import { createMySQLModel } from '@/lib/mysql-model.js';

export const Employee = createMySQLModel('Employee', ['employeeCode']);
export const AttendanceRecord = createMySQLModel('AttendanceRecord');
export const PayrollSlip = createMySQLModel('PayrollSlip');
