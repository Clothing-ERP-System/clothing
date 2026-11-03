import { allocateSequence, connectDB } from '@/lib/db.js';
import Customer from '@/models/Customer.js';
import DesignArticle from '@/models/Design.js';
import SalesOrder from '@/models/SalesOrder.js';
import { AccountHead } from '@/models/Accounting.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, deleteRecord, parseListQuery, pickFields, updateRecord } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';
import { adjustWarehouseStock, getWarehouseStock, recordInventoryMovement } from '@/lib/inventory.js';
import { postBalancedJournalEntry } from '@/lib/accounting.js';

async function getSales(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const customers = applyListQuery(await Customer.find({}).sort({ name: 1 }), query, {
      searchFields: ['name', 'customerCode', 'phone', 'businessName', 'city'],
      statusField: 'tier',
    }).items;
    const salesOrders = applyListQuery(await SalesOrder.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['orderNumber', 'invoiceNumber', 'customerName', 'salesRep'],
    }).items;
    const accounts = await AccountHead.find({}).sort({ code: 1 });

    return successResponse({
      customers,
      salesOrders,
      financialAccounts: accounts.map(({ code, name, type }) => ({ code, name, type })),
    });
  } catch (error) {
    return fromError(error);
  }
}

async function postSales(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_CUSTOMER') {
      const { name, businessName, phone, email, address, city, tier, defaultTierDiscountPercent, specialDiscountOverride, creditLimitPKR, paymentTerms } = body;
      const customerName = String(name || '').trim();
      const customerPhone = String(phone || '').trim();
      if (!customerName || !customerPhone) return errorResponse('Customer name and phone are required', 400);
      const discount = Number(defaultTierDiscountPercent || 0);
      const specialDiscount = Number(specialDiscountOverride || 0);
      const creditLimit = Number(creditLimitPKR ?? body.creditLimit ?? 0);
      if (!Number.isFinite(discount) || discount < 0 || discount > 100 ||
        !Number.isFinite(specialDiscount) || specialDiscount < 0 || specialDiscount > 100 ||
        !Number.isFinite(creditLimit) || creditLimit < 0) {
        return errorResponse('Enter valid non-negative commercial terms', 400);
      }
      if (await Customer.findOne({ phone: customerPhone })) {
        return errorResponse('A customer with this phone number already exists', 409);
      }
      const sequence = await allocateSequence('customer');
      const customerCode = `CUST-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const customer = await Customer.create({
        customerCode,
        name: customerName,
        businessName: businessName || '',
        phone: customerPhone,
        email: email || '',
        address: address || '',
        city: city || '',
        tier: tier || '',
        defaultTierDiscountPercent: discount,
        specialDiscountOverride: specialDiscount,
        creditLimitPKR: creditLimit,
        currentReceivableBalance: 0,
        paymentTerms: paymentTerms || '',
      });

      return successResponse({ customer }, 'Customer created');
    }

    if (action === 'CREATE_SALES_ORDER') {
      const {
        customerId,
        items,
        shippingFee,
        amountPaid,
        salesRep,
        notes,
        warehouseLocation,
        revenueAccountCode,
        receivableAccountCode,
        paymentAccountCode,
        paymentMethod,
        creationRequestId,
      } = body;
      const requestId = String(creationRequestId || '').trim();
      if (!requestId) return errorResponse('A sales order request ID is required', 400);
      const existingOrder = await SalesOrder.findOne({ creationRequestId: requestId });
      if (existingOrder) return successResponse({ salesOrder: existingOrder }, 'Sales order was already created');
      const saleLocation = String(warehouseLocation || '').trim();
      if (!customerId || !Array.isArray(items) || items.length === 0) {
        return errorResponse('Select a customer and add at least one item', 400);
      }
      if (!saleLocation) return errorResponse('Select the warehouse fulfilling this sales order', 400);
      const customer = await Customer.findByIdForUpdate(customerId);
      if (!customer) return errorResponse('Customer not found', 404);

      const shipping = Number(shippingFee ?? 0);
      if (!Number.isFinite(shipping) || shipping < 0) {
        return errorResponse('Shipping fee must be a non-negative amount', 400);
      }
      const requestedByArticle = new Map();
      for (const item of items) {
        if (!item || typeof item.articleCode !== 'string' || !item.articleCode.trim()) {
          return errorResponse('Every order line must reference a design article', 400);
        }
        const quantity = Number(item.quantity);
        if (!Number.isSafeInteger(quantity) || quantity <= 0) {
          return errorResponse('Each order item requires a positive whole-number quantity', 400);
        }
        requestedByArticle.set(item.articleCode, (requestedByArticle.get(item.articleCode) || 0) + quantity);
      }
      const lockedDesigns = new Map();
      for (const articleCode of [...requestedByArticle.keys()].sort()) {
        const existingDesign = await DesignArticle.findOne({
          designCode: articleCode,
          sampleStatus: 'ProductionReady',
        });
        const design = existingDesign
          ? await DesignArticle.findByIdForUpdate(existingDesign._id)
          : null;
        if (!design || design.sampleStatus !== 'ProductionReady') {
          return errorResponse(`Article ${articleCode} is not available for sale`, 400);
        }
        const stock = getWarehouseStock(design, 'finishedGoodsStock', saleLocation);
        if (!Number.isSafeInteger(stock) || stock < requestedByArticle.get(articleCode)) {
          return errorResponse(`Insufficient finished stock for ${articleCode}`, 409);
        }
        lockedDesigns.set(articleCode, design);
      }

      let subtotal = 0;
      let totalDiscount = 0;
      const processedItems = [];
      for (const item of items) {
        const design = lockedDesigns.get(item.articleCode);
        if (!design || Number(design.suggestedRetailPrice) <= 0) {
          return errorResponse(`Article ${item.articleCode || ''} is not available for sale or has no retail price`, 400);
        }
        const unitRetailPrice = Number(design.suggestedRetailPrice);
        const qty = Number(item.quantity);
        if (!Number.isSafeInteger(qty) || qty <= 0) {
          return errorResponse('Each order item requires a positive whole-number quantity', 400);
        }
        const validSizes = new Set((design.sizeGrading || []).map((size) => size.sizeName));
        if (item.size && validSizes.size && !validSizes.has(item.size)) {
          return errorResponse(`Size ${item.size} is not defined for article ${item.articleCode}`, 400);
        }
        const discountPercent = Number(customer.defaultTierDiscountPercent) || 0;
        if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
          return errorResponse('The customer discount percentage is invalid', 409);
        }
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
          warehouseLocation: saleLocation,
        });
      }

      const grandTotal = subtotal - totalDiscount + shipping;
      const paid = Number(amountPaid ?? 0);
      if (!Number.isFinite(grandTotal) || grandTotal <= 0 ||
        !Number.isFinite(paid) || paid < 0 || paid > grandTotal) {
        return errorResponse('Advance received must be between zero and the order total', 400);
      }
      const revenueAccount = await AccountHead.findOne({ code: revenueAccountCode });
      const receivableAccount = await AccountHead.findOne({ code: receivableAccountCode });
      if (!revenueAccount || revenueAccount.type !== 'Revenue' ||
        !receivableAccount || receivableAccount.type !== 'Asset') {
        return errorResponse('Select a sales revenue account and a customer receivables asset account', 400);
      }
      let paymentAccount = null;
      if (paid > 0) {
        if (!['Cash', 'BankTransfer', 'CreditCard'].includes(paymentMethod)) {
          return errorResponse('Select a valid method for the advance payment', 400);
        }
        paymentAccount = await AccountHead.findOne({ code: paymentAccountCode });
        if (!paymentAccount || paymentAccount.type !== 'Asset') {
          return errorResponse('Select an asset account for the advance payment', 400);
        }
      }
      const currentReceivable = Number(customer.currentReceivableBalance || 0);
      const creditLimit = Number(customer.creditLimitPKR || 0);
      if (!Number.isFinite(currentReceivable) || currentReceivable < 0 ||
        !Number.isFinite(creditLimit) || creditLimit < 0 ||
        currentReceivable + grandTotal - paid > creditLimit) {
        return errorResponse('The order would exceed the customer credit limit', 409);
      }
      const sequence = await allocateSequence('sales_order');
      const year = new Date().getFullYear();
      const orderNumber = `SO-${year}-${String(sequence).padStart(4, '0')}`;
      const invoiceNumber = `INV-${year}-${String(sequence).padStart(4, '0')}`;
      const paymentStatus = paid >= grandTotal ? 'PaidInFull' : paid > 0 ? 'PartiallyPaid' : 'Unpaid';

      const order = await SalesOrder.create({
        creationRequestId: requestId,
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
        shippingFee: shipping,
        grandTotal,
        amountPaid: paid,
        paymentStatus,
        revenueAccountCode: revenueAccount.code,
        receivableAccountCode: receivableAccount.code,
        salesRep: salesRep || '',
        notes: notes || '',
        inventoryStatus: 'Deducted',
        warehouseLocation: saleLocation,
      });

      const salesJournalLines = [];
      if (paid > 0) {
        salesJournalLines.push({
          accountCode: paymentAccount.code,
          debit: paid,
          credit: 0,
          memo: `Advance received for ${orderNumber} (${paymentMethod})`,
        });
      }
      if (grandTotal - paid > 0) {
        salesJournalLines.push({
          accountCode: receivableAccount.code,
          debit: grandTotal - paid,
          credit: 0,
          memo: `Receivable for ${orderNumber}`,
        });
      }
      salesJournalLines.push({
        accountCode: revenueAccount.code,
        debit: 0,
        credit: grandTotal,
        memo: `Sales revenue for ${orderNumber}`,
      });
      const { entry: salesJournal } = await postBalancedJournalEntry({
        sourceKey: `SALES_ORDER:${order._id}`,
        voucherType: 'SalesInvoice',
        narration: `Sales invoice ${invoiceNumber}`,
        referenceNumber: orderNumber,
        postedBy: salesRep || '',
        lines: salesJournalLines,
      });
      order.financialEntryId = salesJournal._id;
      order.initialPaymentMethod = paid > 0 ? paymentMethod : '';

      for (const [articleCode, quantity] of requestedByArticle) {
        const design = lockedDesigns.get(articleCode);
        if (!adjustWarehouseStock(design, 'finishedGoodsStock', saleLocation, -quantity)) {
          return errorResponse(`Finished stock at ${saleLocation} changed before this order could be posted`, 409);
        }
        recordInventoryMovement(design, {
          type: 'SALES_ORDER',
          quantity,
          unit: 'Pieces',
          direction: 'OUT',
          referenceType: 'SalesOrder',
          referenceId: order._id,
          referenceNumber: orderNumber,
          sourceItemId: articleCode,
          warehouseLocation: saleLocation,
        });
        await design.save();
      }

      const remainingBalance = grandTotal - paid;
      customer.currentReceivableBalance = currentReceivable + remainingBalance;
      await order.save();
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
      const { orderId, amount, paymentRequestId } = body;
      const order = await SalesOrder.findByIdForUpdate(orderId);
      if (!order) return errorResponse('Sales Order not found', 404);
      if (order.status === 'Cancelled') return errorResponse('Payments cannot be recorded on a cancelled order', 409);

      const payment = Number(amount);
      const requestId = String(paymentRequestId || '').trim();
      if (!requestId) return errorResponse('A payment request ID is required', 400);
      const priorPayment = (order.payments || []).find((entry) => entry.paymentRequestId === requestId);
      if (priorPayment) {
        return successResponse({ salesOrder: order, payment: priorPayment }, 'Payment was already recorded');
      }
      const priorCredits = Number(order.receivableCreditsTotal || 0);
      const orderGrandTotal = Number(order.grandTotal);
      const amountPaid = Number(order.amountPaid || 0);
      const remainingBalance = orderGrandTotal - amountPaid - priorCredits;
      if (![priorCredits, orderGrandTotal, amountPaid, remainingBalance].every(Number.isFinite) ||
        priorCredits < 0 || amountPaid < 0 || remainingBalance < 0 ||
        !Number.isFinite(payment) || payment <= 0 || payment > remainingBalance) {
        return errorResponse('Payment must be positive and cannot exceed the remaining balance', 400);
      }
      const customer = await Customer.findByIdForUpdate(order.customerId);
      if (!customer) return errorResponse('The customer for this sales order no longer exists', 409);
      const receivable = Number(customer.currentReceivableBalance || 0);
      if (!Number.isFinite(receivable) || receivable < payment) {
        return errorResponse('Customer receivable balance is inconsistent with this payment', 409);
      }
      const receivableAccount = await AccountHead.findOne({
        code: order.receivableAccountCode || body.receivableAccountCode,
      });
      const paymentAccount = await AccountHead.findOne({ code: body.paymentAccountCode });
      if (!receivableAccount || receivableAccount.type !== 'Asset' ||
        !paymentAccount || paymentAccount.type !== 'Asset') {
        return errorResponse('Select the receivables account and an asset account receiving this payment', 400);
      }
      if (!['Cash', 'BankTransfer', 'CreditCard'].includes(body.method)) {
        return errorResponse('Select a valid customer payment method', 400);
      }
      const { entry } = await postBalancedJournalEntry({
        sourceKey: `SALES_PAYMENT:${order._id}:${requestId}`,
        voucherType: 'CustomerReceipt',
        narration: `Customer payment for ${order.orderNumber}`,
        referenceNumber: String(body.referenceNumber || order.orderNumber),
        postedBy: String(body.receivedBy || ''),
        lines: [
          {
            accountCode: paymentAccount.code,
            debit: payment,
            credit: 0,
            memo: `Customer receipt (${body.method})`,
          },
          {
            accountCode: receivableAccount.code,
            debit: 0,
            credit: payment,
            memo: `Reduce receivable for ${order.orderNumber}`,
          },
        ],
      });
      order.amountPaid = amountPaid + payment;
      order.payments = Array.isArray(order.payments) ? order.payments : [];
      order.payments.push({
        paymentRequestId: requestId,
        amount: payment,
        method: body.method,
        paymentAccountCode: paymentAccount.code,
        referenceNumber: String(body.referenceNumber || ''),
        financialEntryId: entry._id,
        receivedBy: String(body.receivedBy || ''),
        receivedAt: new Date(),
      });
      order.financialPaymentEntryId = entry._id;
      const totalReturnedValue = (order.returns || []).reduce((sum, record) =>
        sum + Number(record.returnValue || 0), 0
      );
      const totalRefunded = Number(order.refundedAmountTotal || 0);
      if (!Number.isFinite(totalReturnedValue) || !Number.isFinite(totalRefunded) ||
        totalReturnedValue < 0 || totalRefunded < 0) {
        return errorResponse('Existing sales return totals are inconsistent', 409);
      }
      order.paymentStatus = order.amountPaid - totalRefunded >= orderGrandTotal - totalReturnedValue
        ? 'PaidInFull'
        : 'PartiallyPaid';
      customer.currentReceivableBalance = receivable - payment;
      await customer.save();
      await order.save();
      await AuditLog.create({
        userName: String(body.receivedBy || ''),
        action: 'PAYMENT',
        module: 'Sales & Invoicing',
        recordId: order.orderNumber,
        description: `Received customer payment of Rs. ${payment.toLocaleString()} for ${order.orderNumber}`,
      });

      return successResponse({ salesOrder: order }, 'Payment recorded');
    }

    if (action === 'CANCEL_SALES_ORDER') {
      const order = await SalesOrder.findByIdForUpdate(body.orderId);
      if (!order) return errorResponse('Sales Order not found', 404);
      if (order.status === 'Cancelled') return errorResponse('This sales order has already been cancelled', 409);
      if (order.status !== 'Confirmed' || Number(order.amountPaid || 0) > 0) {
        return errorResponse('Only unpaid, unfulfilled sales orders can be cancelled; paid orders require a recorded refund workflow', 409);
      }
      const cancellationReason = String(body.reason || '').trim();
      if (!cancellationReason) return errorResponse('A cancellation reason is required', 400);
      const customer = await Customer.findByIdForUpdate(order.customerId);
      if (!customer) return errorResponse('The customer for this sales order no longer exists', 409);
      const designsByCode = new Map();
      const returnQuantities = new Map();
      for (const item of order.items || []) {
        returnQuantities.set(item.articleCode, (returnQuantities.get(item.articleCode) || 0) + Number(item.quantity));
      }
      for (const articleCode of [...returnQuantities.keys()].sort()) {
        const existingDesign = await DesignArticle.findOne({ designCode: articleCode });
        const design = existingDesign
          ? await DesignArticle.findByIdForUpdate(existingDesign._id)
          : null;
        if (!design) return errorResponse(`Product ${articleCode} no longer exists; the order cannot be cancelled safely`, 409);
        designsByCode.set(articleCode, design);
      }
      for (const [articleCode, quantity] of returnQuantities) {
        const design = designsByCode.get(articleCode);
        if (!adjustWarehouseStock(design, 'finishedGoodsStock', order.warehouseLocation, quantity)) {
          return errorResponse(`Finished stock at ${order.warehouseLocation || 'the order warehouse'} cannot be restored consistently`, 409);
        }
        recordInventoryMovement(design, {
          type: 'SALES_ORDER_CANCELLATION',
          quantity,
          unit: 'Pieces',
          referenceType: 'SalesOrder',
          referenceId: order._id,
          referenceNumber: order.orderNumber,
          sourceItemId: articleCode,
          warehouseLocation: order.warehouseLocation || '',
        });
        await design.save();
      }
      const receivable = Number(customer.currentReceivableBalance || 0);
      const orderBalance = Number(order.grandTotal) - Number(order.amountPaid || 0);
      if (!Number.isFinite(receivable) || receivable < 0 ||
        !Number.isFinite(orderBalance) || orderBalance < 0 || receivable < orderBalance) {
        return errorResponse('Customer receivable balance is inconsistent with this order', 409);
      }
      const revenueAccount = await AccountHead.findOne({ code: order.revenueAccountCode });
      const receivableAccount = await AccountHead.findOne({ code: order.receivableAccountCode });
      if (!revenueAccount || revenueAccount.type !== 'Revenue' ||
        !receivableAccount || receivableAccount.type !== 'Asset') {
        return errorResponse('The sales order is missing its original finance accounts and cannot be cancelled safely', 409);
      }
      const { entry } = await postBalancedJournalEntry({
        sourceKey: `SALES_ORDER_CANCEL:${order._id}`,
        voucherType: 'SalesCancellation',
        narration: `Cancellation of ${order.orderNumber}`,
        referenceNumber: order.orderNumber,
        postedBy: String(body.cancelledBy || ''),
        lines: [
          {
            accountCode: revenueAccount.code,
            debit: orderBalance,
            credit: 0,
            memo: `Reverse sales revenue for ${order.orderNumber}`,
          },
          {
            accountCode: receivableAccount.code,
            debit: 0,
            credit: orderBalance,
            memo: `Reverse receivable for ${order.orderNumber}`,
          },
        ],
      });
      customer.currentReceivableBalance = receivable - orderBalance;
      order.status = 'Cancelled';
      order.inventoryStatus = 'Restored';
      order.cancelledAt = new Date();
      order.cancellationReason = cancellationReason;
      order.cancellationFinancialEntryId = entry._id;
      await customer.save();
      await order.save();
      return successResponse({ salesOrder: order }, 'Sales order cancelled and inventory restored');
    }

    if (action === 'PROCESS_SALES_RETURN') {
      const requestId = String(body.returnRequestId || '').trim();
      const orderRecord = await SalesOrder.findById(body.orderId);
      const order = orderRecord ? await SalesOrder.findByIdForUpdate(orderRecord._id) : null;
      if (!order) return errorResponse('Sales Order not found', 404);
      if (!requestId) return errorResponse('A return request ID is required', 400);
      const priorReturn = (order.returns || []).find((entry) => entry.returnRequestId === requestId);
      if (priorReturn) {
        return successResponse({ salesOrder: order, salesReturn: priorReturn }, 'Return was already processed');
      }
      if (order.status !== 'Delivered') {
        return errorResponse('Only delivered sales orders can be returned', 409);
      }
      if (!Array.isArray(body.items) || body.items.length === 0) {
        return errorResponse('Select at least one sold item and enter its return quantity', 400);
      }
      const requestedQuantities = new Map();
      for (const item of body.items) {
        const code = String(item?.articleCode || '').trim();
        const quantity = Number(item?.quantity);
        if (!code || !Number.isSafeInteger(quantity) || quantity <= 0) {
          return errorResponse('Each return line must reference a sold article and a positive whole-number quantity', 400);
        }
        requestedQuantities.set(code, (requestedQuantities.get(code) || 0) + quantity);
      }
      const priorReturned = new Map();
      for (const previous of order.returns || []) {
        for (const item of previous.items || []) {
          priorReturned.set(item.articleCode, (priorReturned.get(item.articleCode) || 0) + Number(item.quantity));
        }
      }
      const soldQuantities = new Map();
      const lineValueByCode = new Map();
      for (const item of order.items || []) {
        const quantity = Number(item.quantity);
        const value = Number(item.lineTotal);
        if (!Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isFinite(value) || value < 0) {
          return errorResponse('Sales order lines contain invalid quantity or value data', 409);
        }
        soldQuantities.set(item.articleCode, (soldQuantities.get(item.articleCode) || 0) + quantity);
        lineValueByCode.set(item.articleCode, (lineValueByCode.get(item.articleCode) || 0) + value);
      }
      let returnValue = 0;
      const returnItems = [];
      for (const [articleCode, quantity] of requestedQuantities) {
        const sold = soldQuantities.get(articleCode) || 0;
        const alreadyReturned = priorReturned.get(articleCode) || 0;
        if (!sold || alreadyReturned + quantity > sold) {
          return errorResponse(`Return quantity exceeds the unreturned quantity for ${articleCode}`, 409);
        }
        const value = Math.round(((lineValueByCode.get(articleCode) / sold) * quantity) * 100) / 100;
        returnValue += value;
        returnItems.push({ articleCode, quantity, value });
      }
      returnValue = Math.round(returnValue * 100) / 100;
      if (!Number.isFinite(returnValue) || returnValue <= 0) {
        return errorResponse('The selected return has no refundable line value', 400);
      }

      const grandTotal = Number(order.grandTotal);
      const amountPaid = Number(order.amountPaid || 0);
      const priorCredits = Number(order.receivableCreditsTotal || 0);
      const priorRefunds = Number(order.refundedAmountTotal || 0);
      const outstanding = grandTotal - amountPaid - priorCredits;
      const paidAvailable = amountPaid - priorRefunds;
      if (![grandTotal, amountPaid, priorCredits, priorRefunds, outstanding, paidAvailable].every(Number.isFinite) ||
        outstanding < 0 || paidAvailable < 0) {
        return errorResponse('Sales order payment and receivable balances are inconsistent', 409);
      }
      const receivableCredit = Math.min(returnValue, outstanding);
      const refundAmount = Math.round((returnValue - receivableCredit) * 100) / 100;
      if (refundAmount > paidAvailable) {
        return errorResponse('The requested return exceeds the paid amount available to refund', 409);
      }

      const customer = await Customer.findByIdForUpdate(order.customerId);
      if (!customer) return errorResponse('The customer for this sales order no longer exists', 409);
      const customerReceivable = Number(customer.currentReceivableBalance || 0);
      if (!Number.isFinite(customerReceivable) || customerReceivable < receivableCredit) {
        return errorResponse('Customer receivable balance is inconsistent with this return', 409);
      }
      const lockedDesigns = new Map();
      for (const articleCode of [...requestedQuantities.keys()].sort()) {
        const existingDesign = await DesignArticle.findOne({ designCode: articleCode });
        const design = existingDesign ? await DesignArticle.findByIdForUpdate(existingDesign._id) : null;
        if (!design || !order.warehouseLocation) {
          return errorResponse(`Product ${articleCode} or its original warehouse is unavailable for return`, 409);
        }
        lockedDesigns.set(articleCode, design);
      }
      for (const [articleCode, quantity] of requestedQuantities) {
        const design = lockedDesigns.get(articleCode);
        if (!adjustWarehouseStock(design, 'finishedGoodsStock', order.warehouseLocation, quantity)) {
          return errorResponse(`Returned stock for ${articleCode} cannot be reconciled at ${order.warehouseLocation}`, 409);
        }
        recordInventoryMovement(design, {
          type: 'SALES_RETURN',
          quantity,
          unit: 'Pieces',
          referenceType: 'SalesOrder',
          referenceId: order._id,
          referenceNumber: order.orderNumber,
          sourceItemId: articleCode,
          warehouseLocation: order.warehouseLocation,
          notes: requestId,
        });
        await design.save();
      }

      const salesReturnsAccount = await AccountHead.findOne({ code: body.salesReturnsAccountCode });
      const receivableAccount = await AccountHead.findOne({
        code: order.receivableAccountCode || body.receivableAccountCode,
      });
      if (!salesReturnsAccount || salesReturnsAccount.type !== 'Revenue' ||
        !receivableAccount || receivableAccount.type !== 'Asset' ||
        refundAmount > 0 && !String(body.refundAccountCode || '').trim()) {
        return errorResponse('Select a revenue returns account, receivables account, and a refund account when cash is due', 400);
      }
      const journalLines = [
        {
          accountCode: salesReturnsAccount.code,
          debit: returnValue,
          credit: 0,
          memo: `Return against ${order.orderNumber}`,
        },
      ];
      if (receivableCredit > 0) {
        journalLines.push({
          accountCode: receivableAccount.code,
          debit: 0,
          credit: receivableCredit,
          memo: `Reduce receivable for ${order.orderNumber}`,
        });
      }
      if (refundAmount > 0) {
        const refundAccount = await AccountHead.findOne({ code: body.refundAccountCode });
        if (!refundAccount || refundAccount.type !== 'Asset') {
          return errorResponse('Refund account must be an existing asset account', 400);
        }
        journalLines.push({
          accountCode: refundAccount.code,
          debit: 0,
          credit: refundAmount,
          memo: `Refund for ${order.orderNumber}`,
        });
      }
      const { entry } = await postBalancedJournalEntry({
        sourceKey: `SALES_RETURN:${order._id}:${requestId}`,
        voucherType: 'SalesReturn',
        narration: `Sales return for ${order.orderNumber}`,
        referenceNumber: order.orderNumber,
        postedBy: body.receivedBy || '',
        lines: journalLines,
      });

      customer.currentReceivableBalance = customerReceivable - receivableCredit;
      order.receivableCreditsTotal = priorCredits + receivableCredit;
      order.refundedAmountTotal = priorRefunds + refundAmount;
      order.returns = [...(order.returns || []), {
        returnRequestId: requestId,
        items: returnItems,
        returnValue,
        receivableCredit,
        refundAmount,
        refundMethod: String(body.refundMethod || ''),
        refundAccountCode: body.refundAccountCode || '',
        financialEntryId: entry._id,
        receivedBy: String(body.receivedBy || ''),
        reason: String(body.reason || '').trim(),
        returnedAt: new Date(),
      }];
      const totalReturnedValue = (order.returns || []).reduce((sum, entry) =>
        sum + Number(entry.returnValue || 0), 0
      );
      order.paymentStatus = amountPaid - priorRefunds >= grandTotal - totalReturnedValue
        ? 'PaidInFull'
        : amountPaid > 0 ? 'PartiallyPaid' : 'Unpaid';
      await customer.save();
      await order.save();
      await AuditLog.create({
        userName: String(body.receivedBy || ''),
        action: 'RETURN',
        module: 'Sales & Invoicing',
        recordId: order.orderNumber,
        description: `Processed sales return ${requestId} for ${order.orderNumber} (${returnValue})`,
      });
      return successResponse({ salesOrder: order, salesReturn: order.returns[order.returns.length - 1] }, 'Sales return processed');
    }

    if (action === 'UPDATE_CUSTOMER') {
      const customer = await Customer.findByIdForUpdate(body.customerId);
      if (!customer) return errorResponse('Customer not found', 404);
      const updates = pickFields(body, [
        'name', 'businessName', 'phone', 'email', 'address', 'city', 'tier',
        'defaultTierDiscountPercent', 'specialDiscountOverride', 'creditLimitPKR', 'paymentTerms',
      ]);
      if (updates.name !== undefined && !String(updates.name).trim()) {
        return errorResponse('Customer name cannot be empty', 400);
      }
      if (updates.phone !== undefined) {
        updates.phone = String(updates.phone).trim();
        if (!updates.phone) return errorResponse('Customer phone cannot be empty', 400);
        const duplicate = await Customer.findOne({ phone: updates.phone });
        if (duplicate && duplicate._id !== customer._id) {
          return errorResponse('A customer with this phone number already exists', 409);
        }
      }
      for (const field of ['defaultTierDiscountPercent', 'specialDiscountOverride']) {
        if (updates[field] !== undefined &&
          (!Number.isFinite(Number(updates[field])) || Number(updates[field]) < 0 || Number(updates[field]) > 100)) {
          return errorResponse('Customer discount percentages must be between zero and one hundred', 400);
        }
      }
      if (updates.creditLimitPKR !== undefined) {
        const creditLimit = Number(updates.creditLimitPKR);
        if (!Number.isFinite(creditLimit) || creditLimit < Number(customer.currentReceivableBalance || 0)) {
          return errorResponse('Credit limit cannot be lower than the current receivable balance', 409);
        }
        updates.creditLimitPKR = creditLimit;
      }
      if (updates.name !== undefined) updates.name = String(updates.name).trim();
      Object.assign(customer, updates);
      await customer.save();
      return successResponse({ customer }, 'Customer updated');
    }

    if (action === 'DELETE_CUSTOMER') {
      const existingCustomer = await Customer.findById(body.customerId);
      if (existingCustomer && (await SalesOrder.find({ customerId: existingCustomer._id })).length) {
        return errorResponse('A customer with sales order history cannot be deleted', 409);
      }
      const customer = await deleteRecord(Customer, body.customerId);
      if (!customer) return errorResponse('Customer not found', 404);
      return successResponse({ customer }, 'Customer deleted');
    }

    if (action === 'UPDATE_SALES_ORDER') {
      if (body.status !== undefined) {
        const existingOrder = await SalesOrder.findById(body.orderId);
        const nextStatuses = {
          Confirmed: ['Packed'],
          Packed: ['Shipped'],
          Shipped: ['Delivered'],
          Delivered: [],
        };
        if (!existingOrder || !nextStatuses[existingOrder.status]?.includes(body.status)) {
          return errorResponse('Invalid sales order status transition; use the cancellation workflow for cancellation', 409);
        }
      }
      const order = await updateRecord(SalesOrder, body.orderId, pickFields(body, [
        'status', 'deliveryDueDate', 'salesRep', 'notes',
      ]));
      if (!order) return errorResponse('Sales Order not found', 404);
      return successResponse({ salesOrder: order }, 'Sales order updated');
    }

    if (action === 'DELETE_SALES_ORDER') {
      const order = await SalesOrder.findById(body.orderId);
      if (!order) return errorResponse('Sales Order not found', 404);
      if (order.inventoryStatus || Number(order.amountPaid || 0) > 0) {
        return errorResponse('A sales order with stock or payment history cannot be deleted; use its cancellation workflow', 409);
      }
      await SalesOrder.deleteOne({ _id: order._id });
      return successResponse({ salesOrder: order }, 'Sales order deleted');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getSales, 'sales');
export const POST = withAuthorization(postSales, 'sales', 'write');
