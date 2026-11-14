import { connectDB } from '@/lib/db.js';
import SalesOrder from '@/models/SalesOrder.js';
import { POSTransaction } from '@/models/POS.js';
import PurchaseOrder from '@/models/PurchaseOrder.js';
import SupplierInvoice from '@/models/SupplierInvoice.js';
import { AccountHead, JournalEntry, ExpenseRecord, IncomeRecord } from '@/models/Accounting.js';
import Customer from '@/models/Customer.js';
import Supplier from '@/models/Supplier.js';
import DesignArticle from '@/models/Design.js';
import Fabric from '@/models/Fabric.js';
import TrimItem from '@/models/Trims.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { withAuthorization } from '@/lib/authorization.js';
import { getCompanyContext, resolveMapping } from '@/lib/accounting-mappings.js';
import { getCurrencySymbol, formatCurrency as formatSharedCurrency } from '@/lib/currency.js';

const dayMs = 24 * 60 * 60 * 1000;

function numericValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateKey(value) {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getUTCDay(); // 0 = Sunday
  const mondayOffset = (day + 6) % 7; // days to subtract to get to Monday
  d.setUTCDate(d.getUTCDate() - mondayOffset);
  return d;
}

function endOfWeek(date) {
  const d = startOfWeek(date);
  d.setUTCDate(d.getUTCDate() + 6);
  return endOfDay(d);
}

function startOfMonth(date) {
  const d = startOfDay(date);
  d.setUTCDate(1);
  return d;
}

function endOfMonth(date) {
  const d = startOfDay(date);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return endOfDay(d);
}

function getFinancialYearRange(company, now = new Date()) {
  const startStr = String(company.financialYearStart || '').trim();
  const endStr = String(company.financialYearEnd || '').trim();
  if (!startStr || !endStr) return null;

  const startParts = startStr.split('-').map(Number);
  const endParts = endStr.split('-').map(Number);

  // If full ISO date format (YYYY-MM-DD)
  if (startParts.length === 3 && endParts.length === 3) {
    const sYear = startParts[0];
    const sMonth = startParts[1];
    const sDay = startParts[2];
    const eYear = endParts[0];
    const eMonth = endParts[1];
    const eDay = endParts[2];

    const explicitStart = new Date(Date.UTC(sYear, sMonth - 1, sDay));
    const explicitEnd = new Date(Date.UTC(eYear, eMonth - 1, eDay, 23, 59, 59, 999));

    if (now >= explicitStart && now <= explicitEnd) {
      return { start: startOfDay(explicitStart), end: endOfDay(explicitEnd) };
    }

    const year = now.getUTCFullYear();
    const fyStart = new Date(Date.UTC(year, sMonth - 1, sDay));
    const fyEnd = new Date(Date.UTC(year, eMonth - 1, eDay, 23, 59, 59, 999));

    let periodStart, periodEnd;
    if (fyEnd >= fyStart) {
      if (now >= fyStart && now <= fyEnd) {
        periodStart = fyStart;
        periodEnd = fyEnd;
      } else if (now < fyStart) {
        periodStart = new Date(Date.UTC(year - 1, sMonth - 1, sDay));
        periodEnd = new Date(Date.UTC(year - 1, eMonth - 1, eDay, 23, 59, 59, 999));
      } else {
        periodStart = fyStart;
        periodEnd = fyEnd;
      }
    } else {
      if (now >= fyStart) {
        periodStart = fyStart;
        periodEnd = new Date(Date.UTC(year + 1, eMonth - 1, eDay, 23, 59, 59, 999));
      } else {
        periodStart = new Date(Date.UTC(year - 1, sMonth - 1, sDay));
        periodEnd = fyEnd;
      }
    }
    return { start: startOfDay(periodStart), end: endOfDay(periodEnd) };
  }

  // If MM-DD format (2 parts)
  if (startParts.length === 2 && endParts.length === 2) {
    const startMonth = startParts[0];
    const startDay = startParts[1];
    const endMonth = endParts[0];
    const endDay = endParts[1];

    const year = now.getUTCFullYear();
    const fyStart = new Date(Date.UTC(year, startMonth - 1, startDay));
    const fyEnd = new Date(Date.UTC(year, endMonth - 1, endDay, 23, 59, 59, 999));

    let periodStart, periodEnd;
    if (fyEnd >= fyStart) {
      if (now >= fyStart && now <= fyEnd) {
        periodStart = fyStart;
        periodEnd = fyEnd;
      } else if (now < fyStart) {
        periodStart = new Date(Date.UTC(year - 1, startMonth - 1, startDay));
        periodEnd = new Date(Date.UTC(year - 1, endMonth - 1, endDay, 23, 59, 59, 999));
      } else {
        periodStart = fyStart;
        periodEnd = fyEnd;
      }
    } else {
      if (now >= fyStart) {
        periodStart = fyStart;
        periodEnd = new Date(Date.UTC(year + 1, endMonth - 1, endDay, 23, 59, 59, 999));
      } else {
        periodStart = new Date(Date.UTC(year - 1, startMonth - 1, startDay));
        periodEnd = fyEnd;
      }
    }
    return { start: startOfDay(periodStart), end: endOfDay(periodEnd) };
  }

  return null;
}

