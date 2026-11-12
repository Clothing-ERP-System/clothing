import { allocateSequence, connectDB, runInTransaction } from '@/lib/db.js';
import WarehouseTransfer from '@/models/WarehouseTransfer.js';
import Fabric from '@/models/Fabric.js';
import TrimItem from '@/models/Trims.js';
import DesignArticle from '@/models/Design.js';
import Location from '@/models/Location.js';
import AuditLog from '@/models/AuditLog.js';
import { AccountHead, JournalEntry } from '@/models/Accounting.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, parseListQuery } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';
import { canAccessModule } from '@/lib/role-access.js';
import { adjustWarehouseStock, recordInventoryMovement, sumAvailableFabricMeters } from '@/lib/inventory.js';
import { postBalancedJournalEntry } from '@/lib/accounting.js';
import { resolveAndValidateMapping, validateMappingsPresent, getCompanyContext } from '@/lib/accounting-mappings.js';
import { randomUUID } from 'node:crypto';

const stockTypes = {
  Fabric: { model: Fabric, field: 'totalAvailableMeters', unit: 'Meters' },
  Trim: { model: TrimItem, field: 'currentStock' },
  FinishedGoods: { model: DesignArticle, field: 'finishedGoodsStock', unit: 'Pieces' },
};

function stockBalance(item, warehouse) {
  return (item.warehouseBalances || []).find((balance) => balance.warehouse === warehouse);
}

async function lockStockItem(type, id) {
  const config = stockTypes[type];
  if (!config || typeof id !== 'string' || !id) return null;
  const item = await config.model.findByIdForUpdate(id);
  return item ? { config, item } : null;
}

function stockCode(type, item) {
  if (type === 'Fabric') return item.fabricCode;
  if (type === 'Trim') return item.trimCode;
  return item.designCode;
}

function stockDescription(type, item) {
  if (type === 'Fabric') return item.name;
  if (type === 'Trim') return item.name;
  return item.title;
}

async function getWarehouse(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const transfers = applyListQuery(await WarehouseTransfer.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['transferNumber', 'challanNumber', 'sourceWarehouse', 'destinationWarehouse', 'vehicleNumber'],
    }).items;
    const [fabrics, trims, designs] = await Promise.all([
      Fabric.find({}),
      TrimItem.find({}),
      DesignArticle.find({}),
    ]);

    const stockItems = [];
    for (const fabric of fabrics) {
      for (const roll of fabric.rolls || []) {
        const quantity = Number(roll.remainingMeters);
        if (roll.status === 'Voided' || roll.status === 'InTransit' || !Number.isFinite(quantity) || quantity <= 0) continue;
        stockItems.push({
          stockItemType: 'Fabric',
          stockItemId: fabric._id,
          stockItemCode: fabric.fabricCode,
          itemDescription: `${fabric.name} — ${roll.rollNumber}`,
          rollNumber: roll.rollNumber,
          warehouseLocation: roll.warehouseLocation || '',
          quantity,
          unit: 'Meters',
        });
      }
    }
    for (const trim of trims) {
      const quantity = Number(trim.currentStock);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      const balances = (trim.warehouseBalances || []).filter((balance) => Number(balance.quantity) > 0);
      if (!balances.length) {
        stockItems.push({
          stockItemType: 'Trim',
          stockItemId: trim._id,
          stockItemCode: trim.trimCode,
          itemDescription: trim.name,
          warehouseLocation: '',
          quantity,
          unit: trim.unit,
        });
      } else {
        for (const balance of balances) {
          stockItems.push({
            stockItemType: 'Trim',
            stockItemId: trim._id,
            stockItemCode: trim.trimCode,
            itemDescription: trim.name,
            warehouseLocation: balance.warehouse,
            quantity: Number(balance.quantity),
            unit: trim.unit,
          });
        }
      }
    }
    for (const design of designs) {
      const quantity = Number(design.finishedGoodsStock);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      const balances = (design.warehouseBalances || []).filter((balance) => Number(balance.quantity) > 0);
      if (!balances.length) {
        stockItems.push({
          stockItemType: 'FinishedGoods',
          stockItemId: design._id,
          stockItemCode: design.designCode,
          itemDescription: design.title,
          warehouseLocation: '',
          quantity,
          unit: 'Pieces',
        });
      } else {
        for (const balance of balances) {
          stockItems.push({
            stockItemType: 'FinishedGoods',
            stockItemId: design._id,
            stockItemCode: design.designCode,
            itemDescription: design.title,
            warehouseLocation: balance.warehouse,
            quantity: Number(balance.quantity),
            unit: 'Pieces',
          });
        }
      }
    }
    return successResponse({ transfers, stockItems });
  } catch (error) {
    return fromError(error);
  }
}

