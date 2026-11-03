import { allocateSequence, connectDB } from '@/lib/db.js';
import QualityInspection from '@/models/QualityInspection.js';
import ProductionOrder from '@/models/ProductionOrder.js';
import DesignArticle from '@/models/Design.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, deleteRecord, parseListQuery, pickFields } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';
import { adjustWarehouseStock, recordInventoryMovement } from '@/lib/inventory.js';

async function getQuality(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const inspections = applyListQuery(await QualityInspection.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['inspectionNumber', 'referenceOrder', 'articleCode', 'inspectorName', 'finalVerdict'],
      statusField: 'stage',
    }).items;
    const finalQcOrders = await ProductionOrder.find({ status: 'FinalQCReady' });
    return successResponse({ inspections, finalQcOrders });
  } catch (error) {
    return fromError(error);
  }
}

async function postQuality(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_INSPECTION') {
    const requestId = typeof body.submissionRequestId === 'string'
      ? body.submissionRequestId.trim()
      : '';
    if (requestId) {
      const existingInspection = await QualityInspection.findOne({ submissionRequestId: requestId });
      if (existingInspection) {
        return successResponse({ inspection: existingInspection }, 'Inspection was already recorded');
      }
    }
    const {
        stage,
        referenceOrder,
        articleCode,
        inspectorName,
        totalSampleChecked,
        passedQuantity,
        reworkQuantity,
        rejectedQuantity,
        defects,
        finishingStatus,
        finalVerdict,
        remarks,
        acceptedForStockQuantity,
        warehouseLocation,
      } = body;

      const totalChecked = Number(totalSampleChecked);
      if (!Number.isSafeInteger(totalChecked) || totalChecked <= 0) {
        return errorResponse('Enter the number of items inspected', 400);
      }
      const passed = Number(passedQuantity) || 0;
      const rework = Number(reworkQuantity) || 0;
      const rejected = Number(rejectedQuantity) || 0;
      if (![passed, rework, rejected].every(Number.isSafeInteger) ||
        passed < 0 || rework < 0 || rejected < 0 || passed + rework + rejected > totalChecked) {
        return errorResponse('Passed, rework and rejected quantities must be non-negative and cannot exceed the inspected quantity', 400);
      }
      if (!stage || !referenceOrder) {
        return errorResponse('Inspection stage and reference order are required', 400);
      }
      const sequence = await allocateSequence('quality_inspection');
      const inspectionNumber = `QC-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
      const passRate = Number(((passed / totalChecked) * 100).toFixed(1));
      let productionOrder = null;
      let design = null;
      let acceptedQuantity = 0;
      let outputQuantity = 0;
      let alreadyStocked = 0;
      let remainingQuantity = 0;
      if (stage === 'FinalGarmentQC') {
        acceptedQuantity = Number(acceptedForStockQuantity ?? 0);
        if (!['Passed', 'Rejected'].includes(finalVerdict) ||
          !Number.isSafeInteger(acceptedQuantity) ||
          finalVerdict === 'Passed' && acceptedQuantity <= 0 ||
          finalVerdict === 'Rejected' && acceptedQuantity !== 0) {
          return errorResponse('Select a final verdict and enter a positive stock quantity only when the order passes', 400);
        }
        const existingOrder = await ProductionOrder.findOne({ productionOrderNumber: referenceOrder });
        productionOrder = existingOrder
          ? await ProductionOrder.findByIdForUpdate(existingOrder._id)
          : null;
        if (!productionOrder || productionOrder.status !== 'FinalQCReady') {
          return errorResponse('Final garment QC requires a production order with finishing completed', 409);
        }
        outputQuantity = Number(productionOrder.completedQuantity);
        alreadyStocked = Number(productionOrder.stockedFinishedGoodsQuantity || 0);
        const alreadyRejected = Number(productionOrder.qualityRejectedQuantity || 0);
        const pendingRework = Number(productionOrder.reworkPendingQuantity || 0);
        remainingQuantity = outputQuantity - alreadyStocked - alreadyRejected - pendingRework;
        if (!Number.isSafeInteger(outputQuantity) || !Number.isSafeInteger(alreadyStocked) ||
          alreadyStocked < 0 || alreadyStocked + acceptedQuantity > outputQuantity) {
          return errorResponse('Approved stock quantity exceeds the production output not yet posted to finished inventory', 409);
        }
        if (!Number.isSafeInteger(alreadyRejected) || alreadyRejected < 0 ||
          !Number.isSafeInteger(pendingRework) || pendingRework < 0 ||
          !Number.isSafeInteger(remainingQuantity) || remainingQuantity < 0 ||
          acceptedQuantity + rework + rejected > remainingQuantity ||
          acceptedQuantity + rework + rejected === 0) {
          return errorResponse('Record a positive approved, rework or rejected quantity within the remaining production output', 409);
        }
        if (acceptedQuantity > 0) {
          design = await DesignArticle.findOne({ designCode: productionOrder.designCode });
          design = design ? await DesignArticle.findByIdForUpdate(design._id) : null;
          if (!design) return errorResponse('The production design no longer exists; finished stock was not posted', 409);
          if (!String(warehouseLocation || '').trim()) {
            return errorResponse('Select the warehouse receiving accepted finished goods', 400);
          }
          if (!adjustWarehouseStock(design, 'finishedGoodsStock', warehouseLocation, acceptedQuantity)) {
            return errorResponse('Finished-goods location balances are inconsistent; reconcile stock before posting QC output', 409);
          }
        }
      }

      const inspection = await QualityInspection.create({
        inspectionNumber,
        submissionRequestId: requestId || undefined,
        stage,
        referenceOrder,
        articleCode: productionOrder?.designCode || articleCode || '',
        productionOrderId: productionOrder?._id || '',
        acceptedForStockQuantity: acceptedQuantity,
        inspectorName: inspectorName || '',
        totalSampleChecked: totalChecked,
        passedQuantity: passed,
        reworkQuantity: rework,
        rejectedQuantity: rejected,
        passRatePercentage: passRate,
        defects: defects || [],
        finalVerdict: finalVerdict || '',
        finishingStatus: productionOrder?.finishingChecklist || finishingStatus || {},
        remarks: remarks || '',
      });

      if (productionOrder) {
        productionOrder.stockedFinishedGoodsQuantity =
          Number(productionOrder.stockedFinishedGoodsQuantity || 0) + acceptedQuantity;
        productionOrder.qualityRejectedQuantity =
          Number(productionOrder.qualityRejectedQuantity || 0) + rejected;
        productionOrder.reworkPendingQuantity =
          Number(productionOrder.reworkPendingQuantity || 0) + rework;
        if (rework > 0) {
          productionOrder.status = 'ReworkRequired';
        } else if (
          productionOrder.stockedFinishedGoodsQuantity +
          productionOrder.qualityRejectedQuantity >= Number(productionOrder.completedQuantity)
        ) {
          productionOrder.status = 'Completed';
        }
        if (design) {
          recordInventoryMovement(design, {
            type: 'QC_FINISHED_GOODS',
            quantity: acceptedQuantity,
            unit: 'Pieces',
            referenceType: 'QualityInspection',
            referenceId: inspection._id,
            referenceNumber: inspectionNumber,
            sourceItemId: productionOrder._id,
            warehouseLocation: String(warehouseLocation || '').trim(),
            notes: `Accepted from production order ${productionOrder.productionOrderNumber}`,
          });
          await design.save();
        }
      }
      if (productionOrder) await productionOrder.save();

      await AuditLog.create({
        userName: inspectorName || '',
        action: 'CREATE',
        module: 'Quality & Finishing',
        recordId: inspectionNumber,
        description: `Logged QC audit ${inspectionNumber} for ${referenceOrder} (${passed}/${totalChecked} Passed - ${passRate}%)`,
      });

      return successResponse({ inspection }, 'Inspection recorded');
    }

    if (action === 'UPDATE_INSPECTION') {
      const existingInspection = await QualityInspection.findByIdForUpdate(body.inspectionId);
      if (!existingInspection) return errorResponse('Inspection not found', 404);
      if (existingInspection?.stage === 'FinalGarmentQC') {
        return errorResponse('Final garment inspections cannot be edited because they control production and inventory status', 409);
      }
      if (Number(existingInspection?.acceptedForStockQuantity || 0) > 0) {
        return errorResponse('An inspection that posted finished stock cannot be edited', 409);
      }
      const updates = pickFields(body, [
        'stage', 'referenceOrder', 'articleCode', 'inspectorName', 'totalSampleChecked',
        'passedQuantity', 'reworkQuantity', 'rejectedQuantity', 'defects', 'finishingStatus',
        'finalVerdict', 'remarks',
      ]);
      if (updates.stage !== undefined &&
        !['IncomingFabric', 'InProcessStitching', 'PreShipmentAudit'].includes(updates.stage)) {
        return errorResponse('Select a valid editable inspection stage', 400);
      }
      if (updates.referenceOrder !== undefined) updates.referenceOrder = String(updates.referenceOrder).trim();
      if (updates.inspectorName !== undefined) updates.inspectorName = String(updates.inspectorName).trim();
      if (updates.referenceOrder !== undefined && !updates.referenceOrder ||
        updates.inspectorName !== undefined && !updates.inspectorName) {
        return errorResponse('Reference order and inspector are required', 400);
      }
      if (updates.defects !== undefined && !Array.isArray(updates.defects)) {
        return errorResponse('Defects must be provided as a list', 400);
      }
      if (updates.finishingStatus !== undefined &&
        (!updates.finishingStatus || typeof updates.finishingStatus !== 'object' || Array.isArray(updates.finishingStatus))) {
        return errorResponse('Finishing status must be an object', 400);
      }
      const total = Number(updates.totalSampleChecked ?? existingInspection.totalSampleChecked);
      const passed = Number(updates.passedQuantity ?? existingInspection.passedQuantity);
      const rework = Number(updates.reworkQuantity ?? existingInspection.reworkQuantity);
      const rejected = Number(updates.rejectedQuantity ?? existingInspection.rejectedQuantity);
      if (!Number.isSafeInteger(total) || total <= 0 ||
        ![passed, rework, rejected].every(Number.isSafeInteger) ||
        passed < 0 || rework < 0 || rejected < 0 || passed + rework + rejected > total) {
        return errorResponse('Inspection quantities must be non-negative whole numbers and cannot exceed the inspected sample', 400);
      }
      updates.totalSampleChecked = total;
      updates.passedQuantity = passed;
      updates.reworkQuantity = rework;
      updates.rejectedQuantity = rejected;
      Object.assign(existingInspection, updates, {
        passRatePercentage: Number(((passed / total) * 100).toFixed(1)),
      });
      const inspection = await existingInspection.save();
      return successResponse({ inspection }, 'Inspection updated');
    }

    if (action === 'DELETE_INSPECTION') {
      const existingInspection = await QualityInspection.findById(body.inspectionId);
      if (!existingInspection) return errorResponse('Inspection not found', 404);
      if (existingInspection.stage === 'FinalGarmentQC') {
        return errorResponse('Final garment inspections cannot be deleted because they control production and inventory status', 409);
      }
      if (Number(existingInspection.acceptedForStockQuantity || 0) > 0) {
        return errorResponse('An inspection that posted finished stock cannot be deleted', 409);
      }
      const inspection = await deleteRecord(QualityInspection, body.inspectionId);
      return successResponse({ inspection }, 'Inspection deleted');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getQuality, 'quality');
export const POST = withAuthorization(postQuality, 'quality', 'write');
