'use client';

import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import {
  UserCheck,
  Plus,
  Fingerprint,
  Calendar,
  DollarSign,
  Clock,
  Printer,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
} from 'lucide-react';

export default function HRBiometricsPage() {
  const { addToast } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('employees'); // 'employees', 'attendance', 'payroll', 'biometric'

  // Modals
  const [isAddEmpOpen, setIsAddEmpOpen] = useState(false);
  const [isBiometricPunchOpen, setIsBiometricPunchOpen] = useState(false);
  const [isPayrollOpen, setIsPayrollOpen] = useState(false);

  // New Emp Form
  const [newEmp, setNewEmp] = useState({
    name: '',
    designation: '',
    department: '',
    employmentType: '',
    cnic: '',
    phone: '',
    baseSalaryPKR: '',
    pieceRatePerGarmentPKR: '',
    biometricPin: '',
  });

  // Punch Form
  const [punchForm, setPunchForm] = useState({
    employeeCode: '',
    status: '',
    checkInTime: '',
    checkOutTime: '',
  });

  // Payroll Form
  const [payrollForm, setPayrollForm] = useState({
    month: '',
    employeeCode: '',
    piecesProduced: '',
    daysWorked: '',
    overtimeHours: '',
  });

  const fetchData = async () => {
    try {
      const res = await fetch('/api/hr');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (err) {
      console.error('Error fetching HR data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, []);

  const handleCreateEmp = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/hr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_EMPLOYEE', ...newEmp }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create employee', 'error');
        return;
      }
      addToast('Employee profile added!', 'success');
      setIsAddEmpOpen(false);
      fetchData();
    } catch {
      addToast('Error saving employee', 'error');
    }
  };

  const handlePunch = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/hr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'BIOMETRIC_PUNCH', ...punchForm }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Punch failed', 'error');
        return;
      }
      addToast(`Biometric fingerprint punch logged for ${punchForm.employeeCode}!`, 'success');
      setIsBiometricPunchOpen(false);
      fetchData();
    } catch {
      addToast('Error logging biometric punch', 'error');
    }
  };

  const handleGeneratePayroll = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/hr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'GENERATE_PAYROLL', ...payrollForm }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Payroll generation failed', 'error');
        return;
      }
      addToast('Monthly payslip generated successfully!', 'success');
      setIsPayrollOpen(false);
      fetchData();
    } catch {
      addToast('Error generating payroll', 'error');
    }
  };

  const employees = data?.employees || [];
  const attendance = data?.attendance || [];
  const payrollSlips = data?.payrollSlips || [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-[#4F46E5] border border-indigo-100">
                WORKFORCE & COMPENSATION
              </span>
              <span className="text-xs text-slate-500">• Human Resources & Biometric Machine</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Human Resources, Biometrics & Piece-Rate Payroll
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Manage employee records, attendance, piece-rate earnings and payroll
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsBiometricPunchOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Fingerprint className="w-3.5 h-3.5 text-indigo-600" />
              <span>Simulate Biometric Punch</span>
            </button>

            <button
              onClick={() => setIsAddEmpOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add Employee</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('employees')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'employees'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Staff Directory ({employees.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'attendance'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Biometric Attendance ({attendance.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('payroll')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'payroll'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Payroll Slips ({payrollSlips.length})</span>
          </button>
        </div>

        {/* Tab 1: Staff Directory */}
        {activeTab === 'employees' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {employees.map((emp) => (
              <div key={emp._id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-[#4F46E5]">{emp.employeeCode}</span>
                    <h3 className="text-sm font-bold text-slate-900 leading-snug">{emp.name}</h3>
                    <p className="text-xs text-slate-500">{emp.designation} • {emp.department}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700">
                    {emp.employmentType}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <div className="flex justify-between">
                    <span className="text-slate-400">CNIC:</span>
                    <span className="font-mono text-slate-800">{emp.cnic}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Phone:</span>
                    <span className="font-mono text-slate-800">{emp.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Rate / Salary:</span>
                    <span className="font-bold text-emerald-600">
                      {emp.employmentType === 'PieceRateTailor'
                        ? `Rs. ${emp.pieceRatePerGarmentPKR}/Garment`
                        : `Rs. ${emp.baseSalaryPKR?.toLocaleString()}/Month`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Biometric PIN:</span>
                    <span className="font-mono font-bold text-indigo-600">#{emp.biometricPin}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 2: Biometric Attendance Log */}
        {activeTab === 'attendance' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Biometric Device Punch Logs</h3>
                <p className="text-xs text-slate-500">Connected: ZK-TECO-FACTORY-MAIN (TCP/IP Port 4370)</p>
              </div>
              <button
                onClick={() => setIsBiometricPunchOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA]"
              >
                <Fingerprint className="w-3.5 h-3.5" />
                <span>Simulate Device Punch</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Emp Code</th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Check-In</th>
                    <th className="py-3 px-4">Check-Out</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Device Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendance.map((att) => {
                    let badge = 'bg-emerald-100 text-emerald-800';
                    if (att.status === 'Late') badge = 'bg-amber-100 text-amber-800';
                    if (att.status === 'Absent') badge = 'bg-red-100 text-red-800';

                    return (
                      <tr key={att._id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono text-slate-500">{att.date}</td>
                        <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{att.employeeCode}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{att.employeeName}</td>
                        <td className="py-3 px-4 font-mono text-slate-700 font-medium">{att.checkInTime}</td>
                        <td className="py-3 px-4 font-mono text-slate-700 font-medium">{att.checkOutTime}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge}`}>
                            {att.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">{att.biometricDeviceId}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Payroll Slips */}
        {activeTab === 'payroll' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Monthly Compensation & Piece-Rate Payslips</h3>
                <p className="text-xs text-slate-500">Calculate wages from production pieces produced or monthly salary</p>
              </div>
              <button
                onClick={() => setIsPayrollOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Generate Payslip</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                    <th className="py-3 px-4">Month</th>
                    <th className="py-3 px-4">Emp Code & Name</th>
                    <th className="py-3 px-4">Days Worked</th>
                    <th className="py-3 px-4">Pieces Produced</th>
                    <th className="py-3 px-4">Basic / Piece Pay</th>
                    <th className="py-3 px-4">Overtime</th>
                    <th className="py-3 px-4 font-bold text-slate-900">Net Payable</th>
                    <th className="py-3 px-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payrollSlips.map((p) => (
                    <tr key={p._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-semibold text-slate-700">{p.payrollMonth}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{p.employeeName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{p.employeeCode} • {p.designation}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">{p.daysWorked} Days</td>
                      <td className="py-3 px-4 font-bold text-indigo-600">
                        {p.piecesProduced > 0 ? `${p.piecesProduced} pcs` : '-'}
                      </td>
                      <td className="py-3 px-4 text-slate-700">Rs. {p.basicOrPiecePay?.toLocaleString()}</td>
                      <td className="py-3 px-4 text-slate-700">Rs. {p.overtimePay?.toLocaleString()}</td>
                      <td className="py-3 px-4 font-black text-slate-900">
                        Rs. {p.netPayablePKR?.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          {p.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Add Employee */}
        <Modal
          isOpen={isAddEmpOpen}
          onClose={() => setIsAddEmpOpen(false)}
          title="Create Employee Profile"
          subtitle="Register salaried staff, master cutter, or piece-rate stitching tailors"
        >
          <form onSubmit={handleCreateEmp} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Employee Full Name</label>
                <input
                  type="text"
                  required
                  value={newEmp.name}
                  onChange={(e) => setNewEmp({ ...newEmp, name: e.target.value })}
                  placeholder="Employee name"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Designation</label>
                <input
                  type="text"
                  required
                  value={newEmp.designation}
                  onChange={(e) => setNewEmp({ ...newEmp, designation: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
                <select
                  value={newEmp.department}
                  onChange={(e) => setNewEmp({ ...newEmp, department: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="Stitching">Stitching Floor</option>
                  <option value="Cutting">Cutting Section</option>
                  <option value="Quality Assurance">Quality Assurance</option>
                  <option value="Dyeing">Dyeing & Processing</option>
                  <option value="Warehouse">Warehouse & Logistics</option>
                  <option value="Administration">Administration & HR</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Employment Type</label>
                <select
                  value={newEmp.employmentType}
                  onChange={(e) => setNewEmp({ ...newEmp, employmentType: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="PieceRateTailor">Piece-Rate Tailor</option>
                  <option value="Salaried">Salaried Staff</option>
                  <option value="ContractWorker">Contract Worker</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {newEmp.employmentType === 'PieceRateTailor' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Piece Rate per Garment (PKR)</label>
                  <input
                    type="number"
                    required
                    value={newEmp.pieceRatePerGarmentPKR}
                    onChange={(e) => setNewEmp({ ...newEmp, pieceRatePerGarmentPKR: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Base Monthly Salary (PKR)</label>
                  <input
                    type="number"
                    required
                    value={newEmp.baseSalaryPKR}
                    onChange={(e) => setNewEmp({ ...newEmp, baseSalaryPKR: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Biometric Device PIN</label>
                <input
                  type="text"
                  required
                  value={newEmp.biometricPin}
                  onChange={(e) => setNewEmp({ ...newEmp, biometricPin: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">CNIC Number</label>
                <input
                  type="text"
                  required
                  value={newEmp.cnic}
                  onChange={(e) => setNewEmp({ ...newEmp, cnic: e.target.value })}
                  placeholder="35201-XXXXXXX-X"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Contact Phone</label>
                <input
                  type="text"
                  required
                  value={newEmp.phone}
                  onChange={(e) => setNewEmp({ ...newEmp, phone: e.target.value })}
                  placeholder="0300-XXXXXXX"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddEmpOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm"
              >
                Save Employee
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Biometric Punch */}
        <Modal
          isOpen={isBiometricPunchOpen}
          onClose={() => setIsBiometricPunchOpen(false)}
          title="Simulate Biometric Fingerprint Check-In"
          subtitle="Transmits terminal attendance event from factory floor"
        >
          <form onSubmit={handlePunch} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Select Employee</label>
              <select
                value={punchForm.employeeCode}
                onChange={(e) => setPunchForm({ ...punchForm, employeeCode: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              >
                {employees.map((e) => (
                  <option key={e._id} value={e.employeeCode}>
                    {e.name} ({e.employeeCode} - {e.designation})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Punch Status</label>
                <select
                  value={punchForm.status}
                  onChange={(e) => setPunchForm({ ...punchForm, status: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="Present">Present</option>
                  <option value="Late">Late (+15m)</option>
                  <option value="HalfDay">HalfDay</option>
                  <option value="Absent">Absent</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Check-In Time</label>
                <input
                  type="text"
                  value={punchForm.checkInTime}
                  onChange={(e) => setPunchForm({ ...punchForm, checkInTime: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Check-Out Time</label>
                <input
                  type="text"
                  value={punchForm.checkOutTime}
                  onChange={(e) => setPunchForm({ ...punchForm, checkOutTime: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBiometricPunchOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
              >
                Simulate Punch
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Generate Payroll */}
        <Modal
          isOpen={isPayrollOpen}
          onClose={() => setIsPayrollOpen(false)}
          title="Generate Monthly Compensation Payslip"
          subtitle="Calculates wages from pieces produced or salaried attendance"
        >
          <form onSubmit={handleGeneratePayroll} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Employee</label>
                <select
                  value={payrollForm.employeeCode}
                  onChange={(e) => setPayrollForm({ ...payrollForm, employeeCode: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  {employees.map((e) => (
                    <option key={e._id} value={e.employeeCode}>
                      {e.name} ({e.employmentType})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payroll Month</label>
                <input
                  type="text"
                  required
                  value={payrollForm.month}
                  onChange={(e) => setPayrollForm({ ...payrollForm, month: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pieces Produced</label>
                <input
                  type="number"
                  value={payrollForm.piecesProduced}
                  onChange={(e) => setPayrollForm({ ...payrollForm, piecesProduced: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Days Worked</label>
                <input
                  type="number"
                  value={payrollForm.daysWorked}
                  onChange={(e) => setPayrollForm({ ...payrollForm, daysWorked: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Overtime Hours</label>
                <input
                  type="number"
                  value={payrollForm.overtimeHours}
                  onChange={(e) => setPayrollForm({ ...payrollForm, overtimeHours: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsPayrollOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
              >
                Generate Payslip
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </Layout>
  );
}
