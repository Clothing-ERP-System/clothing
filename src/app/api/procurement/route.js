import { allocateSequence, connectDB } from '@/lib/db.js';
import Supplier from '@/models/Supplier.js';
import PurchaseOrder from '@/models/PurchaseOrder.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    await connectDB();
    const suppliers = await Supplier.find({}).sort({ name: 1 });
    const purchaseOrders = await PurchaseOrder.find({}).sort({ createdAt: -1 });

    return successResponse({
      suppliers,
      purchaseOrders,
    });
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_PO') {
      const { supplierName, items, notes, paymentTerms, expectedDeliveryDate } = body;
      if (!supplierName || !Array.isArray(items) || items.length === 0) {
        return errorResponse('Select a supplier and add at least one purchase order item', 400);
      }
      const sequence = await allocateSequence('purchase_order');
      const poNumber = `PO-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      let subtotal = 0;
      const calculatedItems = (items || []).map(item => {
        const lineTotal = Number(item.orderedQty) * Number(item.unitPrice);
        subtotal += lineTotal;
        return {
          ...item,
          totalPrice: lineTotal,
          receivedQty: 0,
        };
      });

      const po = await PurchaseOrder.create({
        poNumber,
        supplierName,
        items: calculatedItems,
        subtotal,
        taxPercentage: 0,
        taxAmount: 0,
        grandTotal: subtotal,
        paymentTerms: paymentTerms || '',
        expectedDeliveryDate: expectedDeliveryDate || null,
        notes: notes || '',
        status: 'PendingApproval',
      });

      await AuditLog.create({
        userName: '',
        action: 'CREATE',
        module: 'Procurement',
        recordId: po.poNumber,
        description: `Generated Purchase Order ${po.poNumber} for ${supplierName} (Total: Rs. ${subtotal.toLocaleString()})`,
      });

      return successResponse({ purchaseOrder: po }, 'Purchase Order created successfully');
    }

    if (action === 'RECEIVE_GRN') {
      const { poNumber, challanNumber, receivedItems, receivedBy } = body;
      const po = await PurchaseOrder.findOne({ poNumber });
      if (!po) return errorResponse('Purchase Order not found', 404);

      if (!Array.isArray(receivedItems) || receivedItems.length === 0) {
        return errorResponse('Add at least one item to the goods receipt', 400);
      }
      const sequence = await allocateSequence('goods_receipt');
      const grnNumber = `GRN-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      let totalReceivedValue = 0;
      const grnItems = [];

      for (const item of (receivedItems || [])) {
        grnItems.push({
          itemDescription: item.description,
          quantityReceived: Number(item.quantityReceived),
          rollNumbers: item.rollNumbers || [],
          inspectionStatus: 'PendingInspection',
          remarks: item.remarks || '',
        });

        // Update receivedQty in PO
        const targetPoItem = po.items.find(i => i.description === item.description);
        if (targetPoItem) {
          targetPoItem.receivedQty = (targetPoItem.receivedQty || 0) + Number(item.quantityReceived);
          totalReceivedValue += Number(item.quantityReceived) * Number(targetPoItem.unitPrice);
        }
      }

      po.grns.push({
        grnNumber,
        receivedDate: new Date(),
        challanNumber: challanNumber || '',
        receivedBy: receivedBy || '',
        items: grnItems,
        totalReceivedValue,
      });

      // Update PO status
      const allReceived = po.items.every(i => (i.receivedQty || 0) >= (i.orderedQty || 0));
      po.status = allReceived ? 'Completed' : 'Partially Received';
      await po.save();

      await AuditLog.create({
        userName: receivedBy || '',
        action: 'APPROVE',
        module: 'Procurement',
        recordId: grnNumber,
        description: `Goods Receipt Note ${grnNumber} processed for ${poNumber}`,
      });

      return successResponse({ po, grnNumber }, 'Goods received and inventory GRN logged successfully');
    }

    if (action === 'CREATE_SUPPLIER') {
      const { name, phone, email, address, city, category, creditPeriodDays } = body;
      if (!name || !phone) return errorResponse('Supplier name and phone are required', 400);
      const sequence = await allocateSequence('supplier');
      const supplierCode = `SUP-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const newSupplier = await Supplier.create({
        supplierCode,
        name,
        phone,
        email,
        address,
        city: city || '',
        category: category || '',
        creditPeriodDays: Number(creditPeriodDays) || 0,
      });

      return successResponse({ supplier: newSupplier }, 'Supplier added successfully');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
