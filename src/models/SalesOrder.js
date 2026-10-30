import { createMySQLModel } from '@/lib/mysql-model.js';

export default createMySQLModel('SalesOrder', ['orderNumber']);
