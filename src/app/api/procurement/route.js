import { allocateSequence, connectDB, runInTransaction } from '@/lib/db.js';
import Supplier from '@/models/Supplier.js';
import PurchaseOrder from '@/models/PurchaseOrder.js';
import PurchaseReturn from '@/models/PurchaseReturn.js';
import PurchaseRequisition from '@/models/PurchaseRequisition.js';
import RFQ from '@/models/RFQ.js';
import SupplierQuotation from '@/models/SupplierQuotation.js';
import SupplierInvoice from '@/models/SupplierInvoice.js';
import ResidualGRNI from '@/models/ResidualGRNI.js';
import Fabric from '@/models/Fabric.js';
import TrimItem from '@/models/Trims.js';
import DesignArticle from '@/models/Design.js';
import { AccountHead, JournalEntry } from '@/models/Accounting.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, parseListQuery, pickFields } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';
import { adjustWarehouseStock, recordInventoryMovement, sumAvailableFabricMeters } from '@/lib/inventory.js';
import { randomUUID } from 'node:crypto';
import { postBalancedJournalEntry } from '@/lib/accounting.js';
import { resolveAndValidateMapping, validateMappingsPresent, getCompanyContext } from '@/lib/accounting-mappings.js';
import ApprovalPolicy from '@/models/ApprovalPolicy.js';
import ApprovalRequest from '@/models/ApprovalRequest.js';
import { startApprovalRequest } from '@/lib/approval-workflow.js';
import { canAccessModule } from '@/lib/role-access.js';

// Maps adjustment type to the accounting-mappings key for the permitted counter account.
// Ensures adjustments debit/credit only accounts appropriate for their purpose.
function adjustmentTypeToMappingKey(adjustmentType) {
  const mapping = {
    price_variance: 'cogsAccountCode',
    inventory_correction: 'inventoryAccountCode',
    expense_write_off: 'expenseAccountCode',
  };
  return mapping[adjustmentType] || null;
}

