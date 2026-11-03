import { allocateSequence, connectDB } from '@/lib/db.js';
import CuttingOrder from '@/models/CuttingOrder.js';
import Fabric from '@/models/Fabric.js';
import DesignArticle from '@/models/Design.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, parseListQuery } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';
import { recordInventoryMovement, sumAvailableFabricMeters } from '@/lib/inventory.js';

async function getCutting(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const cuttingOrders = applyListQuery(await CuttingOrder.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['orderNumber', 'designCode', 'designTitle', 'cuttingMaster', 'fabricType'],
    }).items;
    return successResponse({ cuttingOrders });
  } catch (error) {
    return fromError(error);
  }
}

async function postCutting(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_CUTTING_ORDER') {
      const {
        designCode,
        designTitle,
        targetQuantity,
        fabricType,
        rollsAllocated, // [{ rollNumber, metersIssued }]
        markerLengthMeters,
        pliesCount,
        actualFabricConsumedMeters,
        offcutsMeters,
        cuttingMaster,
        bundles,
        remarks,
      } = body;

      const totalPieces = Number(targetQuantity);
      const markerLength = Number(markerLengthMeters);
      const plies = Number(pliesCount);
      const actualConsumed = Number(actualFabricConsumedMeters);
      const offcutMeters = Number(offcutsMeters);
      if (!designCode || !Number.isSafeInteger(totalPieces) || totalPieces <= 0 ||
        !Number.isFinite(markerLength) || markerLength <= 0 || !Number.isSafeInteger(plies) || plies <= 0 ||
        !Array.isArray(rollsAllocated) || rollsAllocated.length === 0 ||
        !Number.isFinite(actualConsumed) || actualConsumed < 0 ||
        !Number.isFinite(offcutMeters) || offcutMeters < 0 ||
        !Array.isArray(bundles) || bundles.length === 0 ||
        bundles.some((bundle) => !bundle || !bundle.size || !Number.isSafeInteger(Number(bundle.quantityPieces)) || Number(bundle.quantityPieces) <= 0) ||
        bundles.reduce((sum, bundle) => sum + Number(bundle.quantityPieces), 0) !== totalPieces) {
        return errorResponse('Enter valid production details, fabric allocation, actual consumption, offcuts and size bundle quantities matching the target', 400);
      }

      const normalizedRolls = rollsAllocated.map((roll) => ({
        ...roll,
        rollNumber: String(roll?.rollNumber || '').trim(),
        metersIssued: Number(roll?.metersIssued),
      }));
      if (normalizedRolls.some((roll) => !roll.rollNumber || !Number.isFinite(roll.metersIssued) || roll.metersIssued <= 0)) {
        return errorResponse('Each allocated roll requires a roll number and a positive quantity', 400);
      }
      if (new Set(normalizedRolls.map((roll) => roll.rollNumber)).size !== normalizedRolls.length) {
        return errorResponse('Each fabric roll can only be allocated once per cutting order', 400);
      }
      const totalIssued = normalizedRolls.reduce((sum, roll) => sum + roll.metersIssued, 0);
      if (!Number.isFinite(totalIssued)) {
        return errorResponse('Total issued fabric is outside the supported range', 400);
      }
      if (actualConsumed + offcutMeters > totalIssued) {
        return errorResponse('Actual consumption and offcuts cannot exceed the issued fabric', 400);
      }

      const designRecord = await DesignArticle.findOne({ designCode });
      const design = designRecord ? await DesignArticle.findByIdForUpdate(designRecord._id) : null;
      if (!design || design.sampleStatus !== 'ProductionReady') {
        return errorResponse('Select an existing production-ready design', 404);
      }
      const availableSizes = new Set((design.sizeGrading || []).map((size) => size.sizeName));
      if (bundles.some((bundle) => !availableSizes.has(bundle.size))) {
        return errorResponse('Bundle sizes must match the selected design size grading', 400);
      }

      const sequence = await allocateSequence('cutting_order');
      const orderNumber = `CUT-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const lockedFabricById = new Map();
      const fabricByRollNumber = new Map();
      for (const allocation of normalizedRolls) {
        const existingFabric = await Fabric.findOne({ 'rolls.rollNumber': allocation.rollNumber });
        const fabric = existingFabric
          ? lockedFabricById.get(existingFabric._id) || await Fabric.findByIdForUpdate(existingFabric._id)
          : null;
        const roll = fabric?.rolls?.find((item) => item.rollNumber === allocation.rollNumber);
        if (!roll) return errorResponse(`Fabric roll ${allocation.rollNumber} was not found`, 404);
        if (['Voided', 'InTransit'].includes(roll.status) || !Number.isFinite(Number(roll.remainingMeters))) {
          return errorResponse(`Fabric roll ${allocation.rollNumber} is not available for cutting`, 409);
        }
        if (Number(allocation.metersIssued) > Number(roll.remainingMeters)) {
          return errorResponse(`Fabric roll ${allocation.rollNumber} does not have enough available meters`, 409);
        }
        lockedFabricById.set(fabric._id, fabric);
        fabricByRollNumber.set(allocation.rollNumber, fabric);
      }

      const wastageMeters = totalIssued - actualConsumed - offcutMeters;
      const wastagePercentage = totalIssued > 0 ? Number(((wastageMeters / totalIssued) * 100).toFixed(1)) : 0;
      const generatedBundles = bundles.map((bundle, idx) => ({
        bundleNumber: `BND-${sequence}-${idx + 1}`,
        size: bundle.size,
        quantityPieces: Number(bundle.quantityPieces),
        barcode: `BND${sequence}${idx + 1}`,
        status: 'Created',
        assignedStitchingLine: bundle.assignedStitchingLine || '',
      }));

      const order = await CuttingOrder.create({
        orderNumber,
        designCode,
        designTitle: design.title,
        targetQuantity: totalPieces,
        fabricType,
        rollsAllocated: normalizedRolls,
        totalFabricIssuedMeters: totalIssued,
        markerLengthMeters: markerLength,
        pliesCount: plies,
        actualFabricConsumedMeters: actualConsumed,
        offcutsMeters: offcutMeters,
        wastageMeters,
        wastagePercentage,
        cuttingMaster: cuttingMaster || '',
        status: 'BundlingComplete',
        bundles: generatedBundles,
        remarks: remarks || '',
      });

      // Deduct from fabric rolls
      for (const alloc of normalizedRolls) {
        const fabric = fabricByRollNumber.get(alloc.rollNumber);
        if (fabric) {
          const targetRoll = fabric.rolls.find(r => r.rollNumber === alloc.rollNumber);
          if (targetRoll) {
            targetRoll.remainingMeters -= Number(alloc.metersIssued);
            if (targetRoll.remainingMeters === 0) targetRoll.status = 'Exhausted';
            recordInventoryMovement(fabric, {
              type: 'ISSUE_CUTTING',
              quantity: Number(alloc.metersIssued),
              unit: 'Meters',
              direction: 'OUT',
              referenceType: 'CuttingOrder',
              referenceId: order._id,
              referenceNumber: orderNumber,
              sourceItemId: alloc.rollNumber,
              notes: `Issued to ${orderNumber}`,
            });
            fabric.movements[fabric.movements.length - 1].rollNumber = alloc.rollNumber;
            fabric.movements[fabric.movements.length - 1].meters = Number(alloc.metersIssued);
            fabric.movements[fabric.movements.length - 1].referenceDocument = orderNumber;
            fabric.movements[fabric.movements.length - 1].performedBy = cuttingMaster || '';
          }
        }
      }
      for (const fabric of lockedFabricById.values()) {
        fabric.totalAvailableMeters = sumAvailableFabricMeters(fabric);
        await fabric.save();
      }

      await AuditLog.create({
        userName: cuttingMaster || '',
        action: 'CREATE',
        module: 'Cutting',
        recordId: orderNumber,
        description: `Cutting order ${orderNumber} created with ${bundles.length} bundles (${totalPieces} pcs)`,
      });

      return successResponse({ cuttingOrder: order }, 'Cutting order and bundles created');
    }

    if (action === 'HANDOVER_TO_STITCHING') {
      const { orderId, orderNumber, line } = body;
      let order = null;
      if (orderId) {
        order = await CuttingOrder.findByIdForUpdate(orderId);
      } else if (orderNumber) {
        const found = await CuttingOrder.findOne({ orderNumber });
        if (found) order = await CuttingOrder.findByIdForUpdate(found._id);
      }
      if (!order) return errorResponse('Cutting Order not found', 404);
      if (order.status !== 'BundlingComplete') {
        return errorResponse('Only completed cutting bundles can be handed over to stitching', 409);
      }

      order.status = 'TransferredToStitching';
      (order.bundles || []).forEach(b => {
        b.status = 'InStitching';
        if (line) b.assignedStitchingLine = line;
      });
      await order.save();

      return successResponse({ cuttingOrder: order }, 'Bundles transferred to stitching');
    }

    if (action === 'DELETE_CUTTING_ORDER') {
      const order = await CuttingOrder.findById(body.orderId);
      if (!order) return errorResponse('Cutting Order not found', 404);
      return errorResponse('A cutting order that consumed fabric cannot be deleted; preserve it for stock traceability', 409);
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getCutting, 'cutting');
export const POST = withAuthorization(postCutting, 'cutting', 'write');
