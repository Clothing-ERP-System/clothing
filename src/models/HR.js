import { createMySQLModel } from '@/lib/mysql-model.js';

export const Employee = createMySQLModel('Employee', ['employeeCode', 'cnicKey']);
export const AttendanceRecord = createMySQLModel('AttendanceRecord', ['attendanceKey']);
export const PayrollSlip = createMySQLModel('PayrollSlip', ['payrollKey']);