async function getProcurement(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const { action } = query;
    // Historical GRN / GRNI Reconciliation Report (read-only)
    if (action === 'HISTORICAL_GRNI_RECONCILIATION') {
      const company = await getCompanyContext();
      const mappings = company && company.accountingMappings ? company.accountingMappings : {};
      const resolvedGrniCode = mappings.grniAccountCode || '2030';
      const grniAccount = await AccountHead.findOne({ code: resolvedGrniCode });
      if (!grniAccount || grniAccount.type !== 'Liability') {
        return errorResponse(`GRNI clearing account (${resolvedGrniCode}) not configured correctly`, 409);
      }
      const resolvedPayableCode = mappings.payableAccountCode || '2010';
      const payableAccount = await AccountHead.findOne({ code: resolvedPayableCode });
      if (!payableAccount || payableAccount.type !== 'Liability') {
        return errorResponse(`Payable account (${resolvedPayableCode}) not configured correctly`, 409);
      }
      const resolvedInventoryCode = mappings.inventoryAccountCode;
      const inventoryAccount = resolvedInventoryCode ? await AccountHead.findOne({ code: resolvedInventoryCode }) : null;

      // Build lookup of all journals by sourceKey
      const journalsBySourceKey = new Map();
      const allJournals = await JournalEntry.find({}).sort({ createdAt: -1 });
      for (const j of allJournals) {
        if (j.sourceKey) journalsBySourceKey.set(String(j.sourceKey), j);
      }

      const reconciliation = [];
      let grandTotalGrniAccepted = 0;
      let grandTotalGrniCleared = 0;
      let grandTotalPayableCredited = 0;
      let grandTotalUnresolved = 0;

      for (const po of purchaseOrders) {
        const grns = Array.isArray(po.grns) ? po.grns : [];
        for (const grn of grns) {
          if (!grn.grnNumber) continue;

          const grnAcceptedValue = Number(grn.acceptedValue || grn.totalReceivedValue || 0);
          const grnNumber = grn.grnNumber;

          // Find supplier invoices against this GRN
          const grnInvoices = supplierInvoices.filter((inv) => inv.grnNumber === grnNumber);
          const totalInvoicedValue = grnInvoices.reduce((sum, inv) => sum + Number(inv.subtotal || 0), 0);

          // Calculate GRNI cleared from posted journals (Debit to GRNI account)
          let grniClearedFromJournals = 0;
          for (const inv of grnInvoices) {
            const invSourceKey = `SUPPLIER_INVOICE:${inv.supplierId}:${inv.invoiceNumber}`;
            const invJournal = journalsBySourceKey.get(invSourceKey);
            if (invJournal && Array.isArray(invJournal.lines)) {
              for (const line of invJournal.lines) {
                if (line.accountCode === resolvedGrniCode) {
                  grniClearedFromJournals += Number(line.debit || 0);
                }
              }
            }
          }

          // Check if GRNI was credited to Payable instead (historical defect)
          let grniCreditedToPayable = 0;
          for (const inv of grnInvoices) {
            const invSourceKey = `SUPPLIER_INVOICE:${inv.supplierId}:${inv.invoiceNumber}`;
            const invJournal = journalsBySourceKey.get(invSourceKey);
            if (invJournal && Array.isArray(invJournal.lines)) {
              for (const line of invJournal.lines) {
                if (line.accountCode === resolvedPayableCode && (line.debit || 0) > 0) {
                  grniCreditedToPayable += Number(line.debit || 0);
                }
              }
            }
          }

          const remainingGRNI = Math.max(0, grnAcceptedValue - grniClearedFromJournals);
          const unresolvedAmount = Math.max(0, grnAcceptedValue - grniClearedFromJournals - totalInvoicedValue);

          reconciliation.push({
            grnNumber,
            poNumber: po.poNumber,
            supplierId: po.supplierId || '',
            supplierName: po.supplierName || '',
            grnAcceptedValue,
            totalInvoicedValue,
            grniCleared: grniClearedFromJournals,
            remainingGRNI,
            unresolvedAmount,
            grniCreditedToPayable,
            invoiceCount: grnInvoices.length,
            hasJournal: grn.financialEntryId ? true : false,
            status: remainingGRNI === 0 ? 'Fully Cleared' : remainingGRNI > 0 ? 'Partially Cleared' : 'Not Cleared',
            requiresReview: unresolvedAmount > 0 || grniCreditedToPayable > 0,
          });

          grandTotalGrniAccepted += grnAcceptedValue;
          grandTotalGrniCleared += grniClearedFromJournals;
          grandTotalPayableCredited += grniCreditedToPayable;
          grandTotalUnresolved += unresolvedAmount;
        }
      }

      reconciliation.sort((a, b) => b.unresolvedAmount - a.unresolvedAmount || b.remainingGRNI - a.remainingGRNI);

      return successResponse({
        summary: {
          totalGrns: reconciliation.length,
          totalGrniAccepted: grandTotalGrniAccepted,
          totalGrniCleared: grandTotalGrniCleared,
          totalPayableCredited: grandTotalPayableCredited,
          totalUnresolved: grandTotalUnresolved,
          ordersNeedingReview: reconciliation.filter((r) => r.requiresReview).length,
        },
        reconciliation,
      }, 'Historical GRN / GRNI reconciliation report generated');
    }

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
    const [fabricItems, trimItems, designArticles, purchaseReturns,
      purchaseRequisitions, rfqs, supplierQuotations, supplierInvoices] = await Promise.all([
      Fabric.find({}).sort({ name: 1 }),
      TrimItem.find({}).sort({ name: 1 }),
      DesignArticle.find({}).sort({ designCode: 1 }),
      PurchaseReturn.find({}).sort({ returnDate: -1, createdAt: -1 }),
      PurchaseRequisition.find({}).sort({ createdAt: -1 }),
      RFQ.find({}).sort({ createdAt: -1 }),
      SupplierQuotation.find({}).sort({ createdAt: -1 }),
      SupplierInvoice.find({}).sort({ createdAt: -1 }),
    ]);
    const accounts = await AccountHead.find({}).sort({ code: 1 });
    const returns = applyListQuery(purchaseReturns, query, {
      searchFields: ['returnNumber', 'supplierName', 'poNumber', 'grnNumber', 'reason', 'notes'],
    }).items;

    // Calculate real-time stock alerts from actual stock ledgers and balances
    const stockAlerts = [];

    for (const f of fabricItems) {
      const currentStock = sumAvailableFabricMeters(f);
      const minStock = Number(f.reorderLevelMeters || 0);
      const isOutOfStock = currentStock <= 0;
      const isLowStock = minStock > 0 && currentStock <= minStock;

      if (isOutOfStock || isLowStock) {
        const locations = Array.isArray(f.rolls)
          ? [...new Set(f.rolls.map((r) => r.warehouseLocation).filter(Boolean))].join(', ') || ''
          : '';
        stockAlerts.push({
          id: f._id,
          itemCode: f.fabricCode,
          itemName: f.name,
          itemType: 'Fabric',
          category: f.fabricType || 'Fabric',
          variant: f.composition || '',
          currentStock,
          reorderLevel: minStock,
          requiredReorderQty: Math.max(0, minStock - currentStock),
          unit: 'Meters',
          warehouseLocation: locations,
          supplierName: f.supplierName || '',
          unitCost: Number(f.averageCostPerMeter || 0),
          status: isOutOfStock ? 'Out of Stock' : 'Low Stock',
        });
      }
    }

    for (const t of trimItems) {
      const currentStock = Number(t.currentStock || 0);
      const minStock = Number(t.minimumStock || 0);
      const isOutOfStock = currentStock <= 0;
      const isLowStock = minStock > 0 && currentStock <= minStock;

      if (isOutOfStock || isLowStock) {
        stockAlerts.push({
          id: t._id,
          itemCode: t.trimCode,
          itemName: t.name,
          itemType: 'Trim',
          category: t.category || 'Trims',
          variant: [t.variant, t.color].filter(Boolean).join(' - '),
          currentStock,
          reorderLevel: minStock,
          requiredReorderQty: Math.max(0, minStock - currentStock),
          unit: t.unit || 'Pieces',
          warehouseLocation: t.warehouseLocation || '',
          supplierName: t.supplierName || '',
          unitCost: Number(t.unitCost || 0),
          status: isOutOfStock ? 'Out of Stock' : 'Low Stock',
        });
      }
    }

    for (const d of designArticles) {
      const currentStock = Number(d.finishedGoodsStock || 0);
      const minStock = Number(d.minimumStock || 10);
      const isOutOfStock = currentStock <= 0;
      const isLowStock = minStock > 0 && currentStock <= minStock;

      if (isOutOfStock || isLowStock) {
        stockAlerts.push({
          id: d._id,
          itemCode: d.designCode,
          itemName: d.title || d.designCode,
          itemType: 'Finished Goods',
          category: d.category || 'Apparel',
          variant: [d.season, d.status].filter(Boolean).join(' - '),
          currentStock,
          reorderLevel: minStock,
          requiredReorderQty: Math.max(0, minStock - currentStock),
          unit: 'Pieces',
          warehouseLocation: 'Main Finished Goods Depot',
          supplierName: 'In-House Production',
          unitCost: Number(d.sellingPrice || 0),
          status: isOutOfStock ? 'Out of Stock' : 'Low Stock',
        });
      }
    }

    const requisitionsList = applyListQuery(purchaseRequisitions, query, {
      searchFields: ['requisitionNumber', 'department', 'requester', 'status', 'notes'],
      statusField: 'status',
    }).items;
    const rfqsList = applyListQuery(rfqs, query, {
      searchFields: ['rfqNumber', 'supplierName', 'requisitionNumber', 'status', 'notes'],
      statusField: 'status',
    }).items;
    const quotationsList = applyListQuery(supplierQuotations, query, {
      searchFields: ['quotationNumber', 'supplierName', 'rfqNumber', 'status', 'notes'],
      statusField: 'status',
    }).items;
    const invoicesList = applyListQuery(supplierInvoices, query, {
      searchFields: ['invoiceNumber', 'supplierName', 'poNumber', 'grnNumber', 'status', 'notes'],
      statusField: 'status',
    }).items;

    const quotationComparison = {};
    for (const q of quotationsList) {
      const rfqKey = q.rfqNumber || 'no-rfq';
      if (!quotationComparison[rfqKey]) {
        quotationComparison[rfqKey] = {
          rfqNumber: q.rfqNumber || null,
          rfqStatus: null,
          quotations: [],
        };
      }
      quotationComparison[rfqKey].quotations.push({
        quotationNumber: q.quotationNumber,
        supplierName: q.supplierName,
        supplierId: q.supplierId,
        status: q.status,
        totalAmount: Number(q.totalAmount || 0),
        validFrom: q.validFrom,
        validTo: q.validTo,
        notes: q.notes,
        items: (q.items || []).map((item) => ({
          stockItemCode: item.stockItemCode,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          quotedUnitPrice: item.quotedUnitPrice,
          quotedTotal: item.quotedTotal,
          deliveryTime: item.deliveryTime,
          terms: item.terms,
        })),
      });
    }

    return successResponse({
      suppliers,
      purchaseOrders,
      returns,
      purchaseRequisitions: requisitionsList,
      rfqs: rfqsList,
      supplierQuotations: quotationsList,
      quotationComparison,
      supplierInvoices: invoicesList,
      stockAlerts,
      fabricItems: fabricItems.map(({ _id, fabricCode, name, totalAvailableMeters, rolls, supplierName, reorderLevelMeters, averageCostPerMeter }) => ({
        id: _id,
        code: fabricCode,
        name,
        available: Number(totalAvailableMeters) || 0,
        unit: 'Meters',
        rolls: (rolls || []).filter((r) => r.status === 'Available' && Number(r.remainingMeters) > 0),
        supplierName: supplierName || '',
        reorderLevelMeters: Number(reorderLevelMeters) || 0,
        averageCostPerMeter: Number(averageCostPerMeter) || 0,
      })),
      trimItems: trimItems.map(({ _id, trimCode, name, unit, currentStock, minimumStock, unitCost, supplierName, warehouseLocation }) => ({
        id: _id,
        code: trimCode,
        name,
        available: Number(currentStock) || 0,
        unit: unit || '',
        minimumStock: Number(minimumStock) || 0,
        unitCost: Number(unitCost) || 0,
        supplierName: supplierName || '',
        warehouseLocation: warehouseLocation || '',
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
        // Look up GRNI (Goods Received Not Invoiced) clearing account from company mapping
        const company = await getCompanyContext();
        const mappings = company && company.accountingMappings ? company.accountingMappings : {};
        const resolvedGrniCode = mappings.grniAccountCode || '2030';
        const grniAccount = await AccountHead.findOne({ code: resolvedGrniCode });
        if (!grniAccount || grniAccount.type !== 'Liability') {
          return errorResponse(`GRNI clearing account (${resolvedGrniCode}) not configured. Please configure it in company accounting mappings.`, 409);
        }
        const inventoryAccount = await AccountHead.findOne({ code: po.inventoryAccountCode });
        if (!inventoryAccount) {
          return errorResponse(`Inventory account ${po.inventoryAccountCode} not found`, 409);
        }

        // Lock accounts in consistent alphabetical order to prevent deadlocks
        const lockOrder = [grniAccount.code, inventoryAccount.code].sort();
        const lockedFirst = await AccountHead.findByIdForUpdate(
          grniAccount.code === lockOrder[0] ? grniAccount._id : inventoryAccount._id
        );
        const lockedSecond = await AccountHead.findByIdForUpdate(
          grniAccount.code === lockOrder[0] ? inventoryAccount._id : grniAccount._id
        );
        if (!lockedFirst || !lockedSecond) {
          return errorResponse('One or more accounts could not be locked for GRN posting', 409);
        }
        const lockedGrni = grniAccount.code === lockOrder[0] ? lockedFirst : lockedSecond;
        const lockedInventory = grniAccount.code === lockOrder[0] ? lockedSecond : lockedFirst;

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
              accountCode: grniAccount.code,
              debit: 0,
              credit: acceptedValue,
              memo: `GRNI accrual for ${grn.grnNumber}`,
            },
          ],
        });
        supplier.currentBalance = supplierBalance + acceptedValue;
        payableBalances[po.payableAccountCode] = nextPayableBalance;
        grn.financialEntryId = entry._id;
        grn.grniAccountCode = grniAccount.code;
        grn.grniAccountName = grniAccount.name;
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
      // Resolve payable account from company mapping (no silent fallback to body parameter)
      const company = await getCompanyContext();
      const mappings = company && company.accountingMappings ? company.accountingMappings : {};
      const resolvedPayableCode = mappings.payableAccountCode;
      if (!resolvedPayableCode) {
        return errorResponse('Payable account mapping is not configured. Set payableAccountCode in company accounting mappings.', 409);
      }
      const payableAccount = await AccountHead.findOne({ code: resolvedPayableCode });
      const paymentAccount = await AccountHead.findOne({ code: body.paymentAccountCode });
      if (!payableAccount || payableAccount.type !== 'Liability' ||
        !paymentAccount || paymentAccount.type !== 'Asset') {
        return errorResponse('Configured payable account must be a liability account and payment account must be an asset account', 400);
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

    if (action === 'CREATE_PURCHASE_RETURN') {
      const {
        supplierId,
        supplierName,
        poNumber,
        grnNumber,
        supplierInvoiceNumber,
        warehouseLocation,
        inventoryAccountCode,
        payableAccountCode,
        returnDate,
        reason,
        taxPercentage,
        notes,
        status = 'Processed',
        items,
        returnRequestId,
      } = body;

      const normalizedRequestId = String(returnRequestId || randomUUID()).trim();
      if (normalizedRequestId) {
        const existing = await PurchaseReturn.findOne({ returnRequestId: normalizedRequestId });
        if (existing) {
          return successResponse({ purchaseReturn: existing }, 'Purchase return was already recorded');
        }
      }

      if (!supplierId && !supplierName) {
        return errorResponse('Select a supplier for the purchase return', 400);
      }
      const supplierRecord = supplierId ? await Supplier.findById(supplierId) : await Supplier.findOne({ name: supplierName });
      const supplier = supplierRecord ? await Supplier.findByIdForUpdate(supplierRecord._id) : null;
      if (!supplier) return errorResponse('Supplier not found', 404);

      const targetWarehouse = String(warehouseLocation || '').trim();
      // Resolve accounts from company mappings (no silent fallback to body parameters)
      const company = await getCompanyContext();
      const mappings = company && company.accountingMappings ? company.accountingMappings : {};
      const resolvedInventoryCode = mappings.inventoryAccountCode;
      const resolvedPayableCode = mappings.payableAccountCode;
      if (!resolvedInventoryCode || !resolvedPayableCode) {
        return errorResponse('Inventory and payable account mappings are not configured. Set inventoryAccountCode and payableAccountCode in company accounting mappings.', 409);
      }
      const inventoryAccount = await AccountHead.findOne({ code: resolvedInventoryCode });
      const payableAccount = await AccountHead.findOne({ code: resolvedPayableCode });
      if (!inventoryAccount || inventoryAccount.type !== 'Asset' ||
        !payableAccount || payableAccount.type !== 'Liability') {
        return errorResponse('Configured inventory account must be an asset account and payable account must be a liability account', 400);
      }

      if (!Array.isArray(items) || items.length === 0) {
        return errorResponse('Add at least one item to the purchase return', 400);
      }

      if (items.some((item) =>
        !item || !['Fabric', 'Trim'].includes(item.stockItemType) ||
        typeof item.stockItemId !== 'string' || !item.stockItemId ||
        !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 ||
        !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0
      )) {
        return errorResponse('Each returned item must reference valid stock and have a positive quantity and non-negative unit price', 400);
      }

      const sequence = await allocateSequence('purchase_return');
      const returnNumber = `PRN-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      let subtotal = 0;
      const validatedItems = [];

      for (const item of items) {
        const qty = Number(item.quantity);
        const price = Number(item.unitPrice);
        const lineTotal = qty * price;
        subtotal += lineTotal;

        if (status === 'Processed') {
          if (item.stockItemType === 'Fabric') {
            const fabric = await Fabric.findByIdForUpdate(item.stockItemId);
            if (!fabric) return errorResponse(`Fabric item "${item.description || item.stockItemCode}" was not found`, 404);

            const rolls = Array.isArray(fabric.rolls) ? fabric.rolls : [];
            const rollNumber = String(item.rollNumber || '').trim();
            const targetRoll = rollNumber
              ? rolls.find((r) => r.rollNumber === rollNumber)
              : rolls.find((r) => r.status === 'Available' && Number(r.remainingMeters) >= qty);

            if (!targetRoll) {
              return errorResponse(`No available fabric roll found with sufficient meters for "${fabric.name}"`, 409);
            }
            if (Number(targetRoll.remainingMeters) < qty) {
              return errorResponse(`Roll ${targetRoll.rollNumber} only has ${targetRoll.remainingMeters}m available, cannot return ${qty}m`, 409);
            }

            targetRoll.remainingMeters = Number(targetRoll.remainingMeters) - qty;
            if (targetRoll.remainingMeters <= 0.0001) {
              targetRoll.remainingMeters = 0;
              targetRoll.status = 'Exhausted';
            }
            fabric.totalAvailableMeters = sumAvailableFabricMeters(fabric);

            recordInventoryMovement(fabric, {
              type: 'PURCHASE_RETURN',
              quantity: qty,
              unit: 'Meters',
              direction: 'OUT',
              referenceType: 'PurchaseReturn',
              referenceNumber: returnNumber,
              sourceItemId: targetRoll.rollNumber,
              warehouseLocation: targetWarehouse,
              notes: `Purchase return ${returnNumber} to supplier ${supplier.name}: ${item.reason || reason || 'Returned to vendor'}`,
            });
            await fabric.save();

            validatedItems.push({
              ...item,
              stockItemCode: fabric.fabricCode,
              description: fabric.name,
              unit: 'Meters',
              quantity: qty,
              unitPrice: price,
              totalAmount: lineTotal,
              rollNumber: targetRoll.rollNumber,
              reason: item.reason || reason || 'Vendor Return',
            });
          } else if (item.stockItemType === 'Trim') {
            const trim = await TrimItem.findByIdForUpdate(item.stockItemId);
            if (!trim) return errorResponse(`Trim item "${item.description || item.stockItemCode}" was not found`, 404);

            const current = Number(trim.currentStock || 0);
            if (current < qty) {
              return errorResponse(`Insufficient trim stock for "${trim.name}". Available: ${current}, requested return: ${qty}`, 409);
            }

            const adjusted = adjustWarehouseStock(trim, 'currentStock', targetWarehouse, -qty, true);
            if (!adjusted) {
              trim.currentStock = Math.max(0, current - qty);
            }

            recordInventoryMovement(trim, {
              type: 'PURCHASE_RETURN',
              quantity: qty,
              unit: trim.unit || 'Pieces',
              direction: 'OUT',
              referenceType: 'PurchaseReturn',
              referenceNumber: returnNumber,
              sourceItemId: trim.trimCode,
              warehouseLocation: targetWarehouse,
              notes: `Purchase return ${returnNumber} to supplier ${supplier.name}: ${item.reason || reason || 'Returned to vendor'}`,
            });
            await trim.save();

            validatedItems.push({
              ...item,
              stockItemCode: trim.trimCode,
              description: trim.name,
              unit: trim.unit || 'Pieces',
              quantity: qty,
              unitPrice: price,
              totalAmount: lineTotal,
              reason: item.reason || reason || 'Vendor Return',
            });
          }
        } else {
          validatedItems.push({
            ...item,
            quantity: qty,
            unitPrice: price,
            totalAmount: lineTotal,
            reason: item.reason || reason || 'Vendor Return',
          });
        }
      }

      const taxRate = Number(taxPercentage) || 0;
      const taxAmount = (subtotal * taxRate) / 100;
      const grandTotal = subtotal + taxAmount;

      let financialEntryId = null;
      if (status === 'Processed' && grandTotal > 0) {
        const { entry } = await postBalancedJournalEntry({
          sourceKey: `PURCHASE_RETURN:${returnNumber}`,
          voucherType: 'PurchaseReturn',
          narration: `Debit Note: Purchase return ${returnNumber} to ${supplier.name}`,
          referenceNumber: returnNumber,
          postedBy: actor.name || 'System',
          lines: [
            {
              accountCode: payableAccount.code,
              debit: grandTotal,
              credit: 0,
              memo: `Debit note to supplier ${supplier.name} for ${returnNumber}`,
            },
            {
              accountCode: inventoryAccount.code,
              debit: 0,
              credit: grandTotal,
              memo: `Inventory reversal for return ${returnNumber}`,
            },
          ],
        });
        financialEntryId = entry._id;

        const payableBalances = supplier.payableBalances && typeof supplier.payableBalances === 'object'
          ? { ...supplier.payableBalances }
          : {};
        const accountPayable = Number(payableBalances[payableAccount.code] || 0);
        supplier.currentBalance = Math.max(0, (Number(supplier.currentBalance) || 0) - grandTotal);
        payableBalances[payableAccount.code] = Math.max(0, accountPayable - grandTotal);
        supplier.payableBalances = payableBalances;
        await supplier.save();
      }

      const purchaseReturn = await PurchaseReturn.create({
        returnNumber,
        returnRequestId: normalizedRequestId,
        returnDate: returnDate || new Date(),
        supplierId: supplier._id,
        supplierName: supplier.name,
        poNumber: String(poNumber || '').trim(),
        grnNumber: String(grnNumber || '').trim(),
        supplierInvoiceNumber: String(supplierInvoiceNumber || '').trim(),
        warehouseLocation: targetWarehouse,
        inventoryAccountCode: inventoryAccount.code,
        payableAccountCode: payableAccount.code,
        items: validatedItems,
        subtotal,
        taxPercentage: taxRate,
        taxAmount,
        grandTotal,
        reason: String(reason || '').trim(),
        notes: String(notes || '').trim(),
        status,
        financialEntryId,
        returnedBy: actor.name || '',
      });

      await AuditLog.create({
        userName: actor.name || '',
        action: 'CREATE',
        module: 'Procurement',
        recordId: returnNumber,
        description: `Created purchase return ${returnNumber} (${status}) for Rs. ${grandTotal.toLocaleString()} to ${supplier.name}`,
      });

      return successResponse({ purchaseReturn }, status === 'Processed' ? 'Purchase return processed and stock/accounts updated' : 'Purchase return draft saved');
    }

    if (action === 'PROCESS_PURCHASE_RETURN') {
      return await runInTransaction(async () => {
      const pr = await PurchaseReturn.findByIdForUpdate(body.returnId);
      if (!pr) return errorResponse('Purchase Return not found', 404);
      if (pr.status === 'Processed') {
        return errorResponse('This purchase return is already processed', 409);
      }

      const supplierRecord = pr.supplierId ? await Supplier.findById(pr.supplierId) : await Supplier.findOne({ name: pr.supplierName });
      const supplier = supplierRecord ? await Supplier.findByIdForUpdate(supplierRecord._id) : null;
      if (!supplier) return errorResponse('Linked supplier not found', 404);

      const targetWarehouse = String(pr.warehouseLocation || '').trim();
      const inventoryAccount = await AccountHead.findOne({ code: pr.inventoryAccountCode });
      const payableAccount = await AccountHead.findOne({ code: pr.payableAccountCode });
      if (!inventoryAccount || !payableAccount) {
        return errorResponse('Configured inventory asset or payable liability account was not found', 400);
      }

      // Deduct items
      for (const item of pr.items || []) {
        const qty = Number(item.quantity);
        if (item.stockItemType === 'Fabric') {
          const fabric = await Fabric.findByIdForUpdate(item.stockItemId);
          if (!fabric) return errorResponse(`Fabric item "${item.description}" not found`, 404);
          const rolls = Array.isArray(fabric.rolls) ? fabric.rolls : [];
          const targetRoll = item.rollNumber ? rolls.find((r) => r.rollNumber === item.rollNumber) : rolls.find((r) => r.status === 'Available' && Number(r.remainingMeters) >= qty);
          if (!targetRoll || Number(targetRoll.remainingMeters) < qty) {
            return errorResponse(`Insufficient meters in roll for "${fabric.name}"`, 409);
          }
          targetRoll.remainingMeters = Number(targetRoll.remainingMeters) - qty;
          if (targetRoll.remainingMeters <= 0.0001) {
            targetRoll.remainingMeters = 0;
            targetRoll.status = 'Exhausted';
          }
          fabric.totalAvailableMeters = sumAvailableFabricMeters(fabric);
          recordInventoryMovement(fabric, {
            type: 'PURCHASE_RETURN',
            quantity: qty,
            unit: 'Meters',
            direction: 'OUT',
            referenceType: 'PurchaseReturn',
            referenceNumber: pr.returnNumber,
            sourceItemId: targetRoll.rollNumber,
            warehouseLocation: targetWarehouse,
            notes: `Processed return ${pr.returnNumber}`,
          });
          await fabric.save();
        } else if (item.stockItemType === 'Trim') {
          const trim = await TrimItem.findByIdForUpdate(item.stockItemId);
          if (!trim) return errorResponse(`Trim item "${item.description}" not found`, 404);
          const current = Number(trim.currentStock || 0);
          if (current < qty) return errorResponse(`Insufficient trim stock for "${trim.name}"`, 409);
          const adjusted = adjustWarehouseStock(trim, 'currentStock', targetWarehouse, -qty, true);
          if (!adjusted) trim.currentStock = Math.max(0, current - qty);
          recordInventoryMovement(trim, {
            type: 'PURCHASE_RETURN',
            quantity: qty,
            unit: trim.unit || 'Pieces',
            direction: 'OUT',
            referenceType: 'PurchaseReturn',
            referenceNumber: pr.returnNumber,
            sourceItemId: trim.trimCode,
            warehouseLocation: targetWarehouse,
            notes: `Processed return ${pr.returnNumber}`,
          });
          await trim.save();
        }
      }

      // Financial entry
      const grandTotal = Number(pr.grandTotal);
      if (grandTotal > 0) {
        const { entry } = await postBalancedJournalEntry({
          sourceKey: `PURCHASE_RETURN:${pr.returnNumber}`,
          voucherType: 'PurchaseReturn',
          narration: `Debit Note: Purchase return ${pr.returnNumber} to ${supplier.name}`,
          referenceNumber: pr.returnNumber,
          postedBy: actor.name || 'System',
          lines: [
            {
              accountCode: payableAccount.code,
              debit: grandTotal,
              credit: 0,
              memo: `Debit note to supplier ${supplier.name} for ${pr.returnNumber}`,
            },
            {
              accountCode: inventoryAccount.code,
              debit: 0,
              credit: grandTotal,
              memo: `Inventory reversal for return ${pr.returnNumber}`,
            },
          ],
        });
        pr.financialEntryId = entry._id;

        const payableBalances = supplier.payableBalances && typeof supplier.payableBalances === 'object'
          ? { ...supplier.payableBalances }
          : {};
        const accountPayable = Number(payableBalances[payableAccount.code] || 0);
        supplier.currentBalance = Math.max(0, (Number(supplier.currentBalance) || 0) - grandTotal);
        payableBalances[payableAccount.code] = Math.max(0, accountPayable - grandTotal);
        supplier.payableBalances = payableBalances;
        await supplier.save();
      }

      pr.status = 'Processed';
      pr.processedAt = new Date();
      pr.processedBy = actor.name || '';
      await pr.save();

      await AuditLog.create({
        userName: actor.name || '',
        action: 'UPDATE',
        module: 'Procurement',
        recordId: pr.returnNumber,
        description: `Processed purchase return ${pr.returnNumber} to ${supplier.name}`,
      });

      return successResponse({ purchaseReturn: pr }, 'Purchase return successfully processed');
      });
    }

    if (action === 'DELETE_PURCHASE_RETURN') {
      const pr = await PurchaseReturn.findByIdForUpdate(body.returnId);
      if (!pr) return errorResponse('Purchase Return not found', 404);
      if (pr.status === 'Processed') {
        return errorResponse('A processed purchase return cannot be deleted as stock and financial journals are already committed', 409);
      }
      await PurchaseReturn.deleteOne({ _id: pr._id });
      return successResponse({ purchaseReturn: pr }, 'Purchase return deleted');
    }

    if (action === 'CREATE_REQUISITION') {
      const {
        department, requester, items, requiredDate, notes, status = 'Draft',
      } = body;
      const normalizedDepartment = String(department || '').trim();
      const normalizedRequester = String(requester || '').trim();
      if (!normalizedDepartment || !normalizedRequester) {
        return errorResponse('Department and requester are required', 400);
      }
      if (!Array.isArray(items) || items.length === 0) {
        return errorResponse('Add at least one item to the requisition', 400);
      }
      if (items.some((item) =>
        !item || !['Fabric', 'Trim'].includes(item.stockItemType) ||
        typeof item.stockItemId !== 'string' || !item.stockItemId ||
        !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0
      )) {
        return errorResponse('Each item must reference valid stock and have a positive quantity', 400);
      }
      const sequence = await allocateSequence('purchase_requisition');
      const requisitionNumber = `PRQ-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
      const validatedItems = items.map((item) => {
        const qty = Number(item.quantity);
        const price = Number(item.estimatedUnitCost || 0);
        return {
          lineId: randomUUID(),
          stockItemType: item.stockItemType,
          stockItemId: item.stockItemId,
          stockItemCode: item.stockItemCode || '',
          description: item.description || '',
          unit: item.unit || '',
          quantity: qty,
          estimatedUnitCost: price,
          totalAmount: qty * price,
        };
      });
      const requisition = await PurchaseRequisition.create({
        requisitionNumber,
        department: normalizedDepartment,
        requester: normalizedRequester,
        items: validatedItems,
        requiredDate: requiredDate || null,
        notes: notes || '',
        status,
        createdBy: actor?.name || '',
      });
      await AuditLog.create({
        userName: actor?.name || '',
        action: 'CREATE',
        module: 'Procurement',
        recordId: requisitionNumber,
        description: `Created purchase requisition ${requisitionNumber} for ${normalizedDepartment}`,
      });
      return successResponse({ purchaseRequisition: requisition }, 'Purchase requisition created');
    }

    if (action === 'UPDATE_REQUISITION') {
      const requisition = await PurchaseRequisition.findByIdForUpdate(body.requisitionId);
      if (!requisition) return errorResponse('Purchase Requisition not found', 404);
      if (requisition.status === 'Converted') {
        return errorResponse('A converted requisition cannot be updated', 409);
      }
      if (requisition.status === 'Approved') {
        return errorResponse('An approved requisition cannot be updated', 409);
      }
      const updates = pickFields(body, ['department', 'requester', 'items', 'requiredDate', 'notes']);
      Object.assign(requisition, updates);
      await requisition.save();
      return successResponse({ purchaseRequisition: requisition }, 'Purchase requisition updated');
    }

    if (action === 'DELETE_REQUISITION') {
      const requisition = await PurchaseRequisition.findByIdForUpdate(body.requisitionId);
      if (!requisition) return errorResponse('Purchase Requisition not found', 404);
      if (requisition.status !== 'Draft' && requisition.status !== 'Rejected') {
        return errorResponse('Only draft or rejected requisitions can be deleted', 409);
      }
      await PurchaseRequisition.deleteOne({ _id: requisition._id });
      return successResponse({ purchaseRequisition: requisition }, 'Purchase requisition deleted');
    }

    if (action === 'APPROVE_REQUISITION') {
      if (!await canAccessModule(actor, 'procurement', 'approve')) {
        return errorResponse('Procurement approval permission is required to approve a requisition', 403);
      }
      const requisition = await PurchaseRequisition.findByIdForUpdate(body.requisitionId);
      if (!requisition) return errorResponse('Purchase Requisition not found', 404);
      if (requisition.status !== 'PendingApproval') {
        return errorResponse('Only a pending requisition can be approved', 409);
      }
      requisition.status = 'Approved';
      requisition.approvedBy = actor?.name || '';
      requisition.approvedAt = new Date();
      await requisition.save();
      await AuditLog.create({
        userName: actor?.name || '',
        action: 'APPROVE',
        module: 'Procurement',
        recordId: requisition.requisitionNumber,
        description: `Approved purchase requisition ${requisition.requisitionNumber}`,
      });
      return successResponse({ purchaseRequisition: requisition }, 'Purchase requisition approved');
    }

    if (action === 'REJECT_REQUISITION') {
      if (!await canAccessModule(actor, 'procurement', 'approve')) {
        return errorResponse('Procurement approval permission is required to reject a requisition', 403);
      }
      const requisition = await PurchaseRequisition.findByIdForUpdate(body.requisitionId);
      if (!requisition) return errorResponse('Purchase Requisition not found', 404);
      if (requisition.status !== 'PendingApproval') {
        return errorResponse('Only a pending requisition can be rejected', 409);
      }
      const rejectionReason = String(body.rejectionReason || '').trim();
      if (!rejectionReason) {
        return errorResponse('A rejection reason is required', 400);
      }
      requisition.status = 'Rejected';
      requisition.rejectedBy = actor?.name || '';
      requisition.rejectedAt = new Date();
      requisition.rejectionReason = rejectionReason;
      await requisition.save();
      await AuditLog.create({
        userName: actor?.name || '',
        action: 'REJECT',
        module: 'Procurement',
        recordId: requisition.requisitionNumber,
        description: `Rejected purchase requisition ${requisition.requisitionNumber}: ${rejectionReason}`,
      });
      return successResponse({ purchaseRequisition: requisition }, 'Purchase requisition rejected');
    }

    if (action === 'CONVERT_REQUISITION_TO_RFQ') {
      if (!await canAccessModule(actor, 'procurement', 'add') && !await canAccessModule(actor, 'procurement', 'edit')) {
        return errorResponse('Procurement add or edit permission is required to convert a requisition', 403);
      }
      const requisition = await PurchaseRequisition.findByIdForUpdate(body.requisitionId);
      if (!requisition) return errorResponse('Purchase Requisition not found', 404);
      if (requisition.status !== 'Approved') {
        return errorResponse('Only an approved requisition can be converted to an RFQ', 409);
      }
      const existingRfq = await RFQ.findOne({ requisitionId: requisition._id });
      if (existingRfq) {
        return successResponse({ rfq: existingRfq }, 'RFQ already exists for this requisition', 200);
      }
      const sequence = await allocateSequence('rfq');
      const rfqNumber = `RFQ-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
      const rfqItems = (requisition.items || []).map((item) => ({
        lineId: randomUUID(),
        stockItemType: item.stockItemType,
        stockItemId: item.stockItemId,
        stockItemCode: item.stockItemCode || '',
        description: item.description || '',
        unit: item.unit || '',
        quantity: Number(item.quantity),
        quotedUnitPrice: Number(item.estimatedUnitCost || 0),
        quotedTotal: Number(item.quantity) * Number(item.estimatedUnitCost || 0),
        deliveryTime: '',
        terms: '',
      }));
      const rfq = await RFQ.create({
        rfqNumber,
        requisitionId: requisition._id,
        requisitionNumber: requisition.requisitionNumber,
        supplierId: '',
        supplierName: '',
        items: rfqItems,
        validFrom: null,
        validTo: null,
        notes: `Converted from requisition ${requisition.requisitionNumber}`,
        status: 'Draft',
        createdBy: actor?.name || '',
      });
      requisition.status = 'Converted';
      requisition.convertedTo = 'RFQ';
      requisition.convertedToId = rfq._id;
      requisition.convertedToNumber = rfq.rfqNumber;
      requisition.convertedAt = new Date();
      requisition.convertedBy = actor?.name || '';
      await requisition.save();
      await AuditLog.create({
        userName: actor?.name || '',
        action: 'CONVERT',
        module: 'Procurement',
        recordId: rfqNumber,
        description: `Converted purchase requisition ${requisition.requisitionNumber} to RFQ ${rfqNumber}`,
      });
      return successResponse({ rfq, purchaseRequisition: requisition }, 'Requisition converted to RFQ');
    }

    if (action === 'CONVERT_REQUISITION_TO_PO') {
      if (!await canAccessModule(actor, 'procurement', 'add') && !await canAccessModule(actor, 'procurement', 'edit')) {
        return errorResponse('Procurement add or edit permission is required to convert a requisition', 403);
      }
      const requisition = await PurchaseRequisition.findByIdForUpdate(body.requisitionId);
      if (!requisition) return errorResponse('Purchase Requisition not found', 404);
      if (requisition.status !== 'Approved') {
        return errorResponse('Only an approved requisition can be converted to a purchase order', 409);
      }
      const existingPo = await PurchaseOrder.findOne({ 'items.sourceRequisitionId': requisition._id });
      if (existingPo) {
        return successResponse({ purchaseOrder: existingPo }, 'Purchase order already exists for this requisition', 200);
      }
      const {
        supplierName,
        paymentTerms,
        expectedDeliveryDate,
        inventoryAccountCode,
        payableAccountCode,
        notes,
      } = body;
      if (!supplierName) {
        return errorResponse('Select a supplier for the purchase order', 400);
      }
      const existingSupplier = await Supplier.findOne({ name: supplierName });
      const supplier = existingSupplier ? await Supplier.findByIdForUpdate(existingSupplier._id) : null;
      if (!supplier) return errorResponse('Selected supplier was not found', 404);
      const inventoryAccount = await AccountHead.findOne({ code: inventoryAccountCode });
      const payableAccount = await AccountHead.findOne({ code: payableAccountCode });
      if (!inventoryAccount || inventoryAccount.type !== 'Asset' ||
        !payableAccount || payableAccount.type !== 'Liability') {
        return errorResponse('Select an inventory asset account and a supplier payable liability account', 400);
      }
      const sequence = await allocateSequence('purchase_order');
      const poNumber = `PO-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
      let subtotal = 0;
      const calculatedItems = requisition.items.map((item) => {
        const lineTotal = Number(item.quantity) * Number(item.estimatedUnitCost || 0);
        subtotal += lineTotal;
        return {
          lineId: randomUUID(),
          stockItemType: item.stockItemType,
          stockItemId: item.stockItemId,
          stockItemCode: item.stockItemCode || '',
          description: item.description || '',
          unit: item.unit || '',
          orderedQty: Number(item.quantity),
          unitPrice: Number(item.estimatedUnitCost || 0),
          totalPrice: lineTotal,
          receivedQty: 0,
          sourceRequisitionId: requisition._id,
          sourceRequisitionNumber: requisition.requisitionNumber,
        };
      });
      const po = await PurchaseOrder.create({
        poNumber,
        supplierId: supplier._id,
        supplierName,
        items: calculatedItems,
        subtotal,
        taxPercentage: 0,
        taxAmount: 0,
        grandTotal: subtotal,
        paymentTerms: paymentTerms || '',
        inventoryAccountCode: inventoryAccount.code,
        payableAccountCode: payableAccount.code,
        expectedDeliveryDate: expectedDeliveryDate || null,
        notes: notes || `Converted from requisition ${requisition.requisitionNumber}`,
        status: 'PendingApproval',
      });
      requisition.status = 'Converted';
      requisition.convertedTo = 'PO';
      requisition.convertedToId = po._id;
      requisition.convertedToNumber = po.poNumber;
      requisition.convertedAt = new Date();
      requisition.convertedBy = actor?.name || '';
      await requisition.save();
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
        userName: actor?.name || '',
        action: 'CONVERT',
        module: 'Procurement',
        recordId: po.poNumber,
        description: `Converted purchase requisition ${requisition.requisitionNumber} to Purchase Order ${po.poNumber}`,
      });
      return successResponse({ purchaseOrder: po, purchaseRequisition: requisition }, 'Requisition converted to Purchase Order');
    }

    if (action === 'CREATE_RFQ') {
      const {
        requisitionId, requisitionNumber, supplierId, supplierName,
        items, validFrom, validTo, notes, status = 'Draft',
      } = body;
      if (!supplierName) {
        return errorResponse('Supplier name is required', 400);
      }
      if (!Array.isArray(items) || items.length === 0) {
        return errorResponse('Add at least one item to the RFQ', 400);
      }
      const sequence = await allocateSequence('rfq');
      const rfqNumber = `RFQ-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
      const validatedItems = items.map((item) => {
        const qty = Number(item.quantity);
        const price = Number(item.quotedUnitPrice || 0);
        return {
          lineId: randomUUID(),
          stockItemType: item.stockItemType,
          stockItemId: item.stockItemId,
          stockItemCode: item.stockItemCode || '',
          description: item.description || '',
          unit: item.unit || '',
          quantity: qty,
          quotedUnitPrice: price,
          quotedTotal: qty * price,
          deliveryTime: item.deliveryTime || '',
          terms: item.terms || '',
        };
      });
      const rfq = await RFQ.create({
        rfqNumber,
        requisitionId: requisitionId || '',
        requisitionNumber: requisitionNumber || '',
        supplierId: supplierId || '',
        supplierName,
        items: validatedItems,
        validFrom: validFrom || null,
        validTo: validTo || null,
        notes: notes || '',
        status,
        createdBy: actor?.name || '',
      });
      await AuditLog.create({
        userName: actor?.name || '',
        action: 'CREATE',
        module: 'Procurement',
        recordId: rfqNumber,
        description: `Created RFQ ${rfqNumber} for ${supplierName}`,
      });
      return successResponse({ rfq }, 'RFQ created');
    }

    if (action === 'UPDATE_RFQ') {
      const rfq = await RFQ.findByIdForUpdate(body.rfqId);
      if (!rfq) return errorResponse('RFQ not found', 404);
      if (rfq.status === 'Closed') {
        return errorResponse('A closed RFQ cannot be updated', 409);
      }
      const updates = pickFields(body, ['supplierName', 'items', 'validFrom', 'validTo', 'notes', 'status']);
      Object.assign(rfq, updates);
      await rfq.save();
      return successResponse({ rfq }, 'RFQ updated');
    }

    if (action === 'DELETE_RFQ') {
      const rfq = await RFQ.findByIdForUpdate(body.rfqId);
      if (!rfq) return errorResponse('RFQ not found', 404);
      if (rfq.status !== 'Draft' && rfq.status !== 'Closed') {
        return errorResponse('Only draft or closed RFQs can be deleted', 409);
      }
      await RFQ.deleteOne({ _id: rfq._id });
      return successResponse({ rfq }, 'RFQ deleted');
    }

    if (action === 'CREATE_SUPPLIER_QUOTATION') {
      const {
        rfqId, rfqNumber, supplierId, supplierName,
        items, validFrom, validTo, notes, status = 'Submitted',
      } = body;
      if (!supplierName) {
        return errorResponse('Supplier name is required', 400);
      }
      if (!Array.isArray(items) || items.length === 0) {
        return errorResponse('Add at least one item to the quotation', 400);
      }
      // Validate RFQ reference if provided
      if (rfqId) {
        const existingRfq = await RFQ.findById(rfqId);
        if (!existingRfq) {
          return errorResponse('Referenced RFQ does not exist', 404);
        }
      }
      // Supplier-specific duplicate prevention
      if (rfqNumber) {
        const existingByRfq = await SupplierQuotation.findOne({ rfqNumber, supplierName });
        if (existingByRfq) {
          return errorResponse('A quotation for this supplier and RFQ already exists', 409);
        }
      }
      const sequence = await allocateSequence('supplier_quotation');
      const quotationNumber = `SQT-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
      let grandTotal = 0;
      const validatedItems = items.map((item) => {
        const qty = Number(item.quantity);
        const price = Number(item.quotedUnitPrice || 0);
        const total = qty * price;
        grandTotal += total;
        return {
          lineId: randomUUID(),
          stockItemType: item.stockItemType,
          stockItemId: item.stockItemId,
          stockItemCode: item.stockItemCode || '',
          description: item.description || '',
          unit: item.unit || '',
          quantity: qty,
          quotedUnitPrice: price,
          quotedTotal: total,
          deliveryTime: item.deliveryTime || '',
          terms: item.terms || '',
        };
      });
      const quotation = await SupplierQuotation.create({
        quotationNumber,
        rfqId: rfqId || '',
        rfqNumber: rfqNumber || '',
        supplierId: supplierId || '',
        supplierName,
        items: validatedItems,
        totalAmount: grandTotal,
        validFrom: validFrom || null,
        validTo: validTo || null,
        notes: notes || '',
        status,
        createdBy: actor?.name || '',
      });
      await AuditLog.create({
        userName: actor?.name || '',
        action: 'CREATE',
        module: 'Procurement',
        recordId: quotationNumber,
        description: `Received supplier quotation ${quotationNumber} from ${supplierName}`,
      });
      return successResponse({ supplierQuotation: quotation }, 'Supplier quotation recorded');
    }

    if (action === 'UPDATE_SUPPLIER_QUOTATION') {
      const quotation = await SupplierQuotation.findByIdForUpdate(body.quotationId);
      if (!quotation) return errorResponse('Supplier Quotation not found', 404);
      if (quotation.status === 'Accepted') {
        return errorResponse('An accepted quotation cannot be updated', 409);
      }
      const updates = pickFields(body, ['supplierName', 'items', 'validFrom', 'validTo', 'notes', 'status']);
      if (updates.status === 'Accepted') {
        if (!await canAccessModule(actor, 'procurement', 'approve')) {
          return errorResponse('Procurement approval permission is required to accept a quotation', 403);
        }
      }
      if (updates.items !== undefined) {
        if (!Array.isArray(updates.items) || updates.items.length === 0) {
          return errorResponse('Add at least one item to the quotation', 400);
        }
        let grandTotal = 0;
        const validatedItems = updates.items.map((item) => {
          const qty = Number(item.quantity);
          const price = Number(item.quotedUnitPrice || 0);
          const total = qty * price;
          grandTotal += total;
          return {
            lineId: item.lineId || randomUUID(),
            stockItemType: item.stockItemType,
            stockItemId: item.stockItemId,
            stockItemCode: item.stockItemCode || '',
            description: item.description || '',
            unit: item.unit || '',
            quantity: qty,
            quotedUnitPrice: price,
            quotedTotal: total,
            deliveryTime: item.deliveryTime || '',
            terms: item.terms || '',
          };
        });
        updates.items = validatedItems;
        updates.totalAmount = grandTotal;
      }
      Object.assign(quotation, updates);
      await quotation.save();
      return successResponse({ supplierQuotation: quotation }, 'Supplier quotation updated');
    }

    if (action === 'DELETE_SUPPLIER_QUOTATION') {
      const quotation = await SupplierQuotation.findByIdForUpdate(body.quotationId);
      if (!quotation) return errorResponse('Supplier Quotation not found', 404);
      if (quotation.status === 'Accepted') {
        return errorResponse('An accepted quotation cannot be deleted', 409);
      }
      await SupplierQuotation.deleteOne({ _id: quotation._id });
      return successResponse({ supplierQuotation: quotation }, 'Supplier quotation deleted');
    }

    if (action === 'CONVERT_SUPPLIER_QUOTATION_TO_PO') {
      if (!await canAccessModule(actor, 'procurement', 'add') && !await canAccessModule(actor, 'procurement', 'edit')) {
        return errorResponse('Procurement add or edit permission is required to convert a quotation', 403);
      }
      const quotation = await SupplierQuotation.findByIdForUpdate(body.quotationId);
      if (!quotation) return errorResponse('Supplier Quotation not found', 404);
      if (quotation.status !== 'Accepted') {
        return errorResponse('Only an accepted quotation can be converted to a purchase order', 409);
      }
      const existingPo = await PurchaseOrder.findOne({ 'items.sourceQuotationId': quotation._id });
      if (existingPo) {
        return successResponse({ purchaseOrder: existingPo }, 'Purchase order already exists for this quotation', 200);
      }
      const {
        supplierName,
        paymentTerms,
        expectedDeliveryDate,
        inventoryAccountCode,
        payableAccountCode,
        notes,
      } = body;
      if (!supplierName) {
        return errorResponse('Select a supplier for the purchase order', 400);
      }
      const existingSupplier = await Supplier.findOne({ name: supplierName });
      const supplier = existingSupplier ? await Supplier.findByIdForUpdate(existingSupplier._id) : null;
      if (!supplier) return errorResponse('Selected supplier was not found', 404);
      const inventoryAccount = await AccountHead.findOne({ code: inventoryAccountCode });
      const payableAccount = await AccountHead.findOne({ code: payableAccountCode });
      if (!inventoryAccount || inventoryAccount.type !== 'Asset' ||
        !payableAccount || payableAccount.type !== 'Liability') {
        return errorResponse('Select an inventory asset account and a supplier payable liability account', 400);
      }
      const sequence = await allocateSequence('purchase_order');
      const poNumber = `PO-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
      let subtotal = 0;
      const calculatedItems = quotation.items.map((item) => {
        const lineTotal = Number(item.quantity) * Number(item.quotedUnitPrice);
        subtotal += lineTotal;
        return {
          lineId: randomUUID(),
          stockItemType: item.stockItemType,
          stockItemId: item.stockItemId,
          stockItemCode: item.stockItemCode || '',
          description: item.description || '',
          unit: item.unit || '',
          orderedQty: Number(item.quantity),
          unitPrice: Number(item.quotedUnitPrice),
          totalPrice: lineTotal,
          receivedQty: 0,
          sourceQuotationId: quotation._id,
          sourceQuotationNumber: quotation.quotationNumber,
        };
      });
      const po = await PurchaseOrder.create({
        poNumber,
        supplierId: supplier._id,
        supplierName,
        items: calculatedItems,
        subtotal,
        taxPercentage: 0,
        taxAmount: 0,
        grandTotal: subtotal,
        paymentTerms: paymentTerms || '',
        inventoryAccountCode: inventoryAccount.code,
        payableAccountCode: payableAccount.code,
        expectedDeliveryDate: expectedDeliveryDate || null,
        notes: notes || `Converted from quotation ${quotation.quotationNumber}`,
        status: 'PendingApproval',
      });
      quotation.status = 'Converted';
      quotation.convertedTo = 'PO';
      quotation.convertedToId = po._id;
      quotation.convertedToNumber = po.poNumber;
      quotation.convertedAt = new Date();
      quotation.convertedBy = actor?.name || '';
      await quotation.save();
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
        userName: actor?.name || '',
        action: 'CONVERT',
        module: 'Procurement',
        recordId: po.poNumber,
        description: `Converted supplier quotation ${quotation.quotationNumber} to Purchase Order ${po.poNumber}`,
      });
      return successResponse({ purchaseOrder: po, supplierQuotation: quotation }, 'Quotation converted to Purchase Order');
    }

    if (action === 'CREATE_SUPPLIER_INVOICE') {
      const {
        supplierId, supplierName, poNumber, poId, grnNumber, grnId,
        invoiceDate, dueDate, items, taxPercentage, notes, status = 'Posted',
        expenseAccountCode, payableAccountCode,
      } = body;
      if (!supplierName) {
        return errorResponse('Supplier name is required', 400);
      }
      if (!invoiceDate) {
        return errorResponse('Invoice date is required', 400);
      }
      if (!Array.isArray(items) || items.length === 0) {
        return errorResponse('Add at least one item to the invoice', 400);
      }
      // Validate supplier identity against database record
      const supplierRecord = supplierId ? await Supplier.findById(supplierId) : null;
      if (!supplierRecord) {
        return errorResponse('Supplier not found', 404);
      }
      if (supplierName && supplierRecord.name !== supplierName) {
        return errorResponse('Supplier name does not match the supplier record', 400);
      }
      // Per-supplier duplicate prevention: same supplier cannot reuse an invoice number
      const existingInvoice = await SupplierInvoice.findOne({
        invoiceNumber: String(body.invoiceNumber || '').trim(),
        supplierName: supplierRecord.name,
      });
      if (existingInvoice) {
        return errorResponse('A supplier invoice with this number already exists for this supplier', 409);
      }
      // Validate paid amount cannot exceed grand total
      const paidAmount = Number(body.paidAmount || 0);
      if (!Number.isFinite(paidAmount) || paidAmount < 0) {
        return errorResponse('Paid amount must be a non-negative number', 400);
      }
      // Compute totals server-side; never trust client-calculated values
      let subtotal = 0;
      const validatedItems = items.map((item) => {
        const qty = Number(item.quantity);
        const price = Number(item.unitPrice || 0);
        const total = qty * price;
        subtotal += total;
        return {
          lineId: randomUUID(),
          description: item.description || '',
          quantity: qty,
          unit: item.unit || '',
          unitPrice: price,
          totalAmount: total,
        };
      });
      const taxRate = Number(taxPercentage || 0);
      const taxAmount = (subtotal * taxRate) / 100;
      const grandTotal = subtotal + taxAmount;
      if (paidAmount > grandTotal) {
        return errorResponse('Paid amount cannot exceed grand total', 400);
      }
      const outstandingBalance = grandTotal - paidAmount;
      const invoiceNumber = String(body.invoiceNumber || '').trim() || `INV-${new Date().getFullYear()}-${String(await allocateSequence('supplier_invoice')).padStart(4, '0')}`;
      // Supplier-specific source key prevents cross-supplier invoice number collision
      const supplierIdStr = supplierId || '';
      const invoiceSourceKey = `SUPPLIER_INVOICE:${supplierIdStr}:${invoiceNumber}`;

      return await runInTransaction(async () => {
        // Validate supplier identity inside transaction
        const supplierRecord = supplierId ? await Supplier.findById(supplierId) : null;
        if (!supplierRecord) {
          return errorResponse('Supplier not found', 404);
        }
        if (supplierName && supplierRecord.name !== supplierName) {
          return errorResponse('Supplier name does not match the supplier record', 400);
        }
        // Per-supplier duplicate prevention inside transaction
        const existingInvoice = await SupplierInvoice.findOne({
          invoiceNumber: String(body.invoiceNumber || '').trim(),
          supplierName: supplierRecord.name,
        });
        if (existingInvoice) {
          return errorResponse('A supplier invoice with this number already exists for this supplier', 409);
        }
        // Journal idempotency check inside transaction
        const existingJournal = await JournalEntry.findOne({ sourceKey: invoiceSourceKey });
        if (existingJournal) {
          return errorResponse('A journal entry already exists for this invoice from this supplier', 409);
        }
        // Load company-level accounting mappings (required - no silent fallback to hardcoded codes)
        const company = await getCompanyContext();
        const mappings = company && company.accountingMappings ? company.accountingMappings : {};
        if (!mappings || Object.keys(mappings).length === 0) {
          return errorResponse('Accounting mappings are not configured. Please configure company accounting mappings in Administration before posting supplier invoices.', 409);
        }
        // Resolve payable account from company mapping (body parameter is ignored - mappings are source of truth)
        const resolvedPayableCode = mappings.payableAccountCode;
        if (!resolvedPayableCode) {
          return errorResponse('Payable account mapping is not configured. Set payableAccountCode in company accounting mappings.', 409);
        }
        const payableAccount = await AccountHead.findOne({ code: resolvedPayableCode });
        if (!payableAccount || payableAccount.type !== 'Liability') {
          return errorResponse(`Payable account (${resolvedPayableCode}) must be a liability account`, 400);
        }
        // Resolve GRNI account from company mapping
        const resolvedGrniCode = mappings.grniAccountCode;
        if (!resolvedGrniCode) {
          return errorResponse('GRNI account mapping is not configured. Set grniAccountCode in company accounting mappings.', 409);
        }
        const grniAccount = await AccountHead.findOne({ code: resolvedGrniCode });
        if (!grniAccount || grniAccount.type !== 'Liability') {
          return errorResponse(`GRNI clearing account (${resolvedGrniCode}) must be a liability account`, 409);
        }
        // Resolve input tax account from company mapping (required when tax > 0)
        let inputTaxAccount = null;
        if (taxAmount > 0) {
          const resolvedInputTaxCode = mappings.inputTaxAccountCode;
          if (!resolvedInputTaxCode) {
            return errorResponse('Input tax account mapping is not configured. Set inputTaxAccountCode in company accounting mappings.', 409);
          }
          inputTaxAccount = await AccountHead.findOne({ code: resolvedInputTaxCode });
          if (!inputTaxAccount || inputTaxAccount.type !== 'Asset') {
            return errorResponse(`Input tax account (${resolvedInputTaxCode}) must be an asset account`, 409);
          }
        }
        // Resolve expense/COGS account from company mapping
        const resolvedExpenseCode = mappings.cogsAccountCode || mappings.expenseAccountCode;
        if (!resolvedExpenseCode) {
          return errorResponse('Expense/COGS account mapping is not configured. Set cogsAccountCode or expenseAccountCode in company accounting mappings.', 409);
        }
        const expenseAccount = await AccountHead.findOne({ code: resolvedExpenseCode });
        if (!expenseAccount || (expenseAccount.type !== 'OperatingExpense' && expenseAccount.type !== 'CostOfGoodsSold')) {
          return errorResponse(`Expense account (${resolvedExpenseCode}) must be an operating-expense or COGS account`, 400);
        }
        // Lock PO record for GRN row-level concurrency control
        let lockedPo = null;
        if (poId) {
          lockedPo = await PurchaseOrder.findByIdForUpdate(poId);
          if (!lockedPo) {
            return errorResponse('Purchase order not found or locked by another transaction', 409);
          }
        } else if (poNumber) {
          const poByNumber = await PurchaseOrder.findOne({ poNumber });
          if (!poByNumber) {
            return errorResponse('Purchase order not found', 404);
          }
          lockedPo = await PurchaseOrder.findByIdForUpdate(poByNumber._id);
          if (!lockedPo) {
            return errorResponse('Purchase order not found or locked by another transaction', 409);
          }
        } else if (grnNumber) {
          return errorResponse('Purchase order ID or number is required when referencing a GRN', 400);
        }
        // Lock GRNI, Payable, Input Tax, and Expense accounts in consistent order
        const accountsToLock = [grniAccount, payableAccount, expenseAccount];
        if (inputTaxAccount) {
          accountsToLock.push(inputTaxAccount);
        }
        const lockOrder = accountsToLock.map(a => a.code).sort();
        const lockedAccounts = new Map();
        for (const code of lockOrder) {
          const acc = accountsToLock.find(a => a.code === code);
          const locked = await AccountHead.findByIdForUpdate(acc._id);
          if (!locked) {
            return errorResponse(`Account ${code} could not be locked for invoice posting`, 409);
          }
          lockedAccounts.set(code, locked);
        }
        const lockedGrni = lockedAccounts.get(grniAccount.code);
        const lockedPayable = lockedAccounts.get(payableAccount.code);
        const lockedInputTax = inputTaxAccount ? lockedAccounts.get(inputTaxAccount.code) : null;
        const lockedExpense = lockedAccounts.get(expenseAccount.code);
        if (!lockedGrni || !lockedPayable || !lockedExpense || (inputTaxAccount && !lockedInputTax)) {
          return errorResponse('One or more accounts could not be locked for invoice posting', 409);
        }
        // Calculate GRNI clearing inside the protected transaction
        let grniDebit = 0;
        let expenseDebit = subtotal;
        let taxDebit = 0;
        if (grnNumber && lockedPo) {
          const grnEntry = (lockedPo.grns || []).find((g) => g.grnNumber === grnNumber || g._id === grnId);
          let grnAcceptedValue = 0;
          if (grnEntry) {
            grnAcceptedValue = Number(grnEntry.acceptedValue || grnEntry.totalReceivedValue || 0);
          }
          // Calculate cumulative GRNI already cleared by prior invoices from the same supplier
          let grniAlreadyCleared = 0;
          const priorInvoices = await SupplierInvoice.find({
            grnNumber: grnNumber,
            supplierId: supplierId || '',
          }).lean();
          for (const priorInvoice of priorInvoices) {
            if (priorInvoice.invoiceNumber === invoiceNumber) continue;
            const priorJournal = await JournalEntry.findOne({ sourceKey: `SUPPLIER_INVOICE:${priorInvoice.supplierId}:${priorInvoice.invoiceNumber}` });
            if (priorJournal && priorJournal.lines) {
              for (const line of priorJournal.lines) {
                if (line.accountCode === grniAccount.code) {
                  grniAlreadyCleared += Number(line.debit || 0);
                }
              }
            }
          }
          const remainingGRNI = Math.max(0, grnAcceptedValue - grniAlreadyCleared);
          // GRNI debit capped at goods subtotal (never tax) and remaining GRNI balance
          grniDebit = Math.min(subtotal, remainingGRNI);
        }
        taxDebit = taxAmount;
        // Expense/COGS debit is the price variance: goods subtotal minus GRNI cleared
        expenseDebit = subtotal - grniDebit;
        const journalLines = [];
        if (grniDebit > 0) {
          journalLines.push({
            accountCode: lockedGrni.code,
            accountName: lockedGrni.name,
            debit: grniDebit,
            credit: 0,
            memo: `Clear GRNI accrual for invoice ${invoiceNumber}`,
          });
        }
        if (expenseDebit > 0) {
          journalLines.push({
            accountCode: lockedExpense.code,
            accountName: lockedExpense.name,
            debit: expenseDebit,
            credit: 0,
            memo: `Supplier invoice ${invoiceNumber} - expense/COGS`,
          });
        }
        if (taxDebit > 0) {
          journalLines.push({
            accountCode: lockedInputTax.code,
            accountName: lockedInputTax.name,
            debit: taxDebit,
            credit: 0,
            memo: `Input tax for invoice ${invoiceNumber}`,
          });
        }
        // Credit Payable for the full invoice amount
        journalLines.push({
          accountCode: lockedPayable.code,
          accountName: lockedPayable.name,
          debit: 0,
          credit: grandTotal,
          memo: `Supplier payable for invoice ${invoiceNumber}`,
        });
        const { entry: journalEntry, duplicate: journalDuplicate } = await postBalancedJournalEntry({
          sourceKey: invoiceSourceKey,
          voucherType: 'SupplierInvoice',
          narration: `Supplier invoice ${invoiceNumber} for ${supplierName}`,
          referenceNumber: invoiceNumber,
          postedBy: actor?.name || '',
          lines: journalLines,
        });
        if (journalDuplicate) {
          return errorResponse('A journal entry already exists for this invoice from this supplier', 409);
        }
        const invoice = await SupplierInvoice.create({
          invoiceNumber,
          supplierId: supplierId || '',
          supplierName,
          poNumber: String(poNumber || '').trim(),
          poId: poId || '',
          grnNumber: String(grnNumber || '').trim(),
          grnId: grnId || '',
          invoiceDate: new Date(invoiceDate),
          dueDate: dueDate ? new Date(dueDate) : null,
          items: validatedItems,
          subtotal,
          taxPercentage: taxRate,
          taxAmount,
          grandTotal,
          paidAmount,
          outstandingBalance,
          status,
          notes: notes || '',
          createdBy: actor?.name || '',
          financialEntryId: journalEntry._id,
          expenseAccountCode: lockedExpense.code,
          payableAccountCode: lockedPayable.code,
        });
        await AuditLog.create({
          userName: actor?.name || '',
          action: 'CREATE',
          module: 'Procurement',
          recordId: invoiceNumber,
          description: `Recorded supplier invoice ${invoiceNumber} for ${supplierName}`,
        });
        return successResponse({ supplierInvoice: invoice }, 'Supplier invoice recorded');
      });
    }

    if (action === 'CREATE_GRNI_ADJUSTMENT') {
      const {
        grnNumber, supplierId, supplierName, adjustmentAmount,
        counterAccountCode, reason, approvalReference, adjustmentType,
      } = body;
      if (!grnNumber) return errorResponse('GRN number is required', 400);
      if (!supplierId) return errorResponse('Supplier is required', 400);
      const amount = Number(adjustmentAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return errorResponse('Enter a positive adjustment amount', 400);
      }
      if (!counterAccountCode) return errorResponse('Counter account is required', 400);
      if (!reason) return errorResponse('Reason is required', 400);
      if (!approvalReference) return errorResponse('Approval reference is required', 400);
      if (!adjustmentType) return errorResponse('Adjustment type is required', 400);
      const validAdjustmentTypes = ['price_variance', 'inventory_correction', 'expense_write_off'];
      if (!validAdjustmentTypes.includes(adjustmentType)) {
        return errorResponse(`Invalid adjustment type. Must be one of: ${validAdjustmentTypes.join(', ')}`, 400);
      }

      return await runInTransaction(async () => {
        // Lock PO row first to establish fresh read snapshot
        const matchedPo = await PurchaseOrder.findByGrnNumberForUpdate(grnNumber);
        if (!matchedPo) {
          return errorResponse('GRN not found', 404);
        }
        const grnAcceptedValue = Number(matchedPo.acceptedValue || matchedPo.totalReceivedValue || 0);

        // Calculate cumulative GRNI already cleared by prior invoices from the same supplier
        let grniAlreadyCleared = 0;
        const priorInvoices = await SupplierInvoice.find({
          grnNumber,
          supplierId,
        }).lean();
        for (const priorInvoice of priorInvoices) {
          const priorJournal = await JournalEntry.findOne({
            sourceKey: `SUPPLIER_INVOICE:${priorInvoice.supplierId}:${priorInvoice.invoiceNumber}`,
          });
          if (priorJournal && priorJournal.lines) {
            for (const line of priorJournal.lines) {
              // Need GRNI account code to match; resolve from company mappings
              const company = await getCompanyContext();
              const mappings = company && company.accountingMappings ? company.accountingMappings : {};
              const resolvedGrniCode = mappings.grniAccountCode || '2030';
              if (line.accountCode === resolvedGrniCode) {
                grniAlreadyCleared += Number(line.debit || 0);
              }
            }
          }
        }

        // Also check for prior adjustments against this GRN+supplier
        const priorAdjustments = await ResidualGRNI.find({ grnNumber, supplierId }).lean();
        for (const adj of priorAdjustments) {
          if (adj.status === 'Approved' || adj.status === 'Reconciled') {
            grniAlreadyCleared += Number(adj.adjustmentAmount || 0);
          }
        }

        const remainingGRNI = Math.max(0, grnAcceptedValue - grniAlreadyCleared);
        if (amount > remainingGRNI) {
          return errorResponse(
            `Adjustment amount ${amount} exceeds remaining GRNI ${remainingGRNI} for GRN ${grnNumber}`,
            409,
          );
        }

        // Resolve GRNI and counter accounts from company mappings
        const company = await getCompanyContext();
        const mappings = company && company.accountingMappings ? company.accountingMappings : {};
        const resolvedGrniCode = mappings.grniAccountCode;
        if (!resolvedGrniCode) {
          return errorResponse('GRNI account mapping is not configured', 409);
        }
        const grniAccount = await AccountHead.findOne({ code: resolvedGrniCode });
        if (!grniAccount || grniAccount.type !== 'Liability') {
          return errorResponse(`GRNI clearing account (${resolvedGrniCode}) must be a liability account`, 409);
        }

        // Validate counter account against purpose-based mapping for adjustment type
        const counterAccountMappingKey = adjustmentTypeToMappingKey(adjustmentType);
        if (!counterAccountMappingKey) {
          return errorResponse(`Invalid adjustment type: ${adjustmentType}`, 400);
        }
        const resolvedCounterAccountCode = mappings[counterAccountMappingKey];
        if (!resolvedCounterAccountCode) {
          return errorResponse(`No account mapped for adjustment type '${adjustmentType}' (mapping key '${counterAccountMappingKey}')`, 409);
        }
        const counterAccount = await AccountHead.findOne({ code: resolvedCounterAccountCode.trim() });
        if (!counterAccount) {
          return errorResponse(`Counter account ${resolvedCounterAccountCode.trim()} (mapped from adjustment type '${adjustmentType}') does not exist`, 409);
        }

        // Lock both accounts in consistent order
        const lockOrder = [grniAccount.code, resolvedCounterAccountCode.trim()].sort();
        const lockedAccounts = new Map();
        for (const code of lockOrder) {
          const acc = code === grniAccount.code ? grniAccount : counterAccount;
          const locked = await AccountHead.findByIdForUpdate(acc._id);
          if (!locked) {
            return errorResponse(`Account ${code} could not be locked for adjustment`, 409);
          }
          lockedAccounts.set(code, locked);
        }

        const lockedGrni = lockedAccounts.get(grniAccount.code);
        const lockedCounter = lockedAccounts.get(resolvedCounterAccountCode.trim());

        // Idempotency: unique source key per GRN + supplier + adjustment
        const adjustmentSourceKey = `GRNI_ADJUSTMENT:${supplierId}:${grnNumber}:${amount}:${reason}`;
        const existingAdjustment = await JournalEntry.findOne({ sourceKey: adjustmentSourceKey });
        if (existingAdjustment) {
          return errorResponse('An identical GRNI adjustment has already been posted', 409);
        }

        // Post balanced journal: Debit GRNI (reduce liability), Credit counter account
        // This clears the residual GRNI liability and recognizes the write-off/variance
        // in the counter account.
        const { entry: journalEntry } = await postBalancedJournalEntry({
          sourceKey: adjustmentSourceKey,
          voucherType: 'GRNIAdjustment',
          narration: `GRNI residual adjustment for ${grnNumber} - ${reason}`,
          referenceNumber: grnNumber,
          postedBy: actor?.name || '',
          lines: [
            {
              accountCode: grniAccount.code,
              accountName: grniAccount.name,
              debit: amount,
              credit: 0,
              memo: `Clear residual GRNI liability for ${grnNumber}`,
            },
            {
              accountCode: counterAccount.code,
              accountName: counterAccount.name,
              debit: 0,
              credit: amount,
              memo: `GRNI adjustment (${adjustmentType}) - ${reason}`,
            },
          ],
        });

        // Create adjustment tracking record as Pending - requires explicit approval.
        // approvalReference is recorded for audit but does NOT constitute authorization.
        const adjustment = await ResidualGRNI.create({
          grnNumber,
          supplierId,
          supplierName: supplierName || matchedPo.supplierName || '',
          poNumber: matchedPo.poNumber,
          adjustmentAmount: amount,
          counterAccountCode: counterAccount.code,
          counterAccountName: counterAccount.name,
          reason,
          approvalReference,
          adjustmentType,
          status: 'Pending',
          proposedBy: actor?.name || '',
          proposedAt: new Date(),
          journalEntryId: null, // Journal posted only after approval
          sourceKey: adjustmentSourceKey,
        });

        await AuditLog.create({
          userName: actor?.name || '',
          action: 'CREATE',
          module: 'Procurement',
          recordId: adjustment._id.toString(),
          description: `Created GRNI residual adjustment proposal for ${grnNumber}: Rs. ${amount.toLocaleString()} (pending approval)`,
        });

        return successResponse({
          adjustment,
          message: 'GRNI residual adjustment proposal created. Pending approval.',
        }, 'GRNI residual adjustment proposal created');
      });
    }

    if (action === 'APPROVE_GRNI_ADJUSTMENT') {
      return await runInTransaction(async () => {
        const { adjustmentId } = body;
        if (!adjustmentId) return errorResponse('Adjustment ID is required', 400);

        const adjustment = await ResidualGRNI.findByIdForUpdate(adjustmentId);
        if (!adjustment) return errorResponse('GRNI adjustment not found', 404);
        if (adjustment.status !== 'Pending') {
          return errorResponse(`Adjustment is already ${adjustment.status}`, 409);
        }

        // Separation of duties: requester cannot approve their own adjustment
        if (actor?.name && adjustment.proposedBy === actor.name) {
          return errorResponse('You cannot approve your own adjustment. Separation of duties required.', 403);
        }

        // Role-based authorization: only Accountant role (or SuperAdmin) can approve
        if (actor?.role !== 'SuperAdmin' && actor?.role !== 'Accountant') {
          return errorResponse('Only an Accountant or SuperAdmin can approve GRNI adjustments', 403);
        }

        // Lock PO row first to establish fresh read snapshot before reading prior cleared amounts
        const matchedPo = await PurchaseOrder.findByGrnNumberForUpdate(adjustment.grnNumber);
        if (!matchedPo) {
          return errorResponse('GRN not found', 404);
        }
        const grnAcceptedValue = Number(matchedPo.acceptedValue || matchedPo.totalReceivedValue || 0);

        // Verify supplier ownership: the locked PO's supplier must match the adjustment's supplier.
        const poSupplierId = String(matchedPo.supplierId || '').trim();
        const adjustmentSupplierId = String(adjustment.supplierId || '').trim();
        if (poSupplierId !== adjustmentSupplierId) {
          return errorResponse('GRN supplier does not match the purchase order supplier', 409);
        }

        // Resolve GRNI and counter accounts from company mappings
        const company = await getCompanyContext();
        const mappings = company && company.accountingMappings ? company.accountingMappings : {};
        const resolvedGrniCode = mappings.grniAccountCode;
        if (!resolvedGrniCode) {
          return errorResponse('GRNI account mapping is not configured', 409);
        }
        const grniAccount = await AccountHead.findOne({ code: resolvedGrniCode });
        if (!grniAccount || grniAccount.type !== 'Liability') {
          return errorResponse(`GRNI clearing account (${resolvedGrniCode}) must be a liability account`, 409);
        }

        const counterAccount = await AccountHead.findOne({ code: adjustment.counterAccountCode.trim() });
        if (!counterAccount) {
          return errorResponse(`Counter account ${adjustment.counterAccountCode} does not exist`, 409);
        }
        // Validate counter account against its purpose-based mapping
        const counterAccountMappingKey = adjustmentTypeToMappingKey(adjustment.adjustmentType);
        if (!counterAccountMappingKey) {
          return errorResponse(`Invalid adjustment type: ${adjustment.adjustmentType}`, 400);
        }
        const resolvedCounterAccountCode = mappings[counterAccountMappingKey];
        if (!resolvedCounterAccountCode || counterAccount.code.trim() !== resolvedCounterAccountCode.trim()) {
          return errorResponse(`Counter account ${adjustment.counterAccountCode} does not match mapping for adjustment type '${adjustment.adjustmentType}'`, 409);
        }

        // Re-verify remaining GRNI (may have changed since proposal) — read prior cleared amounts AFTER acquiring PO lock
        let grniAlreadyCleared = 0;
        const priorInvoices = await SupplierInvoice.find({
          grnNumber: adjustment.grnNumber,
          supplierId: adjustment.supplierId,
        }).lean();
        for (const priorInvoice of priorInvoices) {
          const priorJournal = await JournalEntry.findOne({
            sourceKey: `SUPPLIER_INVOICE:${adjustment.supplierId}:${priorInvoice.invoiceNumber}`,
          });
          if (priorJournal && priorJournal.lines) {
            for (const line of priorJournal.lines) {
              if (line.accountCode === resolvedGrniCode) {
                grniAlreadyCleared += Number(line.debit || 0);
              }
            }
          }
        }
        const priorAdjustments = await ResidualGRNI.find({
          grnNumber: adjustment.grnNumber,
          supplierId: adjustment.supplierId,
        }).lean();
        for (const adj of priorAdjustments) {
          if (adj._id.toString() !== adjustmentId && (adj.status === 'Approved' || adj.status === 'Reconciled')) {
            grniAlreadyCleared += Number(adj.adjustmentAmount || 0);
          }
        }

        const remainingGRNI = Math.max(0, grnAcceptedValue - grniAlreadyCleared);

        if (adjustment.adjustmentAmount > remainingGRNI) {
          return errorResponse(
            `Adjustment amount exceeds remaining GRNI ${remainingGRNI}`,
            409,
          );
        }

        // Lock both accounts in consistent order
        const lockOrder = [resolvedGrniCode, adjustment.counterAccountCode.trim()].sort();
        const lockedAccounts = new Map();
        for (const code of lockOrder) {
          const acc = code === resolvedGrniCode ? grniAccount : counterAccount;
          const locked = await AccountHead.findByIdForUpdate(acc._id);
          if (!locked) {
            return errorResponse(`Account ${code} could not be locked`, 409);
          }
          lockedAccounts.set(code, locked);
        }

        const lockedGrni = lockedAccounts.get(resolvedGrniCode);
        const lockedCounter = lockedAccounts.get(adjustment.counterAccountCode.trim());

        // Idempotency: check journal not already posted
        if (adjustment.journalEntryId) {
          return errorResponse('Adjustment has already been posted', 409);
        }
        const existingJournal = await JournalEntry.findOne({ sourceKey: adjustment.sourceKey });
        if (existingJournal) {
          return errorResponse('A journal entry for this adjustment already exists', 409);
        }

        // Post balanced journal: Debit GRNI (reduce liability), Credit counter account
        const { entry: journalEntry } = await postBalancedJournalEntry({
          sourceKey: adjustment.sourceKey,
          voucherType: 'GRNIAdjustment',
          narration: `GRNI residual adjustment for ${adjustment.grnNumber} - ${adjustment.reason}`,
          referenceNumber: adjustment.grnNumber,
          postedBy: actor?.name || '',
          lines: [
            {
              accountCode: grniAccount.code,
              accountName: grniAccount.name,
              debit: adjustment.adjustmentAmount,
              credit: 0,
              memo: `Clear residual GRNI liability for ${adjustment.grnNumber}`,
            },
            {
              accountCode: counterAccount.code,
              accountName: counterAccount.name,
              debit: 0,
              credit: adjustment.adjustmentAmount,
              memo: `GRNI adjustment - ${adjustment.reason}`,
            },
          ],
        });

        // Update adjustment as Approved
        adjustment.status = 'Approved';
        adjustment.approvedBy = actor?.name || '';
        adjustment.approvedAt = new Date();
        adjustment.journalEntryId = journalEntry._id;
        await adjustment.save();

        await AuditLog.create({
          userName: actor?.name || '',
          action: 'APPROVE',
          module: 'Procurement',
          recordId: adjustment._id.toString(),
          description: `Approved GRNI residual adjustment for ${adjustment.grnNumber}: Rs. ${adjustment.adjustmentAmount.toLocaleString()}`,
        });

        return successResponse({
          adjustment,
          journalEntry,
        }, 'GRNI residual adjustment approved and posted');
      });
    }

    if (action === 'UPDATE_SUPPLIER_INVOICE') {
      const invoice = await SupplierInvoice.findByIdForUpdate(body.invoiceId);
      if (!invoice) return errorResponse('Supplier Invoice not found', 404);
      if (invoice.status === 'Paid') {
        return errorResponse('A paid invoice cannot be updated', 409);
      }
      // Posted invoices with a journal entry cannot have accounting-impacting fields changed.
      // Non-financial fields (notes) remain editable. Status changes to Paid must go through
      // the payment flow, not direct invoice updates.
      const accountingFields = ['supplierName', 'poNumber', 'grnNumber', 'items', 'taxPercentage', 'paidAmount', 'expenseAccountCode', 'payableAccountCode', 'status'];
      const hasAccountingChange = accountingFields.some((f) => body[f] !== undefined);
      if (invoice.financialEntryId && hasAccountingChange) {
        return errorResponse('Posted invoice accounting fields cannot be changed. Use a credit/debit note workflow instead.', 409);
      }
      if (body.status === 'Paid') {
        return errorResponse('Paid status must result from a valid payment record, not direct invoice update.', 409);
      }
      const updates = pickFields(body, ['supplierName', 'poNumber', 'grnNumber', 'invoiceDate', 'dueDate', 'items', 'taxPercentage', 'paidAmount', 'notes', 'status', 'expenseAccountCode', 'payableAccountCode']);
      if (updates.paidAmount !== undefined) {
        const paid = Number(updates.paidAmount);
        if (!Number.isFinite(paid) || paid < 0) {
          return errorResponse('Paid amount must be a non-negative number', 400);
        }
        if (paid > Number(invoice.grandTotal)) {
          return errorResponse('Paid amount cannot exceed grand total', 400);
        }
        updates.outstandingBalance = Number(invoice.grandTotal) - paid;
      }
      if (updates.taxPercentage !== undefined) {
        const rate = Number(updates.taxPercentage);
        if (!Number.isFinite(rate) || rate < 0) {
          return errorResponse('Tax percentage must be a non-negative number', 400);
        }
        updates.taxAmount = (Number(invoice.subtotal || 0) * rate) / 100;
        updates.grandTotal = Number(invoice.subtotal || 0) + updates.taxAmount;
        if (updates.paidAmount !== undefined && Number(updates.paidAmount) > updates.grandTotal) {
          return errorResponse('Paid amount cannot exceed grand total', 400);
        }
        updates.outstandingBalance = updates.grandTotal - Number(updates.paidAmount || 0);
      }
      if (updates.items !== undefined) {
        if (!Array.isArray(updates.items) || updates.items.length === 0) {
          return errorResponse('Add at least one item to the invoice', 400);
        }
        let sub = 0;
        const validatedItems = updates.items.map((item) => {
          const qty = Number(item.quantity);
          const price = Number(item.unitPrice || 0);
          const total = qty * price;
          sub += total;
          return {
            lineId: item.lineId || randomUUID(),
            description: item.description || '',
            quantity: qty,
            unit: item.unit || '',
            unitPrice: price,
            totalAmount: total,
          };
        });
        updates.items = validatedItems;
        updates.subtotal = sub;
        updates.taxAmount = (sub * Number(updates.taxPercentage || invoice.taxPercentage || 0)) / 100;
        updates.grandTotal = sub + updates.taxAmount;
        if (updates.paidAmount !== undefined && Number(updates.paidAmount) > updates.grandTotal) {
          return errorResponse('Paid amount cannot exceed grand total', 400);
        }
        updates.outstandingBalance = updates.grandTotal - Number(updates.paidAmount || 0);
      }
      if (updates.expenseAccountCode || updates.payableAccountCode) {
        const expCode = updates.expenseAccountCode || invoice.expenseAccountCode;
        const payCode = updates.payableAccountCode || invoice.payableAccountCode;
        const expAcc = await AccountHead.findOne({ code: expCode });
        const payAcc = await AccountHead.findOne({ code: payCode });
        if (!expAcc || (expAcc.type !== 'OperatingExpense' && expAcc.type !== 'CostOfGoodsSold')) {
          return errorResponse('Expense account must be an operating-expense or COGS account', 400);
        }
        if (!payAcc || payAcc.type !== 'Liability') {
          return errorResponse('Payable account must be a liability account', 400);
        }
        updates.expenseAccountCode = expAcc.code;
        updates.payableAccountCode = payAcc.code;
      }
      Object.assign(invoice, updates);
      await invoice.save();
      return successResponse({ supplierInvoice: invoice }, 'Supplier invoice updated');
    }

    if (action === 'DELETE_SUPPLIER_INVOICE') {
      const invoice = await SupplierInvoice.findByIdForUpdate(body.invoiceId);
      if (!invoice) return errorResponse('Supplier Invoice not found', 404);
      if (invoice.status === 'Paid' || invoice.financialEntryId) {
        return errorResponse('A posted or paid invoice cannot be deleted', 409);
      }
      await SupplierInvoice.deleteOne({ _id: invoice._id });
      return successResponse({ supplierInvoice: invoice }, 'Supplier invoice deleted');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getProcurement, 'procurement');
export const POST = withAuthorization(postProcurement, 'procurement', 'write');
