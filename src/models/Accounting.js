import { createMySQLModel } from '@/lib/mysql-model.js';

export const AccountHead = createMySQLModel('AccountHead', ['code']);
export const JournalEntry = createMySQLModel('JournalEntry', ['voucherNumber', 'sourceKey']);
export const ExpenseRecord = createMySQLModel('ExpenseRecord', ['expenseNumber']);
