import { allocateSequence, connectDB } from '@/lib/db.js';
import ProductionOrder from '@/models/ProductionOrder.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    await connectDB();
    const productionOrders = await ProductionOrder.find({}).sort({ createdAt: -1 });
    return successResponse({ productionOrders });
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}

export async function POST(request) {
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
      } = body;

      if (!designCode || !articleName || !Number.isFinite(Number(targetQuantity)) || Number(targetQuantity) <= 0) {
        return errorResponse('Design, article name and a target quantity greater than zero are required', 400);
      }
      const sequence = await allocateSequence('production_order');
      const productionOrderNumber = `PROD-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const order = await ProductionOrder.create({
        productionOrderNumber,
        designCode,
        articleName,
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
      const order = await ProductionOrder.findById(orderId);
      if (!order) return errorResponse('Production Order not found', 404);

      const pieces = Number(piecesProduced);
      order.dailyLogs.push({
        date: new Date(),
        shift: '',
        piecesProduced: pieces,
        hoursWorked: Number(hoursWorked) || 0,
        operatorCount: Number(operatorCount) || 0,
        efficiencyPercentage: Number(efficiencyPercentage) || 0,
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

    if (action === 'UPDATE_OPERATION_PROGRESS') {
      const { orderId, opIndex, completedIncrement } = body;
      const order = await ProductionOrder.findById(orderId);
      if (!order) return errorResponse('Production Order not found', 404);

      if (order.operations && order.operations[opIndex]) {
        order.operations[opIndex].completedPieces = (order.operations[opIndex].completedPieces || 0) + Number(completedIncrement);
        await order.save();
      }

      return successResponse({ productionOrder: order }, 'Operation updated');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
