import { allocateSequence, connectDB } from '@/lib/db.js';
import CuttingOrder from '@/models/CuttingOrder.js';
import Fabric from '@/models/Fabric.js';
import DesignArticle from '@/models/Design.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    await connectDB();
    const cuttingOrders = await CuttingOrder.find({}).sort({ createdAt: -1 });
    return successResponse({ cuttingOrders });
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}

export async function POST(request) {
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
      if (!designCode || !designTitle || !Number.isInteger(totalPieces) || totalPieces <= 0 ||
        !Number.isFinite(markerLength) || markerLength <= 0 || !Number.isFinite(plies) || plies <= 0 ||
        !Array.isArray(rollsAllocated) || rollsAllocated.length === 0 ||
        !Number.isFinite(actualConsumed) || actualConsumed < 0 ||
        !Number.isFinite(offcutMeters) || offcutMeters < 0 ||
        !Array.isArray(bundles) || bundles.length === 0 ||
        bundles.some((bundle) => !bundle.size || !Number.isInteger(Number(bundle.quantityPieces)) || Number(bundle.quantityPieces) <= 0) ||
        bundles.reduce((sum, bundle) => sum + Number(bundle.quantityPieces), 0) !== totalPieces) {
        return errorResponse('Enter valid production details, fabric allocation, actual consumption, offcuts and size bundle quantities matching the target', 400);
      }

      const design = await DesignArticle.findOne({ designCode });
      if (!design) return errorResponse('Design article not found', 404);
      const availableSizes = new Set((design.sizeGrading || []).map((size) => size.sizeName));
      if (bundles.some((bundle) => !availableSizes.has(bundle.size))) {
        return errorResponse('Bundle sizes must match the selected design size grading', 400);
      }

      const sequence = await allocateSequence('cutting_order');
      const orderNumber = `CUT-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const totalIssued = rollsAllocated.reduce((sum, roll) => sum + Number(roll.metersIssued), 0);
      if (rollsAllocated.some((roll) => !roll.rollNumber || !Number.isFinite(Number(roll.metersIssued)) || Number(roll.metersIssued) <= 0)) {
        return errorResponse('Each allocated roll requires a roll number and a positive quantity', 400);
      }
      if (actualConsumed + offcutMeters > totalIssued) {
        return errorResponse('Actual consumption and offcuts cannot exceed the issued fabric', 400);
      }
      for (const allocation of rollsAllocated) {
        const fabric = await Fabric.findOne({ 'rolls.rollNumber': allocation.rollNumber });
        const roll = fabric?.rolls?.find((item) => item.rollNumber === allocation.rollNumber);
        if (!roll) return errorResponse(`Fabric roll ${allocation.rollNumber} was not found`, 404);
        if (Number(allocation.metersIssued) > Number(roll.remainingMeters)) {
          return errorResponse(`Fabric roll ${allocation.rollNumber} does not have enough available meters`, 409);
        }
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
        designTitle,
        targetQuantity: totalPieces,
        fabricType,
        rollsAllocated,
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
      for (const alloc of (rollsAllocated || [])) {
        const fabric = await Fabric.findOne({ "rolls.rollNumber": alloc.rollNumber });
        if (fabric) {
          const targetRoll = fabric.rolls.find(r => r.rollNumber === alloc.rollNumber);
          if (targetRoll) {
            targetRoll.remainingMeters = Math.max(0, targetRoll.remainingMeters - Number(alloc.metersIssued));
            if (targetRoll.remainingMeters === 0) targetRoll.status = 'Exhausted';
            fabric.totalAvailableMeters = Math.max(0, fabric.totalAvailableMeters - Number(alloc.metersIssued));
            fabric.movements.push({
              type: 'ISSUE_CUTTING',
              rollNumber: alloc.rollNumber,
              meters: Number(alloc.metersIssued),
              referenceDocument: orderNumber,
              performedBy: cuttingMaster || '',
              notes: `Issued to ${orderNumber}`,
            });
            await fabric.save();
          }
        }
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
      const { orderId, line } = body;
      const order = await CuttingOrder.findById(orderId);
      if (!order) return errorResponse('Cutting Order not found', 404);

      order.status = 'TransferredToStitching';
      (order.bundles || []).forEach(b => {
        b.status = 'InStitching';
        if (line) b.assignedStitchingLine = line;
      });
      await order.save();

      return successResponse({ cuttingOrder: order }, 'Bundles transferred to stitching');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
