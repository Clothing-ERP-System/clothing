import { allocateSequence, connectDB } from '@/lib/db.js';
import TrimItem from '@/models/Trims.js';
import PurchaseOrder from '@/models/PurchaseOrder.js';
import Company from '@/models/Company.js';
import { AccountHead } from '@/models/Accounting.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, parseListQuery, pickFields } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';
import { recordInventoryMovement, adjustWarehouseStock } from '@/lib/inventory.js';
import { postBalancedJournalEntry } from '@/lib/accounting.js';

async function getTrims(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const trims = applyListQuery(await TrimItem.find({}).sort({ category: 1, name: 1 }), query, {
      searchFields: ['name', 'trimCode', 'variant', 'color', 'supplierName'],
    }).items;
    return successResponse({ trims });
  } catch (error) {
    return fromError(error);
  }
}

async function postTrims(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_TRIM') {
      const { name, category, variant, color, unit, currentStock, minimumStock, unitCost, supplierName, binLocation, warehouseLocation } = body;
      const openingStock = Number(currentStock || 0);
      if (!name || !category || !unit || !Number.isFinite(Number(unitCost)) || Number(unitCost) < 0 ||
        !Number.isFinite(openingStock) || openingStock < 0) {
        return errorResponse('Trim name, category, unit, non-negative opening stock and a valid unit cost are required', 400);
      }
      const sequence = await allocateSequence('trim_item');
      const trimCode = `TRM-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
      const location = String(warehouseLocation || '').trim();
      const warehouseBalances = (location && openingStock > 0) ? [{ warehouse: location, quantity: openingStock }] : [];

      const item = await TrimItem.create({
        trimCode,
        name,
        category,
        variant: variant || '',
        color: color || '',
        unit: unit || '',
        currentStock: openingStock,
        minimumStock: Number(minimumStock) || 0,
        unitCost: Number(unitCost),
        supplierName: supplierName || '',
        binLocation: binLocation || '',
        warehouseLocation: location,
        warehouseBalances,
        movements: [],
      });
      if (openingStock > 0) {
        recordInventoryMovement(item, {
          type: 'OPENING_STOCK',
          quantity: openingStock,
          unit,
          referenceType: 'StockItem',
          referenceId: item._id,
          referenceNumber: trimCode,
          notes: 'Opening stock',
        });
        await item.save();
      }

      return successResponse({ trim: item }, 'Trim item created successfully');
    }

    if (action === 'ADJUST_STOCK') {
      const { trimId, quantityChange, reason } = body;
      const trim = await TrimItem.findByIdForUpdate(trimId);
      if (!trim) return errorResponse('Trim item not found', 404);

      const adjustment = Number(quantityChange);
      const currentStock = Number(trim.currentStock);
      if (!Number.isFinite(adjustment) || adjustment === 0 || !Number.isFinite(currentStock)) {
        return errorResponse('Enter a non-zero valid stock adjustment', 400);
      }
      if (currentStock + adjustment < 0) {
        return errorResponse('Stock adjustment cannot reduce inventory below zero', 409);
      }
      if (!String(reason || '').trim()) {
        return errorResponse('A reason is required for every stock adjustment', 400);
      }

      // Resolve unit cost for GL valuation
      const unitCost = Number(trim.unitCost || 0);
      if (!Number.isFinite(unitCost) || unitCost <= 0) {
        return errorResponse(`Cannot adjust stock for ${trim.name}: item has no valid unit cost recorded`, 409);
      }
      const adjustmentAmount = Math.round(Math.abs(adjustment) * unitCost * 100) / 100;

      // Resolve accounting mappings
      const company = await Company.findOne({});
      const mappings = (company && company.accountingMappings) ? company.accountingMappings : {};
      const inventoryCode = mappings.inventoryAccountCode;
      const expenseCode = mappings.expenseAccountCode;
      if (!inventoryCode || !expenseCode) {
        return errorResponse('Inventory adjustment requires both inventoryAccountCode and expenseAccountCode configured in Administration → Accounting Mappings', 409);
      }
      const inventoryAccount = await AccountHead.findOne({ code: inventoryCode });
      const expenseAccount = await AccountHead.findOne({ code: expenseCode });
      if (!inventoryAccount || inventoryAccount.type !== 'Asset') {
        return errorResponse(`Inventory account (${inventoryCode}) must be an Asset account`, 409);
      }
      if (!expenseAccount || (expenseAccount.type !== 'OperatingExpense' && expenseAccount.type !== 'CostOfGoodsSold')) {
        return errorResponse(`Expense account (${expenseCode}) must be an OperatingExpense or CostOfGoodsSold account`, 409);
      }

      // Post balanced GL journal for the stock change
      const isIncrease = adjustment > 0;
      const sourceKey = `TRIM_ADJUST:${trim._id}:${Date.now()}`;
      await postBalancedJournalEntry({
        sourceKey,
        voucherType: 'StockAdjustment',
        narration: `Trim stock adjustment: ${isIncrease ? '+' : ''}${adjustment} ${trim.unit} of ${trim.name} — ${String(reason).trim()}`,
        referenceNumber: trim.trimCode,
        postedBy: String(body.postedBy || body.user || ''),
        lines: [
          {
            accountCode: isIncrease ? inventoryAccount.code : expenseAccount.code,
            accountName: isIncrease ? inventoryAccount.name : expenseAccount.name,
            debit: adjustmentAmount,
            credit: 0,
            memo: `Trim ${isIncrease ? 'increase' : 'decrease'}: ${trim.name} ${adjustment} @ Rs. ${unitCost}`,
          },
          {
            accountCode: isIncrease ? expenseAccount.code : inventoryAccount.code,
            accountName: isIncrease ? expenseAccount.name : inventoryAccount.name,
            debit: 0,
            credit: adjustmentAmount,
            memo: `Trim ${isIncrease ? 'increase' : 'decrease'}: ${trim.name} ${adjustment} @ Rs. ${unitCost}`,
          },
        ],
      });

      const targetLocation = String(body.warehouseLocation || trim.warehouseLocation || '').trim();
      const adjusted = adjustWarehouseStock(trim, 'currentStock', targetLocation, adjustment, true);
      if (!adjusted) {
        trim.currentStock = currentStock + adjustment;
        if (trim.currentStock > 0) {
          trim.warehouseBalances = [{ warehouse: targetLocation, quantity: trim.currentStock }];
        }
      }
      recordInventoryMovement(trim, {
        type: 'STOCK_ADJUSTMENT',
        quantity: Math.abs(adjustment),
        unit: trim.unit,
        direction: adjustment > 0 ? 'IN' : 'OUT',
        referenceType: 'ManualAdjustment',
        referenceId: trim._id,
        referenceNumber: trim.trimCode,
        notes: reason,
      });
      await trim.save();

      await AuditLog.create({
        userName: String(body.postedBy || body.user || ''),
        action: 'ADJUST_STOCK',
        module: 'Trims Inventory',
        recordId: trim.trimCode,
        description: `Adjusted stock for ${trim.name} by ${quantityChange} ${trim.unit} @ Rs. ${unitCost} = Rs. ${adjustmentAmount}${reason ? ` (${reason})` : ''}`,
      });

      return successResponse({ trim }, 'Stock updated and accounting entry posted');
    }

    if (action === 'UPDATE_TRIM') {
      const trim = await TrimItem.findByIdForUpdate(body.trimId);
      if (!trim) return errorResponse('Trim item not found', 404);
      const updates = pickFields(body, [
        'name', 'category', 'variant', 'color', 'unit', 'minimumStock', 'unitCost', 'supplierName', 'binLocation',
      ]);
      if (updates.unit !== undefined && updates.unit !== trim.unit && (trim.movements || []).length) {
        return errorResponse('A trim unit cannot change after stock movement history has been recorded', 409);
      }
      for (const field of ['name', 'category', 'unit']) {
        if (updates[field] !== undefined) updates[field] = String(updates[field]).trim();
        if (updates[field] !== undefined && !updates[field]) {
          return errorResponse('Trim name, category and unit cannot be empty', 400);
        }
      }
      for (const field of ['minimumStock', 'unitCost']) {
        if (updates[field] === undefined) continue;
        const value = Number(updates[field]);
        if (!Number.isFinite(value) || value < 0) {
          return errorResponse('Trim minimum stock and unit cost must be non-negative valid numbers', 400);
        }
        updates[field] = value;
      }
      Object.assign(trim, updates);
      await trim.save();
      return successResponse({ trim }, 'Trim updated');
    }

    if (action === 'DELETE_TRIM') {
      const trim = await TrimItem.findByIdForUpdate(body.trimId);
      if (!trim) return errorResponse('Trim item not found', 404);
      const linkedOrders = await PurchaseOrder.find({ 'items.stockItemId': trim._id });
      if (Number(trim.currentStock || 0) !== 0 || (trim.movements || []).length || linkedOrders.length) {
        return errorResponse('A trim item referenced by stock, purchase orders or movement history cannot be deleted', 409);
      }
      await TrimItem.deleteOne({ _id: trim._id });
      return successResponse({ trim }, 'Trim deleted');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getTrims, 'trims');
export const POST = withAuthorization(postTrims, 'trims', 'write');
