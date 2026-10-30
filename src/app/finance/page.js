'use client';

import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import {
  DollarSign,
  Plus,
  Scale,
  FileText,
  TrendingUp,
  Receipt,
  Building,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Trash2,
} from 'lucide-react';

export default function FinanceAccountsPage() {
  const { addToast } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary'); // 'summary', 'accounts', 'journals', 'expenses'

  // Modals
  const [isNewJVOpen, setIsNewJVOpen] = useState(false);
  const [isNewExpenseOpen, setIsNewExpenseOpen] = useState(false);

  // New Journal Voucher Form
  const [newJV, setNewJV] = useState({
    narration: '',
    referenceNumber: '',
    postedBy: '',
    lines: [
      { accountCode: '', accountName: '', debit: '', credit: '', memo: '' },
      { accountCode: '', accountName: '', debit: '', credit: '', memo: '' },
    ],
  });

  // New Expense Form
  const [newExpense, setNewExpense] = useState({
    title: '',
    category: '',
    amount: '',
    paidFromAccount: '',
    paidTo: '',
    approvedBy: '',
  });

  const fetchData = async () => {
    try {
      const res = await fetch('/api/finance');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (err) {
      console.error('Error fetching finance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, []);

  const handleCreateJV = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_JOURNAL_VOUCHER', ...newJV }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Journal Voucher failed to post', 'error');
        return;
      }
      addToast(`Journal Voucher ${json.data.journalEntry?.voucherNumber} posted!`, 'success');
      setIsNewJVOpen(false);
      fetchData();
    } catch {
      addToast('Error posting journal voucher', 'error');
    }
  };

  const handleCreateExpense = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_EXPENSE', ...newExpense }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to record expense', 'error');
        return;
      }
      addToast('Factory expense recorded!', 'success');
      setIsNewExpenseOpen(false);
      fetchData();
    } catch {
      addToast('Error logging expense', 'error');
    }
  };

  const summary = data?.summary || {
    totalAssets: 9450000,
    totalLiabilities: 1337000,
    totalEquity: 8113000,
    totalRevenue: 3450000,
    totalCogs: 2000000,
    totalExpenses: 339500,
    grossProfit: 1450000,
    netProfit: 1110500,
  };

  const accounts = data?.accounts || [];
  const journalEntries = data?.journalEntries || [];
  const expenses = data?.expenses || [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-[#059669] border border-emerald-100">
                DOUBLE-ENTRY GENERAL LEDGER
              </span>
              <span className="text-xs text-slate-500">• Finance & Production Costing</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Financial Accounting & Profitability
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Balanced journal entries, chart of accounts, production costing, and profit & loss statements
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsNewExpenseOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Log Expense</span>
            </button>

            <button
              onClick={() => setIsNewJVOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Post Journal Voucher</span>
            </button>
          </div>
        </div>

        {/* Financial KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Gross Sales Revenue</span>
            <div className="text-2xl font-black text-slate-900 mt-1">
              Rs. {summary.totalRevenue?.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">From wholesale orders & retail POS</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Cost of Goods Sold</span>
            <div className="text-2xl font-black text-amber-600 mt-1">
              Rs. {summary.totalCogs?.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Direct fabric, trims & labor</div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Gross Manufacturing Profit</span>
            <div className="text-2xl font-black text-emerald-600 mt-1">
              Rs. {summary.grossProfit?.toLocaleString()}
            </div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-1">
              Margin: {summary.totalRevenue > 0 ? Math.round((summary.grossProfit / summary.totalRevenue) * 100) : 42}%
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Net Operational Profit</span>
            <div className="text-2xl font-black text-[#4F46E5] mt-1">
              Rs. {summary.netProfit?.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">After factory utilities & overhead</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'summary'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>Balance Sheet Summary</span>
          </button>

          <button
            onClick={() => setActiveTab('accounts')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'accounts'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>Chart of Accounts ({accounts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('journals')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'journals'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Journal Vouchers ({journalEntries.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('expenses')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'expenses'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Factory Expenses ({expenses.length})</span>
          </button>
        </div>

        {/* Tab 1: Balance Sheet & P&L Statement */}
        {activeTab === 'summary' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
                Balance Sheet Statement (Statement of Financial Position)
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="font-semibold text-slate-700">Total Company Assets:</span>
                  <span className="font-bold text-slate-900">Rs. {summary.totalAssets?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="font-semibold text-slate-700">Total Liabilities (Payables & Debt):</span>
                  <span className="font-bold text-red-600">Rs. {summary.totalLiabilities?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-t border-slate-200 font-black text-sm text-slate-900">
                  <span>Net Equity & Capital:</span>
                  <span className="text-[#4F46E5]">Rs. {(summary.totalAssets - summary.totalLiabilities)?.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-slate-900 pb-2 border-b border-slate-100">
                Profit & Loss Statement (Income Statement)
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="font-semibold text-slate-700">Gross Sales Revenue:</span>
                  <span className="font-bold text-slate-900">Rs. {summary.totalRevenue?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="font-semibold text-slate-700">Less: Cost of Goods Sold (COGS):</span>
                  <span className="font-semibold text-amber-600">- Rs. {summary.totalCogs?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-50 font-bold text-slate-800">
                  <span>Gross Margin:</span>
                  <span>Rs. {summary.grossProfit?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <span className="font-semibold text-slate-700">Less: Factory Operating Overheads:</span>
                  <span className="font-semibold text-amber-600">- Rs. {summary.totalExpenses?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-t border-slate-200 font-black text-sm text-emerald-700">
                  <span>Net Profit (PAT):</span>
                  <span>Rs. {summary.netProfit?.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Chart of Accounts */}
        {activeTab === 'accounts' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Chart of Accounts (General Ledger Master)</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                    <th className="py-3 px-4">Account Code</th>
                    <th className="py-3 px-4">Account Title</th>
                    <th className="py-3 px-4">Account Type</th>
                    <th className="py-3 px-4 text-right">Current Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accounts.map((acc) => (
                    <tr key={acc._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{acc.code}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{acc.name}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {acc.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 text-right">
                        Rs. {acc.balance?.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Journal Vouchers */}
        {activeTab === 'journals' && (
          <div className="space-y-4">
            {journalEntries.map((jv) => (
              <div key={jv._id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex justify-between items-start pb-2 border-b border-slate-100">
                  <div>
                    <span className="font-mono text-xs font-bold text-[#4F46E5]">{jv.voucherNumber}</span>
                    <h3 className="text-sm font-bold text-slate-900 mt-0.5">{jv.narration}</h3>
                    <p className="text-xs text-slate-400">Posted by {jv.postedBy} • {new Date(jv.date).toLocaleDateString()}</p>
                  </div>
                  <span className="font-bold text-slate-800 text-xs">
                    Balanced: Rs. {jv.totalDebit?.toLocaleString()}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-500 font-bold border-b border-slate-100">
                        <th className="py-1 px-2">Account</th>
                        <th className="py-1 px-2 text-right">Debit</th>
                        <th className="py-1 px-2 text-right">Credit</th>
                        <th className="py-1 px-2">Memo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(jv.lines || []).map((l, idx) => (
                        <tr key={idx}>
                          <td className="py-1.5 px-2 font-medium text-slate-800">
                            {l.accountCode} - {l.accountName}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900">
                            {l.debit > 0 ? `Rs. ${l.debit.toLocaleString()}` : '-'}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900">
                            {l.credit > 0 ? `Rs. ${l.credit.toLocaleString()}` : '-'}
                          </td>
                          <td className="py-1.5 px-2 text-slate-500">{l.memo || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 4: Factory Expenses */}
        {activeTab === 'expenses' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Factory Operating Expenses & Petty Cash</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                    <th className="py-3 px-4">Expense #</th>
                    <th className="py-3 px-4">Title / Purpose</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Paid To</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Paid From</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.map((exp) => (
                    <tr key={exp._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{exp.expenseNumber}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{exp.title}</td>
                      <td className="py-3 px-4 text-slate-600">{exp.category}</td>
                      <td className="py-3 px-4 text-slate-700 font-medium">{exp.paidTo}</td>
                      <td className="py-3 px-4 font-bold text-[#DC2626]">Rs. {exp.amount?.toLocaleString()}</td>
                      <td className="py-3 px-4 text-slate-500">{exp.paidFromAccount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Post Balanced Journal Voucher */}
        <Modal
          isOpen={isNewJVOpen}
          onClose={() => setIsNewJVOpen(false)}
          title="Post Double-Entry Journal Voucher (JV)"
          subtitle="Enforces balanced double-entry (Debit = Credit)"
          maxWidth="max-w-2xl"
        >
          <form onSubmit={handleCreateJV} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Narration / Description</label>
              <input
                type="text"
                required
                value={newJV.narration}
                onChange={(e) => setNewJV({ ...newJV, narration: e.target.value })}
                placeholder="Journal narration"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-xs font-bold text-slate-700 block">Journal Lines</label>
              {newJV.lines.map((l, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-12 gap-2 text-xs items-center">
                  <div className="col-span-6">
                    <label className="text-[10px] text-slate-500 block mb-0.5">Account Code & Title</label>
                    <input
                      type="text"
                      required
                      value={`${l.accountCode} - ${l.accountName}`}
                      onChange={(e) => {
                        const updated = [...newJV.lines];
                        updated[idx].accountName = e.target.value;
                        setNewJV({ ...newJV, lines: updated });
                      }}
                      className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none"
                    />
                  </div>

                  <div className="col-span-3">
                    <label className="text-[10px] text-slate-500 block mb-0.5">Debit (Rs)</label>
                    <input
                      type="number"
                      value={l.debit}
                      onChange={(e) => {
                        const updated = [...newJV.lines];
                        updated[idx].debit = Number(e.target.value);
                        setNewJV({ ...newJV, lines: updated });
                      }}
                      className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none font-bold text-right"
                    />
                  </div>

                  <div className="col-span-3">
                    <label className="text-[10px] text-slate-500 block mb-0.5">Credit (Rs)</label>
                    <input
                      type="number"
                      value={l.credit}
                      onChange={(e) => {
                        const updated = [...newJV.lines];
                        updated[idx].credit = Number(e.target.value);
                        setNewJV({ ...newJV, lines: updated });
                      }}
                      className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none font-bold text-right"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewJVOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm"
              >
                Post Balanced Entry
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Log Factory Expense */}
        <Modal
          isOpen={isNewExpenseOpen}
          onClose={() => setIsNewExpenseOpen(false)}
          title="Record Factory Operating Expense"
          subtitle="Utility, boiler fuel, machine spare parts, or worker tea"
        >
          <form onSubmit={handleCreateExpense} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Expense Description</label>
              <input
                type="text"
                required
                value={newExpense.title}
                onChange={(e) => setNewExpense({ ...newExpense, title: e.target.value })}
                placeholder="Expense description"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                <select
                  value={newExpense.category}
                  onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="Factory Electricity & Diesel">Factory Electricity & Diesel</option>
                  <option value="Boiler Fuel">Boiler Fuel</option>
                  <option value="Machine Maintenance">Machine Maintenance</option>
                  <option value="Worker Tea & Meals">Worker Tea & Meals</option>
                  <option value="Office Supplies">Office Supplies</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Amount (PKR)</label>
                <input
                  type="number"
                  required
                  value={newExpense.amount}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Paid To (Vendor/Person)</label>
                <input
                  type="text"
                  required
                  value={newExpense.paidTo}
                  onChange={(e) => setNewExpense({ ...newExpense, paidTo: e.target.value })}
                  placeholder="Expense payee"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Paid From Account</label>
                <select
                  value={newExpense.paidFromAccount}
                  onChange={(e) => setNewExpense({ ...newExpense, paidFromAccount: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="Cash in Hand (Petty Cash & POS)">Cash in Hand (Petty Cash & POS)</option>
                  <option value="Meezan Bank - Factory Current A/c">Meezan Bank - Factory Current A/c</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewExpenseOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm"
              >
                Save Expense
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </Layout>
  );
}
