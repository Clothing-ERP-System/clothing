import { allocateSequence, connectDB, runInTransaction } from '@/lib/db.js';
import { AccountHead, JournalEntry, ExpenseRecord, IncomeRecord } from '@/models/Accounting.js';
import PurchaseOrder from '@/models/PurchaseOrder.js';
import PurchaseReturn from '@/models/PurchaseReturn.js';
import ProductionOrder from '@/models/ProductionOrder.js';
import Supplier from '@/models/Supplier.js';
import Customer from '@/models/Customer.js';
import SalesOrder from '@/models/SalesOrder.js';
import { POSTransaction } from '@/models/POS.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, deleteRecord, parseListQuery, pickFields } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';
import { postBalancedJournalEntry } from '@/lib/accounting.js';
import { randomUUID } from 'node:crypto';
import { resolveAndValidateMapping, validateMappingsPresent, getCompanyContext } from '@/lib/accounting-mappings.js';

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'CostOfGoodsSold', 'OperatingExpense'];

const DEFAULT_ACCOUNTS = [
  { code: '1020', name: 'Main Operating Bank Account', type: 'Asset', balance: 0 },
  { code: '1030', name: 'Accounts Receivable', type: 'Asset', balance: 0 },
  { code: '1050', name: 'Finished Goods Inventory', type: 'Asset', balance: 0 },
  { code: '1060', name: 'Accumulated Depreciation', type: 'Asset', balance: 0 },
  { code: '2010', name: 'Accounts Payable - Suppliers', type: 'Liability', balance: 0 },
  { code: '2020', name: 'Payroll Payable', type: 'Liability', balance: 0 },
  { code: '2030', name: 'Goods Received Not Invoiced', type: 'Liability', balance: 0 },
  { code: '2035', name: 'Input Tax Recoverable', type: 'Asset', balance: 0 },
  { code: '3100', name: 'Opening Balance Equity', type: 'Equity', balance: 0 },
  { code: '4010', name: 'Sales Revenue', type: 'Revenue', balance: 0 },
  { code: '5010', name: 'Salaries Expense', type: 'OperatingExpense', balance: 0 },
  { code: '5020', name: 'Cost of Goods Sold', type: 'CostOfGoodsSold', balance: 0 },
  { code: '5100', name: 'Depreciation Expense', type: 'OperatingExpense', balance: 0 },
];

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
      searchFields: ['code', 'name', 'type', 'bankName', 'accountNumber'],
      statusField: 'type',
    }).items;
    const journalEntries = applyListQuery(await JournalEntry.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['voucherNumber', 'narration', 'referenceNumber', 'postedBy'],
    }).items;
    const expenses = applyListQuery(await ExpenseRecord.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['expenseNumber', 'title', 'category', 'paidTo', 'paidFromAccount', 'expenseAccountCode'],
    }).items;
    const incomes = applyListQuery(await IncomeRecord.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['incomeNumber', 'title', 'category', 'receivedFrom', 'receivedInAccount', 'incomeAccountCode'],
    }).items;

    const [suppliers, customers, salesOrders, posTransactions, purchaseOrders, purchaseReturns] = await Promise.all([
      Supplier.find({}).sort({ name: 1 }),
      Customer.find({}).sort({ name: 1 }),
      SalesOrder.find({}).sort({ createdAt: -1 }),
      POSTransaction.find({}).sort({ createdAt: -1 }),
      PurchaseOrder.find({}).sort({ createdAt: -1 }),
      PurchaseReturn.find({}).sort({ createdAt: -1 }),
    ]);

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
      incomes,
      suppliers,
      customers,
      salesOrders,
      posTransactions,
      purchaseOrders,
      purchaseReturns,
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

      // Resolve expense accounts from company mappings
      const company = await getCompanyContext();
      const mappings = company && company.accountingMappings ? company.accountingMappings : {};
      const missingMappingErr = validateMappingsPresent(mappings, [
        'expenseAccountCode',
        'cashAccountCode',
      ], 'expense posting');
      if (missingMappingErr) return errorResponse(missingMappingErr, 409);

      const expenseResult = await resolveAndValidateMapping(mappings, 'expenseAccountCode', 'OperatingExpense');
      if (expenseResult.error) return errorResponse(expenseResult.error, 400);
      const paymentResult = await resolveAndValidateMapping(mappings, 'cashAccountCode', 'Asset');
      if (paymentResult.error) return errorResponse(paymentResult.error, 400);

      const paymentAccountCode = paymentResult.account.code;
      const debitAccountCode = expenseResult.account.code;

      const existingPaymentAccount = paymentResult.account;
      const existingExpenseAccount = expenseResult.account;
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
      // All journal entries in this system are posted via postBalancedJournalEntry.
      // There is no draft journal concept. Posted historical journals must never
      // be physically deleted or silently overwritten. Use a reversal journal instead.
      return errorResponse(
        'Posted journal entries cannot be deleted. Use a reversal journal to offset the original entry.',
        409,
      );
    }

    if (action === 'CREATE_REVERSAL_JOURNAL') {
      return await runInTransaction(async () => {
        const { journalId, reason } = body;
        if (!journalId) return errorResponse('Original journal ID is required', 400);
        if (!reason || !String(reason).trim()) return errorResponse('A reversal reason is required', 400);

        const originalEntry = await JournalEntry.findByIdForUpdate(String(journalId));
        if (!originalEntry) return errorResponse('Original journal entry not found', 404);

        // Prevent reversal of a reversal journal
        if (String(originalEntry.voucherType || '') === 'Reversal') {
          return errorResponse('A reversal journal cannot be reversed', 409);
        }

        // Reject unsupported journal types: only production and procurement journals may be reversed
        const supportedTypes = ['GoodsReceipt', 'SupplierPayment', 'ProductionCompletion', 'ProductionMaterialConsumption', 'ScrapWriteOff', 'GRNIReconciliation', 'JournalVoucher'];
        if (!supportedTypes.includes(String(originalEntry.voucherType || ''))) {
          return errorResponse(`Journal type '${originalEntry.voucherType}' is not eligible for reversal`, 409);
        }

        // Reject if already reversed
        if (originalEntry.reversedBy) {
          return errorResponse('This journal entry has already been reversed', 409);
        }

        // Idempotency: prevent multiple reversals of the same original journal.
        // Use database-level uniqueness on sourceKey as the final safety net
        // against concurrent duplicate reversal requests.
        const reversalSourceKey = `REVERSAL:${originalEntry._id}`;
        const existingReversal = await JournalEntry.findOne({ sourceKey: reversalSourceKey });
        if (existingReversal) {
          return successResponse({
            journalEntry: existingReversal,
            reversal: true,
            duplicate: true,
          }, 'Reversal journal already exists for this entry', 200);
        }

        // Validate source ownership: the reversal references the original journal's
        // referenceNumber. For production-related journals, verify the ProductionOrder
        // exists and that the journal's referenceNumber matches that order's number.
        const referenceNumber = String(originalEntry.referenceNumber || '');
        if (['ProductionCompletion', 'ProductionMaterialConsumption', 'ScrapWriteOff'].includes(String(originalEntry.voucherType || ''))) {
          const relatedPo = await ProductionOrder.findOne({ productionOrderNumber: referenceNumber });
          if (!relatedPo) {
            return errorResponse(`No production order found for reference '${referenceNumber}'`, 409);
          }
        }

        // Build reversal lines with opposite debit/credit for every original line.
        // Full reversal only: every line of the original is reversed. No partial
        // reversal amounts are supported by this API.
        const originalLines = Array.isArray(originalEntry.lines) ? originalEntry.lines : [];
        if (originalLines.length < 2) {
          return errorResponse('Original journal entry has no valid lines to reverse', 409);
        }

        const reversalLines = [];
        let totalDebit = 0;
        let totalCredit = 0;
        for (const line of originalLines) {
          const debit = Number(line.credit || 0);
          const credit = Number(line.debit || 0);
          totalDebit += debit;
          totalCredit += credit;
          reversalLines.push({
            accountCode: line.accountCode,
            accountName: line.accountName,
            debit,
            credit,
            memo: `Reversal: ${line.memo || ''}`.trim(),
          });
        }

        if (!Number.isFinite(totalDebit) || !Number.isFinite(totalCredit) ||
          Math.abs(totalDebit - totalCredit) > 0.01) {
          return errorResponse('Original journal entry is unbalanced and cannot be reversed', 409);
        }

        // Lock all accounts in consistent order to prevent deadlocks
        const accountCodes = [...new Set(reversalLines.map((l) => l.accountCode))].sort();
        const lockedAccounts = new Map();
        for (const code of accountCodes) {
          const account = await AccountHead.findOne({ code });
          if (!account) return errorResponse(`Account ${code} no longer exists`, 409);
          const locked = await AccountHead.findByIdForUpdate(account._id);
          if (!locked) return errorResponse(`Account ${code} could not be locked`, 409);
          lockedAccounts.set(code, locked);
        }

        const sequence = await allocateSequence('journal_entry');
        const voucherNumber = `JV-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
        const reversalEntry = await JournalEntry.create({
          voucherNumber,
          sourceKey: reversalSourceKey,
          voucherType: 'Reversal',
          date: new Date(),
          narration: `Reversal of ${originalEntry.voucherNumber || originalEntry._id}: ${String(reason).trim()}`,
          referenceNumber: referenceNumber,
          lines: reversalLines,
          totalDebit,
          totalCredit,
          postedBy: actor?.name || '',
          reversalOf: originalEntry._id,
          originalVoucherNumber: originalEntry.voucherNumber || '',
        });

        // Update account balances for the reversal
        for (const line of reversalLines) {
          const account = lockedAccounts.get(line.accountCode);
          updateAccountBalance(account, line.debit, line.credit);
          await account.save();
        }

        // Record reversal reference on the original journal where compatible
        try {
          originalEntry.reversedBy = reversalEntry._id;
          originalEntry.reversalReason = String(reason).trim();
          originalEntry.reversedAt = new Date();
          await originalEntry.save();
        } catch {
          // Original journal may not support these fields; reversal is still valid
        }

        await AuditLog.create({
          userName: actor?.name || '',
          action: 'REVERSE_JOURNAL',
          module: 'Finance & Accounts',
          recordId: reversalEntry._id,
          description: `Reversed journal ${originalEntry.voucherNumber || originalEntry._id}: ${String(reason).trim()}`,
        });

        return successResponse({
          journalEntry: reversalEntry,
          reversalOf: originalEntry._id,
          originalVoucherNumber: originalEntry.voucherNumber || '',
        }, 'Reversal journal posted', 201);
      });
    }

    if (action === 'CREATE_INCOME') {
      const { title, category, amount, receivedInAccount, incomeAccountCode, receivedFrom, referenceNumber, postedBy } = body;
      const description = String(title || '').trim();
      const sourcePayer = String(receivedFrom || '').trim();
      const incomeAmount = Number(amount);
      if (!description || !category || !Number.isFinite(incomeAmount) || incomeAmount <= 0) {
        return errorResponse('Income title, category and a positive amount are required', 400);
      }
      if (!description || !category || !Number.isFinite(incomeAmount) || incomeAmount <= 0) {
        return errorResponse('Income title, category and a positive amount are required', 400);
      }

      // Resolve income accounts from company mappings
      const company = await getCompanyContext();
      const mappings = company && company.accountingMappings ? company.accountingMappings : {};
      const missingMappingErr = validateMappingsPresent(mappings, [
        'salesRevenueAccountCode',
        'cashAccountCode',
      ], 'income posting');
      if (missingMappingErr) return errorResponse(missingMappingErr, 409);

      const depositResult = await resolveAndValidateMapping(mappings, 'cashAccountCode', 'Asset');
      if (depositResult.error) return errorResponse(depositResult.error, 400);
      const revenueResult = await resolveAndValidateMapping(mappings, 'salesRevenueAccountCode', 'Revenue');
      if (revenueResult.error) return errorResponse(revenueResult.error, 400);

      const depositAccountCode = depositResult.account.code;
      const revenueAccountCode = revenueResult.account.code;
      const existingDepositAccount = depositResult.account;
      const existingRevenueAccount = revenueResult.account;
      const accountsByCode = new Map([
        [depositAccountCode, existingDepositAccount],
        [revenueAccountCode, existingRevenueAccount],
      ]);
      for (const accountCode of [...accountsByCode.keys()].sort()) {
        const account = await AccountHead.findByIdForUpdate(accountsByCode.get(accountCode)._id);
        if (!account) return errorResponse(`Account ${accountCode} no longer exists`, 409);
        accountsByCode.set(accountCode, account);
      }
      const depositAccount = accountsByCode.get(depositAccountCode);
      const revenueAccount = accountsByCode.get(revenueAccountCode);
      const sequence = await allocateSequence('income_record');
      const incomeNumber = `INC-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const income = await IncomeRecord.create({
        incomeNumber,
        title: description,
        category,
        amount: incomeAmount,
        receivedInAccount: depositAccountCode,
        incomeAccountCode: revenueAccountCode,
        paymentDate: new Date(),
        receivedFrom: sourcePayer,
        referenceNumber: referenceNumber || '',
        postedBy: postedBy || '',
      });

      const voucherSequence = await allocateSequence('journal_entry');
      const voucherNumber = `JV-${new Date().getFullYear()}-${String(voucherSequence).padStart(4, '0')}`;
      const journalEntry = await JournalEntry.create({
        voucherNumber,
        voucherType: 'Income',
        date: new Date(),
        narration: description,
        referenceNumber: incomeNumber,
        incomeId: income._id,
        lines: [
          { accountCode: depositAccountCode, accountName: depositAccount.name, debit: incomeAmount, credit: 0 },
          { accountCode: revenueAccountCode, accountName: revenueAccount.name, debit: 0, credit: incomeAmount },
        ],
        totalDebit: incomeAmount,
        totalCredit: incomeAmount,
        postedBy: postedBy || '',
      });
      income.journalEntryId = journalEntry._id;
      await income.save();
      updateAccountBalance(depositAccount, incomeAmount, 0);
      await depositAccount.save();
      updateAccountBalance(revenueAccount, 0, incomeAmount);
      await revenueAccount.save();

      return successResponse({ income, journalEntry }, 'Income logged and posted to accounts');
    }

    if (action === 'DELETE_INCOME') {
      const existingIncome = await IncomeRecord.findByIdForUpdate(body.incomeId);
      if (!existingIncome) return errorResponse('Income record not found', 404);
      if (existingIncome.journalEntryId || existingIncome.paymentDate) {
        return errorResponse('A posted income record is an immutable financial record and cannot be deleted', 409);
      }
      await IncomeRecord.deleteOne({ _id: existingIncome._id });
      return successResponse({ income: existingIncome }, 'Income deleted');
    }

    if (action === 'CREATE_BANK_ACCOUNT') {
      const { code, name, bankName, accountNumber, branchCode, openingBalance, postedBy } = body;
      const accountCode = String(code || '').trim();
      const accountName = String(name || '').trim();
      const bName = String(bankName || '').trim();
      const accNum = String(accountNumber || '').trim();

      // --- Opening balance validation (before any writes) ---
      // 1. Explicitly reject boolean values (true / false)
      if (typeof openingBalance === 'boolean') {
        return errorResponse('Opening balance must be a valid numeric amount, not a boolean', 400);
      }
      // 2. Explicitly reject objects and arrays
      if (typeof openingBalance === 'object' && openingBalance !== null) {
        return errorResponse('Opening balance must be a valid numeric amount, not an object or array', 400);
      }
      // 3. Explicitly reject empty or whitespace-only strings
      if (typeof openingBalance === 'string' && openingBalance.trim() === '') {
        return errorResponse('Opening balance cannot be an empty or whitespace-only string', 400);
      }
      // 4. Default omitted/null to 0, otherwise parse numeric value
      const rawBal = openingBalance == null ? 0 : openingBalance;
      const initialBal = Number(rawBal);
      if (!Number.isFinite(initialBal)) {
        return errorResponse('Opening balance must be a valid finite number (e.g. 0 or 50000.00)', 400);
      }
      if (initialBal < 0) {
        return errorResponse('Opening balance cannot be negative', 400);
      }
      // Round to 2 decimal places to avoid floating-point drift before writes
      const openingBal = Math.round(initialBal * 100) / 100;

      // --- Required field validation (before any writes) ---
      if (!accountCode || !accountName || !bName) {
        return errorResponse('Account code, display name, and bank name are required', 400);
      }

      // --- Wrap ALL database writes in a single atomic transaction ---
      // runInTransaction() uses AsyncLocalStorage so every pool.execute/query call
      // inside the callback (including model .create(), .save(), findByIdForUpdate())
      // automatically routes to the same transaction connection.
      //
      // allocateSequence() uses its own dedicated connection (outside the transaction)
      // by design — this means a rolled-back transaction may leave a gap in the
      // JV sequence. Sequence gaps in voucher numbering are acceptable and harmless.
      return runInTransaction(async () => {
        let account;

        const existingByCode = await AccountHead.findOne({ code: accountCode });
        if (existingByCode) {
          // Acquire row-level lock FIRST, then re-read state after lock is held.
          // This closes the TOCTOU window: a concurrent request will block here
          // until this transaction commits or rolls back.
          const lockedAccount = await AccountHead.findByIdForUpdate(existingByCode._id);
          if (!lockedAccount) {
            return errorResponse(`Account ${accountCode} no longer exists`, 409);
          }
          // Re-check configured status on the locked record (not the pre-lock snapshot)
          if (lockedAccount.bankName || lockedAccount.accountNumber) {
            return errorResponse(
              `Account code ${accountCode} is already in use by a configured bank account`,
              409
            );
          }
          // Safe to configure — account is locked and confirmed unconfigured
          lockedAccount.name = accountName;
          lockedAccount.isBank = true;
          lockedAccount.bankName = bName;
          lockedAccount.accountNumber = accNum;
          lockedAccount.branchCode = branchCode || '';
          await lockedAccount.save();
          account = lockedAccount;
        } else {
          // New account code — the DB UNIQUE constraint on `code` (uq_erp_account_head_code)
          // will reject a concurrent INSERT for the same code with ER_DUP_ENTRY (HTTP 409).
          // mysqlError() in mysql-model.js translates ER_DUP_ENTRY to a 409 error that
          // causes runInTransaction() to roll back this transaction automatically.
          account = await AccountHead.create({
            code: accountCode,
            name: accountName,
            type: 'Asset',
            balance: 0,
            isBank: true,
            bankName: bName,
            accountNumber: accNum,
            branchCode: branchCode || '',
          });
        }

        if (openingBal > 0) {
          // Resolve opening balance equity account from company mappings
          const company = await getCompanyContext();
          const mappings = company && company.accountingMappings ? company.accountingMappings : {};
          const equityResult = await resolveAndValidateMapping(mappings, 'openingBalanceEquityAccountCode', 'Equity');
          if (equityResult.error) return errorResponse(equityResult.error, 409);
          let equityAccount = equityResult.account;

          // Acquire row locks on both accounts in a consistent alphabetical order
          // to prevent deadlocks when concurrent requests target different accounts.
          const sortedCodes = [account.code, equityAccount.code].sort();
          const bankGoesFirst = sortedCodes[0] === account.code;
          const lockOrder = bankGoesFirst
            ? [account._id, equityAccount._id]
            : [equityAccount._id, account._id];
          const lockedFirst = await AccountHead.findByIdForUpdate(lockOrder[0]);
          const lockedSecond = await AccountHead.findByIdForUpdate(lockOrder[1]);
          if (!lockedFirst || !lockedSecond) {
            return errorResponse('One or more accounts could not be locked for the opening balance', 409);
          }
          const lockedBank = lockedFirst._id === account._id ? lockedFirst : lockedSecond;
          const lockedEquity = lockedFirst._id === equityAccount._id ? lockedFirst : lockedSecond;

          // Idempotency: use a deterministic sourceKey tied to this specific bank account's
          // opening balance configuration. The JournalEntry model has a DB-level UNIQUE index
          // on `sourceKey` (uq_erp_journal_entry_source_key). If two concurrent transactions
          // both reach JournalEntry.create() with the same sourceKey, MySQL will reject the
          // second INSERT with ER_DUP_ENTRY → mysqlError() throws a 409-status error →
          // runInTransaction() rolls back that transaction. This is DB-enforced idempotency.
          const obSourceKey = `OP-BANK-${accountCode}`;

          // Check for an existing opening balance JV before allocating a sequence number.
          // This avoids consuming a sequence slot on a duplicate request.
          const existingOBJv = await JournalEntry.findOne({ sourceKey: obSourceKey });
          if (existingOBJv) {
            // Opening balance already posted — return the already-configured account.
            // Balance updates were already applied in the prior successful request.
            return successResponse({ account }, 'Bank account registered successfully');
          }

          // allocateSequence uses its own dedicated connection (outside the transaction).
          // A sequence number is allocated here; if the transaction rolls back after this
          // point, the sequence number will be skipped (gap). This is intentional and safe.
          const vSeq = await allocateSequence('journal_entry');
          const vNum = `JV-${new Date().getFullYear()}-${String(vSeq).padStart(4, '0')}`;

          await JournalEntry.create({
            voucherNumber: vNum,
            sourceKey: obSourceKey,
            voucherType: 'OpeningBalance',
            date: new Date(),
            narration: `Opening balance for bank account ${bName} (${accountName})`,
            referenceNumber: `OP-${accountCode}`,
            lines: [
              { accountCode: lockedBank.code, accountName: lockedBank.name, debit: openingBal, credit: 0 },
              { accountCode: lockedEquity.code, accountName: lockedEquity.name, debit: 0, credit: openingBal },
            ],
            totalDebit: openingBal,
            totalCredit: openingBal,
            postedBy: postedBy || 'System',
          });

          updateAccountBalance(lockedBank, openingBal, 0);
          await lockedBank.save();
          updateAccountBalance(lockedEquity, 0, openingBal);
          await lockedEquity.save();
        }

        return successResponse({ account }, 'Bank account registered successfully');
      });
    }

    if (action === 'SET_OPENING_BALANCE') {
      const { targetType, targetId, amount, date, reference, postedBy, accountCode: explicitCode } = body;
      const numAmount = Number(amount);
      if (!Number.isFinite(numAmount) || numAmount <= 0) {
        return errorResponse('Opening balance amount must be a positive number', 400);
      }

      // Resolve opening balance equity account from company mappings
      const company = await getCompanyContext();
      const mappings = company && company.accountingMappings ? company.accountingMappings : {};
      const equityResult = await resolveAndValidateMapping(mappings, 'openingBalanceEquityAccountCode', 'Equity');
      if (equityResult.error) return errorResponse(equityResult.error, 409);
      let equityAccount = equityResult.account;

      if (targetType === 'ACCOUNT') {
        const accCode = String(explicitCode || '').trim();
        const targetAccount = await AccountHead.findOne({ code: accCode });
        if (!targetAccount) return errorResponse(`Account ${accCode} not found`, 404);
        const existingJV = await JournalEntry.findOne({
          voucherType: 'OpeningBalance',
          referenceNumber: `OP-${accCode}`,
        });
        if (existingJV) {
          return errorResponse(`Opening balance already recorded for account ${accCode} (${existingJV.voucherNumber})`, 409);
        }
        const isNormalDebit = ['Asset', 'CostOfGoodsSold', 'OperatingExpense'].includes(targetAccount.type);
        const lockedTarget = await AccountHead.findByIdForUpdate(targetAccount._id);
        const lockedEquity = await AccountHead.findByIdForUpdate(equityAccount._id);

        const vSeq = await allocateSequence('journal_entry');
        const vNum = `JV-${new Date().getFullYear()}-${String(vSeq).padStart(4, '0')}`;
        const lines = isNormalDebit
          ? [
              { accountCode: lockedTarget.code, accountName: lockedTarget.name, debit: numAmount, credit: 0 },
              { accountCode: lockedEquity.code, accountName: lockedEquity.name, debit: 0, credit: numAmount },
            ]
          : [
              { accountCode: lockedEquity.code, accountName: lockedEquity.name, debit: numAmount, credit: 0 },
              { accountCode: lockedTarget.code, accountName: lockedTarget.name, debit: 0, credit: numAmount },
            ];

        const jv = await JournalEntry.create({
          voucherNumber: vNum,
          voucherType: 'OpeningBalance',
          date: date ? new Date(date) : new Date(),
          narration: `Opening balance for ${lockedTarget.name} (${lockedTarget.code})`,
          referenceNumber: `OP-${accCode}`,
          lines,
          totalDebit: numAmount,
          totalCredit: numAmount,
          postedBy: postedBy || 'Admin',
        });
        if (isNormalDebit) {
          updateAccountBalance(lockedTarget, numAmount, 0);
          updateAccountBalance(lockedEquity, 0, numAmount);
        } else {
          updateAccountBalance(lockedTarget, 0, numAmount);
          updateAccountBalance(lockedEquity, numAmount, 0);
        }
        await lockedTarget.save();
        await lockedEquity.save();
        return successResponse({ journalEntry: jv }, 'Opening balance recorded successfully');
      }

      if (targetType === 'CUSTOMER') {
        const customer = await Customer.findByIdForUpdate(targetId);
        if (!customer) return errorResponse('Customer not found', 404);
        const existingJV = await JournalEntry.findOne({
          voucherType: 'OpeningBalance',
          referenceNumber: `OP-CUST-${customer._id}`,
        });
        if (existingJV) {
          return errorResponse(`Opening balance already recorded for customer ${customer.name}`, 409);
        }
        let arAccount = await AccountHead.findOne({ code: '1030' });
        if (!arAccount) {
          arAccount = await AccountHead.create({ code: '1030', name: 'Accounts Receivable', type: 'Asset', balance: 0 });
        }
        const lockedAR = await AccountHead.findByIdForUpdate(arAccount._id);
        const lockedEquity = await AccountHead.findByIdForUpdate(equityAccount._id);
        const vSeq = await allocateSequence('journal_entry');
        const vNum = `JV-${new Date().getFullYear()}-${String(vSeq).padStart(4, '0')}`;
        const jv = await JournalEntry.create({
          voucherNumber: vNum,
          voucherType: 'OpeningBalance',
          date: date ? new Date(date) : new Date(),
          narration: `Opening balance receivable for Customer: ${customer.name}`,
          referenceNumber: `OP-CUST-${customer._id}`,
          lines: [
            { accountCode: lockedAR.code, accountName: lockedAR.name, debit: numAmount, credit: 0 },
            { accountCode: lockedEquity.code, accountName: lockedEquity.name, debit: 0, credit: numAmount },
          ],
          totalDebit: numAmount,
          totalCredit: numAmount,
          postedBy: postedBy || 'Admin',
        });
        updateAccountBalance(lockedAR, numAmount, 0);
        updateAccountBalance(lockedEquity, 0, numAmount);
        await lockedAR.save();
        await lockedEquity.save();
        customer.balance = (customer.balance || 0) + numAmount;
        await customer.save();
        return successResponse({ journalEntry: jv, customer }, 'Customer opening balance recorded');
      }

      if (targetType === 'SUPPLIER') {
        const supplier = await Supplier.findByIdForUpdate(targetId);
        if (!supplier) return errorResponse('Supplier not found', 404);
        const existingJV = await JournalEntry.findOne({
          voucherType: 'OpeningBalance',
          referenceNumber: `OP-SUPP-${supplier._id}`,
        });
        if (existingJV) {
          return errorResponse(`Opening balance already recorded for supplier ${supplier.name}`, 409);
        }
        let apAccount = await AccountHead.findOne({ code: '2010' });
        if (!apAccount) {
          apAccount = await AccountHead.create({ code: '2010', name: 'Accounts Payable', type: 'Liability', balance: 0 });
        }
        const lockedAP = await AccountHead.findByIdForUpdate(apAccount._id);
        const lockedEquity = await AccountHead.findByIdForUpdate(equityAccount._id);
        const vSeq = await allocateSequence('journal_entry');
        const vNum = `JV-${new Date().getFullYear()}-${String(vSeq).padStart(4, '0')}`;
        const jv = await JournalEntry.create({
          voucherNumber: vNum,
          voucherType: 'OpeningBalance',
          date: date ? new Date(date) : new Date(),
          narration: `Opening balance payable for Supplier: ${supplier.name}`,
          referenceNumber: `OP-SUPP-${supplier._id}`,
          lines: [
            { accountCode: lockedEquity.code, accountName: lockedEquity.name, debit: numAmount, credit: 0 },
            { accountCode: lockedAP.code, accountName: lockedAP.name, debit: 0, credit: numAmount },
          ],
          totalDebit: numAmount,
          totalCredit: numAmount,
          postedBy: postedBy || 'Admin',
        });
        updateAccountBalance(lockedEquity, numAmount, 0);
        updateAccountBalance(lockedAP, 0, numAmount);
        await lockedAP.save();
        await lockedEquity.save();
        supplier.balance = (supplier.balance || 0) + numAmount;
        await supplier.save();
        return successResponse({ journalEntry: jv, supplier }, 'Supplier opening balance recorded');
      }

      return errorResponse('Invalid targetType for opening balance', 400);
    }

    if (action === 'ENSURE_DEFAULT_ACCOUNTS') {
      if (!await canAccessModule(actor, 'finance', 'write')) {
        return errorResponse('Finance write permission is required to ensure default accounts', 403);
      }
      return await runInTransaction(async () => {
        const created = [];
        const existing = [];
        for (const defAcc of DEFAULT_ACCOUNTS) {
          const existingAccount = await AccountHead.findOne({ code: defAcc.code });
          if (existingAccount) {
            existing.push({ code: defAcc.code, name: existingAccount.name, type: existingAccount.type, balance: existingAccount.balance });
          } else {
            const createdAccount = await AccountHead.create(defAcc);
            created.push({ code: defAcc.code, name: defAcc.name, type: defAcc.type, balance: defAcc.balance });
          }
        }
        return successResponse({ created, existing }, 'Default accounts ensured');
      });
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getFinance, 'finance');
export const POST = withAuthorization(postFinance, 'finance', 'write');
