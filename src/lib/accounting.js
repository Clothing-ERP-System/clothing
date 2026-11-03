import { allocateSequence } from '@/lib/db.js';
import { AccountHead, JournalEntry } from '@/models/Accounting.js';

function accountingError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function updateBalance(account, debit, credit) {
  const normalDebit = ['Asset', 'CostOfGoodsSold', 'OperatingExpense'].includes(account.type);
  const movement = normalDebit ? debit - credit : credit - debit;
  const balance = Number(account.balance || 0) + movement;
  if (!Number.isFinite(balance)) throw accountingError(`Account ${account.code} balance is outside the supported range`, 409);
  account.balance = balance;
}

export async function postBalancedJournalEntry({
  sourceKey,
  voucherType,
  narration,
  referenceNumber,
  postedBy,
  lines,
}) {
  const existing = sourceKey ? await JournalEntry.findOne({ sourceKey }) : null;
  if (existing) return { entry: existing, duplicate: true };
  if (!Array.isArray(lines) || lines.length < 2) throw accountingError('At least two journal lines are required');

  let totalDebit = 0;
  let totalCredit = 0;
  const accounts = new Map();
  const validatedLines = [];
  for (const line of lines) {
    const accountCode = String(line.accountCode || '').trim();
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    if (!accountCode || !Number.isFinite(debit) || !Number.isFinite(credit) ||
      debit < 0 || credit < 0 || (debit === 0 && credit === 0) || (debit > 0 && credit > 0)) {
      throw accountingError('Each journal line needs an account and exactly one non-negative debit or credit');
    }
    const account = await AccountHead.findOne({ code: accountCode });
    if (!account) throw accountingError(`Finance account ${accountCode} does not exist`, 409);
    accounts.set(accountCode, account);
    totalDebit += debit;
    totalCredit += credit;
    validatedLines.push({
      accountCode,
      accountName: account.name,
      debit,
      credit,
      memo: String(line.memo || ''),
    });
  }
  if (!Number.isFinite(totalDebit) || !Number.isFinite(totalCredit) ||
    Math.abs(totalDebit - totalCredit) > 0.01) {
    throw accountingError('Journal entry must have equal, finite debit and credit totals');
  }
  for (const code of [...accounts.keys()].sort()) {
    const locked = await AccountHead.findByIdForUpdate(accounts.get(code)._id);
    if (!locked) throw accountingError(`Finance account ${code} no longer exists`, 409);
    accounts.set(code, locked);
  }
  const sequence = await allocateSequence('journal_entry');
  const voucherNumber = `JV-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;
  const entry = await JournalEntry.create({
    voucherNumber,
    sourceKey: sourceKey || '',
    voucherType: voucherType || 'JournalVoucher',
    date: new Date(),
    narration,
    referenceNumber: referenceNumber || '',
    lines: validatedLines,
    totalDebit,
    totalCredit,
    postedBy: postedBy || '',
  });
  for (const line of validatedLines) {
    const account = accounts.get(line.accountCode);
    updateBalance(account, line.debit, line.credit);
    await account.save();
  }
  return { entry, duplicate: false };
}
