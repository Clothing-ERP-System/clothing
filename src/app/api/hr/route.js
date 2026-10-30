import { allocateSequence, connectDB } from '@/lib/db.js';
import { Employee, AttendanceRecord, PayrollSlip } from '@/models/HR.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse } from '@/lib/api-response.js';

export async function GET() {
  try {
    await connectDB();
    const employees = await Employee.find({}).sort({ name: 1 });
    const attendance = await AttendanceRecord.find({}).sort({ createdAt: -1 }).limit(50);
    const payrollSlips = await PayrollSlip.find({}).sort({ createdAt: -1 });

    return successResponse({
      employees,
      attendance,
      payrollSlips,
    });
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_EMPLOYEE') {
      const { name, designation, department, employmentType, cnic, phone, baseSalaryPKR, pieceRatePerGarmentPKR, biometricPin } = body;
      if (!name || !designation || !department) {
        return errorResponse('Employee name, designation and department are required', 400);
      }
      const sequence = await allocateSequence('employee');
      const employeeCode = `EMP-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const emp = await Employee.create({
        employeeCode,
        name,
        designation,
        department,
        employmentType: employmentType || '',
        cnic,
        phone,
        baseSalaryPKR: Number(baseSalaryPKR) || 0,
        pieceRatePerGarmentPKR: Number(pieceRatePerGarmentPKR) || 0,
        biometricPin: biometricPin || '',
        status: 'Active',
      });

      return successResponse({ employee: emp }, 'Employee profile created');
    }

    if (action === 'BIOMETRIC_PUNCH') {
      const { employeeCode, status, checkInTime, checkOutTime } = body;
      const emp = await Employee.findOne({ employeeCode });
      if (!emp) return errorResponse('Employee not found', 404);

      const todayStr = new Date().toISOString().split('T')[0];
      const punch = await AttendanceRecord.create({
        employeeCode: emp.employeeCode,
        employeeName: emp.name,
        date: todayStr,
        checkInTime: checkInTime || '',
        checkOutTime: checkOutTime || '',
        status: status || 'Present',
        lateMinutes: Number(body.lateMinutes) || 0,
        overtimeHours: Number(body.overtimeHours) || 0,
        biometricDeviceId: '',
      });

      return successResponse({ attendance: punch }, 'Biometric attendance registered');
    }

    if (action === 'GENERATE_PAYROLL') {
      const { month, employeeCode, piecesProduced, daysWorked, overtimeHours } = body;
      if (!month) return errorResponse('Payroll month is required', 400);
      const emp = await Employee.findOne({ employeeCode });
      if (!emp) return errorResponse('Employee not found', 404);

      let basicOrPiecePay = 0;
      if (emp.employmentType === 'PieceRateTailor') {
        basicOrPiecePay = (Number(piecesProduced) || 0) * (emp.pieceRatePerGarmentPKR || 0);
      } else {
        basicOrPiecePay = emp.baseSalaryPKR || 0;
      }

      const overtimePay = (Number(overtimeHours) || 0) * (Number(body.overtimeRate) || 0);
      const netPayablePKR = basicOrPiecePay + overtimePay;

      const slip = await PayrollSlip.create({
        payrollMonth: month || '',
        employeeCode: emp.employeeCode,
        employeeName: emp.name,
        designation: emp.designation,
        daysWorked: Number(daysWorked) || 0,
        piecesProduced: Number(piecesProduced) || 0,
        basicOrPiecePay,
        overtimePay,
        allowances: 0,
        taxDeduction: 0,
        loanAdvanceDeduction: 0,
        netPayablePKR,
        paymentStatus: 'Pending',
      });

      await AuditLog.create({
        userName: '',
        action: 'CREATE',
        module: 'Human Resources',
        recordId: emp.employeeCode,
        description: `Generated payroll slip for ${emp.name} (${month}) - Net: Rs. ${netPayablePKR.toLocaleString()}`,
      });

      return successResponse({ payrollSlip: slip }, 'Payroll slip generated');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
}