async function postWarehouse(request, actor) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_TRANSFER') {
      return await runInTransaction(async () => {
        const sourceWarehouse = String(body.sourceWarehouse || '').trim();
        const destinationWarehouse = String(body.destinationWarehouse || '').trim();
        const items = body.items;
        if (!sourceWarehouse || !destinationWarehouse ||
          sourceWarehouse.toLowerCase() === destinationWarehouse.toLowerCase() ||
          !Array.isArray(items) || items.length === 0) {
          return errorResponse('Choose different source and destination warehouses and add at least one stock item', 400);
        }
        const transferRequestId = String(body.transferRequestId || '').trim();
        if (!transferRequestId) return errorResponse('A transfer request ID is required', 400);
        const duplicate = await WarehouseTransfer.findOne({ transferRequestId });
        if (duplicate) return successResponse({ transfer: duplicate }, 'Transfer was already dispatched');
        const identities = items.map((item) =>
          `${item?.stockItemType}:${item?.stockItemId}:${item?.rollNumber || ''}`
        );
        if (identities.some((identity) => identity.includes('undefined') || identity.includes(':null')) ||
          new Set(identities).size !== identities.length) {
          return errorResponse('Each transfer line must reference a unique stock item or fabric roll', 400);
        }
        const stockOwners = items.map((item) => `${item.stockItemType}:${item.stockItemId}`);
        if (new Set(stockOwners).size !== stockOwners.length) {
          return errorResponse('Use one transfer line per stock record to prevent conflicting balance updates', 400);
        }

        const validatedItems = [];
        const lockedItems = new Map();
        for (const requested of items) {
          const locked = await lockStockItem(requested.stockItemType, requested.stockItemId);
          if (!locked) return errorResponse('A selected stock item does not exist', 404);
          const { config, item } = locked;
          const quantity = Number(requested.quantity);
          if (!Number.isFinite(quantity) || quantity <= 0 ||
            requested.unit !== (requested.stockItemType === 'Trim' ? item.unit : config.unit) ||
            requested.stockItemType === 'FinishedGoods' && !Number.isSafeInteger(quantity)) {
            return errorResponse('Transfer quantities and stock units must be valid', 400);
          }
          const key = `${requested.stockItemType}:${item._id}:${requested.rollNumber || ''}`;
          if (lockedItems.has(key)) return errorResponse('Duplicate stock references are not allowed in a transfer', 400);

          if (requested.stockItemType === 'Fabric') {
            const roll = (item.rolls || []).find((entry) => entry.rollNumber === requested.rollNumber);
            if (!roll || ['Voided', 'InTransit'].includes(roll.status)) {
              return errorResponse('Select an available fabric roll', 409);
            }
            if (!roll.warehouseLocation && body.confirmUnlocatedStockLocation !== true) {
              return errorResponse('Confirm the physical source location before assigning this unlocated roll', 409);
            }
            const currentLocation = roll.warehouseLocation || sourceWarehouse;
            if (currentLocation !== sourceWarehouse || Number(roll.remainingMeters) !== quantity) {
              return errorResponse('Fabric rolls must be transferred whole from their recorded source warehouse', 409);
            }
            lockedItems.set(key, { ...locked, roll });
            validatedItems.push({
              stockItemType: requested.stockItemType,
              stockItemId: item._id,
              stockItemCode: stockCode(requested.stockItemType, item),
              rollNumber: roll.rollNumber,
              itemDescription: stockDescription(requested.stockItemType, item),
              quantity,
              unit: config.unit,
            });
            continue;
          }

          const totalStock = Number(item[config.field]);
          if (!Number.isFinite(totalStock) || totalStock < 0) {
            return errorResponse('The stock item has an invalid balance', 409);
          }
          const balances = Array.isArray(item.warehouseBalances) ? item.warehouseBalances : [];
          if (!balances.length && totalStock > 0) {
            if (body.confirmUnlocatedStockLocation !== true) {
              return errorResponse('Confirm the physical source location before assigning unlocated stock', 409);
            }
            item.warehouseBalances = [{ warehouse: sourceWarehouse, quantity: totalStock, locationId: sourceLocationId || '' }];
          }
          const balance = stockBalance(item, sourceWarehouse);
          if (!balance || !Number.isFinite(Number(balance.quantity)) || Number(balance.quantity) < quantity) {
            return errorResponse(`Insufficient stock at ${sourceWarehouse} for ${stockCode(requested.stockItemType, item)}`, 409);
          }
          if (quantity > totalStock) return errorResponse('Transfer quantity exceeds total available stock', 409);
          lockedItems.set(key, locked);
          validatedItems.push({
            stockItemType: requested.stockItemType,
            stockItemId: item._id,
            stockItemCode: stockCode(requested.stockItemType, item),
            itemDescription: stockDescription(requested.stockItemType, item),
            quantity,
            unit: requested.stockItemType === 'Trim' ? item.unit : config.unit,
          });
        }

        const sourceLocationInput = body.sourceLocation || {};
        const destinationLocationInput = body.destinationLocation || {};
        let sourceLocationId = null;
        let destinationLocationId = null;
        if (sourceLocationInput.zone || sourceLocationInput.aisle || sourceLocationInput.rack || sourceLocationInput.shelf || sourceLocationInput.bin) {
          const sourceLocation = await Location.findOne({
            zone: sourceLocationInput.zone || '',
            aisle: sourceLocationInput.aisle || '',
            rack: sourceLocationInput.rack || '',
            shelf: sourceLocationInput.shelf || '',
            bin: sourceLocationInput.bin || '',
          });
          if (!sourceLocation) {
            return errorResponse('Source location not found. Define the location hierarchy first.', 409);
          }
          if (sourceLocation.warehouse && sourceLocation.warehouse !== sourceWarehouse) {
            return errorResponse('Source location does not belong to the specified source warehouse', 409);
          }
          sourceLocationId = sourceLocation._id;
        }
        if (destinationLocationInput.zone || destinationLocationInput.aisle || destinationLocationInput.rack || destinationLocationInput.shelf || destinationLocationInput.bin) {
          const destinationLocation = await Location.findOne({
            zone: destinationLocationInput.zone || '',
            aisle: destinationLocationInput.aisle || '',
            rack: destinationLocationInput.rack || '',
            shelf: destinationLocationInput.shelf || '',
            bin: destinationLocationInput.bin || '',
          });
          if (!destinationLocation) {
            return errorResponse('Destination location not found. Define the location hierarchy first.', 409);
          }
          if (destinationLocation.warehouse && destinationLocation.warehouse !== destinationWarehouse) {
            return errorResponse('Destination location does not belong to the specified destination warehouse', 409);
          }
          destinationLocationId = destinationLocation._id;
        }
        const sequence = await allocateSequence('warehouse_transfer');
        const transferNumber = `TRF-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
        const challanNumber = `DC-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
        const transfer = await WarehouseTransfer.create({
          transferNumber,
          transferRequestId,
          challanNumber,
          sourceWarehouse,
          destinationWarehouse,
          sourceLocation: {
            zone: String(sourceLocationInput.zone || '').trim(),
            aisle: String(sourceLocationInput.aisle || '').trim(),
            rack: String(sourceLocationInput.rack || '').trim(),
            shelf: String(sourceLocationInput.shelf || '').trim(),
            bin: String(sourceLocationInput.bin || '').trim(),
            locationId: sourceLocationId,
          },
          destinationLocation: {
            zone: String(destinationLocationInput.zone || '').trim(),
            aisle: String(destinationLocationInput.aisle || '').trim(),
            rack: String(destinationLocationInput.rack || '').trim(),
            shelf: String(destinationLocationInput.shelf || '').trim(),
            bin: String(destinationLocationInput.bin || '').trim(),
            locationId: destinationLocationId,
          },
          vehicleNumber: String(body.vehicleNumber || '').trim(),
          driverName: String(body.driverName || '').trim(),
          driverPhone: String(body.driverPhone || '').trim(),
          status: 'DispatchedInTransit',
          items: validatedItems,
          dispatchedBy: String(body.dispatchedBy || '').trim(),
          dispatchedDate: new Date(),
          notes: String(body.notes || '').trim(),
        });

        for (const requested of items) {
          const key = `${requested.stockItemType}:${requested.stockItemId}:${requested.rollNumber || ''}`;
          const { config, item } = lockedItems.get(key);
          const line = validatedItems.find((entry) =>
            entry.stockItemType === requested.stockItemType &&
            entry.stockItemId === item._id &&
            entry.rollNumber === (requested.rollNumber || undefined)
          );
          if (requested.stockItemType === 'Fabric') {
            const roll = lockedItems.get(key).roll;
            roll.warehouseLocation = sourceWarehouse;
            roll.status = 'InTransit';
            recordInventoryMovement(item, {
              type: 'WAREHOUSE_TRANSFER_OUT',
              quantity: line.quantity,
              unit: line.unit,
              direction: 'OUT',
              referenceType: 'WarehouseTransfer',
              referenceId: transfer._id,
              referenceNumber: transfer.transferNumber,
              sourceItemId: roll.rollNumber,
              notes: `${sourceWarehouse} to ${destinationWarehouse}`,
            });
            item.movements[item.movements.length - 1].warehouseLocation = sourceWarehouse;
          } else {
            if (!adjustWarehouseStock(item, config.field, sourceWarehouse, -line.quantity)) {
              return errorResponse(`Source balance for ${line.stockItemCode} is inconsistent`, 409);
            }
            recordInventoryMovement(item, {
              type: 'WAREHOUSE_TRANSFER_OUT',
              quantity: line.quantity,
              unit: line.unit,
              direction: 'OUT',
              referenceType: 'WarehouseTransfer',
              referenceId: transfer._id,
              referenceNumber: transfer.transferNumber,
              sourceItemId: line.stockItemCode,
              notes: `${sourceWarehouse} to ${destinationWarehouse}`,
            });
            item.movements[item.movements.length - 1].warehouseLocation = sourceWarehouse;
          }
          await item.save();
        }
        const fabricItems = new Set(validatedItems.filter((item) => item.stockItemType === 'Fabric').map((item) => item.stockItemId));
        for (const fabricId of fabricItems) {
          const fabric = lockedItems.get(`Fabric:${fabricId}:${validatedItems.find((item) =>
            item.stockItemType === 'Fabric' && item.stockItemId === fabricId
          ).rollNumber}`).item;
          fabric.totalAvailableMeters = sumAvailableFabricMeters(fabric);
          await fabric.save();
        }
        await AuditLog.create({
          userName: String(body.dispatchedBy || ''),
          action: 'DISPATCH',
          module: 'Warehouse & Logistics',
          recordId: transferNumber,
          description: `Dispatched ${challanNumber} from ${sourceWarehouse} to ${destinationWarehouse}`,
        });
        return successResponse({ transfer }, 'Stock transfer dispatched');
      });
    }

    if (action === 'CONFIRM_RECEIPT') {
      return await runInTransaction(async () => {
        const existing = await WarehouseTransfer.findById(body.transferId);
        const transfer = existing ? await WarehouseTransfer.findByIdForUpdate(existing._id) : null;
        if (!transfer) return errorResponse('Transfer record not found', 404);
        if (transfer.status !== 'DispatchedInTransit') {
          return errorResponse('Only a dispatched transfer can be received; duplicate receipts are rejected', 409);
        }
        const receivedBy = String(body.receivedBy || '').trim();
        if (!receivedBy) return errorResponse('Receiver name is required', 400);
        const lockedItems = new Map();
        for (const line of transfer.items || []) {
          const key = `${line.stockItemType}:${line.stockItemId}:${line.rollNumber || ''}`;
          const locked = await lockStockItem(line.stockItemType, line.stockItemId);
          if (!locked) return errorResponse(`Stock item ${line.stockItemCode} no longer exists`, 409);
          if (lockedItems.has(key)) return errorResponse('Transfer contains duplicate stock references', 409);
          lockedItems.set(key, { ...locked, line });
        }
        for (const [key, { config, item, line }] of lockedItems) {
          if (line.stockItemType === 'Fabric') {
            const roll = (item.rolls || []).find((entry) =>
              entry.rollNumber === line.rollNumber && entry.status === 'InTransit' &&
              entry.warehouseLocation === transfer.sourceWarehouse
            );
            if (!roll || Number(roll.remainingMeters) !== Number(line.quantity)) {
              return errorResponse(`Fabric roll ${line.rollNumber} no longer matches the dispatched quantity`, 409);
            }
            roll.warehouseLocation = transfer.destinationWarehouse;
            roll.locationId = transfer.destinationLocation?.locationId || '';
            roll.status = 'Available';
            recordInventoryMovement(item, {
              type: 'WAREHOUSE_TRANSFER_IN',
              quantity: line.quantity,
              unit: line.unit,
              referenceType: 'WarehouseTransfer',
              referenceId: transfer._id,
              referenceNumber: transfer.transferNumber,
              sourceItemId: line.rollNumber,
              notes: `${transfer.sourceWarehouse} to ${transfer.destinationWarehouse}`,
              warehouseLocation: transfer.destinationWarehouse,
            });
            item.movements[item.movements.length - 1].warehouseLocation = transfer.destinationWarehouse;
            item.movements[item.movements.length - 1].locationId = transfer.destinationLocation?.locationId || '';
            item.totalAvailableMeters = sumAvailableFabricMeters(item);
          } else {
            if (!adjustWarehouseStock(item, config.field, transfer.destinationWarehouse, Number(line.quantity), false, transfer.destinationLocation?.locationId || '')) {
              return errorResponse(`Destination balance for ${line.stockItemCode} is invalid`, 409);
            }
            // Update the warehouse balance to reference the destination bin location
            const destBalance = item.warehouseBalances?.find((b) => b.warehouse === transfer.destinationWarehouse);
            if (destBalance && transfer.destinationLocation?.locationId) {
              destBalance.locationId = transfer.destinationLocation.locationId;
            }
            recordInventoryMovement(item, {
              type: 'WAREHOUSE_TRANSFER_IN',
              quantity: line.quantity,
              unit: line.unit,
              referenceType: 'WarehouseTransfer',
              referenceId: transfer._id,
              referenceNumber: transfer.transferNumber,
              sourceItemId: line.stockItemCode,
              notes: `${transfer.sourceWarehouse} to ${transfer.destinationWarehouse}`,
              warehouseLocation: transfer.destinationWarehouse,
            });
            item.movements[item.movements.length - 1].warehouseLocation = transfer.destinationWarehouse;
            item.movements[item.movements.length - 1].locationId = transfer.destinationLocation?.locationId || '';
          }
          await item.save();
        }
        transfer.status = 'ReceivedAndVerified';
        transfer.receivedBy = receivedBy;
        transfer.receivedDate = new Date();
        await transfer.save();
        await AuditLog.create({
          userName: receivedBy,
          action: 'RECEIVE',
          module: 'Warehouse & Logistics',
          recordId: transfer.transferNumber,
          description: `Received ${transfer.challanNumber} into ${transfer.destinationWarehouse}`,
        });
        return successResponse({ transfer }, 'Transfer verified and received in destination warehouse');
      });
    }

    if (action === 'DELETE_TRANSFER') {
      return errorResponse('A dispatched transfer cannot be deleted because it has stock movement history', 409);
    }

    if (action === 'ADJUST_STOCK') {
      return await runInTransaction(async () => {
        const {
          stockItemType,
          stockItemId,
          quantity,
          adjustmentType,
          reason,
          warehouse,
          location,
          warehouseLocation,
          approvalReference,
          postedBy,
        } = body;

        if (!stockItemType || !['Fabric', 'Trim', 'FinishedGoods'].includes(stockItemType)) {
          return errorResponse('Valid stock item type (Fabric, Trim, FinishedGoods) is required', 400);
        }
        if (!stockItemId || typeof stockItemId !== 'string') {
          return errorResponse('Stock item ID is required', 400);
        }
        const adjQuantity = Number(quantity);
        if (!Number.isFinite(adjQuantity) || adjQuantity === 0) {
          return errorResponse('Adjustment quantity must be a non-zero number', 400);
        }
        if (!adjustmentType || !['STOCK_IN', 'STOCK_OUT', 'STOCK_CORRECTION'].includes(adjustmentType)) {
          return errorResponse('Valid adjustment type (STOCK_IN, STOCK_OUT, STOCK_CORRECTION) is required', 400);
        }
        if (!reason || !String(reason).trim()) {
          return errorResponse('Adjustment reason is required', 400);
        }
        const adjWarehouse = String(warehouse || warehouseLocation || '').trim();
        if (!adjWarehouse) {
          return errorResponse('Warehouse is required', 400);
        }
        const adjLocation = String(location || '').trim();
        const adjApprovalRef = String(approvalReference || '').trim();
        const adjPostedBy = String(postedBy || '').trim();

        // Authorization check for warehouse stock adjustments
        const adjustingUser = actor || { role: 'Viewer', name: adjPostedBy || 'Unknown' };
        if (!await canAccessModule(adjustingUser, 'warehouse', 'adjust')) {
          return errorResponse('Warehouse adjustment permission is required', 403);
        }

        // Idempotency key
        const adjustSourceKey = `STOCK_ADJUST:${stockItemType}:${stockItemId}:${adjWarehouse}:${adjQuantity}:${String(reason).trim()}`;
        const existingAdjustment = await JournalEntry.findOne({ sourceKey: adjustSourceKey });
        if (existingAdjustment) {
          return successResponse({ journalEntry: existingAdjustment, duplicate: true }, 'Stock adjustment was already posted', 200);
        }

        const config = stockTypes[stockItemType];
        if (!config) return errorResponse(`Unsupported stock item type: ${stockItemType}`, 409);

        const item = await config.model.findByIdForUpdate(stockItemId);
        if (!item) return errorResponse(`Stock item ${stockItemId} not found`, 404);

        // Validate stock availability for STOCK_OUT
        if (adjustmentType === 'STOCK_OUT') {
          const totalStock = Number(item[config.field]);
          if (!Number.isFinite(totalStock) || totalStock < adjQuantity) {
            return errorResponse(`Insufficient stock for ${stockCode(stockItemType, item)}: available ${totalStock}, requested ${adjQuantity}`, 409);
          }
          const balances = Array.isArray(item.warehouseBalances) ? item.warehouseBalances : [];
          const balance = balances.find((b) => b.warehouse === adjWarehouse);
          const balanceQty = balance ? Number(balance.quantity) : 0;
          if (balanceQty < adjQuantity) {
            return errorResponse(`Insufficient stock at ${adjWarehouse} for ${stockCode(stockItemType, item)}: available ${balanceQty}, requested ${adjQuantity}`, 409);
          }
        }

        // Resolve item's verified unit cost
        let unitCost = 0;
        if (stockItemType === 'Fabric') {
          unitCost = Number(item.averageCostPerMeter || 0);
        } else if (stockItemType === 'Trim') {
          unitCost = Number(item.unitCost || 0);
        } else if (stockItemType === 'FinishedGoods') {
          unitCost = Number(item.finishedGoodsCostPerUnit || 0);
        }
        if (!Number.isFinite(unitCost) || unitCost <= 0) {
          return errorResponse(`Cannot adjust stock for ${stockCode(stockItemType, item)}: item has no valid recorded unit cost`, 409);
        }
        const adjustmentAmount = Math.round(Math.abs(adjQuantity) * unitCost * 100) / 100;
        if (adjustmentAmount <= 0) {
          return errorResponse('Calculated adjustment valuation must be greater than zero', 400);
        }

        // Resolve inventory adjustment account mapping
        const company = await getCompanyContext();
        const mappings = company && company.accountingMappings ? company.accountingMappings : {};
        const expenseResult = await resolveAndValidateMapping(mappings, 'expenseAccountCode', 'OperatingExpense');
        const inventoryResult = await resolveAndValidateMapping(mappings, 'inventoryAccountCode', 'Asset');

        if (expenseResult.error || inventoryResult.error || !expenseResult.account || !inventoryResult.account) {
          return errorResponse(
            `Inventory adjustment accounting mapping is incomplete: ${expenseResult.error || inventoryResult.error || 'Configure inventory and expense accounts in Administration'}`,
            409,
          );
        }

        // Post inventory adjustment journal
        const isStockIn = adjustmentType === 'STOCK_IN';
        const debitAccount = isStockIn ? inventoryResult.account : expenseResult.account;
        const creditAccount = isStockIn ? expenseResult.account : inventoryResult.account;

        const { entry: adjustJournal } = await postBalancedJournalEntry({
          sourceKey: adjustSourceKey,
          voucherType: 'StockAdjustment',
          narration: `Stock adjustment: ${adjustmentType} ${adjQuantity} ${stockCode(stockItemType, item)} - ${String(reason).trim()}`,
          referenceNumber: adjustSourceKey,
          postedBy: adjustingUser.name || adjPostedBy || '',
          lines: [
            {
              accountCode: debitAccount.code,
              accountName: debitAccount.name,
              debit: adjustmentAmount,
              credit: 0,
              memo: `Stock ${adjustmentType.toLowerCase()} for ${stockCode(stockItemType, item)}: ${adjQuantity} @ Rs. ${unitCost}`,
            },
            {
              accountCode: creditAccount.code,
              accountName: creditAccount.name,
              debit: 0,
              credit: adjustmentAmount,
              memo: `Stock ${adjustmentType.toLowerCase()} for ${stockCode(stockItemType, item)}: ${adjQuantity} @ Rs. ${unitCost}`,
            },
          ],
        });
        const financialPosted = true;
        const financialEntryId = adjustJournal._id;

        // Update stock
        const stockAdjustment = adjustmentType === 'STOCK_OUT' ? -adjQuantity : adjQuantity;
        if (!adjustWarehouseStock(item, config.field, adjWarehouse, stockAdjustment, true, adjLocation)) {
          return errorResponse(`Stock balance for ${stockCode(stockItemType, item)} at ${adjWarehouse} is inconsistent`, 409);
        }

        recordInventoryMovement(item, {
          type: 'STOCK_ADJUSTMENT',
          quantity: Math.abs(adjQuantity),
          unit: config.unit,
          direction: adjustmentType === 'STOCK_OUT' ? 'OUT' : 'IN',
          referenceType: 'StockAdjustment',
          referenceId: item._id,
          referenceNumber: adjustSourceKey,
          sourceItemId: stockCode(stockItemType, item),
          warehouseLocation: adjWarehouse,
          notes: `${adjustmentType}: ${String(reason).trim()} - ${adjQuantity} ${config.unit}`,
        });
        item.movements[item.movements.length - 1].warehouseLocation = adjWarehouse;
        if (adjLocation) item.movements[item.movements.length - 1].locationId = adjLocation;

        if (stockItemType === 'Fabric') {
          item.totalAvailableMeters = sumAvailableFabricMeters(item);
        }
        await item.save();

        await AuditLog.create({
          userName: adjPostedBy,
          action: 'STOCK_ADJUST',
          module: 'Warehouse & Logistics',
          recordId: stockItemId,
          description: `Stock adjustment ${adjustmentType} ${adjQuantity} ${stockCode(stockItemType, item)} at ${adjWarehouse} - ${String(reason).trim()}`,
        });

        return successResponse({
          stockItemId,
          stockItemType,
          adjustmentType,
          quantity: Math.abs(adjQuantity),
          warehouse: adjWarehouse,
          location: adjLocation,
          financialPosted,
          financialEntryId,
          reason: String(reason).trim(),
        }, 'Stock adjustment posted successfully');
      });
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getWarehouse, 'warehouse');
export const POST = withAuthorization(postWarehouse, 'warehouse', 'write');
