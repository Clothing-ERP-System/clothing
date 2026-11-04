import { allocateSequence, connectDB } from '@/lib/db.js';
import ProductionOrder from '@/models/ProductionOrder.js';
import DesignArticle from '@/models/Design.js';
import CuttingOrder from '@/models/CuttingOrder.js';
import Fabric from '@/models/Fabric.js';
import TrimItem from '@/models/Trims.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, parseListQuery, pickFields, updateRecord } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';
import { adjustWarehouseStock, getWarehouseStock, recordInventoryMovement } from '@/lib/inventory.js';

async function getProduction(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const productionOrders = applyListQuery(await ProductionOrder.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['productionOrderNumber', 'designCode', 'articleName', 'stitchingLine', 'supervisor'],
    }).items;
    const designs = await DesignArticle.find({ sampleStatus: 'ProductionReady' });
    return successResponse({ productionOrders, designs });
  } catch (error) {
    return fromError(error);
  }
}

async function postProduction(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_PRODUCTION_ORDER') {
      const {
        designCode,
        articleName,
        cuttingOrderRef,
        stitchingLine,
        targetQuantity,
        supervisor,
        targetDate,
        operations,
        warehouseLocation,
        creationRequestId,
      } = body;
      const requestId = String(creationRequestId || '').trim();
      if (!requestId) return errorResponse('A production order request ID is required', 400);
      const existingOrder = await ProductionOrder.findOne({ creationRequestId: requestId });
      if (existingOrder) return successResponse({ productionOrder: existingOrder }, 'Production order was already created');

      if (!designCode || !articleName || !Number.isSafeInteger(Number(targetQuantity)) || Number(targetQuantity) <= 0) {
        return errorResponse('Design, article name and a positive whole-number target quantity are required', 400);
      }
      const designRecord = await DesignArticle.findOne({ designCode });
      const design = designRecord ? await DesignArticle.findByIdForUpdate(designRecord._id) : null;
      if (!design || design.sampleStatus !== 'ProductionReady') {
        return errorResponse('Select an existing production-ready design', 400);
      }
      if (cuttingOrderRef) {
        const cuttingOrder = await CuttingOrder.findOne({ orderNumber: cuttingOrderRef });
        if (!cuttingOrder || cuttingOrder.designCode !== design.designCode ||
          Number(cuttingOrder.targetQuantity) < Number(targetQuantity) ||
          !['BundlingComplete', 'TransferredToStitching'].includes(cuttingOrder.status)) {
          return errorResponse('The cutting order must match this design, contain enough pieces and be ready for stitching', 409);
        }
      }
      const designBom = Array.isArray(design.bom) ? design.bom : [];
      if (designBom.some((line) => !['Fabric', 'Trim'].includes(line.stockItemType) ||
        typeof line.stockItemId !== 'string' || !line.stockItemId ||
        !Number.isFinite(Number(line.quantityPerGarment)) ||
        Number(line.quantityPerGarment) <= 0)) {
        return errorResponse('The design BOM contains unlinked or invalid stock items; update its BOM before production', 409);
      }
      const bomByReference = new Map();
      for (const line of designBom) {
        const stockItemModel = line.stockItemType === 'Fabric' ? Fabric : TrimItem;
        const stockItem = await stockItemModel.findById(line.stockItemId);
        if (!stockItem) {
          return errorResponse(`BOM stock item ${line.stockItemCode || line.stockItemId} no longer exists`, 409);
        }
        const key = `${line.stockItemType}:${stockItem._id}`;
        const requirement = bomByReference.get(key) || {
          stockItemType: line.stockItemType,
          stockItemId: stockItem._id,
          stockItemCode: line.stockItemType === 'Fabric' ? stockItem.fabricCode : stockItem.trimCode,
          itemName: stockItem.name,
          quantityPerGarment: 0,
          unit: line.stockItemType === 'Fabric' ? 'Meters' : stockItem.unit || '',
        };
        requirement.quantityPerGarment += Number(line.quantityPerGarment);
        if (!Number.isFinite(requirement.quantityPerGarment)) {
          return errorResponse('BOM material quantity is outside the supported range', 400);
        }
        bomByReference.set(key, requirement);
      }
      const normalizedBom = [...bomByReference.values()];
      const trimRequirements = normalizedBom.filter((line) => line.stockItemType === 'Trim');
      const fabricRequirements = normalizedBom.filter((line) => line.stockItemType === 'Fabric');
      if (trimRequirements.length && !String(warehouseLocation || '').trim()) {
        return errorResponse('Select the warehouse issuing BOM materials', 400);
      }
      if (fabricRequirements.length) {
        if (fabricRequirements.length !== 1 || !cuttingOrderRef) {
          return errorResponse('A fabric BOM requires exactly one explicit fabric item and its matching cutting order', 409);
        }
        const cuttingOrder = await CuttingOrder.findOne({ orderNumber: cuttingOrderRef });
        const fabricRequirement = fabricRequirements[0];
        let issuedFromBomFabric = 0;
        for (const rollAllocation of cuttingOrder?.rollsAllocated || []) {
          const sourceFabric = await Fabric.findOne({ 'rolls.rollNumber': rollAllocation.rollNumber });
          if (sourceFabric?._id === fabricRequirement.stockItemId) {
            issuedFromBomFabric += Number(rollAllocation.metersIssued);
          }
        }
        const requiredFabric = Number(fabricRequirement.quantityPerGarment) * Number(targetQuantity);
        if (!cuttingOrder || !Number.isFinite(issuedFromBomFabric) || issuedFromBomFabric < requiredFabric) {
          return errorResponse('The linked cutting order did not issue enough of the BOM fabric stock item', 409);
        }
      }
      const materialRequirements = normalizedBom.map((line) => ({
        stockItemType: line.stockItemType,
        stockItemId: line.stockItemId,
        stockItemCode: line.stockItemCode,
        itemName: line.itemName,
        quantityPerGarment: Number(line.quantityPerGarment),
        requiredQuantity: Number(line.quantityPerGarment) * Number(targetQuantity),
        unit: line.unit,
        sourceModule: line.stockItemType === 'Fabric' ? 'Cutting' : 'Production',
      }));
      if (materialRequirements.some((line) => !Number.isFinite(line.requiredQuantity) || line.requiredQuantity <= 0)) {
        return errorResponse('BOM material requirements are outside the supported quantity range', 400);
      }
      const sequence = await allocateSequence('production_order');
      const productionOrderNumber = `PROD-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const order = await ProductionOrder.create({
        creationRequestId: requestId,
        productionOrderNumber,
        designCode,
        articleName: design.title,
        cuttingOrderRef: cuttingOrderRef || '',
        stitchingLine: stitchingLine || '',
        targetQuantity: Number(targetQuantity),
        completedQuantity: 0,
        wipQuantity: Number(targetQuantity),
        rejectedQuantity: 0,
        supervisor: supervisor || '',
        status: 'InProduction',
        startDate: new Date(),
        targetDate: targetDate || null,
        operations: Array.isArray(operations) ? operations : [],
        dailyLogs: [],
        warehouseLocation: String(warehouseLocation || '').trim(),
        materialRequirements,
        materialConsumptions: [],
        materialsConsumedAt: null,
      });

      await AuditLog.create({
        userName: supervisor || '',
        action: 'CREATE',
        module: 'Stitching & Production',
        recordId: productionOrderNumber,
        description: `Production Order ${productionOrderNumber} scheduled on ${stitchingLine} for ${targetQuantity} pcs`,
      });

      return successResponse({ productionOrder: order }, 'Production Order initiated');
    }

    if (action === 'LOG_DAILY_OUTPUT') {
      const { orderId, piecesProduced, hoursWorked, operatorCount, efficiencyPercentage, supervisorNotes } = body;
      const order = await ProductionOrder.findByIdForUpdate(orderId);
      if (!order) return errorResponse('Production Order not found', 404);
      if (order.status !== 'InProduction') {
        return errorResponse('Daily output can only be logged for an order in production', 409);
      }
      if ((order.materialRequirements || []).some((line) => line.stockItemType === 'Trim') &&
        !order.materialsConsumedAt) {
        return errorResponse('Consume the production BOM materials before logging production output', 409);
      }

      const pieces = Number(piecesProduced);
      const hours = Number(hoursWorked);
      const operators = Number(operatorCount);
      const efficiency = Number(efficiencyPercentage);
      const targetQuantity = Number(order.targetQuantity);
      const completedQuantity = Number(order.completedQuantity || 0);
      const remainingQuantity = targetQuantity - completedQuantity;
      if (!Number.isFinite(targetQuantity) || targetQuantity <= 0 ||
        !Number.isFinite(completedQuantity) || completedQuantity < 0 ||
        !Number.isSafeInteger(pieces) || pieces <= 0 || pieces > remainingQuantity) {
        return errorResponse('Output must be a positive whole number and cannot exceed the remaining target quantity', 400);
      }
      if (!Number.isFinite(hours) || hours < 0 ||
        !Number.isInteger(operators) || operators < 0 ||
        !Number.isFinite(efficiency) || efficiency < 0 || efficiency > 100) {
        return errorResponse('Hours, operator count and efficiency must be valid non-negative values; efficiency cannot exceed 100%', 400);
      }
      order.dailyLogs = Array.isArray(order.dailyLogs) ? order.dailyLogs : [];
      order.dailyLogs.push({
        date: new Date(),
        shift: '',
        piecesProduced: pieces,
        hoursWorked: hours,
        operatorCount: operators,
        efficiencyPercentage: efficiency,
        supervisorNotes: supervisorNotes || '',
      });

      order.completedQuantity = (order.completedQuantity || 0) + pieces;
      order.wipQuantity = Math.max(0, (order.targetQuantity || 0) - order.completedQuantity);

      if (order.completedQuantity >= order.targetQuantity) {
        order.status = 'FinishingStage';
      }

      await order.save();

      return successResponse({ productionOrder: order }, 'Daily output logged');
    }

    if (action === 'CONSUME_BOM_MATERIALS') {
      const order = await ProductionOrder.findByIdForUpdate(body.orderId);
      if (!order) return errorResponse('Production Order not found', 404);
      if (order.status !== 'InProduction') {
        return errorResponse('BOM materials can only be issued to an order in production', 409);
      }
      const requestId = String(body.consumptionRequestId || '').trim();
      if (order.materialsConsumedAt) {
        if (requestId && requestId === order.materialConsumptionRequestId) {
          return successResponse({ productionOrder: order }, 'BOM materials were already issued for this request');
        }
        return errorResponse('BOM materials have already been issued for this production order', 409);
      }
      const requirements = (order.materialRequirements || []).filter((line) => line.stockItemType === 'Trim');
      if (!requestId || !requirements.length || !Array.isArray(body.items) ||
        body.items.length !== requirements.length || !order.warehouseLocation) {
        return errorResponse('Provide one consumption line for every trim BOM item and a request ID', 400);
      }
      const submittedByReference = new Map();
      for (const submitted of body.items) {
        const key = `${submitted?.stockItemType}:${submitted?.stockItemId}`;
        if (submittedByReference.has(key)) return errorResponse('Duplicate BOM consumption references are not allowed', 400);
        submittedByReference.set(key, submitted);
      }
      const normalized = [];
      const lockedTrims = new Map();
      for (const requirement of requirements) {
        const key = `Trim:${requirement.stockItemId}`;
        const submitted = submittedByReference.get(key);
        const quantityConsumed = Number(submitted?.quantityConsumed);
        const wastageQuantity = Number(submitted?.wastageQuantity ?? 0);
        if (!submitted || !Number.isFinite(quantityConsumed) || quantityConsumed < requirement.requiredQuantity ||
          !Number.isFinite(wastageQuantity) || wastageQuantity < 0 ||
          Math.abs(quantityConsumed - requirement.requiredQuantity - wastageQuantity) > 0.000001) {
          return errorResponse(`Consumption for ${requirement.stockItemCode} must equal required material plus recorded wastage`, 400);
        }
        const trim = await TrimItem.findByIdForUpdate(requirement.stockItemId);
        if (!trim) return errorResponse(`BOM stock item ${requirement.stockItemCode} no longer exists`, 409);
        const available = getWarehouseStock(trim, 'currentStock', order.warehouseLocation);
        if (!Number.isFinite(available) || available < quantityConsumed) {
          return errorResponse(`Insufficient or inconsistent stock for ${requirement.stockItemCode} at ${order.warehouseLocation}`, 409);
        }
        lockedTrims.set(key, trim);
        normalized.push({
          stockItemType: 'Trim',
          stockItemId: trim._id,
          stockItemCode: trim.trimCode,
          itemName: trim.name,
          quantityConsumed,
          wastageQuantity,
          requiredQuantity: requirement.requiredQuantity,
          unit: trim.unit,
        });
      }
      for (const consumption of normalized) {
        const trim = lockedTrims.get(`Trim:${consumption.stockItemId}`);
        if (!adjustWarehouseStock(trim, 'currentStock', order.warehouseLocation, -consumption.quantityConsumed)) {
          return errorResponse(`Stock balance changed for ${consumption.stockItemCode}`, 409);
        }
        recordInventoryMovement(trim, {
          type: 'PRODUCTION_MATERIAL_CONSUMPTION',
          quantity: consumption.quantityConsumed,
          unit: consumption.unit,
          direction: 'OUT',
          referenceType: 'ProductionOrder',
          referenceId: order._id,
          referenceNumber: order.productionOrderNumber,
          sourceItemId: consumption.stockItemCode,
          warehouseLocation: order.warehouseLocation,
          notes: `BOM requirement ${consumption.requiredQuantity}; wastage ${consumption.wastageQuantity}; request ${requestId}`,
        });
        await trim.save();
      }
      order.materialConsumptions = normalized.map((entry) => ({
        ...entry,
        consumptionRequestId: requestId,
        consumedAt: new Date(),
      }));
      order.materialsConsumedAt = new Date();
      order.materialConsumptionRequestId = requestId;
      await order.save();
      return successResponse({ productionOrder: order }, 'BOM materials issued and consumption recorded');
    }

    if (action === 'COMPLETE_FINISHING') {
      const order = await ProductionOrder.findByIdForUpdate(body.orderId);
      if (!order) return errorResponse('Production Order not found', 404);
      if (order.status !== 'FinishingStage' || order.finishingCompletedAt ||
        !Number.isSafeInteger(Number(order.completedQuantity)) || Number(order.completedQuantity) <= 0 ||
        Number(order.reworkPendingQuantity || 0) !== 0) {
        return errorResponse('Finishing can only be completed once for an order in the finishing stage', 409);
      }
      const checklist = body.finishingChecklist;
      const requiredChecks = ['steamIroning', 'taggingAndBarcode', 'polybagPackaged'];
      if (!checklist || requiredChecks.some((check) => checklist[check] !== true)) {
        return errorResponse('Complete steam ironing, barcode/tagging and polybag packing before final QC', 400);
      }
      order.finishingChecklist = Object.fromEntries(requiredChecks.map((check) => [check, true]));
      order.finishingCompletedAt = new Date();
      order.status = 'FinalQCReady';
      await order.save();
      await AuditLog.create({
        userName: order.supervisor || '',
        action: 'UPDATE',
        module: 'Quality & Finishing',
        recordId: order.productionOrderNumber,
        description: `Finishing completed for ${order.productionOrderNumber}; ready for final QC`,
      });
      return successResponse({ productionOrder: order }, 'Finishing completed; order is ready for final QC');
    }

    if (action === 'COMPLETE_REWORK') {
      const order = await ProductionOrder.findByIdForUpdate(body.orderId);
      if (!order) return errorResponse('Production Order not found', 404);
      const pending = Number(order.reworkPendingQuantity || 0);
      const quantity = Number(body.quantity);
      if (order.status !== 'ReworkRequired' || !Number.isSafeInteger(pending) || pending <= 0 ||
        !Number.isSafeInteger(quantity) ||
        quantity <= 0 || quantity > pending) {
        return errorResponse('Enter a positive whole-number quantity up to the pending rework amount', 400);
      }
      order.reworkPendingQuantity = pending - quantity;
      order.reworkCompletedQuantity = Number(order.reworkCompletedQuantity || 0) + quantity;
      order.reworkHistory = Array.isArray(order.reworkHistory) ? order.reworkHistory : [];
      order.reworkHistory.push({
        quantity,
        completedAt: new Date(),
        notes: String(body.notes || '').trim(),
      });
      if (order.reworkPendingQuantity === 0) {
        order.status = 'FinishingStage';
        order.finishingChecklist = {};
        order.finishingCompletedAt = null;
      }
      await order.save();
      await AuditLog.create({
        userName: order.supervisor || '',
        action: 'UPDATE',
        module: 'Quality & Finishing',
        recordId: order.productionOrderNumber,
        description: `Recorded ${quantity} reworked pieces for ${order.productionOrderNumber}`,
      });
      return successResponse({ productionOrder: order }, 'Rework progress recorded');
    }

    if (action === 'UPDATE_OPERATION_PROGRESS') {
      const { orderId, opIndex, completedIncrement } = body;
      const order = await ProductionOrder.findByIdForUpdate(orderId);
      if (!order) return errorResponse('Production Order not found', 404);
      if (order.status !== 'InProduction') {
        return errorResponse('Operation progress can only be updated while the order is in production', 409);
      }

      const operationIndex = Number(opIndex);
      const increment = Number(completedIncrement);
      if (!Number.isSafeInteger(operationIndex) || operationIndex < 0 ||
        !Array.isArray(order.operations) || !order.operations[operationIndex] ||
        !Number.isSafeInteger(increment) || increment <= 0) {
        return errorResponse('Select a valid operation and enter a positive whole-number progress increment', 400);
      }
      const operation = order.operations[operationIndex];
      const currentOperationPieces = Number(operation.completedPieces || 0);
      if (!Number.isSafeInteger(currentOperationPieces) || currentOperationPieces < 0) {
        return errorResponse('Current operation progress is invalid', 409);
      }
      const updatedPieces = currentOperationPieces + increment;
      const targetQuantity = Number(order.targetQuantity);
      if (!Number.isFinite(targetQuantity) || targetQuantity <= 0 || updatedPieces > targetQuantity) {
        return errorResponse('Operation progress cannot exceed the production order target', 409);
      }
      operation.completedPieces = updatedPieces;
      await order.save();

      return successResponse({ productionOrder: order }, 'Operation updated');
    }

    if (action === 'UPDATE_PRODUCTION_ORDER') {
      if (body.status !== undefined) {
        return errorResponse('Production status is controlled by production, finishing and quality workflows', 400);
      }
      const updates = pickFields(body, ['stitchingLine', 'supervisor', 'targetDate']);
      for (const field of ['stitchingLine', 'supervisor']) {
        if (updates[field] !== undefined) updates[field] = String(updates[field]).trim();
      }
      if (updates.targetDate !== undefined && updates.targetDate !== null &&
        (!Number.isFinite(Date.parse(updates.targetDate)))) {
        return errorResponse('Enter a valid production target date', 400);
      }
      const order = await updateRecord(ProductionOrder, body.orderId, updates);
      if (!order) return errorResponse('Production Order not found', 404);
      return successResponse({ productionOrder: order }, 'Production order updated');
    }

    if (action === 'DELETE_ORDER' || action === 'DELETE_PRODUCTION_ORDER') {
      const order = await ProductionOrder.findById(body.orderId);
      if (!order) return errorResponse('Production Order not found', 404);
      if (Number(order.completedQuantity || 0) > 0 || (order.dailyLogs || []).length > 0 ||
        Number(order.stockedFinishedGoodsQuantity || 0) > 0 || order.materialsConsumedAt ||
        (order.materialConsumptions || []).length > 0 || (order.reworkHistory || []).length > 0) {
        return errorResponse('A production order with output, material, rework or inventory history cannot be deleted', 409);
      }
      await ProductionOrder.deleteOne({ _id: order._id });
      return successResponse({ productionOrder: order }, 'Production order deleted');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getProduction, 'production');
export const POST = withAuthorization(postProduction, 'production', 'write');
