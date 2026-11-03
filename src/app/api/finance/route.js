import { allocateSequence, connectDB } from '@/lib/db.js';
import { AccountHead, JournalEntry, ExpenseRecord } from '@/models/Accounting.js';
import PurchaseOrder from '@/models/PurchaseOrder.js';
import Supplier from '@/models/Supplier.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, deleteRecord, parseListQuery, pickFields } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'CostOfGoodsSold', 'OperatingExpense'];

function updateAccountBalance(account, debit, credit, direction = 1) {
  const balance = Number(account.balance ?? 0);
  if (!Number.isFinite(balance)) throw new Error(`Account ${account.code} has an invalid balance`);
  const normalDebit = ['Asset', 'CostOfGoodsSold', 'OperatingExpense'].includes(account.type);
  const movement = normalDebit ? debit - credit : credit - debit;
  const updatedBalance = balance + (movement * direction);
  if (!Number.isFinite(updatedBalance)) throw new Error(`Account ${account.code} balance is outside the supported range`);
  account.balance = updatedBalance;
}

async function getFinance(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const allAccounts = await AccountHead.find({}).sort({ code: 1 });
    const accounts = applyListQuery(allAccounts, query, {
      searchFields: ['code', 'name', 'type'],
      statusField: 'type',
    }).items;
    const journalEntries = applyListQuery(await JournalEntry.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['voucherNumber', 'narration', 'referenceNumber', 'postedBy'],
    }).items;
    const expenses = applyListQuery(await ExpenseRecord.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['expenseNumber', 'title', 'category', 'paidTo'],
    }).items;

    // Financial summaries
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let totalRevenue = 0;
    let totalCogs = 0;
    let totalExpenses = 0;

    allAccounts.forEach(acc => {
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
    return fromError(error);
  }
}

