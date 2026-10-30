import { allocateSequence, connectDB } from '@/lib/db.js';
import TrimItem from '@/models/Trims.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    await connectDB();
    const trims = await TrimItem.find({}).sort({ category: 1, name: 1 });
    return successResponse({ trims });
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_TRIM') {
      const { name, category, variant, color, unit, currentStock, minimumStock, unitCost, supplierName, binLocation } = body;
      const sequence = await allocateSequence('trim_item');
      const trimCode = `TRM-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const item = await TrimItem.create({
        trimCode,
        name,
        category,
        variant: variant || '',
        color: color || '',
        unit: unit || '',
        currentStock: Number(currentStock) || 0,
        minimumStock: Number(minimumStock) || 0,
        unitCost: Number(unitCost),
        supplierName: supplierName || '',
        binLocation: binLocation || '',
      });

      return successResponse({ trim: item }, 'Trim item created successfully');
    }

    if (action === 'ADJUST_STOCK') {
      const { trimId, quantityChange, reason, user } = body;
      const trim = await TrimItem.findById(trimId);
      if (!trim) return errorResponse('Trim item not found', 404);

      trim.currentStock = Math.max(0, (trim.currentStock || 0) + Number(quantityChange));
      await trim.save();

      await AuditLog.create({
        userName: user || '',
        action: 'ADJUST_STOCK',
        module: 'Trims Inventory',
        recordId: trim.trimCode,
        description: `Adjusted stock for ${trim.name} by ${quantityChange} ${trim.unit}${reason ? ` (${reason})` : ''}`,
      });

      return successResponse({ trim }, 'Stock updated successfully');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
