import { createMySQLModel } from '@/lib/mysql-model.js';

export default createMySQLModel('PurchaseReturn', ['returnNumber', 'returnRequestId']);