async function postFinance(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_JOURNAL_VOUCHER') {
      const { narration, referenceNumber, lines, postedBy } = body;

      if (!narration || !Array.isArray(lines) || lines.length < 2) {
        return errorResponse('A narration and at least two journal lines are required', 400);
      }

      let totalDebit = 0;
      let totalCredit = 0;
      const validatedLines = [];
      const accountsByCode = new Map();

      for (const line of lines) {
        const accountCode = String(line?.accountCode || '').trim();
        const debit = Number(line?.debit ?? 0);
        const credit = Number(line?.credit ?? 0);
        if (!accountCode || !Number.isFinite(debit) || !Number.isFinite(credit) ||
          debit < 0 || credit < 0 || (debit === 0 && credit === 0) || (debit > 0 && credit > 0)) {
          return errorResponse('Each journal line needs an account and exactly one non-negative debit or credit amount', 400);
        }

        const account = await AccountHead.findOne({ code: accountCode });
        if (!account) {
          return errorResponse(`Account ${accountCode} does not exist`, 400);
        }
        accountsByCode.set(accountCode, account);
        totalDebit += debit;
        totalCredit += credit;
        validatedLines.push({
          accountCode,
          accountName: account.name,
          debit,
          credit,
          memo: typeof line.memo === 'string' ? line.memo : '',
        });
      }

      if (!Number.isFinite(totalDebit) || !Number.isFinite(totalCredit)) {
        return errorResponse('Journal totals are outside the supported range', 400);
      }
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return errorResponse(`Journal voucher must balance. Debit: Rs. ${totalDebit}, Credit: Rs. ${totalCredit}`, 400);
      }
      for (const accountCode of [...accountsByCode.keys()].sort()) {
        const account = accountsByCode.get(accountCode);
        const lockedAccount = await AccountHead.findByIdForUpdate(account._id);
        if (!lockedAccount) return errorResponse(`Account ${accountCode} no longer exists`, 409);
        accountsByCode.set(accountCode, lockedAccount);
      }
      const sequence = await allocateSequence('journal_entry');
      const voucherNumber = `JV-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const jv = await JournalEntry.create({
        voucherNumber,
        voucherType: 'JournalVoucher',
        date: new Date(),
        narration,
        referenceNumber: referenceNumber || '',
        lines: validatedLines,
        totalDebit,
        totalCredit,
        postedBy: postedBy || '',
      });

      // Update account balances
      for (const line of validatedLines) {
        const acc = accountsByCode.get(line.accountCode);
        updateAccountBalance(acc, line.debit, line.credit);
        await acc.save();
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
      const { title, category, amount, paidFromAccount, expenseAccountCode, paidTo, approvedBy } = body;
      const description = String(title || '').trim();
      const payee = String(paidTo || '').trim();
      const expenseAmount = Number(amount);
      if (!description || !category || !payee || !Number.isFinite(expenseAmount) || expenseAmount <= 0) {
        return errorResponse('Expense title, category, payee and a positive amount are required', 400);
      }
      if (!paidFromAccount || !expenseAccountCode) {
        return errorResponse('Select the asset payment account and operating-expense account', 400);
      }
      const paymentAccountCode = String(paidFromAccount).trim();
      const debitAccountCode = String(expenseAccountCode).trim();
      const existingPaymentAccount = await AccountHead.findOne({ code: paymentAccountCode });
      const existingExpenseAccount = await AccountHead.findOne({ code: debitAccountCode });
      if (!existingPaymentAccount || existingPaymentAccount.type !== 'Asset') {
        return errorResponse('The selected payment account must be an existing asset account', 400);
      }
      if (!existingExpenseAccount || existingExpenseAccount.type !== 'OperatingExpense') {
        return errorResponse('The selected expense account must be an existing operating-expense account', 400);
      }
      const accountsByCode = new Map([
        [paymentAccountCode, existingPaymentAccount],
        [debitAccountCode, existingExpenseAccount],
      ]);
      for (const accountCode of [...accountsByCode.keys()].sort()) {
        const account = await AccountHead.findByIdForUpdate(accountsByCode.get(accountCode)._id);
        if (!account) return errorResponse(`Account ${accountCode} no longer exists`, 409);
        if (!Number.isFinite(Number(account.balance ?? 0))) {
          return errorResponse(`Account ${accountCode} has an invalid balance`, 409);
        }
        accountsByCode.set(accountCode, account);
      }
      const paymentAccount = accountsByCode.get(paymentAccountCode);
      const expenseAccount = accountsByCode.get(debitAccountCode);
      const sequence = await allocateSequence('expense_record');
      const expenseNumber = `EXP-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const expense = await ExpenseRecord.create({
        expenseNumber,
        title: description,
        category,
        amount: expenseAmount,
        paidFromAccount: paymentAccountCode,
        expenseAccountCode: debitAccountCode,
        paymentDate: new Date(),
        paidTo: payee,
        approvedBy: approvedBy || '',
      });

      const voucherSequence = await allocateSequence('journal_entry');
      const voucherNumber = `JV-${new Date().getFullYear()}-${String(voucherSequence).padStart(4, '0')}`;
      const journalEntry = await JournalEntry.create({
        voucherNumber,
        voucherType: 'Expense',
        date: new Date(),
        narration: description,
        referenceNumber: expenseNumber,
        expenseId: expense._id,
        lines: [
          { accountCode: debitAccountCode, accountName: expenseAccount.name, debit: expenseAmount, credit: 0 },
          { accountCode: paymentAccountCode, accountName: paymentAccount.name, debit: 0, credit: expenseAmount },
        ],
        totalDebit: expenseAmount,
        totalCredit: expenseAmount,
        postedBy: approvedBy || '',
      });
      expense.journalEntryId = journalEntry._id;
      await expense.save();
      updateAccountBalance(expenseAccount, expenseAmount, 0);
      await expenseAccount.save();
      updateAccountBalance(paymentAccount, 0, expenseAmount);
      await paymentAccount.save();

      return successResponse({ expense, journalEntry }, 'Expense logged and posted to accounts');
    }

    if (action === 'CREATE_ACCOUNT') {
      const { code, name, type, balance } = body;
      const accountCode = String(code || '').trim();
      const accountName = String(name || '').trim();
      const openingBalance = Number(balance ?? 0);
      if (!accountCode || !accountName || !ACCOUNT_TYPES.includes(type) || !Number.isFinite(openingBalance)) {
        return errorResponse('Account code, name and a valid account type are required', 400);
      }
      const account = await AccountHead.create({
        code: accountCode,
        name: accountName,
        type,
        balance: openingBalance,
      });
      return successResponse({ account }, 'Account created');
    }

    if (action === 'UPDATE_ACCOUNT') {
      if (body.type && !ACCOUNT_TYPES.includes(body.type)) {
        return errorResponse('Select a valid account type', 400);
      }
      const account = await AccountHead.findByIdForUpdate(body.accountId);
      if (!account) return errorResponse('Account not found', 404);
      if (body.type && body.type !== account.type) {
        const entries = await JournalEntry.find({});
        if (entries.some((entry) => (entry.lines || []).some((line) => line.accountCode === account.code))) {
          return errorResponse('An account used by journal entries cannot change its account type', 409);
        }
      }
      const updates = pickFields(body, ['name', 'type']);
      if (updates.name !== undefined && !String(updates.name).trim()) {
        return errorResponse('Account name cannot be empty', 400);
      }
      if (updates.name !== undefined) updates.name = String(updates.name).trim();
      Object.assign(account, updates);
      await account.save();
      return successResponse({ account }, 'Account updated');
    }

    if (action === 'DELETE_ACCOUNT') {
      const account = await AccountHead.findByIdForUpdate(body.accountId);
      if (!account) return errorResponse('Account not found', 404);
      const [journalEntries, expenses, purchaseOrders, suppliers] = await Promise.all([
        JournalEntry.find({}),
        ExpenseRecord.find({}),
        PurchaseOrder.find({}),
        Supplier.find({}),
      ]);
      if (journalEntries.some((entry) => (entry.lines || []).some((line) => line.accountCode === account.code)) ||
        expenses.some((expense) =>
          expense.paidFromAccount === account.code || expense.expenseAccountCode === account.code
        ) ||
        purchaseOrders.some((order) =>
          order.inventoryAccountCode === account.code || order.payableAccountCode === account.code
        ) ||
        suppliers.some((supplier) =>
          Object.prototype.hasOwnProperty.call(supplier.payableBalances || {}, account.code)
        )) {
        return errorResponse('This account is referenced by financial records and cannot be deleted', 409);
      }
      const deletedAccount = await deleteRecord(AccountHead, body.accountId);
      if (!deletedAccount) return errorResponse('Account not found', 404);
      return successResponse({ account: deletedAccount }, 'Account deleted');
    }

    if (action === 'DELETE_EXPENSE') {
      const existingExpense = await ExpenseRecord.findByIdForUpdate(body.expenseId);
      if (!existingExpense) return errorResponse('Expense not found', 404);
      if (existingExpense.journalEntryId || existingExpense.paymentDate) {
        return errorResponse('A paid or posted expense is an immutable financial record and cannot be deleted', 409);
      }
      await ExpenseRecord.deleteOne({ _id: existingExpense._id });
      return successResponse({ expense: existingExpense }, 'Expense deleted');
    }

    if (action === 'DELETE_JOURNAL_VOUCHER') {
      const existingEntry = await JournalEntry.findByIdForUpdate(body.journalId);
      if (!existingEntry) return errorResponse('Journal voucher not found', 404);
      if (existingEntry.expenseId) {
        return errorResponse('Expense journal entries must be reversed by deleting their expense record', 409);
      }
      const accounts = new Map();
      for (const line of existingEntry.lines || []) {
        if (!accounts.has(line.accountCode)) {
          accounts.set(line.accountCode, await AccountHead.findOne({ code: line.accountCode }));
        }
      }
      for (const code of [...accounts.keys()].sort()) {
        const accountRecord = accounts.get(code);
        const account = accountRecord
          ? await AccountHead.findByIdForUpdate(accountRecord._id)
          : null;
        if (!account) return errorResponse(`Account ${code} is missing; the voucher cannot be safely deleted`, 409);
        accounts.set(code, account);
      }
      for (const line of existingEntry.lines || []) {
        const account = accounts.get(line.accountCode);
        updateAccountBalance(account, Number(line.debit), Number(line.credit), -1);
        await account.save();
      }
      await JournalEntry.deleteOne({ _id: existingEntry._id });
      const journalEntry = existingEntry;
      return successResponse({ journalEntry }, 'Journal voucher deleted');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getFinance, 'finance');
export const POST = withAuthorization(postFinance, 'finance', 'write');
