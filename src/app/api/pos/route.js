import { allocateSequence, connectDB } from '@/lib/db.js';
import { POSSession, POSTransaction } from '@/models/POS.js';
import DesignArticle from '@/models/Design.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    await connectDB();
    const activeSession = await POSSession.findOne({ status: 'Open' }).sort({ openedAt: -1 });
    const recentTransactions = await POSTransaction.find({}).sort({ createdAt: -1 }).limit(20);
    const catalogArticles = await DesignArticle.find({ sampleStatus: 'ProductionReady' });

    return successResponse({
      activeSession,
      recentTransactions,
      catalogArticles: catalogArticles.map(a => ({
        id: a._id,
        code: a.designCode,
        title: a.title,
        price: a.suggestedRetailPrice,
        barcode: a.barcode,
        category: a.category,
        sizes: (a.sizeGrading || []).map(s => s.sizeName),
      })),
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
        openedAt: new Date(),
      });

      return successResponse({ session }, 'POS shift opened successfully');
    }

    if (action === 'CLOSE_SHIFT') {
      const { sessionId, closingCashActual, closingNotes } = body;
      const session = await POSSession.findById(sessionId);
      if (!session) return errorResponse('Session not found', 404);
      const closingCash = Number(closingCashActual);
      if (session.status !== 'Open' || !Number.isFinite(closingCash) || closingCash < 0) {
        return errorResponse('An open shift and a valid closing cash amount are required', 400);
      }

      session.closingCashActual = closingCash;
      session.varianceAmount = session.closingCashActual - session.expectedCash;
      session.status = 'Closed';
      session.closedAt = new Date();
      session.closingNotes = closingNotes || '';
      await session.save();

      return successResponse({ session }, 'POS shift closed and cash drawer reconciled');
    }

    if (action === 'COMPLETE_CHECKOUT') {
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
      } = body;

      if (!sessionId || !Array.isArray(items) || items.length === 0) {
        return errorResponse('An open shift and at least one product are required', 400);
      }
      const session = await POSSession.findOne({ sessionCode: sessionId, status: 'Open' });
      if (!session) return errorResponse('Open a POS shift before completing checkout', 409);
      if (!['Cash', 'CreditCard', 'BankTransfer', 'Split'].includes(paymentMethod)) {
        return errorResponse('Select a supported payment method', 400);
      }
      const verifiedItems = [];
      for (const item of items) {
        const quantity = Number(item.quantity);
        const article = await DesignArticle.findOne({
          designCode: item.articleCode,
          sampleStatus: 'ProductionReady',
        });
        if (!article || !Number.isInteger(quantity) || quantity <= 0 || Number(article.suggestedRetailPrice) <= 0) {
          return errorResponse(`Cart item ${item.articleCode || ''} is invalid or unavailable`, 400);
        }
        const discountPercent = Number(item.discountPercent) || 0;
        if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
          return errorResponse('Item discounts must be between zero and one hundred percent', 400);
        }
        verifiedItems.push({
          ...item,
          title: article.title,
          barcode: article.barcode,
          price: Number(article.suggestedRetailPrice),
        });
      }
      const sequence = await allocateSequence('pos_transaction');
      const receiptNumber = `RCPT-${new Date().getFullYear()}-${String(sequence).padStart(5, '0')}`;

      let subtotal = 0;
      let discountTotal = 0;
      let totalPieces = 0;

      const processedItems = verifiedItems.map(i => {
        const itemSub = Number(i.price) * Number(i.quantity);
        const itemDisc = (Number(i.discountPercent) || 0) > 0 ? (itemSub * (Number(i.discountPercent) / 100)) : (Number(i.discountAmount) || 0);
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
      const tendered = Number(cashTendered) || 0;
      if (paymentMethod === 'Cash' && tendered < grandTotal) {
        return errorResponse('Cash tendered cannot be less than the sale total', 400);
      }
      const changeGiven = Math.max(0, tendered - grandTotal);

      const transaction = await POSTransaction.create({
        receiptNumber,
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
        cashTendered: tendered,
        changeGiven,
        splitDetails: splitDetails || {},
      });

      // Update POS session expected cash
      session.totalTransactionsCount = (session.totalTransactionsCount || 0) + 1;
      session.totalSalesAmount = (session.totalSalesAmount || 0) + grandTotal;
      if (paymentMethod === 'Cash') {
        session.expectedCash = (session.expectedCash || 0) + grandTotal;
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
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
