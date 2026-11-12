'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  ArrowLeft,
  DollarSign,
  PlusCircle,
  Building2,
  Calendar,
  CreditCard,
  User,
  FileText,
  AlertCircle,
  CheckCircle2,
  Tag,
  Hash,
  Scale,
  Loader2,
} from 'lucide-react';

const INCOME_CATEGORIES = [
  'Garment Wholesale Sales',
  'Retail Store Sales',
  'Export Apparel Order Advance',
  'Fabric & Trims Scrap Sales',
  'Embroidery & Stitching Job Work',
  'Rental Income',
  'Bank Profit & Dividend',
  'Consulting & Commission',
  'Foreign Exchange Gain',
  'Miscellaneous Operating Revenue',
];

const PAYMENT_METHODS = [
  { value: 'BankTransfer', label: 'Bank Transfer / Online' },
  { value: 'Cash', label: 'Cash on Hand' },
  { value: 'Cheque', label: 'Cheque' },
  { value: 'CreditCard', label: 'Credit / Debit Card' },
];

export default function AddIncomePage() {
  const router = useRouter();
  const { user, addToast } = useAuth();
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [assetAccounts, setAssetAccounts] = useState([]);
  const [revenueAccounts, setRevenueAccounts] = useState([]);
  const [customers, setCustomers] = useState([]);

  const [form, setForm] = useState({
    title: '',
    category: INCOME_CATEGORIES[0],
    amount: '',
    date: new Date().toISOString().split('T')[0],
    receivedInAccount: '',
    incomeAccountCode: '',
    receivedFrom: '',
    paymentMethod: 'BankTransfer',
    referenceNumber: '',
    notes: '',
  });

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        const res = await apiFetch('/api/finance');
        const json = await res.json();
        if (active && json.success) {
          const accounts = json.data?.accounts || [];
          const assets = accounts.filter((a) => a.type === 'Asset');
          const revenues = accounts.filter((a) => a.type === 'Revenue');
          setAssetAccounts(assets);
          setRevenueAccounts(revenues);
          setCustomers(json.data?.customers || []);

          if (assets.length > 0) {
            setForm((prev) => ({
              ...prev,
              receivedInAccount: prev.receivedInAccount || assets[0].code,
              incomeAccountCode: prev.incomeAccountCode || (revenues[0]?.code || ''),
            }));
          }
        }
      } catch (err) {
        console.error('Failed to load accounts for income form:', err);
      } finally {
        if (active) setLoadingAccounts(false);
      }
    }
    loadData();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      addToast('Please enter an income description / title', 'error');
      return;
    }
    const numAmount = Number(form.amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      addToast('Please enter a valid positive income amount', 'error');
      return;
    }
    if (!form.receivedInAccount) {
      addToast('Please select the receiving bank or cash account', 'error');
      return;
    }
    if (!form.incomeAccountCode) {
      addToast('Please select a revenue head', 'error');
      return;
    }
    if (!form.receivedFrom.trim()) {
      addToast('Please enter customer / payer source name', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_INCOME',
          title: form.title.trim(),
          category: form.category,
          amount: numAmount,
          date: form.date,
          receivedInAccount: form.receivedInAccount,
          incomeAccountCode: form.incomeAccountCode,
          receivedFrom: form.receivedFrom.trim(),
          paymentMethod: form.paymentMethod,
          referenceNumber: form.referenceNumber.trim(),
          notes: form.notes.trim(),
          postedBy: user?.name || user?.email || 'Authorized User',
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to record income');
      }

      addToast(`Income logged: ${json.data?.income?.incomeNumber || 'Success'}`, 'success');
      router.push('/accounts/income');
    } catch (err) {
      addToast(err.message || 'Error recording income', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedDepositAccount = assetAccounts.find((a) => a.code === form.receivedInAccount);
  const selectedRevenueAccount = revenueAccounts.find((a) => a.code === form.incomeAccountCode);
  const parsedAmount = Number(form.amount) || 0;

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
        {/* Breadcrumb & Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              <Link href="/accounts/income" className="hover:text-emerald-600 flex items-center gap-1 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />
                Finance & Accounts
              </Link>
              <span>/</span>
              <Link href="/accounts/income" className="hover:text-emerald-600 transition-colors">
                Income
              </Link>
              <span>/</span>
              <span className="text-slate-800 dark:text-slate-200">New Income</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center border border-emerald-200 dark:border-emerald-800 shadow-xs">
                <DollarSign className="w-5 h-5" />
              </span>
              Record Operating Revenue
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Log sales advances, scrap realizations, and job-work receipts with instant double-entry general ledger voucher posting.
            </p>
          </div>

          <Link
            href="/accounts/income"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 shadow-xs transition-colors shrink-0"
          >
            <DollarSign className="w-3.5 h-3.5" />
            View Income Registry
          </Link>
        </div>

        {/* Main Form Container */}
        <form
          onSubmit={(event) => preventDuplicateSubmit(event, handleSubmit)}
          className="space-y-6"
        >
          {/* Card 1: Voucher & Transaction Basics */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <FileText className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                1. Transaction & Receipt Details
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Title / Description */}
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Income Narration / Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Export Denim Order #892 Advance, Fabric Offcut Scrap Auction"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white dark:focus:bg-slate-900 transition-all font-medium"
                />
              </div>

              {/* Receipt Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Receipt Date <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Revenue Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  {INCOME_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Payment Method <span className="text-rose-500">*</span>
                </label>
                <select
                  value={form.paymentMethod}
                  onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm.value} value={pm.value}>
                      {pm.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference / Cheque Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Cheque / Online Reference #
                </label>
                <input
                  type="text"
                  placeholder="e.g. CHQ-88219, FT-990231"
                  value={form.referenceNumber}
                  onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Financial Amount & Deposit Accounts */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Scale className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                2. Financial Amount & Deposit Allocation
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Amount Received (PKR) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs font-black text-slate-400">Rs.</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Deposit Into (Debit Account) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Deposit Account (Debit Account) <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={form.receivedInAccount}
                  onChange={(e) => setForm({ ...form, receivedInAccount: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  {loadingAccounts ? (
                    <option>Loading accounts…</option>
                  ) : (
                    assetAccounts.map((acc) => (
                      <option key={acc.code} value={acc.code}>
                        [{acc.code}] {acc.name} (Bal: Rs. {Number(acc.balance || 0).toLocaleString()})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Revenue Head (Credit Account) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Revenue Head (Credit Account) <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={form.incomeAccountCode}
                  onChange={(e) => setForm({ ...form, incomeAccountCode: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  {loadingAccounts ? (
                    <option>Loading revenue accounts…</option>
                  ) : (
                    revenueAccounts.map((acc) => (
                      <option key={acc.code} value={acc.code}>
                        [{acc.code}] {acc.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Card 3: Payer / Source & Notes */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <User className="w-4 h-4 text-emerald-600" />
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                3. Customer / Source & Remarks
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Received From */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Received From (Customer / Client / Source) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  list="customersList"
                  placeholder="e.g. Customer Name / Buyer / Walk-in Client"
                  value={form.receivedFrom}
                  onChange={(e) => setForm({ ...form, receivedFrom: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
                <datalist id="customersList">
                  {customers.map((c) => (
                    <option key={c._id} value={c.name} />
                  ))}
                </datalist>
              </div>

              {/* Remarks / Memo */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Internal Remarks / Memo
                </label>
                <input
                  type="text"
                  placeholder="e.g. Advance on commercial invoice #892; verified via bank advice"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Double-Entry Ledger Impact Preview */}
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-4 sm:p-5">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-200/60 dark:border-emerald-900/60 mb-3">
              <h3 className="text-xs font-black text-emerald-900 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Double-Entry Ledger Impact Preview
              </h3>
              <span className="text-[10px] font-mono font-bold text-emerald-600 uppercase">
                Voucher Type: Income (Auto-Balanced)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-emerald-100 dark:border-emerald-950 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-emerald-600 block">DEBIT (Dr)</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    [{selectedDepositAccount?.code || form.receivedInAccount || 'Head'}] {selectedDepositAccount?.name || 'Asset / Bank'}
                  </span>
                </div>
                <span className="font-mono font-black text-sm text-emerald-600">
                  Rs. {parsedAmount.toLocaleString()}
                </span>
              </div>

              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-emerald-100 dark:border-emerald-950 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">CREDIT (Cr)</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    [{selectedRevenueAccount?.code || form.incomeAccountCode || 'Head'}] {selectedRevenueAccount?.name || 'Revenue'}
                  </span>
                </div>
                <span className="font-mono font-black text-sm text-slate-800 dark:text-slate-200">
                  Rs. {parsedAmount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Link
              href="/accounts/income"
              className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Cancel & Return
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 rounded-xl shadow-md shadow-emerald-600/20 disabled:opacity-50 transition-all cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Recording & Posting…
                </>
              ) : (
                <>
                  <PlusCircle className="w-4 h-4" />
                  Record & Post Income
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
