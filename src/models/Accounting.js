import { createMySQLModel } from '@/lib/mysql-model.js';

export const AccountHead = createMySQLModel('AccountHead');
export const JournalEntry = createMySQLModel('JournalEntry', ['voucherNumber']);
export const ExpenseRecord = createMySQLModel('ExpenseRecord', ['expenseNumber']);
