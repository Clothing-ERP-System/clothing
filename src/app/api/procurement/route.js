import { allocateSequence, connectDB } from '@/lib/db.js';
import Supplier from '@/models/Supplier.js';
import PurchaseOrder from '@/models/PurchaseOrder.js';
import Fabric from '@/models/Fabric.js';
import TrimItem from '@/models/Trims.js';
import { AccountHead } from '@/models/Accounting.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, parseListQuery, pickFields } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';
import { adjustWarehouseStock, recordInventoryMovement, sumAvailableFabricMeters } from '@/lib/inventory.js';
import { randomUUID } from 'node:crypto';
import { postBalancedJournalEntry } from '@/lib/accounting.js';
import ApprovalPolicy from '@/models/ApprovalPolicy.js';
import ApprovalRequest from '@/models/ApprovalRequest.js';
import { startApprovalRequest } from '@/lib/approval-workflow.js';
import { canAccessModule } from '@/lib/role-access.js';

async function getProcurement(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const suppliers = applyListQuery(await Supplier.find({}).sort({ name: 1 }), query, {
      searchFields: ['name', 'supplierCode', 'phone', 'city', 'category'],
    }).items;
    const activePurchaseOrderPolicy = await ApprovalPolicy.findOne({
      policyKey: 'procurement:purchase_order',
      isActive: true,
    });
    const purchaseOrders = applyListQuery(await PurchaseOrder.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['poNumber', 'supplierName', 'notes'],
    }).items.map((order) => ({
      ...order,
      approvalPolicyActive: Boolean(activePurchaseOrderPolicy),
    }));
    const [fabricItems, trimItems] = await Promise.all([
      Fabric.find({}).sort({ name: 1 }),
      TrimItem.find({}).sort({ name: 1 }),
    ]);
    const accounts = await AccountHead.find({}).sort({ code: 1 });

    return successResponse({
      suppliers,
      purchaseOrders,
      fabricItems: fabricItems.map(({ _id, fabricCode, name, totalAvailableMeters }) => ({
        id: _id, code: fabricCode, name, available: Number(totalAvailableMeters) || 0, unit: 'Meters',
      })),
      trimItems: trimItems.map(({ _id, trimCode, name, unit, currentStock }) => ({
        id: _id, code: trimCode, name, available: Number(currentStock) || 0, unit: unit || '',
      })),
      financialAccounts: accounts.map(({ code, name, type }) => ({ code, name, type })),
    });
  } catch (error) {
    return fromError(error);
  }
}

