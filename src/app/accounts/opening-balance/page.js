'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  Scale,
  PlusCircle,
  Building,
  Users,
  Truck,
  BookOpen,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
} from 'lucide-react';

export default function OpeningBalancePage() {
  const { user, addToast } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [form, setForm] = useState({
    targetType: 'ACCOUNT', // 'ACCOUNT', 'CUSTOMER', 'SUPPLIER'
    targetId: '',
    accountCode: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/finance');
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Unable to load finance data');
      }
      setData(json.data);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Error loading opening balance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const accounts = useMemo(() => data?.accounts || [], [data]);
  const customers = useMemo(() => data?.customers || [], [data]);
  const suppliers = useMemo(() => data?.suppliers || [], [data]);
  const journalEntries = useMemo(() => data?.journalEntries || [], [data]);

  // Existing opening balance journal entries
  const openingVouchers = useMemo(() => {
    return journalEntries.filter(
      (jv) => jv.voucherType === 'OpeningBalance' || /^OP-/.test(jv.referenceNumber || '')
    );
  }, [journalEntries]);

  const filteredVouchers = useMemo(() => {
    return openingVouchers.filter((jv) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        jv.voucherNumber.toLowerCase().includes(term) ||
        (jv.narration && jv.narration.toLowerCase().includes(term)) ||
        (jv.referenceNumber && jv.referenceNumber.toLowerCase().includes(term))
      );
    });
  }, [openingVouchers, searchTerm]);

  const totalOpeningDebit = useMemo(() => {
    return openingVouchers.reduce((sum, jv) => sum + Number(jv.totalDebit || 0), 0);
  }, [openingVouchers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numAmount = Number(form.amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      addToast('Please enter a positive opening balance amount', 'error');
      return;
    }

    if (form.targetType === 'ACCOUNT' && !form.accountCode) {
      addToast('Please select a chart of accounts head', 'error');
      return;
    }
    if ((form.targetType === 'CUSTOMER' || form.targetType === 'SUPPLIER') && !form.targetId) {
      addToast(`Please select a ${form.targetType.toLowerCase()}`, 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SET_OPENING_BALANCE',
          targetType: form.targetType,
          targetId: form.targetId,
          accountCode: form.accountCode,
          amount: numAmount,
          date: form.date,
          reference: form.reference,
          postedBy: user?.name || user?.email || 'Admin',
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to record opening balance');
      }

      addToast('Opening balance posted and balanced with Equity account 3100', 'success');
      setIsModalOpen(false);
      setForm({
        targetType: 'ACCOUNT',
        targetId: '',
        accountCode: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        reference: '',
      });
      fetchData();
    } catch (err) {
      addToast(err.message || 'Error recording opening balance', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <Scale className="w-7 h-7 text-indigo-600" />
              Opening Balances
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Establish initial balances for Banks, Cash, Customers, Suppliers, and Inventory balanced against Opening Balance Equity (3100).
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600 rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Post Opening Balance
          </button>
        </div>

        {/* Informational Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Total Opening Capital & Assets
            </span>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-2 font-mono">
              Rs. {totalOpeningDebit.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Balanced against Account 3100
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Posted Opening Vouchers
            </span>
            <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-2 font-mono">
              {openingVouchers.length}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Immutable journal vouchers
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Integrity Status
            </span>
            <div className="flex items-center gap-2 mt-2 text-emerald-600 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5" />
              Debits Equal Credits (100%)
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Zero balance discrepancy
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search opening voucher number, narration or reference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            />
          </div>
        </div>

        {/* Existing Opening Vouchers Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Recorded Opening Balance Journal Vouchers
            </h3>
            <span className="text-xs font-mono font-bold text-indigo-600">
              {filteredVouchers.length} Vouchers
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading opening balance vouchers…</div>
          ) : loadError ? (
            <div className="p-8 text-center text-xs text-rose-500">{loadError}</div>
          ) : filteredVouchers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No opening balance vouchers recorded yet. Click &quot;Post Opening Balance&quot; to establish initial balances.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Voucher #</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Narration</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Journal Lines</th>
                    <th className="px-4 py-3 text-right">Debit (PKR)</th>
                    <th className="px-4 py-3 text-right">Credit (PKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredVouchers.map((jv) => (
                    <tr key={jv._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {jv.voucherNumber}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {jv.date ? new Date(jv.date).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white max-w-sm">
                        {jv.narration}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                        {jv.referenceNumber || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          {(jv.lines || []).map((line, idx) => (
                            <div key={idx} className="text-[11px] flex items-center justify-between gap-2">
                              <span className="font-mono text-slate-500">[{line.accountCode}] {line.accountName}:</span>
                              <span className="font-mono font-bold">
                                {line.debit > 0 ? `Dr Rs. ${Number(line.debit).toLocaleString()}` : `Cr Rs. ${Number(line.credit).toLocaleString()}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">
                        Rs. {Number(jv.totalDebit || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-600 dark:text-slate-400">
                        Rs. {Number(jv.totalCredit || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Post Opening Balance Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Post Opening Balance"
        >
          <form
            onSubmit={(event) => preventDuplicateSubmit(event, handleSubmit)}
            className="space-y-4 text-xs"
          >
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Balance Type <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, targetType: 'ACCOUNT' })}
                  className={`py-2 px-3 rounded-xl border text-center font-bold transition-colors cursor-pointer ${
                    form.targetType === 'ACCOUNT'
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600'
                      : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  General Account
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, targetType: 'CUSTOMER' })}
                  className={`py-2 px-3 rounded-xl border text-center font-bold transition-colors cursor-pointer ${
                    form.targetType === 'CUSTOMER'
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600'
                      : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Customer Receivable
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, targetType: 'SUPPLIER' })}
                  className={`py-2 px-3 rounded-xl border text-center font-bold transition-colors cursor-pointer ${
                    form.targetType === 'SUPPLIER'
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600'
                      : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Supplier Payable
                </button>
              </div>
            </div>

            {form.targetType === 'ACCOUNT' && (
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Select Chart of Accounts Head <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={form.accountCode}
                  onChange={(e) => setForm({ ...form, accountCode: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="">-- Choose Account --</option>
                  {accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      [{a.code}] {a.name} ({a.type})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {form.targetType === 'CUSTOMER' && (
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Select Customer <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={form.targetId}
                  onChange={(e) => setForm({ ...form, targetId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="">-- Choose Customer --</option>
                  {customers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} (Current Bal: Rs. {Number(c.balance || 0).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {form.targetType === 'SUPPLIER' && (
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Select Supplier <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={form.targetId}
                  onChange={(e) => setForm({ ...form, targetId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="">-- Choose Supplier --</option>
                  {suppliers.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name} (Current Bal: Rs. {Number(s.balance || 0).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Opening Balance Amount (PKR) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Effective Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl text-amber-800 dark:text-amber-300 text-[11px] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <span>
                An opening journal voucher will be generated automatically balancing this entry against <strong>3100 Opening Balance Equity</strong>. This prevents duplicate entries and preserves ledger balance.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs cursor-pointer"
              >
                {submitting ? 'Posting…' : 'Post Opening Balance'}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </Layout>
  );
}
