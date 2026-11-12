import { allocateSequence, connectDB, runInTransaction } from '@/lib/db.js';
import { POSSession, POSTransaction } from '@/models/POS.js';
import DesignArticle from '@/models/Design.js';
import { AccountHead } from '@/models/Accounting.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, parseListQuery } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';
import { adjustWarehouseStock, getWarehouseStock, recordInventoryMovement } from '@/lib/inventory.js';
import { postBalancedJournalEntry } from '@/lib/accounting.js';
import { resolveAndValidateMapping, validateMappingsPresent, getCompanyContext } from '@/lib/accounting-mappings.js';

async function getPos(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const branch = new URL(request.url).searchParams.get('branch') || '';
    const activeSession = await POSSession.findOne({ status: 'Open' }).sort({ openedAt: -1 });
    const recentTransactions = applyListQuery(await POSTransaction.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['receiptNumber', 'cashierName', 'customerName', 'customerPhone', 'paymentMethod'],
    }).items;
    const catalogArticles = await DesignArticle.find({ sampleStatus: 'ProductionReady' });
    const financialAccounts = await AccountHead.find({}).sort({ code: 1 });

    return successResponse({
      activeSession,
      recentTransactions,
      financialAccounts: financialAccounts.map(({ code, name, type }) => ({ code, name, type })),
      catalogArticles: catalogArticles.map(a => ({
        id: a._id,
        code: a.designCode,
        title: a.title,
        price: a.suggestedRetailPrice,
        availableStock: getWarehouseStock(a, 'finishedGoodsStock', branch) || 0,
        barcode: a.barcode,
        category: a.category,
        sizes: (a.sizeGrading || []).map(s => s.sizeName),
      })),
    });
  } catch (error) {
    return fromError(error);
  }
}

