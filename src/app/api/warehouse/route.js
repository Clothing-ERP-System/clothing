import { allocateSequence, connectDB } from '@/lib/db.js';
import WarehouseTransfer from '@/models/WarehouseTransfer.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    await connectDB();
    const transfers = await WarehouseTransfer.find({}).sort({ createdAt: -1 });
    return successResponse({ transfers });
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_TRANSFER') {
      const {
        sourceWarehouse,
        destinationWarehouse,
        vehicleNumber,
        driverName,
        driverPhone,
        items,
        dispatchedBy,
        notes,
      } = body;

      if (!sourceWarehouse || !destinationWarehouse || sourceWarehouse === destinationWarehouse || !Array.isArray(items) || items.length === 0 ||
        items.some((item) => !item.itemDescription || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || !item.unit)) {
        return errorResponse('Choose different source and destination warehouses and add at least one item', 400);
      }
      const sequence = await allocateSequence('warehouse_transfer');
      const transferNumber = `TRF-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
      const challanNumber = `DC-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const transfer = await WarehouseTransfer.create({
        transferNumber,
        challanNumber,
        sourceWarehouse,
        destinationWarehouse,
        vehicleNumber: vehicleNumber || '',
        driverName: driverName || '',
        driverPhone: driverPhone || '',
        status: 'DispatchedInTransit',
        items,
        dispatchedBy: dispatchedBy || '',
        dispatchedDate: new Date(),
        notes: notes || '',
      });

      await AuditLog.create({
        userName: dispatchedBy || '',
        action: 'DISPATCH',
        module: 'Warehouse & Logistics',
        recordId: transferNumber,
        description: `Dispatched Delivery Challan ${challanNumber} from ${sourceWarehouse} to ${destinationWarehouse}`,
      });

      return successResponse({ transfer }, 'Stock transfer dispatched');
    }

    if (action === 'CONFIRM_RECEIPT') {
      const { transferId, receivedBy } = body;
      const transfer = await WarehouseTransfer.findById(transferId);
      if (!transfer) return errorResponse('Transfer record not found', 404);

      if (!receivedBy) return errorResponse('Receiver name is required', 400);
      transfer.status = 'ReceivedAndVerified';
      transfer.receivedBy = receivedBy;
      transfer.receivedDate = new Date();
      await transfer.save();

      return successResponse({ transfer }, 'Transfer verified and received in destination warehouse');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