async function postProcurement(request, actor) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_PO') {
      const {
        supplierName,
        items,
        notes,
        paymentTerms,
        expectedDeliveryDate,
        inventoryAccountCode,
        payableAccountCode,
      } = body;
      const normalizedSupplierName = String(supplierName || '').trim();
      if (!normalizedSupplierName || !Array.isArray(items) || items.length === 0) {
        return errorResponse('Select a supplier and add at least one purchase order item', 400);
      }
      const existingSupplier = await Supplier.findOne({ name: normalizedSupplierName });
      const supplier = existingSupplier ? await Supplier.findByIdForUpdate(existingSupplier._id) : null;
      if (!supplier) return errorResponse('Selected supplier was not found', 404);
      const inventoryAccount = await AccountHead.findOne({ code: inventoryAccountCode });
      const payableAccount = await AccountHead.findOne({ code: payableAccountCode });
      if (!inventoryAccount || inventoryAccount.type !== 'Asset' ||
        !payableAccount || payableAccount.type !== 'Liability') {
        return errorResponse('Select an inventory asset account and a supplier payable liability account', 400);
      }
      if (items.some((item) =>
        !item || !['Fabric', 'Trim'].includes(item.stockItemType) ||
        typeof item.stockItemId !== 'string' || !item.stockItemId ||
        !Number.isFinite(Number(item.orderedQty)) || Number(item.orderedQty) <= 0 ||
        !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0
      )) {
        return errorResponse('Each purchase order item must reference fabric or trim stock and have a positive quantity and non-negative unit price', 400);
      }
      const itemReferences = items.map((item) => `${item.stockItemType}:${item.stockItemId}`);
      if (new Set(itemReferences).size !== itemReferences.length) {
        return errorResponse('Each stock item can appear only once on a purchase order', 400);
      }
      let subtotal = 0;
      const calculatedItems = [];
      for (const item of items) {
        const stockItemModel = item.stockItemType === 'Fabric' ? Fabric : TrimItem;
        const stockItem = await stockItemModel.findByIdForUpdate(item.stockItemId);
        if (!stockItem) return errorResponse('A selected stock item no longer exists', 404);
        const orderedQty = Number(item.orderedQty);
        const unitPrice = Number(item.unitPrice);
        const lineTotal = orderedQty * unitPrice;
        subtotal += lineTotal;
        calculatedItems.push({
          lineId: randomUUID(),
          stockItemType: item.stockItemType,
          stockItemId: stockItem._id,
          stockItemCode: item.stockItemType === 'Fabric' ? stockItem.fabricCode : stockItem.trimCode,
          description: stockItem.name,
          unit: item.stockItemType === 'Fabric' ? 'Meters' : stockItem.unit || '',
          orderedQty,
          unitPrice,
          totalPrice: lineTotal,
          receivedQty: 0,
        });
      }
      if (!Number.isFinite(subtotal)) {
        return errorResponse('Purchase order total is outside the supported range', 400);
      }
      const sequence = await allocateSequence('purchase_order');
      const poNumber = `PO-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const po = await PurchaseOrder.create({
        poNumber,
        supplierId: supplier._id,
        supplierName: normalizedSupplierName,
        items: calculatedItems,
        subtotal,
        taxPercentage: 0,
        taxAmount: 0,
        grandTotal: subtotal,
        paymentTerms: paymentTerms || '',
        inventoryAccountCode: inventoryAccount.code,
        payableAccountCode: payableAccount.code,
        expectedDeliveryDate: expectedDeliveryDate || null,
        notes: notes || '',
        status: 'PendingApproval',
      });
      const approvalPolicy = await ApprovalPolicy.findOne({
        policyKey: 'procurement:purchase_order',
        isActive: true,
      });
      if (approvalPolicy) {
        const approvalResult = await startApprovalRequest({
          module: 'procurement',
          documentType: 'purchase_order',
          documentId: po._id,
          requestId: randomUUID(),
          amount: subtotal,
          actor,
          record: po,
        });
        if (approvalResult.error) return errorResponse(approvalResult.error, 409);
      }

      await AuditLog.create({
        userName: '',
        action: 'CREATE',
        module: 'Procurement',
        recordId: po.poNumber,
        description: `Generated Purchase Order ${po.poNumber} for ${normalizedSupplierName} (Total: Rs. ${subtotal.toLocaleString()})`,
      });

      return successResponse({ purchaseOrder: po }, 'Purchase Order created successfully');
    }

    if (action === 'RECEIVE_GRN') {
      const { poNumber, challanNumber, receivedItems, receivedBy } = body;
      const warehouseLocation = String(body.warehouseLocation || '').trim();
      if (!warehouseLocation) return errorResponse('Select the warehouse receiving these goods', 400);
      const existingPo = await PurchaseOrder.findOne({ poNumber });
      const po = existingPo ? await PurchaseOrder.findByIdForUpdate(existingPo._id) : null;
      if (!po) return errorResponse('Purchase Order not found', 404);
      const supplierRecord = po.supplierId
        ? await Supplier.findById(po.supplierId)
        : await Supplier.findOne({ name: po.supplierName });
      const supplier = supplierRecord ? await Supplier.findByIdForUpdate(supplierRecord._id) : null;
      if (!supplier) return errorResponse('The supplier linked to this purchase order no longer exists', 409);
      if (!['Approved', 'Partially Received'].includes(po.status)) {
        return errorResponse('This purchase order cannot receive additional goods', 409);
      }
      const normalizedChallan = String(challanNumber || '').trim();
      if (!normalizedChallan) return errorResponse('Supplier delivery challan number is required', 400);
      const challanKey = normalizedChallan.toLowerCase();
      if ((supplier.grnChallans || []).includes(challanKey)) {
        return errorResponse('This supplier delivery challan has already been received', 409);
      }
      if ((po.grns || []).some((grn) =>
        String(grn.challanNumber || '').trim().toLowerCase() === normalizedChallan.toLowerCase()
      )) {
        return errorResponse('This supplier delivery challan has already been recorded against the purchase order', 409);
      }

      if (!Array.isArray(receivedItems) || receivedItems.length === 0) {
        return errorResponse('Add at least one item to the goods receipt', 400);
      }
      const poItemsByLineId = new Map();
      for (const poItem of po.items || []) {
        const key = String(poItem.lineId || '');
        const orderedQuantity = Number(poItem.orderedQty);
        const previouslyReceived = Number(poItem.receivedQty || 0);
        if (!key || poItemsByLineId.has(key) ||
          !Number.isFinite(orderedQuantity) || orderedQuantity <= 0 ||
          !Number.isFinite(previouslyReceived) || previouslyReceived < 0 ||
          previouslyReceived > orderedQuantity) {
          return errorResponse('This purchase order has invalid or ambiguous stock item lines and cannot receive goods safely', 409);
        }
        poItemsByLineId.set(key, poItem);
      }
      const receiptTotals = new Map();
      const grnItems = [];

      for (const item of receivedItems) {
        const quantityReceived = Number(item?.quantityReceived);
        if (item?.quantityReceived === '' || quantityReceived === 0) continue;
        const key = String(item?.lineId || '');
        const targetPoItem = poItemsByLineId.get(key);
        if (!targetPoItem) {
          return errorResponse('A received item does not match a purchase order stock line', 400);
        }
        if (!Number.isFinite(quantityReceived) || quantityReceived <= 0) {
          return errorResponse(`Enter a positive received quantity for "${targetPoItem.description}"`, 400);
        }
        const orderedQuantity = Number(targetPoItem.orderedQty);
        const previouslyReceived = Number(targetPoItem.receivedQty || 0);
        if (!Number.isFinite(orderedQuantity) || orderedQuantity <= 0 ||
          !Number.isFinite(previouslyReceived) || previouslyReceived < 0) {
          return errorResponse(`Purchase order quantity for "${targetPoItem.description}" is invalid`, 409);
        }
        const cumulativeReceived = previouslyReceived +
          (receiptTotals.get(key) || 0) + quantityReceived;
        if (cumulativeReceived > orderedQuantity) {
          return errorResponse(`Received quantity for "${targetPoItem.description}" exceeds the remaining purchase order quantity`, 409);
        }
        const rolls = Array.isArray(item.rolls) ? item.rolls : [];
        if (targetPoItem.stockItemType === 'Fabric') {
          const rollMeters = rolls.map((roll) => Number(roll.meters));
          if (!rolls.length || rollMeters.some((meters) => !Number.isFinite(meters) || meters <= 0) ||
            Math.abs(rollMeters.reduce((sum, meters) => sum + meters, 0) - quantityReceived) > 0.000001) {
            return errorResponse(`Enter each received roll length for "${targetPoItem.description}" so the lengths equal the received quantity`, 400);
          }
        } else if (rolls.length) {
          return errorResponse('Roll lengths can only be provided for fabric receipts', 400);
        }
        const receivedValue = quantityReceived * Number(targetPoItem.unitPrice);
        if (!Number.isFinite(receivedValue) || receivedValue < 0) {
          return errorResponse(`Purchase order price for "${targetPoItem.description}" is invalid`, 409);
        }
        receiptTotals.set(key, (receiptTotals.get(key) || 0) + quantityReceived);
        grnItems.push({
          lineId: targetPoItem.lineId,
          stockItemType: targetPoItem.stockItemType,
          stockItemId: targetPoItem.stockItemId,
          stockItemCode: targetPoItem.stockItemCode,
          itemDescription: targetPoItem.description,
          unit: targetPoItem.unit,
          quantityReceived,
          rolls,
          inspectionStatus: 'PendingInspection',
          remarks: item.remarks || '',
        });
      }

      if (!grnItems.length) {
        return errorResponse('Enter a positive received quantity for at least one purchase order item', 400);
      }

      const sequence = await allocateSequence('goods_receipt');
      const grnNumber = `GRN-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
      const receivedValue = grnItems.reduce((sum, item) => {
        const poItem = poItemsByLineId.get(item.lineId);
        return sum + Number(item.quantityReceived) * Number(poItem.unitPrice);
      }, 0);
      if (!Number.isFinite(receivedValue) || receivedValue < 0) {
        return errorResponse('Goods receipt value is outside the supported range', 409);
      }
      for (const [lineId, quantity] of receiptTotals) {
        poItemsByLineId.get(lineId).receivedQty =
          (Number(poItemsByLineId.get(lineId).receivedQty) || 0) + quantity;
      }
      po.grns = [...(po.grns || []), {
        grnNumber,
        receivedDate: new Date(),
        challanNumber: normalizedChallan,
        receivedBy: receivedBy || '',
        warehouseLocation,
        items: grnItems,
        receivedValue,
        totalReceivedValue: 0,
        status: 'PendingInspection',
      }];
      supplier.grnChallans = [...(supplier.grnChallans || []), challanKey];

      const allReceived = po.items.every(i => Number(i.receivedQty || 0) >= Number(i.orderedQty || 0));
      po.status = allReceived ? 'Completed' : 'Partially Received';
      await po.save();
      await supplier.save();

      await AuditLog.create({
        userName: receivedBy || '',
        action: 'CREATE',
        module: 'Procurement',
        recordId: grnNumber,
        description: `Goods Receipt Note ${grnNumber} recorded for inspection against ${poNumber}`,
      });

      return successResponse({ po, grnNumber }, 'Goods receipt recorded and held pending inspection');
    }

    if (action === 'APPROVE_GRN_INSPECTION') {
      if (!await canAccessModule(actor, 'procurement', 'approve')) {
        return errorResponse('Procurement approval permission is required to inspect received goods', 403);
      }
      const po = await PurchaseOrder.findByIdForUpdate(String(body.poId || ''));
      if (!po) return errorResponse('Purchase Order not found', 404);
      const grn = (po.grns || []).find((item) => item.grnNumber === body.grnNumber);
      if (!grn) return errorResponse('Goods Receipt Note not found', 404);
      if (grn.status !== 'PendingInspection') {
        return errorResponse('This goods receipt has already been inspected', 409);
      }
      if (!Array.isArray(body.decisions) || body.decisions.length !== grn.items.length) {
        return errorResponse('Provide an inspection decision for every received stock line', 400);
      }
      const poLines = new Map((po.items || []).map((item) => [String(item.lineId), item]));
      const decisionMap = new Map();
      for (const decision of body.decisions) {
        const lineId = String(decision?.lineId || '');
        if (!lineId || decisionMap.has(lineId)) {
          return errorResponse('Each received stock line must have exactly one inspection decision', 400);
        }
        decisionMap.set(lineId, decision);
      }

      const acceptedByLine = new Map();
      let acceptedValue = 0;
      for (const received of grn.items) {
        const lineId = String(received.lineId || '');
        const poLine = poLines.get(lineId);
        const decision = decisionMap.get(lineId);
        if (!poLine || !decision) {
          return errorResponse('An inspected stock line does not match the purchase order', 409);
        }
        const acceptedQuantity = Number(decision.acceptedQuantity);
        const rejectedQuantity = Number(decision.rejectedQuantity);
        const receivedQuantity = Number(received.quantityReceived);
        const unitPrice = Number(poLine.unitPrice);
        if (![acceptedQuantity, rejectedQuantity, receivedQuantity].every(Number.isFinite) ||
          acceptedQuantity < 0 || rejectedQuantity < 0 || receivedQuantity <= 0 ||
          Math.abs(acceptedQuantity + rejectedQuantity - receivedQuantity) > 0.000001 ||
          !Number.isFinite(unitPrice) || unitPrice < 0) {
          return errorResponse(`Accepted and rejected quantities must equal the received quantity for "${received.itemDescription}"`, 400);
        }
        const rejectionReason = String(decision.rejectionReason || '').trim();
        if (rejectedQuantity > 0 && !rejectionReason) {
          return errorResponse(`A rejection reason is required for "${received.itemDescription}"`, 400);
        }
        if (rejectionReason.length > 1000) {
          return errorResponse('Inspection rejection reason must be 1,000 characters or fewer', 400);
        }

        if (received.stockItemType === 'Fabric') {
          if (!Array.isArray(received.rolls) || !received.rolls.length ||
            !Array.isArray(decision.rolls) || decision.rolls.length !== received.rolls.length) {
            return errorResponse(`Provide a separate inspection decision for every fabric roll in "${received.itemDescription}"`, 400);
          }
          const rollDecisions = new Map();
          for (const rollDecision of decision.rolls) {
            const rollIndex = Number(rollDecision?.rollIndex);
            if (!Number.isSafeInteger(rollIndex) || rollIndex < 0 ||
              rollIndex >= received.rolls.length || rollDecisions.has(rollIndex)) {
              return errorResponse('Fabric roll inspection references are invalid or duplicated', 400);
            }
            const acceptedMeters = Number(rollDecision.acceptedMeters);
            const rejectedMeters = Number(rollDecision.rejectedMeters);
            const rollMeters = Number(received.rolls[rollIndex]?.meters);
            const rollReason = String(rollDecision.rejectionReason || rejectionReason).trim();
            if (![acceptedMeters, rejectedMeters, rollMeters].every(Number.isFinite) ||
              acceptedMeters < 0 || rejectedMeters < 0 || rollMeters <= 0 ||
              Math.abs(acceptedMeters + rejectedMeters - rollMeters) > 0.000001 ||
              rejectedMeters > 0 && !rollReason) {
              return errorResponse(`Accepted and rejected meters must match each received roll in "${received.itemDescription}"`, 400);
            }
            rollDecisions.set(rollIndex, {
              acceptedMeters,
              rejectedMeters,
              rejectionReason: rollReason.slice(0, 1000),
            });
          }
          const rollAccepted = [...rollDecisions.values()].reduce((sum, item) => sum + item.acceptedMeters, 0);
          const rollRejected = [...rollDecisions.values()].reduce((sum, item) => sum + item.rejectedMeters, 0);
          if (Math.abs(rollAccepted - acceptedQuantity) > 0.000001 ||
            Math.abs(rollRejected - rejectedQuantity) > 0.000001) {
            return errorResponse(`Roll-level inspection totals do not match "${received.itemDescription}"`, 400);
          }
          decision.rollDecisions = rollDecisions;
        } else if (received.stockItemType !== 'Trim' || (decision.rolls || []).length) {
          return errorResponse('This goods receipt contains an unsupported inspection stock type', 409);
        }

        acceptedByLine.set(lineId, { acceptedQuantity, rejectedQuantity, decision });
        acceptedValue += acceptedQuantity * unitPrice;
      }
      if (!Number.isFinite(acceptedValue)) {
        return errorResponse('Accepted goods value is outside the supported range', 400);
      }

      const supplierRecord = po.supplierId
        ? await Supplier.findById(po.supplierId)
        : await Supplier.findOne({ name: po.supplierName });
      const supplier = supplierRecord ? await Supplier.findByIdForUpdate(supplierRecord._id) : null;
      if (!supplier) return errorResponse('The supplier linked to this purchase order no longer exists', 409);
      const warehouseLocation = String(grn.warehouseLocation || '').trim();
      if (!warehouseLocation) return errorResponse('The receiving warehouse was not recorded for this GRN', 409);

      for (const received of grn.items) {
        const { acceptedQuantity, rejectedQuantity, decision } = acceptedByLine.get(String(received.lineId));
        const poLine = poLines.get(String(received.lineId));
        const priorReceived = Number(poLine.receivedQty || 0);
        const priorRejected = Number(poLine.rejectedQty || 0);
        if (!Number.isFinite(priorReceived) || priorReceived < rejectedQuantity ||
          !Number.isFinite(priorRejected) || priorRejected < 0) {
          return errorResponse(`Purchase order receiving totals are inconsistent for "${received.itemDescription}"`, 409);
        }
        poLine.receivedQty = priorReceived - rejectedQuantity;
        poLine.rejectedQty = priorRejected + rejectedQuantity;
        received.acceptedQuantity = acceptedQuantity;
        received.rejectedQuantity = rejectedQuantity;
        received.rejectionReason = String(decision.rejectionReason || '').trim();
        received.inspectionStatus = rejectedQuantity === 0
          ? 'Accepted'
          : acceptedQuantity === 0 ? 'Rejected' : 'PartiallyAccepted';
        received.inspectedBy = actor.name || '';
        received.inspectedAt = new Date();

        if (received.stockItemType === 'Fabric') {
          const fabric = await Fabric.findByIdForUpdate(received.stockItemId);
          if (!fabric) return errorResponse(`Fabric item "${received.itemDescription}" no longer exists`, 409);
          const storedRolls = [];
          for (let index = 0; index < received.rolls.length; index += 1) {
            const receivedRoll = received.rolls[index];
            const inspection = decision.rollDecisions.get(index);
            receivedRoll.acceptedMeters = inspection.acceptedMeters;
            receivedRoll.rejectedMeters = inspection.rejectedMeters;
            receivedRoll.rejectionReason = inspection.rejectionReason;
            if (!inspection.acceptedMeters) continue;

            const rollSequence = await allocateSequence('fabric_roll');
            const rollNumber = `ROL-${new Date().getFullYear()}-${String(rollSequence).padStart(5, '0')}`;
            const roll = {
              rollNumber,
              barcode: `FAB${String(rollSequence).padStart(10, '0')}`,
              lotNumber: String(receivedRoll.supplierRollNumber || '').trim(),
              initialMeters: inspection.acceptedMeters,
              remainingMeters: inspection.acceptedMeters,
              widthInches: Number(fabric.widthInches) || 0,
              weightKg: 0,
              gsm: Number(fabric.defaultGsm) || 0,
              warehouseLocation,
              status: 'Available',
              inspectionNotes: inspection.rejectedMeters
                ? `Partially rejected: ${inspection.rejectionReason}`
                : '',
              defectsCount: inspection.rejectedMeters ? 1 : 0,
              grnNumber: grn.grnNumber,
            };
            storedRolls.push(rollNumber);
            fabric.rolls = [...(Array.isArray(fabric.rolls) ? fabric.rolls : []), roll];
            recordInventoryMovement(fabric, {
              type: 'GRN_QC_ACCEPTED',
              quantity: inspection.acceptedMeters,
              unit: 'Meters',
              referenceType: 'GRN',
              referenceId: po._id,
              referenceNumber: grn.grnNumber,
              sourceItemId: `${received.lineId}:${rollNumber}`,
              warehouseLocation,
              notes: `Quality accepted against ${po.poNumber}`,
            });
          }
          received.rollsAddedToStock = storedRolls;
          fabric.totalAvailableMeters = sumAvailableFabricMeters(fabric);
          await fabric.save();
        } else {
          const trim = await TrimItem.findByIdForUpdate(received.stockItemId);
          if (!trim) return errorResponse(`Trim item "${received.itemDescription}" no longer exists`, 409);
          if (acceptedQuantity > 0) {
            if (!adjustWarehouseStock(trim, 'currentStock', warehouseLocation, acceptedQuantity)) {
              return errorResponse(`Trim stock ${trim.trimCode} has an unassigned or inconsistent location balance`, 409);
            }
            recordInventoryMovement(trim, {
              type: 'GRN_QC_ACCEPTED',
              quantity: acceptedQuantity,
              unit: received.unit,
              referenceType: 'GRN',
              referenceId: po._id,
              referenceNumber: grn.grnNumber,
              sourceItemId: received.lineId,
              warehouseLocation,
              notes: `Quality accepted against ${po.poNumber}`,
            });
          }
          await trim.save();
        }
      }

      const supplierBalance = Number(supplier.currentBalance ?? 0);
      const payableBalances = supplier.payableBalances && typeof supplier.payableBalances === 'object'
        ? { ...supplier.payableBalances }
        : {};
      if (!Number.isFinite(supplierBalance) || supplierBalance < 0) {
        return errorResponse('Supplier payable balance is invalid; inspection was not posted', 409);
      }
      if (acceptedValue > 0) {
        const payableBalance = Number(payableBalances[po.payableAccountCode] || 0);
        const nextPayableBalance = payableBalance + acceptedValue;
        if (!Number.isFinite(payableBalance) || payableBalance < 0 ||
          !Number.isFinite(nextPayableBalance) || !Number.isFinite(supplierBalance + acceptedValue)) {
          return errorResponse('Supplier payable balance is invalid or outside the supported range', 409);
        }
        const { entry } = await postBalancedJournalEntry({
          sourceKey: `GRN:${supplier._id}:${grn.grnNumber}`,
          voucherType: 'GoodsReceipt',
          narration: `Accepted goods received against ${po.poNumber}`,
          referenceNumber: grn.grnNumber,
          postedBy: actor.name || '',
          lines: [
            {
              accountCode: po.inventoryAccountCode,
              debit: acceptedValue,
              credit: 0,
              memo: `Accepted inventory under ${grn.grnNumber}`,
            },
            {
              accountCode: po.payableAccountCode,
              debit: 0,
              credit: acceptedValue,
              memo: `Supplier payable for accepted goods ${grn.grnNumber}`,
            },
          ],
        });
        supplier.currentBalance = supplierBalance + acceptedValue;
        payableBalances[po.payableAccountCode] = nextPayableBalance;
        grn.financialEntryId = entry._id;
      }

      supplier.payableBalances = payableBalances;
      await supplier.save();
      grn.totalReceivedValue = acceptedValue;
      grn.inspectionStatus = 'Inspected';
      grn.inspectedBy = actor.name || '';
      grn.inspectedAt = new Date();
      grn.status = 'Inspected';
      const allAccepted = (po.items || []).every((item) =>
        Number(item.receivedQty || 0) >= Number(item.orderedQty || 0)
      );
      po.status = allAccepted
        ? 'Completed'
        : (po.items || []).some((item) => Number(item.receivedQty || 0) > 0)
          ? 'Partially Received'
          : 'Approved';
      await po.save();
      await AuditLog.create({
        userName: actor.name || '',
        action: 'APPROVE',
        module: 'Procurement',
        recordId: grn.grnNumber,
        description: `Inspected ${grn.grnNumber}; accepted value ${acceptedValue}, rejected goods excluded from stock and payable`,
      });
      return successResponse({ purchaseOrder: po, grn }, 'Goods inspection recorded; only accepted quantities entered inventory');
    }

    if (action === 'RECORD_SUPPLIER_PAYMENT') {
      const requestId = String(body.paymentRequestId || '').trim();
      const supplierRecord = await Supplier.findById(body.supplierId);
      const supplier = supplierRecord ? await Supplier.findByIdForUpdate(supplierRecord._id) : null;
      if (!supplier) return errorResponse('Supplier not found', 404);
      if (!requestId) return errorResponse('A payment request ID is required', 400);
      const previousPayment = (supplier.payments || []).find((payment) => payment.paymentRequestId === requestId);
      if (previousPayment) {
        return successResponse({ supplier, payment: previousPayment }, 'Supplier payment was already recorded');
      }
      const amount = Number(body.amount);
      const payable = Number(supplier.currentBalance || 0);
      const payableAccount = await AccountHead.findOne({ code: body.payableAccountCode });
      const paymentAccount = await AccountHead.findOne({ code: body.paymentAccountCode });
      if (!payableAccount || payableAccount.type !== 'Liability' ||
        !paymentAccount || paymentAccount.type !== 'Asset') {
        return errorResponse('Select a supplier payable liability account and a payment asset account', 400);
      }
      const payableBalances = supplier.payableBalances && typeof supplier.payableBalances === 'object'
        ? { ...supplier.payableBalances }
        : {};
      const accountPayable = Number(payableBalances[payableAccount.code] || 0);
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(payable) || payable < 0 ||
        !Number.isFinite(accountPayable) || accountPayable < 0 || amount > payable || amount > accountPayable) {
        return errorResponse('Payment must be positive and cannot exceed the supplier payable balance for the selected liability account', 400);
      }
      if (!['Cash', 'BankTransfer', 'Cheque'].includes(body.method)) {
        return errorResponse('Select a valid supplier payment method', 400);
      }
      const payment = {
        paymentRequestId: requestId,
        amount,
        payableAccountCode: payableAccount.code,
        paymentAccountCode: paymentAccount.code,
        method: String(body.method || ''),
        referenceNumber: String(body.referenceNumber || ''),
        paidBy: String(body.paidBy || ''),
        paidAt: new Date(),
      };
      const { entry } = await postBalancedJournalEntry({
        sourceKey: `SUPPLIER_PAYMENT:${supplier._id}:${requestId}`,
        voucherType: 'SupplierPayment',
        narration: `Supplier payment to ${supplier.name}`,
        referenceNumber: payment.referenceNumber || requestId,
        postedBy: payment.paidBy,
        lines: [
          {
            accountCode: payableAccount.code,
            debit: amount,
            credit: 0,
            memo: `Settle payable to ${supplier.name}`,
          },
          {
            accountCode: paymentAccount.code,
            debit: 0,
            credit: amount,
            memo: `Supplier payment ${supplier.name}`,
          },
        ],
      });
      payment.financialEntryId = entry._id;
      supplier.currentBalance = payable - amount;
      payableBalances[payableAccount.code] = accountPayable - amount;
      supplier.payableBalances = payableBalances;
      supplier.payments = [...(supplier.payments || []), payment];
      await supplier.save();
      await AuditLog.create({
        userName: payment.paidBy,
        action: 'PAYMENT',
        module: 'Procurement',
        recordId: supplier.supplierCode,
        description: `Recorded supplier payment of Rs. ${amount.toLocaleString()} to ${supplier.name}`,
      });
      return successResponse({ supplier, payment }, 'Supplier payment recorded');
    }

    if (action === 'CREATE_SUPPLIER') {
      const { name, phone, email, address, city, category, creditPeriodDays } = body;
      const supplierName = String(name || '').trim();
      const supplierPhone = String(phone || '').trim();
      if (!supplierName || !supplierPhone) return errorResponse('Supplier name and phone are required', 400);
      if (await Supplier.findOne({ name: supplierName }) || await Supplier.findOne({ phone: supplierPhone })) {
        return errorResponse('A supplier with this name or phone already exists', 409);
      }
      const sequence = await allocateSequence('supplier');
      const supplierCode = `SUP-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
      const creditDays = Number(creditPeriodDays || 0);
      if (!Number.isSafeInteger(creditDays) || creditDays < 0) {
        return errorResponse('Supplier credit period must be a non-negative whole number of days', 400);
      }

      const newSupplier = await Supplier.create({
        supplierCode,
        name: supplierName,
        phone: supplierPhone,
        email,
        address,
        city: city || '',
        category: category || '',
        creditPeriodDays: creditDays,
        currentBalance: 0,
      });

      return successResponse({ supplier: newSupplier }, 'Supplier added successfully');
    }

    if (action === 'UPDATE_SUPPLIER') {
      const supplier = await Supplier.findByIdForUpdate(body.supplierId);
      if (!supplier) return errorResponse('Supplier not found', 404);
      const updates = pickFields(body, [
        'name', 'phone', 'email', 'address', 'city', 'category', 'creditPeriodDays',
      ]);
      if (updates.name !== undefined) updates.name = String(updates.name).trim();
      if (updates.phone !== undefined) updates.phone = String(updates.phone).trim();
      if (updates.name !== undefined && !updates.name || updates.phone !== undefined && !updates.phone) {
        return errorResponse('Supplier name and phone cannot be empty', 400);
      }
      if (updates.phone !== undefined) {
        const duplicate = await Supplier.findOne({ phone: updates.phone });
        if (duplicate && duplicate._id !== supplier._id) {
          return errorResponse('A supplier with this phone number already exists', 409);
        }
      }
      if (updates.creditPeriodDays !== undefined &&
        (!Number.isSafeInteger(Number(updates.creditPeriodDays)) || Number(updates.creditPeriodDays) < 0)) {
        return errorResponse('Supplier credit period must be a non-negative whole number of days', 400);
      }
      Object.assign(supplier, updates);
      await supplier.save();
      return successResponse({ supplier }, 'Supplier updated');
    }

    if (action === 'DELETE_SUPPLIER') {
      const supplier = await Supplier.findByIdForUpdate(body.supplierId);
      if (!supplier) return errorResponse('Supplier not found', 404);
      const linkedOrders = await PurchaseOrder.find({
        $or: [
          { supplierId: supplier._id },
          { supplierName: supplier.name },
        ],
      });
      if (linkedOrders.length) {
        return errorResponse('A supplier with purchase order history cannot be deleted', 409);
      }
      await Supplier.deleteOne({ _id: supplier._id });
      return successResponse({ supplier }, 'Supplier deleted');
    }

    if (action === 'UPDATE_PO') {
      const po = await PurchaseOrder.findByIdForUpdate(body.poId);
      if (!po) return errorResponse('Purchase Order not found', 404);
      if (body.status !== undefined) {
        if (body.status === 'Approved') {
          if (!await canAccessModule(actor, 'procurement', 'approve')) {
            return errorResponse('Approval permission is required to approve a purchase order', 403);
          }
          const policy = await ApprovalPolicy.findOne({
            policyKey: 'procurement:purchase_order',
            isActive: true,
          });
          if (policy) {
            const approval = po.approvalRequestId
              ? await ApprovalRequest.findById(po.approvalRequestId)
              : null;
            if (approval?.status !== 'Approved') {
              return errorResponse('This purchase order must complete its configured approval stages before approval', 409);
            }
          }
        }
        if (!['Approved', 'Cancelled'].includes(body.status) ||
          !['PendingApproval', 'Approved'].includes(po.status) ||
          body.status === 'Cancelled' && ((po.grns || []).length || (po.items || []).some((item) => Number(item.receivedQty) > 0))) {
          return errorResponse('Invalid purchase order status transition', 409);
        }
        po.status = body.status;
      }
      Object.assign(po, pickFields(body, ['notes', 'paymentTerms', 'expectedDeliveryDate']));
      await po.save();
      return successResponse({ purchaseOrder: po }, 'Purchase order updated');
    }

    if (action === 'APPROVE_PO') {
      const po = await PurchaseOrder.findByIdForUpdate(body.poId);
      if (!po) return errorResponse('Purchase Order not found', 404);
      if (po.status !== 'PendingApproval') {
        return errorResponse('Only a pending purchase order can be approved', 409);
      }
      const approval = po.approvalRequestId
        ? await ApprovalRequest.findById(po.approvalRequestId)
        : null;
      if (approval && approval.status !== 'Approved') {
        return errorResponse('This purchase order must complete its configured approval stages before approval', 409);
      }
      const policy = await ApprovalPolicy.findOne({
        policyKey: 'procurement:purchase_order',
        isActive: true,
      });
      if (policy && approval?.status !== 'Approved') {
        return errorResponse('This purchase order requires a configured approval request', 409);
      }
      po.status = 'Approved';
      po.approvedAt = new Date();
      po.approvedBy = actor.name || '';
      await po.save();
      await AuditLog.create({
        userName: actor.name || '',
        action: 'APPROVE',
        module: 'Procurement',
        recordId: po.poNumber,
        description: `Approved purchase order ${po.poNumber}`,
      });
      return successResponse({ purchaseOrder: po }, 'Purchase order approved');
    }

    if (action === 'DELETE_PO') {
      const po = await PurchaseOrder.findByIdForUpdate(body.poId);
      if (!po) return errorResponse('Purchase Order not found', 404);
      if (po.approvalRequestId) {
        return errorResponse('A purchase order with approval history cannot be deleted', 409);
      }
      if ((po.grns || []).length || (po.items || []).some((item) => Number(item.receivedQty) > 0)) {
        return errorResponse('A purchase order with receiving history cannot be deleted', 409);
      }
      await PurchaseOrder.deleteOne({ _id: po._id });
      return successResponse({ purchaseOrder: po }, 'Purchase Order deleted');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getProcurement, 'procurement');
export const POST = withAuthorization(postProcurement, 'procurement', 'write');
