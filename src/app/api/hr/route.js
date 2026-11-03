import { allocateSequence, connectDB } from '@/lib/db.js';
import { Employee, AttendanceRecord, PayrollSlip } from '@/models/HR.js';
import { AccountHead } from '@/models/Accounting.js';
import AuditLog from '@/models/AuditLog.js';
import { successResponse, errorResponse, fromError } from '@/lib/api-response.js';
import { applyListQuery, deleteRecord, parseListQuery, pickFields } from '@/lib/query.js';
import { withAuthorization } from '@/lib/authorization.js';
import { postBalancedJournalEntry } from '@/lib/accounting.js';

async function getHr(request) {
  try {
    await connectDB();
    const query = parseListQuery(request);
    const employees = applyListQuery(await Employee.find({}).sort({ name: 1 }), query, {
      searchFields: ['employeeCode', 'name', 'designation', 'department', 'phone', 'cnic'],
    }).items;
    const attendance = applyListQuery(await AttendanceRecord.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['employeeCode', 'employeeName', 'status'],
    }).items;
    const payrollSlips = applyListQuery(await PayrollSlip.find({}).sort({ createdAt: -1 }), query, {
      searchFields: ['employeeCode', 'employeeName', 'payrollMonth', 'designation'],
    }).items;
    const accounts = await AccountHead.find({}).sort({ code: 1 });

    return successResponse({
      employees,
      attendance,
      payrollSlips,
      financialAccounts: accounts.map(({ code, name, type }) => ({ code, name, type })),
    });
  } catch (error) {
    return fromError(error);
  }
}

