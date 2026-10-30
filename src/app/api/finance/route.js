import { allocateSequence, connectDB } from '@/lib/db.js';
import { AccountHead, JournalEntry, ExpenseRecord } from '@/models/Accounting.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    await connectDB();
    const accounts = await AccountHead.find({}).sort({ code: 1 });
    const journalEntries = await JournalEntry.find({}).sort({ createdAt: -1 });
    const expenses = await ExpenseRecord.find({}).sort({ createdAt: -1 });

    // Financial summaries
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let totalRevenue = 0;
    let totalCogs = 0;
    let totalExpenses = 0;

    accounts.forEach(acc => {
      const bal = acc.balance || 0;
      if (acc.type === 'Asset') totalAssets += bal;
      if (acc.type === 'Liability') totalLiabilities += bal;
      if (acc.type === 'Equity') totalEquity += bal;
      if (acc.type === 'Revenue') totalRevenue += bal;
      if (acc.type === 'CostOfGoodsSold') totalCogs += bal;
      if (acc.type === 'OperatingExpense') totalExpenses += bal;
    });

    const grossProfit = totalRevenue - totalCogs;
    const netProfit = grossProfit - totalExpenses;

    return successResponse({
      accounts,
      journalEntries,
      expenses,
      summary: {
        totalAssets,
        totalLiabilities,
        totalEquity,
        totalRevenue,
        totalCogs,
        totalExpenses,
        grossProfit,
        netProfit,
      },
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

    if (action === 'CREATE_JOURNAL_VOUCHER') {
      const { narration, referenceNumber, lines, postedBy } = body;

      let totalDebit = 0;
      let totalCredit = 0;

      (lines || []).forEach(line => {
        totalDebit += Number(line.debit) || 0;
        totalCredit += Number(line.credit) || 0;
      });

      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return errorResponse(`Journal voucher must balance. Debit: Rs. ${totalDebit}, Credit: Rs. ${totalCredit}`, 400);
      }

      if (!narration || !Array.isArray(lines) || lines.length < 2) {
        return errorResponse('A narration and at least two journal lines are required', 400);
      }
      const sequence = await allocateSequence('journal_entry');
      const voucherNumber = `JV-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const jv = await JournalEntry.create({
        voucherNumber,
        voucherType: 'JournalVoucher',
        date: new Date(),
        narration,
        referenceNumber: referenceNumber || '',
        lines: lines || [],
        totalDebit,
        totalCredit,
        postedBy: postedBy || '',
      });

      // Update account balances
      for (const line of (lines || [])) {
        if (line.accountCode) {
          const acc = await AccountHead.findOne({ code: line.accountCode });
          if (acc) {
            const deb = Number(line.debit) || 0;
            const cred = Number(line.credit) || 0;
            if (acc.type === 'Asset' || acc.type === 'CostOfGoodsSold' || acc.type === 'OperatingExpense') {
              acc.balance = (acc.balance || 0) + deb - cred;
            } else {
              acc.balance = (acc.balance || 0) + cred - deb;
            }
            await acc.save();
          }
        }
      }

      await AuditLog.create({
        userName: postedBy || '',
        action: 'POST_JOURNAL',
        module: 'Finance & Accounts',
        recordId: voucherNumber,
        description: `Posted Journal Voucher ${voucherNumber}: ${narration} (Rs. ${totalDebit.toLocaleString()})`,
      });

      return successResponse({ journalEntry: jv }, 'Journal Voucher posted');
    }

    if (action === 'CREATE_EXPENSE') {
      const { title, category, amount, paidFromAccount, paidTo, approvedBy } = body;
      if (!title || !category || !paidTo || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
        return errorResponse('Expense title, category, payee and a positive amount are required', 400);
      }
      const sequence = await allocateSequence('expense_record');
      const expenseNumber = `EXP-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const expense = await ExpenseRecord.create({
        expenseNumber,
        title,
        category,
        amount: Number(amount),
        paidFromAccount: paidFromAccount || '',
        paymentDate: new Date(),
        paidTo,
        approvedBy: approvedBy || '',
      });

      return successResponse({ expense }, 'Expense logged');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
