import { allocateSequence, connectDB } from '@/lib/db.js';
import Customer from '@/models/Customer.js';
import DesignArticle from '@/models/Design.js';
import SalesOrder from '@/models/SalesOrder.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    await connectDB();
    const customers = await Customer.find({}).sort({ name: 1 });
    const salesOrders = await SalesOrder.find({}).sort({ createdAt: -1 });

    return successResponse({
      customers,
      salesOrders,
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

    if (action === 'CREATE_CUSTOMER') {
      const { name, businessName, phone, email, address, city, tier, defaultTierDiscountPercent, specialDiscountOverride, creditLimitPKR, paymentTerms } = body;
      if (!name || !phone) return errorResponse('Customer name and phone are required', 400);
      const discount = Number(defaultTierDiscountPercent || 0);
      const creditLimit = Number(creditLimitPKR || 0);
      if (!Number.isFinite(discount) || discount < 0 || discount > 100 ||
        !Number.isFinite(creditLimit) || creditLimit < 0) {
        return errorResponse('Enter valid non-negative commercial terms', 400);
      }
      const sequence = await allocateSequence('customer');
      const customerCode = `CUST-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const customer = await Customer.create({
        customerCode,
        name,
        businessName: businessName || '',
        phone,
        email: email || '',
        address: address || '',
        city: city || '',
        tier: tier || '',
        defaultTierDiscountPercent: discount,
        specialDiscountOverride: Number(specialDiscountOverride) || 0,
        creditLimitPKR: creditLimit,
        paymentTerms: paymentTerms || '',
      });

      return successResponse({ customer }, 'Customer created');
    }

    if (action === 'CREATE_SALES_ORDER') {
      const { customerId, items, shippingFee, amountPaid, salesRep, notes } = body;
      if (!customerId || !Array.isArray(items) || items.length === 0) {
        return errorResponse('Select a customer and add at least one item', 400);
      }
      const customer = await Customer.findById(customerId);
      if (!customer) return errorResponse('Customer not found', 404);

      let subtotal = 0;
      let totalDiscount = 0;
      const processedItems = [];
      for (const item of items) {
        const design = await DesignArticle.findOne({ designCode: item.articleCode, sampleStatus: 'ProductionReady' });
        if (!design || Number(design.suggestedRetailPrice) <= 0) {
          return errorResponse(`Article ${item.articleCode || ''} is not available for sale or has no retail price`, 400);
        }
        const unitRetailPrice = Number(design.suggestedRetailPrice);
        const qty = Number(item.quantity);
        if (!Number.isInteger(qty) || qty <= 0) {
          return errorResponse('Each order item requires a positive whole-number quantity', 400);
        }
        const discountPercent = Number(customer.defaultTierDiscountPercent) || 0;
        const discountAmount = Math.round(unitRetailPrice * (discountPercent / 100)) * qty;
        const netPrice = unitRetailPrice - (unitRetailPrice * (discountPercent / 100));
        const lineTotal = Math.round(netPrice * qty);

        subtotal += unitRetailPrice * qty;
        totalDiscount += discountAmount;

        processedItems.push({
          articleCode: design.designCode,
          title: design.title,
          size: item.size || '',
          unitRetailPrice,
          quantity: qty,
          discountPercentApplied: discountPercent,
          discountAmount,
          netPrice,
          lineTotal,
        });
      }

      const grandTotal = subtotal - totalDiscount + (Number(shippingFee) || 0);
      const paid = Number(amountPaid) || 0;
      if (!Number.isFinite(paid) || paid < 0 || paid > grandTotal) {
        return errorResponse('Advance received must be between zero and the order total', 400);
      }
      const sequence = await allocateSequence('sales_order');
      const year = new Date().getFullYear();
      const orderNumber = `SO-${year}-${String(sequence).padStart(4, '0')}`;
      const invoiceNumber = `INV-${year}-${String(sequence).padStart(4, '0')}`;
      const paymentStatus = paid >= grandTotal ? 'PaidInFull' : paid > 0 ? 'PartiallyPaid' : 'Unpaid';

      const order = await SalesOrder.create({
        orderNumber,
        invoiceNumber,
        customerId: customer._id,
        customerName: customer.name,
        customerTier: customer.tier || '',
        orderDate: new Date(),
        deliveryDueDate: null,
        status: 'Confirmed',
        items: processedItems,
        subtotal,
        totalDiscount,
        shippingFee: Number(shippingFee) || 0,
        grandTotal,
        amountPaid: paid,
        paymentStatus,
        salesRep: salesRep || '',
        notes: notes || '',
      });

      // Update customer balance if unpaid balance remains
      const remainingBalance = grandTotal - paid;
      customer.currentReceivableBalance = (customer.currentReceivableBalance || 0) + remainingBalance;
      await customer.save();

      await AuditLog.create({
        userName: salesRep || '',
        action: 'CREATE',
        module: 'Sales & Invoicing',
        recordId: orderNumber,
        description: `Created Sales Order ${orderNumber} for ${customer.name} (Net: Rs. ${grandTotal.toLocaleString()})`,
      });

      return successResponse({ salesOrder: order }, 'Sales Order generated');
    }

    if (action === 'RECORD_PAYMENT') {
      const { orderId, amount } = body;
      const order = await SalesOrder.findById(orderId);
      if (!order) return errorResponse('Sales Order not found', 404);

      const payment = Number(amount);
      if (!Number.isFinite(payment) || payment <= 0 || payment > order.grandTotal - (order.amountPaid || 0)) {
        return errorResponse('Payment must be positive and cannot exceed the remaining balance', 400);
      }
      order.amountPaid = (order.amountPaid || 0) + payment;
      if (order.amountPaid >= order.grandTotal) {
        order.paymentStatus = 'PaidInFull';
      } else {
        order.paymentStatus = 'PartiallyPaid';
      }
      await order.save();
      const customer = await Customer.findById(order.customerId);
      if (customer) {
        customer.currentReceivableBalance = Math.max(0, (customer.currentReceivableBalance || 0) - payment);
        await customer.save();
      }

      return successResponse({ salesOrder: order }, 'Payment recorded');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
