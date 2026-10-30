import { createMySQLModel } from '@/lib/mysql-model.js';

export const POSTransaction = createMySQLModel('POSTransaction', ['receiptNumber']);
export const POSSession = createMySQLModel('POSSession', ['sessionCode']);