function getDateRange(range, company, now = new Date()) {
  const today = startOfDay(now);
  switch (range) {
    case 'today':
      return { start: today, end: endOfDay(today) };
    case 'week':
      return { start: startOfWeek(today), end: endOfWeek(today) };
    case 'month':
      return { start: startOfMonth(today), end: endOfMonth(today) };
    case 'financial-year': {
      const fy = getFinancialYearRange(company, now);
      if (!fy) return { start: startOfMonth(today), end: endOfMonth(today) };
      return fy;
    }
    default:
      return { start: startOfMonth(today), end: endOfMonth(today) };
  }
}

function isWithinRange(dateValue, rangeStart, rangeEnd) {
  const d = parseDate(dateValue);
  if (!d) return false;
  return d >= rangeStart && d <= rangeEnd;
}

async function getAccountBalance(accountCode) {
  if (!accountCode) return 0;
  const account = await AccountHead.findOne({ code: accountCode });
  if (!account) return 0;
  return numericValue(account.balance);
}

async function getDashboardData(request, user) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || 'month';
    const section = searchParams.get('section') || 'all';

    const company = await getCompanyContext();
    if (!company) {
      return errorResponse('No company is configured. Complete client onboarding first.', 409);
    }

    const currency = String(company.currency || 'PKR');
    const currencySymbol = getCurrencySymbol(currency, company.currencySymbol);
    const mappings = company.accountingMappings || {};
    const dateRange = getDateRange(range, company);
    const rangeStart = dateRange.start;
    const rangeEnd = dateRange.end;

    const result = {
      company: {
        companyName: company.companyName || company.name || 'Dawley institute of technology',
        legalName: company.legalName || '',
        currency,
        currencySymbol,
        onboardingCompleted: Boolean(company.onboardingCompleted),
        branches: Array.isArray(company.branches) ? company.branches : [],
        locations: Array.isArray(company.locations) ? company.locations : [],
      },
    };

    // ── 1. Summary Cards ──────────────────────────────────────────────
    if (section === 'all' || section === 'summary') {
      const [salesOrders, posTransactions, purchaseOrders, supplierInvoices, expenseRecords, allAccounts, allJournals] =
        await Promise.all([
          SalesOrder.find({}),
          POSTransaction.find({}),
          PurchaseOrder.find({}),
          SupplierInvoice.find({}),
          ExpenseRecord.find({}),
          AccountHead.find({}),
          JournalEntry.find({}),
        ]);

      // 1. Total Purchase: actual purchase records (non-cancelled within range)
      const totalPurchase = purchaseOrders
        .filter((po) => po.status !== 'Cancelled' && po.status !== 'Voided')
        .filter((po) => isWithinRange(po.orderDate || po.createdAt, rangeStart, rangeEnd))
        .reduce((sum, po) => sum + numericValue(po.grandTotal), 0);

      // 2. Total Sale: actual sales orders and POS transactions without double counting
      const totalSaleFromOrders = salesOrders
        .filter((so) => so.status !== 'Cancelled' && so.status !== 'Voided')
        .filter((so) => isWithinRange(so.orderDate || so.createdAt, rangeStart, rangeEnd))
        .reduce((sum, so) => sum + numericValue(so.grandTotal), 0);
      const totalSaleFromPos = posTransactions
        .filter((pt) => pt.status !== 'Cancelled' && pt.status !== 'Voided')
        .filter((pt) => isWithinRange(pt.createdAt, rangeStart, rangeEnd))
        .reduce((sum, pt) => sum + numericValue(pt.grandTotal), 0);
      const totalSale = totalSaleFromOrders + totalSaleFromPos;

      // 3. Expenses: actual posted expenses within range
      const expenseDate = (er) => er.paymentDate || er.expenseDate || er.date || er.createdAt;
      const totalExpenses = expenseRecords
        .filter((er) => er.status !== 'Cancelled' && er.status !== 'Voided')
        .filter((er) => isWithinRange(expenseDate(er), rangeStart, rangeEnd))
        .reduce((sum, er) => sum + numericValue(er.amount), 0);

      // 4. Purchase Due: actual outstanding supplier balances
      let purchaseDue = 0;
      if (supplierInvoices.length > 0) {
        const invoiceDueFromSuppliers = supplierInvoices
          .filter((inv) => inv.status !== 'Paid' && inv.status !== 'Cancelled' && inv.status !== 'Voided')
          .filter((inv) => isWithinRange(inv.invoiceDate || inv.createdAt, rangeStart, rangeEnd))
          .reduce((sum, inv) => {
            const outBal = inv.outstandingBalance != null
              ? numericValue(inv.outstandingBalance)
              : Math.max(0, numericValue(inv.grandTotal) - numericValue(inv.paidAmount));
            return sum + Math.max(0, outBal);
          }, 0);

        const invoicedPoNumbers = new Set(supplierInvoices.map((inv) => inv.poNumber).filter(Boolean));
        const uninvoicedPoDue = purchaseOrders
          .filter((po) => po.status !== 'Cancelled' && po.status !== 'Voided')
          .filter((po) => !invoicedPoNumbers.has(po.poNumber))
          .filter((po) => isWithinRange(po.orderDate || po.createdAt, rangeStart, rangeEnd))
          .reduce((sum, po) => {
            const grandTotal = numericValue(po.grandTotal);
            const amountPaid = numericValue(po.amountPaid);
            return sum + Math.max(0, grandTotal - amountPaid);
          }, 0);

        purchaseDue = invoiceDueFromSuppliers + uninvoicedPoDue;
      } else {
        purchaseDue = purchaseOrders
          .filter((po) => po.status !== 'Cancelled' && po.status !== 'Voided')
          .filter((po) => isWithinRange(po.orderDate || po.createdAt, rangeStart, rangeEnd))
          .reduce((sum, po) => {
            const grandTotal = numericValue(po.grandTotal);
            const amountPaid = numericValue(po.amountPaid);
            return sum + Math.max(0, grandTotal - amountPaid);
          }, 0);
      }

      // 5. Invoice Due: actual outstanding customer invoices within range
      const invoiceDue = salesOrders
        .filter((so) => so.status !== 'Cancelled' && so.status !== 'Voided')
        .filter((so) => isWithinRange(so.orderDate || so.createdAt, rangeStart, rangeEnd))
        .reduce((sum, so) => {
          const grandTotal = numericValue(so.grandTotal);
          const amountPaid = numericValue(so.amountPaid);
          const refunded = numericValue(so.refundedAmountTotal);
          const returns = numericValue(so.totalReturnedValue);
          return sum + Math.max(0, grandTotal - amountPaid - refunded - returns);
        }, 0);

      // 6. Total in Bank: actual mapped bank account balances
      const bankAccountCode = resolveMapping(mappings, 'bankAccountCode');
      const bankAccounts = allAccounts.filter((a) =>
        a.isBank === true || (bankAccountCode && a.code === bankAccountCode)
      );
      const totalInBank = bankAccounts.reduce((sum, a) => sum + numericValue(a.balance), 0);

      // 7. Total in Cash: actual mapped cash account balance
      const cashAccountCode = resolveMapping(mappings, 'cashAccountCode') || '1010';
      const cashAccounts = allAccounts.filter((a) =>
        a.code === cashAccountCode || (a.type === 'Asset' && a.name?.toLowerCase().includes('cash in hand'))
      );
      const uniqueCashAccounts = Array.from(new Map(cashAccounts.map(a => [a.code, a])).values());
      const totalInCash = uniqueCashAccounts.reduce((sum, a) => sum + numericValue(a.balance), 0);

      // 8. Net Profit: actual accounting-based calculation from journals within range
      // Revenue (credit - debit) - COGS (debit - credit) - Expenses (debit - credit)
      const revenueAccountCode = resolveMapping(mappings, 'salesRevenueAccountCode');
      const cogsAccountCode = resolveMapping(mappings, 'cogsAccountCode');
      const expenseAccountCode = resolveMapping(mappings, 'expenseAccountCode');

      const revenueAccountCodes = new Set(
        allAccounts.filter((a) => a.type === 'Revenue' || a.code === revenueAccountCode).map((a) => a.code)
      );
      const cogsAccountCodes = new Set(
        allAccounts.filter((a) => a.type === 'CostOfGoodsSold' || a.code === cogsAccountCode).map((a) => a.code)
      );
      const expenseAccountCodes = new Set(
        allAccounts.filter((a) => a.type === 'OperatingExpense' || a.code === expenseAccountCode).map((a) => a.code)
      );

      let totalRevenue = 0;
      let totalCogs = 0;
      let totalExpenseFromJournals = 0;

      for (const journal of allJournals) {
        const journalDate = dateKey(journal.date || journal.createdAt);
        if (!journalDate) continue;
        const jd = new Date(`${journalDate}T00:00:00.000Z`);
        if (jd < rangeStart || jd > rangeEnd) continue;
        if (!Array.isArray(journal.lines)) continue;
        for (const line of journal.lines) {
          const code = String(line.accountCode || '');
          const debit = numericValue(line.debit);
          const credit = numericValue(line.credit);
          if (revenueAccountCodes.has(code)) totalRevenue += (credit - debit);
          if (cogsAccountCodes.has(code)) totalCogs += (debit - credit);
          if (expenseAccountCodes.has(code)) totalExpenseFromJournals += (debit - credit);
        }
      }

      const netProfit = (totalRevenue || totalCogs || totalExpenseFromJournals)
        ? (totalRevenue - totalCogs - totalExpenseFromJournals)
        : 0;

      result.summary = {
        totalPurchase,
        totalSale,
        totalExpenses,
        purchaseDue,
        invoiceDue,
        totalInBank,
        totalInCash,
        netProfit,
        currency,
        currencySymbol,
      };
    }

    // ── 2. Sale Statistics ────────────────────────────────────────────
    if (section === 'all' || section === 'sales') {
      const [salesOrders, posTransactions] = await Promise.all([
        SalesOrder.find({}),
        POSTransaction.find({}),
      ]);

      const monthlyData = new Map();
      const yearlyData = new Map();

      const addSale = (dateValue, amount, source) => {
        const d = parseDate(dateValue);
        if (!d) return;
        const monthKey = d.toISOString().slice(0, 7); // YYYY-MM
        const yearKey = String(d.getUTCFullYear());

        if (!monthlyData.has(monthKey)) monthlyData.set(monthKey, 0);
        monthlyData.set(monthKey, monthlyData.get(monthKey) + amount);

        if (!yearlyData.has(yearKey)) yearlyData.set(yearKey, 0);
        yearlyData.set(yearKey, yearlyData.get(yearKey) + amount);
      };

      for (const so of salesOrders) {
        if (so.status === 'Cancelled' || so.status === 'Voided') continue;
        addSale(so.orderDate || so.createdAt, numericValue(so.grandTotal), 'SalesOrder');
      }
      for (const pt of posTransactions) {
        if (pt.status === 'Cancelled' || pt.status === 'Voided') continue;
        addSale(pt.createdAt, numericValue(pt.grandTotal), 'POS');
      }

      result.sales = {
        monthly: [...monthlyData.entries()]
          .map(([month, total]) => ({ month, total }))
          .sort((a, b) => a.month.localeCompare(b.month)),
        yearly: [...yearlyData.entries()]
          .map(([year, total]) => ({ year, total }))
          .sort((a, b) => a.year.localeCompare(b.year)),
      };
    }

    // ── 3. Profit Statistics ──────────────────────────────────────────
    if (section === 'all' || section === 'profit') {
      const [salesOrders, posTransactions, allJournals] = await Promise.all([
        SalesOrder.find({}),
        POSTransaction.find({}),
        JournalEntry.find({}),
      ]);

      const revenueAccountCode = resolveMapping(mappings, 'salesRevenueAccountCode');
      const cogsAccountCode = resolveMapping(mappings, 'cogsAccountCode');
      const expenseAccountCode = resolveMapping(mappings, 'expenseAccountCode');

      const profitByDate = new Map();

      const addProfit = (dateValue, revenue, cogs, expense) => {
        const d = parseDate(dateValue);
        if (!d) return;
        const dayKey = d.toISOString().slice(0, 10);
        if (!profitByDate.has(dayKey)) {
          profitByDate.set(dayKey, { revenue: 0, cogs: 0, expense: 0 });
        }
        const entry = profitByDate.get(dayKey);
        entry.revenue += revenue;
        entry.cogs += cogs;
        entry.expense += expense;
      };

      // Sales revenue from orders (within range)
      for (const so of salesOrders) {
        if (so.status === 'Cancelled' || so.status === 'Voided') continue;
        if (!isWithinRange(so.orderDate || so.createdAt, rangeStart, rangeEnd)) continue;
        addProfit(so.orderDate || so.createdAt, numericValue(so.grandTotal), 0, 0);
      }
      // POS revenue (within range)
      for (const pt of posTransactions) {
        if (pt.status === 'Cancelled' || pt.status === 'Voided') continue;
        if (!isWithinRange(pt.createdAt, rangeStart, rangeEnd)) continue;
        addProfit(pt.createdAt, numericValue(pt.grandTotal), 0, 0);
      }

      // COGS and expenses from journals
      for (const journal of allJournals) {
        const journalDate = dateKey(journal.date || journal.createdAt);
        if (!journalDate) continue;
        if (!Array.isArray(journal.lines)) continue;
        for (const line of journal.lines) {
          const code = String(line.accountCode || '');
          const debit = numericValue(line.debit);
          const credit = numericValue(line.credit);
          if (code === cogsAccountCode) addProfit(journalDate, 0, debit, 0);
          if (code === expenseAccountCode) addProfit(journalDate, 0, 0, debit);
        }
      }

      const dailyProfit = [...profitByDate.entries()]
        .map(([date, data]) => ({
          date,
          revenue: data.revenue,
          cogs: data.cogs,
          expense: data.expense,
          profit: data.revenue - data.cogs - data.expense,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Weekly aggregation
      const weeklyProfit = new Map();
      for (const entry of dailyProfit) {
        const d = new Date(`${entry.date}T00:00:00.000Z`);
        const weekStart = startOfWeek(d);
        const weekKey = weekStart.toISOString().slice(0, 10);
        if (!weeklyProfit.has(weekKey)) {
          weeklyProfit.set(weekKey, { revenue: 0, cogs: 0, expense: 0, profit: 0 });
        }
        const w = weeklyProfit.get(weekKey);
        w.revenue += entry.revenue;
        w.cogs += entry.cogs;
        w.expense += entry.expense;
        w.profit += entry.profit;
      }

      // Monthly aggregation
      const monthlyProfit = new Map();
      for (const entry of dailyProfit) {
        const monthKey = entry.date.slice(0, 7);
        if (!monthlyProfit.has(monthKey)) {
          monthlyProfit.set(monthKey, { revenue: 0, cogs: 0, expense: 0, profit: 0 });
        }
        const m = monthlyProfit.get(monthKey);
        m.revenue += entry.revenue;
        m.cogs += entry.cogs;
        m.expense += entry.expense;
        m.profit += entry.profit;
      }

      // Yearly aggregation
      const yearlyProfit = new Map();
      for (const entry of dailyProfit) {
        const yearKey = entry.date.slice(0, 4);
        if (!yearlyProfit.has(yearKey)) {
          yearlyProfit.set(yearKey, { revenue: 0, cogs: 0, expense: 0, profit: 0 });
        }
        const y = yearlyProfit.get(yearKey);
        y.revenue += entry.revenue;
        y.cogs += entry.cogs;
        y.expense += entry.expense;
        y.profit += entry.profit;
      }

      result.profit = {
        daily: dailyProfit,
        weekly: [...weeklyProfit.entries()].map(([week, data]) => ({ week, ...data })).sort((a, b) => a.week.localeCompare(b.week)),
        monthly: [...monthlyProfit.entries()].map(([month, data]) => ({ month, ...data })).sort((a, b) => a.month.localeCompare(b.month)),
        yearly: [...yearlyProfit.entries()].map(([year, data]) => ({ year, ...data })).sort((a, b) => a.year.localeCompare(b.year)),
      };
    }

    // ── 4. Recent Activity ────────────────────────────────────────────
    if (section === 'all' || section === 'activity') {
      const [salesOrders, purchaseOrders] = await Promise.all([
        SalesOrder.find({}),
        PurchaseOrder.find({}),
      ]);

      const salesActivity = salesOrders
        .filter((so) => so.status !== 'Cancelled' && so.status !== 'Voided')
        .map((so) => ({
          type: 'sale',
          invoiceNumber: so.invoiceNumber || so.orderNumber,
          date: so.orderDate || so.createdAt,
          branch: so.warehouseLocation || '',
          amount: numericValue(so.grandTotal),
          customer: so.customerName || '',
          status: so.paymentStatus || so.status,
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);

      const purchaseActivity = purchaseOrders
        .filter((po) => po.status !== 'Cancelled' && po.status !== 'Voided')
        .map((po) => ({
          type: 'purchase',
          invoiceNumber: po.poNumber || '',
          date: po.orderDate || po.createdAt,
          branch: po.warehouseLocation || '',
          amount: numericValue(po.grandTotal),
          customer: po.supplierName || '',
          status: po.paymentStatus || po.status,
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);

      result.activity = { sales: salesActivity, purchases: purchaseActivity };
    }

    // ── 5. Branch Wise Product Quantity ───────────────────────────────
    if (section === 'all' || section === 'branch-stock') {
      const [designs, fabrics, trims] = await Promise.all([
        DesignArticle.find({}),
        Fabric.find({}),
        TrimItem.find({}),
      ]);

      const branchStock = new Map();

      // Finished goods from designs (warehouseBalances)
      for (const design of designs) {
        const balances = Array.isArray(design.warehouseBalances) ? design.warehouseBalances : [];
        for (const bal of balances) {
          const warehouse = String(bal.warehouse || '').trim();
          if (!warehouse) continue;
          const qty = numericValue(bal.quantity);
          if (qty <= 0) continue;
          if (!branchStock.has(warehouse)) branchStock.set(warehouse, { finishedGoods: 0, fabricMeters: 0, trimUnits: 0 });
          branchStock.get(warehouse).finishedGoods += qty;
        }
        // Also use total finishedGoodsStock if no warehouseBalances
        const totalStock = numericValue(design.finishedGoodsStock);
        if (totalStock > 0 && balances.length === 0) {
          if (!branchStock.has('Unassigned')) branchStock.set('Unassigned', { finishedGoods: 0, fabricMeters: 0, trimUnits: 0 });
          branchStock.get('Unassigned').finishedGoods += totalStock;
        }
      }

      // Fabric meters
      for (const fabric of fabrics) {
        const rolls = Array.isArray(fabric.rolls) ? fabric.rolls : [];
        const totalMeters = rolls
          .filter((roll) => roll.status !== 'Voided' && roll.status !== 'InTransit')
          .reduce((sum, roll) => sum + numericValue(roll.remainingMeters), 0);
        if (totalMeters > 0) {
          const warehouse = fabric.warehouseLocation || 'Unassigned';
          if (!branchStock.has(warehouse)) branchStock.set(warehouse, { finishedGoods: 0, fabricMeters: 0, trimUnits: 0 });
          branchStock.get(warehouse).fabricMeters += totalMeters;
        }
      }

      // Trim units
      for (const trim of trims) {
        const stock = numericValue(trim.currentStock);
        if (stock > 0) {
          const warehouse = trim.warehouseLocation || 'Unassigned';
          if (!branchStock.has(warehouse)) branchStock.set(warehouse, { finishedGoods: 0, fabricMeters: 0, trimUnits: 0 });
          branchStock.get(warehouse).trimUnits += stock;
        }
      }

      result.branchStock = [...branchStock.entries()]
        .map(([branch, data]) => ({ branch, ...data }))
        .sort((a, b) => b.finishedGoods + b.fabricMeters + b.trimUnits - (a.finishedGoods + a.fabricMeters + a.trimUnits));
    }

    // ── 6. Payment Due List ───────────────────────────────────────────
    if (section === 'all' || section === 'payment-due') {
      const [salesOrders, customers] = await Promise.all([
        SalesOrder.find({}),
        Customer.find({}),
      ]);

      const customerMap = new Map();
      for (const c of customers) {
        customerMap.set(String(c._id), c.name || '');
      }

      const paymentDue = salesOrders
        .filter((so) => so.status !== 'Cancelled' && so.status !== 'Voided')
        .map((so) => {
          const grandTotal = numericValue(so.grandTotal);
          const amountPaid = numericValue(so.amountPaid);
          const refunded = numericValue(so.refundedAmountTotal);
          const returns = numericValue(so.totalReturnedValue);
          const due = Math.max(0, grandTotal - amountPaid - refunded - returns);
          if (due <= 0) return null;
          return {
            invoiceNumber: so.invoiceNumber || so.orderNumber,
            date: so.orderDate || so.createdAt,
            branch: so.warehouseLocation || '',
            amount: grandTotal,
            dueAmount: due,
            customer: so.customerName || customerMap.get(String(so.customerId)) || '',
            status: so.paymentStatus || so.status,
          };
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 20);

      result.paymentDue = paymentDue;
    }

    // ── 7. Stock Alert List ───────────────────────────────────────────
    if (section === 'all' || section === 'stock-alerts') {
      const [trims] = await Promise.all([TrimItem.find({})]);

      const stockAlerts = trims
        .filter((t) => {
          const current = numericValue(t.currentStock);
          const minimum = numericValue(t.minimumStock);
          return minimum > 0 && current <= minimum;
        })
        .map((t) => ({
          id: t._id,
          name: t.name || '',
          sku: t.trimCode || '',
          current: numericValue(t.currentStock),
          min: numericValue(t.minimumStock),
          unit: t.unit || 'pcs',
          warehouse: t.warehouseLocation || '',
        }))
        .sort((a, b) => a.current - b.current);

      result.stockAlerts = stockAlerts;
    }

    return successResponse(result, 'Dashboard data fetched successfully');
  } catch (error) {
    console.error('Dashboard API error:', error);
    return fromError(error, 503);
  }
}

export const GET = withAuthorization(getDashboardData, 'dashboard', 'read');
