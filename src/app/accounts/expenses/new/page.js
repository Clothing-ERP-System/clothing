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
  Receipt,
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

const EXPENSE_CATEGORIES = [
  'Factory Wages & Labor',
  'Factory Rent & Utilities',
  'Electricity & Generator Fuel',
  'Machine Repair & Maintenance',
  'Packaging & Cartons',
  'Freight & Carriage Inward',
  'Office Supplies & Stationery',
  'Tea, Food & Refreshments',
  'Marketing, Ads & Printing',
  'Bank Charges & Fees',
  'Legal & Professional Fees',
  'Miscellaneous Operating Expense',
];

const PAYMENT_METHODS = [
  { value: 'BankTransfer', label: 'Bank Transfer / Online' },
  { value: 'Cash', label: 'Cash on Hand' },
  { value: 'Cheque', label: 'Cheque' },
  { value: 'CreditCard', label: 'Corporate Card' },
];

export default function AddExpensePage() {
  const router = useRouter();
  const { user, addToast } = useAuth();
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [assetAccounts, setAssetAccounts] = useState([]);
  const [expenseAccounts, setExpenseAccounts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  const [form, setForm] = useState({
    title: '',
    category: EXPENSE_CATEGORIES[0],
    amount: '',
    date: new Date().toISOString().split('T')[0],
    paidFromAccount: '',
    expenseAccountCode: '',
    paidTo: '',
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
          const expenses = accounts.filter((a) => a.type === 'OperatingExpense');
          setAssetAccounts(assets);
          setExpenseAccounts(expenses);
          setSuppliers(json.data?.suppliers || []);

          if (assets.length > 0) {
            setForm((prev) => ({
              ...prev,
              paidFromAccount: prev.paidFromAccount || assets[0].code,
              expenseAccountCode: prev.expenseAccountCode || (expenses[0]?.code || ''),
            }));
          }
        }
      } catch (err) {
        console.error('Failed to load accounts for expense form:', err);
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
      addToast('Please enter an expense title / description', 'error');
      return;
    }
    const numAmount = Number(form.amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      addToast('Please enter a valid positive expense amount', 'error');
      return;
    }
    if (!form.paidFromAccount) {
      addToast('Please select a payment account (Bank or Cash)', 'error');
      return;
    }
    if (!form.expenseAccountCode) {
      addToast('Please select an operating expense account', 'error');
      return;
    }
    if (!form.paidTo.trim()) {
      addToast('Please specify the payee / vendor name', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_EXPENSE',
          title: form.title.trim(),
          category: form.category,
          amount: numAmount,
          date: form.date,
          paidFromAccount: form.paidFromAccount,
          expenseAccountCode: form.expenseAccountCode,
          paidTo: form.paidTo.trim(),
          paymentMethod: form.paymentMethod,
          referenceNumber: form.referenceNumber.trim(),
          notes: form.notes.trim(),
          approvedBy: user?.name || user?.email || 'Authorized User',
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to record expense');
      }

      addToast(`Expense logged: ${json.data?.expense?.expenseNumber || 'Success'}`, 'success');
      router.push('/accounts/expenses');
    } catch (err) {
      addToast(err.message || 'Error recording expense', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPaymentAccount = assetAccounts.find((a) => a.code === form.paidFromAccount);
  const selectedExpenseAccount = expenseAccounts.find((a) => a.code === form.expenseAccountCode);
  const parsedAmount = Number(form.amount) || 0;

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
        {/* Breadcrumb & Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
              <Link href="/accounts/expenses" className="hover:text-indigo-600 flex items-center gap-1 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />
                Finance & Accounts
              </Link>
              <span>/</span>
              <Link href="/accounts/expenses" className="hover:text-indigo-600 transition-colors">
                Expenses
              </Link>
              <span>/</span>
              <span className="text-slate-800 dark:text-slate-200">New Expense</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center border border-rose-200 dark:border-rose-800 shadow-xs">
                <Receipt className="w-5 h-5" />
              </span>
              Record Operating Expense
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Log commercial, production, or administrative expenses with real-time double-entry general ledger voucher posting.
            </p>
          </div>

          <Link
            href="/accounts/expenses"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 shadow-xs transition-colors shrink-0"
          >
            <Receipt className="w-3.5 h-3.5" />
            View Expense Registry
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
              <FileText className="w-4 h-4 text-rose-600" />
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                1. Transaction & Voucher Details
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Title / Description */}
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Expense Title / Description <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Factory Diesel for Generator, Monthly Thread & Bobbin Purchases"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white dark:focus:bg-slate-900 transition-all font-medium"
                />
              </div>

              {/* Expense Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Transaction Date <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Expense Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
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
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                >
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm.value} value={pm.value}>
                      {pm.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference / Invoice Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Reference / Bill / Receipt No.
                </label>
                <input
                  type="text"
                  placeholder="e.g. BILL-9921, REC-4402"
                  value={form.referenceNumber}
                  onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Financial Allocation & Accounts */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Scale className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                2. Financial Amount & General Ledger Allocation
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Expense Amount (PKR) <span className="text-rose-500">*</span>
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
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* Paid From Account (Asset / Bank / Cash) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Paid From (Credit Account) <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={form.paidFromAccount}
                  onChange={(e) => setForm({ ...form, paidFromAccount: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
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

              {/* Expense Account Head (Debit) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Expense Head (Debit Account) <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={form.expenseAccountCode}
                  onChange={(e) => setForm({ ...form, expenseAccountCode: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                >
                  {loadingAccounts ? (
                    <option>Loading accounts…</option>
                  ) : (
                    expenseAccounts.map((acc) => (
                      <option key={acc.code} value={acc.code}>
                        [{acc.code}] {acc.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Card 3: Payee & Notes */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <User className="w-4 h-4 text-indigo-600" />
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                3. Payee, Vendor & Notes
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Paid To */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Paid To (Payee / Supplier / Person) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  list="suppliersList"
                  placeholder="e.g. Vendor / Supplier / Payee Name"
                  value={form.paidTo}
                  onChange={(e) => setForm({ ...form, paidTo: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                />
                <datalist id="suppliersList">
                  {suppliers.map((s) => (
                    <option key={s._id} value={s.name} />
                  ))}
                </datalist>
              </div>

              {/* Additional Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Internal Remarks / Memo
                </label>
                <input
                  type="text"
                  placeholder="e.g. Approved by Factory Manager; monthly maintenance schedule"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                />
              </div>
            </div>
          </div>

          {/* Double-Entry Ledger Impact Preview */}
          <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/20 p-4 sm:p-5">
            <div className="flex items-center justify-between pb-2 border-b border-indigo-200/60 dark:border-indigo-900/60 mb-3">
              <h3 className="text-xs font-black text-indigo-900 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Double-Entry Ledger Impact Preview
              </h3>
              <span className="text-[10px] font-mono font-bold text-indigo-600 uppercase">
                Voucher Type: Expense (Auto-Balanced)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-indigo-100 dark:border-indigo-950 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-emerald-600 block">DEBIT (Dr)</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    [{selectedExpenseAccount?.code || form.expenseAccountCode || 'Head'}] {selectedExpenseAccount?.name || 'Operating Expense'}
                  </span>
                </div>
                <span className="font-mono font-black text-sm text-emerald-600">
                  Rs. {parsedAmount.toLocaleString()}
                </span>
              </div>

              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-indigo-100 dark:border-indigo-950 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">CREDIT (Cr)</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    [{selectedPaymentAccount?.code || form.paidFromAccount || 'Head'}] {selectedPaymentAccount?.name || 'Asset / Bank'}
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
              href="/accounts/expenses"
              className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Cancel & Return
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 rounded-xl shadow-md shadow-rose-600/20 disabled:opacity-50 transition-all cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Recording & Posting…
                </>
              ) : (
                <>
                  <PlusCircle className="w-4 h-4" />
                  Record & Post Expense
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