async function postPos(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'OPEN_SHIFT') {
      const { cashierName, openingCash, outletBranch } = body;
      const cash = Number(openingCash);
      if (!cashierName || !Number.isFinite(cash) || cash < 0) {
        return errorResponse('Cashier name and a non-negative opening amount are required', 400);
      }
      const openSession = await POSSession.findOne({ status: 'Open' });
      if (openSession) return errorResponse('A POS shift is already open', 409);
      const sequence = await allocateSequence('pos_session');
      const sessionCode = `POS-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const session = await POSSession.create({
        sessionCode,
        cashierName: cashierName || '',
        outletBranch: outletBranch || '',
        openingCash: cash,
        expectedCash: cash,
        status: 'Open',
        openSessionKey: 'OPEN',
        openedAt: new Date(),
      });

      return successResponse({ session }, 'POS shift opened successfully');
    }

    if (action === 'CLOSE_SHIFT') {
      const { sessionId, closingCashActual, closingNotes } = body;
      const session = await POSSession.findByIdForUpdate(sessionId);
      if (!session) return errorResponse('Session not found', 404);
      const closingCash = Number(closingCashActual);
      if (session.status !== 'Open' || !Number.isFinite(closingCash) || closingCash < 0) {
        return errorResponse('An open shift and a valid closing cash amount are required', 400);
      }

      session.closingCashActual = closingCash;
      session.varianceAmount = session.closingCashActual - session.expectedCash;
      session.status = 'Closed';
      delete session.openSessionKey;
      session.closedAt = new Date();
      session.closingNotes = closingNotes || '';
      await session.save();

      return successResponse({ session }, 'POS shift closed and cash drawer reconciled');
    }

    if (action === 'COMPLETE_CHECKOUT') {
      return await runInTransaction(async () => {
      const {
        sessionId,
        cashierName,
        customerName,
        customerPhone,
        items,
        paymentMethod,
        cashTendered,
        splitDetails,
        outletBranch,
        checkoutRequestId,
        revenueAccountCode,
        paymentAccountCode,
      } = body;

      if (!sessionId || !Array.isArray(items) || items.length === 0 ||
        typeof checkoutRequestId !== 'string' || !checkoutRequestId.trim()) {
        return errorResponse('An open shift and at least one product are required', 400);
      }
      const priorTransaction = await POSTransaction.findOne({ checkoutRequestId: checkoutRequestId.trim() });
      if (priorTransaction) {
        return successResponse({ transaction: priorTransaction }, 'Checkout was already completed');
      }
      const existingSession = (await POSSession.findOne({ sessionCode: sessionId, status: 'Open' })) ||
        (await POSSession.findById(sessionId));
      const session = existingSession && existingSession.status === 'Open'
        ? await POSSession.findByIdForUpdate(existingSession._id)
        : null;
      if (!session) return errorResponse('Open a POS shift before completing checkout', 409);
      if (session.status !== 'Open') return errorResponse('This POS shift is no longer open', 409);
      if (!session.outletBranch || outletBranch !== session.outletBranch) {
        return errorResponse('Checkout location must match the open shift warehouse', 409);
      }
      if (!['Cash', 'CreditCard', 'BankTransfer', 'Split'].includes(paymentMethod)) {
        return errorResponse('Select a supported payment method', 400);
      }
      const sessionTransactionCount = Number(session.totalTransactionsCount || 0);
      const sessionSalesAmount = Number(session.totalSalesAmount || 0);
      const sessionExpectedCash = Number(session.expectedCash || 0);
      if (!Number.isSafeInteger(sessionTransactionCount) || sessionTransactionCount < 0 ||
        !Number.isFinite(sessionSalesAmount) || sessionSalesAmount < 0 ||
        !Number.isFinite(sessionExpectedCash) || sessionExpectedCash < 0) {
        return errorResponse('The active shift totals are invalid; close the shift and review its records', 409);
      }
      const requestedByArticle = new Map();
      for (const item of items) {
        if (!item || !item.articleCode) {
          return errorResponse('Every cart item must reference a product', 400);
        }
        const quantity = Number(item.quantity);
        if (!Number.isSafeInteger(quantity) || quantity <= 0) {
          return errorResponse(`Cart item ${item.articleCode} requires a positive whole-number quantity`, 400);
        }
        requestedByArticle.set(item.articleCode, (requestedByArticle.get(item.articleCode) || 0) + quantity);
      }
      const lockedArticles = new Map();
      for (const articleCode of [...requestedByArticle.keys()].sort()) {
        const existingArticle = await DesignArticle.findOne({
          designCode: articleCode,
          sampleStatus: 'ProductionReady',
        });
        const article = existingArticle
          ? await DesignArticle.findByIdForUpdate(existingArticle._id)
          : null;
        if (!article || article.sampleStatus !== 'ProductionReady') {
          return errorResponse(`Cart item ${articleCode} is invalid or unavailable`, 400);
        }
        const availableStock = getWarehouseStock(article, 'finishedGoodsStock', session.outletBranch);
        if (!Number.isSafeInteger(availableStock) || availableStock < requestedByArticle.get(articleCode)) {
          return errorResponse(`Insufficient finished stock for ${articleCode}`, 409);
        }
        lockedArticles.set(articleCode, article);
      }
      const verifiedItems = [];
      for (const item of items) {
        const quantity = Number(item.quantity);
        const discountPercent = Number(item.discountPercent ?? 0);
        const discountAmount = Number(item.discountAmount ?? 0);
        const article = lockedArticles.get(item.articleCode);
        const price = Number(article?.suggestedRetailPrice);
        if (!article || !Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) {
          return errorResponse(`Cart item ${item.articleCode || ''} is invalid or unavailable`, 400);
        }
        if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100 ||
          !Number.isFinite(discountAmount) || discountAmount < 0 ||
          !Number.isFinite(price * quantity) || discountAmount > price * quantity) {
          return errorResponse('Item discounts must be valid and cannot exceed the item price', 400);
        }
        verifiedItems.push({
          ...item,
          title: article.title,
          barcode: article.barcode,
          price,
          discountPercent,
          discountAmount,
        });
      }
      const sequence = await allocateSequence('pos_transaction');
      const receiptNumber = `RCPT-${new Date().getFullYear()}-${String(sequence).padStart(5, '0')}`;

      let subtotal = 0;
      let discountTotal = 0;
      let totalPieces = 0;

      const processedItems = verifiedItems.map(i => {
        const itemSub = Number(i.price) * Number(i.quantity);
        const itemDisc = i.discountPercent > 0 ? (itemSub * (i.discountPercent / 100)) : i.discountAmount;
        subtotal += itemSub;
        discountTotal += itemDisc;
        totalPieces += Number(i.quantity);

        return {
          articleCode: i.articleCode,
          title: i.title,
          barcode: i.barcode || '',
          size: i.size || '',
          color: i.color || '',
          price: Number(i.price),
          quantity: Number(i.quantity),
          discountPercent: Number(i.discountPercent) || 0,
          discountAmount: itemDisc,
          subtotal: itemSub - itemDisc,
        };
      });

      const grandTotal = Math.round(subtotal - discountTotal);
      if (!Number.isFinite(subtotal) || !Number.isFinite(discountTotal) || !Number.isFinite(grandTotal) || grandTotal <= 0) {
        return errorResponse('Sale total is outside the supported range', 400);
      }
      const tendered = Number(cashTendered ?? body.amountReceived ?? 0);
      if (!Number.isFinite(tendered) || tendered < 0) {
        return errorResponse('Cash tendered must be a non-negative valid amount', 400);
      }
      if (paymentMethod === 'Cash' && tendered < grandTotal) {
        return errorResponse('Cash tendered cannot be less than the sale total', 400);
      }
      const changeGiven = Math.max(0, tendered - grandTotal);
      // Resolve POS revenue account from company mappings
      const company = await getCompanyContext();
      const mappings = company && company.accountingMappings ? company.accountingMappings : {};
      const missingMappingErr = validateMappingsPresent(mappings, [
        'salesRevenueAccountCode',
      ], 'POS checkout');
      if (missingMappingErr) return errorResponse(missingMappingErr, 409);
      const revenueResult = await resolveAndValidateMapping(mappings, 'salesRevenueAccountCode', 'Revenue');
      if (revenueResult.error) return errorResponse(revenueResult.error, 400);
      const revenueAccount = revenueResult.account;
      let paymentLines;
      if (paymentMethod === 'Split') {
        if (!Array.isArray(splitDetails) || splitDetails.length < 2) {
          return errorResponse('Split payments require at least two amount and account allocations', 400);
        }
        let splitTotal = 0;
        paymentLines = [];
        for (const split of splitDetails) {
          const amount = Number(split.amount);
          const account = await AccountHead.findOne({ code: split.accountCode });
          if (!Number.isFinite(amount) || amount <= 0 || !account || account.type !== 'Asset') {
            return errorResponse('Every split payment requires a positive amount and an asset account', 400);
          }
          splitTotal += amount;
          paymentLines.push({
            accountCode: account.code,
            debit: amount,
            credit: 0,
            memo: `POS ${split.method || 'Split'} payment`,
          });
        }
        if (Math.abs(splitTotal - grandTotal) > 0.01) {
          return errorResponse('Split payment allocations must equal the sale total', 400);
        }
      } else {
        // Resolve POS payment account from company mappings based on payment method
        let paymentAccountCode = null;
        if (paymentMethod === 'Cash') {
          paymentAccountCode = mappings.cashAccountCode;
        } else if (paymentMethod === 'BankTransfer' || paymentMethod === 'CreditCard') {
          paymentAccountCode = mappings.bankAccountCode;
        }
        if (!paymentAccountCode) {
          return errorResponse(`No ${paymentMethod.toLowerCase()} account configured in company accounting mappings`, 409);
        }
        const paymentAccount = await AccountHead.findOne({ code: paymentAccountCode });
        if (!paymentAccount || paymentAccount.type !== 'Asset') {
          return errorResponse(`Configured ${paymentMethod.toLowerCase()} account must be an asset account`, 400);
        }
        paymentLines = [{
          accountCode: paymentAccount.code,
          debit: grandTotal,
          credit: 0,
          memo: `POS ${paymentMethod} receipt`,
        }];
      }

      const transaction = await POSTransaction.create({
        receiptNumber,
        checkoutRequestId: checkoutRequestId.trim(),
        sessionId,
        outletBranch: outletBranch || '',
        cashierName: cashierName || '',
        customerName: customerName || '',
        customerPhone: customerPhone || '',
        items: processedItems,
        totalItemsCount: totalPieces,
        subtotal,
        discountTotal,
        taxTotal: 0,
        grandTotal,
        paymentMethod,
        status: 'Completed',
        cashTendered: tendered,
        changeGiven,
        splitDetails: splitDetails || {},
      });

      const { entry: saleJournal } = await postBalancedJournalEntry({
        sourceKey: `POS_SALE:${transaction._id}`,
        voucherType: 'POSSale',
        narration: `POS sale ${receiptNumber}`,
        referenceNumber: receiptNumber,
        postedBy: cashierName,
        lines: [
          ...paymentLines,
          {
            accountCode: revenueAccount.code,
            debit: 0,
            credit: grandTotal,
            memo: 'POS sales revenue',
          },
        ],
      });
      transaction.financialEntryId = saleJournal._id;
      await transaction.save();

      for (const [articleCode, quantity] of requestedByArticle) {
        const article = lockedArticles.get(articleCode);
        if (!adjustWarehouseStock(article, 'finishedGoodsStock', session.outletBranch, -quantity)) {
          return errorResponse(`Finished stock at ${session.outletBranch} changed before checkout could be completed`, 409);
        }
        recordInventoryMovement(article, {
          type: 'POS_SALE',
          quantity,
          unit: 'Pieces',
          direction: 'OUT',
          referenceType: 'POS',
          referenceId: transaction._id,
          referenceNumber: receiptNumber,
          sourceItemId: articleCode,
          warehouseLocation: session.outletBranch,
        });
        await article.save();
      }

      // Update POS session expected cash
      session.totalTransactionsCount = sessionTransactionCount + 1;
      session.totalSalesAmount = sessionSalesAmount + grandTotal;
      if (paymentMethod === 'Cash') {
        session.expectedCash = sessionExpectedCash + grandTotal;
      }
      await session.save();

      await AuditLog.create({
        userName: cashierName || '',
        action: 'CREATE',
        module: 'Retail POS',
        recordId: receiptNumber,
        description: `POS Receipt ${receiptNumber} completed (Rs. ${grandTotal.toLocaleString()} via ${paymentMethod})`,
      });

      return successResponse({ transaction }, 'POS transaction completed');
      });
    }

    if (action === 'CANCEL_TRANSACTION') {
      return await runInTransaction(async () => {
      const company = await getCompanyContext();
      const mappings = company && company.accountingMappings ? company.accountingMappings : {};
      const transaction = await POSTransaction.findByIdForUpdate(body.transactionId);
      if (!transaction) return errorResponse('Transaction not found', 404);
      if (transaction.status === 'Cancelled') return errorResponse('This transaction has already been cancelled', 409);
      const refundAmount = Number(body.refundAmount);
      const refundMethod = body.refundMethod;
      if (!['Cash', 'BankTransfer', 'CreditCard'].includes(refundMethod) ||
        !Number.isFinite(refundAmount) || refundAmount !== Number(transaction.grandTotal)) {
        return errorResponse('Cancellation must record a supported refund method for the full sale amount', 400);
      }
      const existingSession = await POSSession.findOne({ sessionCode: transaction.sessionId });
      const session = existingSession ? await POSSession.findByIdForUpdate(existingSession._id) : null;
      if (!session || session.status !== 'Open') {
        return errorResponse('The original POS shift must be open to record a cancellation and refund', 409);
      }

      const returnQuantities = new Map();
      for (const item of transaction.items || []) {
        returnQuantities.set(item.articleCode, (returnQuantities.get(item.articleCode) || 0) + Number(item.quantity));
      }
      const lockedArticles = new Map();
      for (const articleCode of [...returnQuantities.keys()].sort()) {
        const existingArticle = await DesignArticle.findOne({ designCode: articleCode });
        const article = existingArticle
          ? await DesignArticle.findByIdForUpdate(existingArticle._id)
          : null;
        if (!article) return errorResponse(`Product ${articleCode} no longer exists; cancellation cannot restore its stock`, 409);
        lockedArticles.set(articleCode, article);
      }
      for (const [articleCode, quantity] of returnQuantities) {
        const article = lockedArticles.get(articleCode);
        if (!adjustWarehouseStock(article, 'finishedGoodsStock', transaction.outletBranch, quantity)) {
          return errorResponse(`Finished stock at ${transaction.outletBranch} cannot be restored consistently`, 409);
        }
        recordInventoryMovement(article, {
          type: 'POS_CANCELLATION_RETURN',
          quantity,
          unit: 'Pieces',
          referenceType: 'POS',
          referenceId: transaction._id,
          referenceNumber: transaction.receiptNumber,
          sourceItemId: articleCode,
          warehouseLocation: transaction.outletBranch,
          notes: String(body.cancellationReason || '').trim(),
        });
        await article.save();
      }
      if (refundMethod === 'Cash') {
        const expectedCash = Number(session.expectedCash || 0);
        if (!Number.isFinite(expectedCash) || expectedCash < refundAmount) {
          return errorResponse('The shift cash balance cannot cover this refund', 409);
        }
        session.expectedCash = expectedCash - refundAmount;
      }
      // Resolve POS refund accounts from company mappings
      const returnsResult = await resolveAndValidateMapping(mappings, 'salesReturnsAccountCode', 'Revenue');
      if (returnsResult.error) return errorResponse(returnsResult.error, 409);
      const salesReturnsAccount = returnsResult.account;

      const refundAccountCode = mappings.cashAccountCode || mappings.bankAccountCode;
      if (!refundAccountCode) {
        return errorResponse('No cash or bank account configured for POS refunds', 409);
      }
      const refundAccount = await AccountHead.findOne({ code: refundAccountCode });
      if (!refundAccount || refundAccount.type !== 'Asset') {
        return errorResponse('Configured refund account must be an asset account', 400);
      }
      const { entry: refundJournal } = await postBalancedJournalEntry({
        sourceKey: `POS_REFUND:${transaction._id}`,
        voucherType: 'POSRefund',
        narration: `POS refund ${transaction.receiptNumber}`,
        referenceNumber: transaction.receiptNumber,
        postedBy: body.cancelledBy || '',
        lines: [
          {
            accountCode: salesReturnsAccount.code,
            debit: refundAmount,
            credit: 0,
            memo: 'Reverse POS revenue',
          },
          {
            accountCode: refundAccount.code,
            debit: 0,
            credit: refundAmount,
            memo: `${refundMethod} refund`,
          },
        ],
      });
      const transactionCount = Number(session.totalTransactionsCount || 0);
      const salesAmount = Number(session.totalSalesAmount || 0);
      if (!Number.isSafeInteger(transactionCount) || transactionCount < 1 ||
        !Number.isFinite(salesAmount) || salesAmount < Number(transaction.grandTotal)) {
        return errorResponse('POS shift totals cannot be reconciled for this cancellation', 409);
      }
      session.totalTransactionsCount = transactionCount - 1;
      session.totalSalesAmount = salesAmount - Number(transaction.grandTotal);
      await session.save();
      transaction.status = 'Cancelled';
      transaction.cancelledAt = new Date();
      transaction.cancellationReason = String(body.cancellationReason || '').trim();
      transaction.refund = {
        amount: refundAmount,
        method: refundMethod,
        accountCode: refundAccount.code,
        financialEntryId: refundJournal._id,
        recordedAt: new Date(),
      };
      await transaction.save();

      await AuditLog.create({
        userName: body.cancelledBy || '',
        action: 'CANCEL',
        module: 'Retail POS',
        recordId: transaction.receiptNumber,
        description: `Cancelled POS receipt ${transaction.receiptNumber} and recorded a ${refundMethod} refund`,
      });
      return successResponse({ transaction }, 'POS transaction cancelled and stock restored');
      });
    }

    if (action === 'DELETE_TRANSACTION') {
      return errorResponse('Completed POS transactions are immutable; use CANCEL_TRANSACTION to record a refund and restore stock', 409);
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getPos, 'pos');
export const POST = withAuthorization(postPos, 'pos', 'write');