async function postHr(request) {
  try {
    await connectDB();
    const body = await request.json();
    const { action } = body;

    if (action === 'CREATE_EMPLOYEE') {
      const { name, designation, department, employmentType, cnic, phone, baseSalaryPKR, pieceRatePerGarmentPKR, biometricPin } = body;
      const employeeName = String(name || '').trim();
      const baseSalary = Number(baseSalaryPKR ?? 0);
      const pieceRate = Number(pieceRatePerGarmentPKR ?? 0);
      const normalizedCnic = String(cnic || '').trim();
      if (!employeeName || !designation || !department ||
        !Number.isFinite(baseSalary) || baseSalary < 0 ||
        !Number.isFinite(pieceRate) || pieceRate < 0) {
        return errorResponse('Employee name, designation and department are required', 400);
      }
      if (normalizedCnic && await Employee.findOne({ cnicKey: normalizedCnic.toLowerCase() })) {
        return errorResponse('An employee with this CNIC already exists', 409);
      }
      const sequence = await allocateSequence('employee');
      const employeeCode = `EMP-${new Date().getFullYear()}-${String(sequence).padStart(4, '0')}`;

      const emp = await Employee.create({
        employeeCode,
        name: employeeName,
        designation,
        department,
        employmentType: employmentType || '',
        cnic: normalizedCnic,
        cnicKey: normalizedCnic ? normalizedCnic.toLowerCase() : undefined,
        phone,
        baseSalaryPKR: baseSalary,
        pieceRatePerGarmentPKR: pieceRate,
        biometricPin: biometricPin || '',
        status: 'Active',
      });

      return successResponse({ employee: emp }, 'Employee profile created');
    }

    if (action === 'BIOMETRIC_PUNCH') {
      const { employeeCode, status, checkInTime, checkOutTime } = body;
      const employeeRecord = await Employee.findOne({ employeeCode });
      const emp = employeeRecord ? await Employee.findByIdForUpdate(employeeRecord._id) : null;
      if (!emp) return errorResponse('Employee not found', 404);
      if (emp.status !== 'Active') return errorResponse('Attendance cannot be recorded for an inactive employee', 409);
      const attendanceStatus = status || 'Present';
      if (!['Present', 'Absent', 'Late', 'HalfDay', 'Leave'].includes(attendanceStatus)) {
        return errorResponse('Select a valid attendance status', 400);
      }
      const lateMinutes = Number(body.lateMinutes ?? 0);
      const overtimeHours = Number(body.overtimeHours ?? 0);
      if (!Number.isSafeInteger(lateMinutes) || lateMinutes < 0 ||
        !Number.isFinite(overtimeHours) || overtimeHours < 0) {
        return errorResponse('Late minutes and overtime hours must be non-negative valid quantities', 400);
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const punch = await AttendanceRecord.create({
        attendanceKey: `${emp.employeeCode}:${todayStr}`,
        employeeCode: emp.employeeCode,
        employeeName: emp.name,
        date: todayStr,
        checkInTime: checkInTime || '',
        checkOutTime: checkOutTime || '',
        status: attendanceStatus,
        lateMinutes,
        overtimeHours,
        biometricDeviceId: '',
      });

      return successResponse({ attendance: punch }, 'Biometric attendance registered');
    }

    if (action === 'GENERATE_PAYROLL') {
      const {
        month,
        employeeCode,
        piecesProduced,
        daysWorked,
        overtimeHours,
        expenseAccountCode,
        payableAccountCode,
      } = body;
      const payrollMonth = String(month || '').trim();
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(payrollMonth)) {
        return errorResponse('Payroll month must use YYYY-MM format', 400);
      }
      const employeeRecord = await Employee.findOne({ employeeCode });
      const emp = employeeRecord ? await Employee.findByIdForUpdate(employeeRecord._id) : null;
      if (!emp) return errorResponse('Employee not found', 404);
      if (emp.status !== 'Active') return errorResponse('Payroll cannot be generated for an inactive employee', 409);
      const pieces = Number(piecesProduced ?? 0);
      const days = Number(daysWorked ?? 0);
      const overtime = Number(overtimeHours ?? 0);
      const overtimeRate = Number(body.overtimeRate ?? 0);
      if (!Number.isSafeInteger(pieces) || pieces < 0 ||
        !Number.isSafeInteger(days) || days < 0 || days > 31 ||
        !Number.isFinite(overtime) || overtime < 0 ||
        !Number.isFinite(overtimeRate) || overtimeRate < 0) {
        return errorResponse('Payroll quantities and overtime rate must be valid non-negative values', 400);
      }
      const payrollKey = `${emp.employeeCode}:${payrollMonth}`;
      if (await PayrollSlip.findOne({ payrollKey })) {
        return errorResponse('Payroll has already been generated for this employee and month', 409);
      }

      let basicOrPiecePay = 0;
      if (emp.employmentType === 'PieceRateTailor') {
        basicOrPiecePay = pieces * (Number(emp.pieceRatePerGarmentPKR) || 0);
      } else {
        basicOrPiecePay = Number(emp.baseSalaryPKR) || 0;
      }

      const overtimePay = overtime * overtimeRate;
      const netPayablePKR = basicOrPiecePay + overtimePay;
      if (!Number.isFinite(netPayablePKR) || netPayablePKR <= 0) {
        return errorResponse('Payroll amount must be a positive, supported value before it can be posted', 400);
      }
      const expenseAccount = await AccountHead.findOne({ code: expenseAccountCode });
      const payableAccount = await AccountHead.findOne({ code: payableAccountCode });
      if (!expenseAccount || expenseAccount.type !== 'OperatingExpense' ||
        !payableAccount || payableAccount.type !== 'Liability') {
        return errorResponse('Select a payroll operating-expense account and a payroll payable liability account', 400);
      }

      const slip = await PayrollSlip.create({
        payrollKey,
        payrollMonth,
        employeeCode: emp.employeeCode,
        employeeName: emp.name,
        designation: emp.designation,
        daysWorked: days,
        piecesProduced: pieces,
        basicOrPiecePay,
        overtimePay,
        allowances: 0,
        taxDeduction: 0,
        loanAdvanceDeduction: 0,
        netPayablePKR,
        paymentStatus: 'Pending',
        expenseAccountCode: expenseAccount.code,
        payableAccountCode: payableAccount.code,
      });
      const { entry } = await postBalancedJournalEntry({
        sourceKey: `PAYROLL_ACCRUAL:${payrollKey}`,
        voucherType: 'PayrollAccrual',
        narration: `Payroll accrual for ${emp.name} (${payrollMonth})`,
        referenceNumber: payrollKey,
        lines: [
          {
            accountCode: expenseAccount.code,
            debit: netPayablePKR,
            credit: 0,
            memo: `Payroll expense for ${emp.name}`,
          },
          {
            accountCode: payableAccount.code,
            debit: 0,
            credit: netPayablePKR,
            memo: `Payroll payable for ${emp.name}`,
          },
        ],
      });
      slip.financialEntryId = entry._id;
      await slip.save();

      await AuditLog.create({
        userName: '',
        action: 'CREATE',
        module: 'Human Resources',
        recordId: emp.employeeCode,
        description: `Generated payroll slip for ${emp.name} (${payrollMonth}) - Net: Rs. ${netPayablePKR.toLocaleString()}`,
      });

      return successResponse({ payrollSlip: slip }, 'Payroll slip generated');
    }

    if (action === 'PAY_PAYROLL') {
      const payrollRecord = await PayrollSlip.findById(body.payrollSlipId);
      const slip = payrollRecord ? await PayrollSlip.findByIdForUpdate(payrollRecord._id) : null;
      if (!slip) return errorResponse('Payroll slip not found', 404);
      if (slip.paymentStatus === 'Paid') {
        return successResponse({ payrollSlip: slip }, 'Payroll was already paid');
      }
      if (slip.paymentStatus !== 'Pending' || !slip.payableAccountCode) {
        return errorResponse('Only accrued, unpaid payroll can be paid', 409);
      }
      if (!['Cash', 'BankTransfer', 'Cheque'].includes(body.method)) {
        return errorResponse('Select a valid payroll payment method', 400);
      }
      const paymentAccount = await AccountHead.findOne({ code: body.paymentAccountCode });
      if (!paymentAccount || paymentAccount.type !== 'Asset') {
        return errorResponse('Select an existing asset cash or bank account for payroll payment', 400);
      }
      const amount = Number(slip.netPayablePKR);
      if (!Number.isFinite(amount) || amount <= 0) {
        return errorResponse('Payroll slip has an invalid payment amount', 409);
      }
      const { entry } = await postBalancedJournalEntry({
        sourceKey: `PAYROLL_PAYMENT:${slip.payrollKey}`,
        voucherType: 'PayrollPayment',
        narration: `Payroll payment to ${slip.employeeName} (${slip.payrollMonth})`,
        referenceNumber: String(body.referenceNumber || slip.payrollKey),
        postedBy: String(body.paidBy || ''),
        lines: [
          {
            accountCode: slip.payableAccountCode,
            debit: amount,
            credit: 0,
            memo: `Settle payroll payable for ${slip.employeeName}`,
          },
          {
            accountCode: paymentAccount.code,
            debit: 0,
            credit: amount,
            memo: `Payroll payment to ${slip.employeeName}`,
          },
        ],
      });
      slip.paymentStatus = 'Paid';
      slip.payment = {
        amount,
        method: String(body.method || ''),
        referenceNumber: String(body.referenceNumber || ''),
        paidBy: String(body.paidBy || ''),
        paidAt: new Date(),
        financialEntryId: entry._id,
      };
      await slip.save();
      await AuditLog.create({
        userName: slip.payment.paidBy,
        action: 'PAYMENT',
        module: 'Human Resources',
        recordId: slip.payrollKey,
        description: `Paid payroll of Rs. ${amount.toLocaleString()} to ${slip.employeeName}`,
      });
      return successResponse({ payrollSlip: slip }, 'Payroll payment recorded');
    }

    if (action === 'UPDATE_EMPLOYEE') {
      const employee = await Employee.findByIdForUpdate(body.employeeId);
      if (!employee) return errorResponse('Employee not found', 404);
      const updates = pickFields(body, [
        'name', 'designation', 'department', 'employmentType', 'cnic', 'phone',
        'baseSalaryPKR', 'pieceRatePerGarmentPKR', 'biometricPin', 'status',
      ]);
      if (updates.name !== undefined) updates.name = String(updates.name).trim();
      if (updates.name !== undefined && !updates.name) return errorResponse('Employee name cannot be empty', 400);
      if (updates.status !== undefined && !['Active', 'Inactive'].includes(updates.status)) {
        return errorResponse('Select a valid employee status', 400);
      }
      if (updates.cnic !== undefined) {
        updates.cnic = String(updates.cnic || '').trim();
        updates.cnicKey = updates.cnic ? updates.cnic.toLowerCase() : undefined;
        if (updates.cnicKey) {
          const duplicate = await Employee.findOne({ cnicKey: updates.cnicKey });
          if (duplicate && duplicate._id !== employee._id) {
            return errorResponse('An employee with this CNIC already exists', 409);
          }
        }
      }
      for (const field of ['baseSalaryPKR', 'pieceRatePerGarmentPKR']) {
        if (updates[field] !== undefined &&
          (!Number.isFinite(Number(updates[field])) || Number(updates[field]) < 0)) {
          return errorResponse('Employee pay rates must be non-negative valid amounts', 400);
        }
        if (updates[field] !== undefined) updates[field] = Number(updates[field]);
      }
      Object.assign(employee, updates);
      await employee.save();
      return successResponse({ employee }, 'Employee updated');
    }

    if (action === 'DELETE_EMPLOYEE') {
      const employee = await Employee.findByIdForUpdate(body.employeeId);
      if (!employee) return errorResponse('Employee not found', 404);
      const [attendance, payroll] = await Promise.all([
        AttendanceRecord.find({ employeeCode: employee.employeeCode }),
        PayrollSlip.find({ employeeCode: employee.employeeCode }),
      ]);
      if (attendance.length || payroll.length) {
        return errorResponse('An employee with attendance or payroll history cannot be deleted', 409);
      }
      await Employee.deleteOne({ _id: employee._id });
      return successResponse({ employee }, 'Employee deleted');
    }

    if (action === 'DELETE_ATTENDANCE') {
      const attendance = await deleteRecord(AttendanceRecord, body.attendanceId);
      if (!attendance) return errorResponse('Attendance record not found', 404);
      return successResponse({ attendance }, 'Attendance deleted');
    }

    if (action === 'DELETE_PAYROLL') {
      const payrollSlip = await PayrollSlip.findById(body.payrollId);
      if (!payrollSlip) return errorResponse('Payroll slip not found', 404);
      if (payrollSlip.paymentStatus !== 'Pending') {
        return errorResponse('A paid payroll slip cannot be deleted', 409);
      }
      await PayrollSlip.deleteOne({ _id: payrollSlip._id });
      return successResponse({ payrollSlip }, 'Payroll slip deleted');
    }

    return errorResponse('Invalid action', 400);
  } catch (error) {
    return fromError(error);
  }
}

export const GET = withAuthorization(getHr, 'hr');
export const POST = withAuthorization(postHr, 'hr', 'write');
