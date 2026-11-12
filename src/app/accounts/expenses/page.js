'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  Receipt,
  PlusCircle,
  Search,
  Filter,
  DollarSign,
  TrendingDown,
  Calendar,
  Building,
  User,
  ArrowUpRight,
  Trash2,
  AlertCircle,
} from 'lucide-react';

export default function ExpenseListPage() {
  const { user, addToast } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedExpense, setSelectedExpense] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/finance');
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Unable to load expenses');
      }
      setData(json.data);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Error loading expenses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const expenses = useMemo(() => data?.expenses || [], [data]);

  const categories = useMemo(() => {
    const set = new Set(expenses.map((e) => e.category).filter(Boolean));
    return ['ALL', ...Array.from(set)];
  }, [expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((item) => {
      const matchesSearch =
        !searchTerm ||
        (item.expenseNumber && item.expenseNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.title && item.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.paidTo && item.paidTo.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.paidFromAccount && item.paidFromAccount.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [expenses, searchTerm, categoryFilter]);

  const totalExpenseAmount = useMemo(() => {
    return filteredExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }, [filteredExpenses]);

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <Receipt className="w-7 h-7 text-rose-500" />
              Expense Lists
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Comprehensive registry of all operating, factory, and administrative expenses.
            </p>
          </div>

          <Link
            href="/accounts/expenses/new"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 rounded-xl shadow-md shadow-rose-600/20 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Add New Expense
          </Link>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Total Expenses
              </span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-2">
              Rs. {totalExpenseAmount.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Across {filteredExpenses.length} filtered entries
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Total Records
              </span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-2">
              {expenses.length}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              General ledger synchronized
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Average Expense
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-2">
              Rs. {expenses.length > 0 ? Math.round(totalExpenseAmount / expenses.length).toLocaleString() : '0'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Per recorded voucher
            </p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by expense #, title, payee, account..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full sm:w-48 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === 'ALL' ? 'All Categories' : c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading expenses…</div>
          ) : loadError ? (
            <div className="p-8 text-center text-xs text-rose-500">{loadError}</div>
          ) : filteredExpenses.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No expense records found. Click &quot;Add New Expense&quot; to log your first expense.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5">Expense #</th>
                    <th className="px-4 py-3.5">Date</th>
                    <th className="px-4 py-3.5">Title & Description</th>
                    <th className="px-4 py-3.5">Category</th>
                    <th className="px-4 py-3.5">Paid To</th>
                    <th className="px-4 py-3.5">Paid From</th>
                    <th className="px-4 py-3.5 text-right">Amount</th>
                    <th className="px-4 py-3.5 text-center">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredExpenses.map((exp) => (
                    <tr key={exp._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-rose-600 dark:text-rose-400">
                        {exp.expenseNumber || 'EXP-—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {exp.paymentDate ? new Date(exp.paymentDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white max-w-xs truncate">
                        {exp.title}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {exp.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                        {exp.paidTo || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                        {exp.paidFromAccount || 'Asset'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white font-mono whitespace-nowrap">
                        Rs. {Number(exp.amount || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedExpense(exp)}
                          className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Expense Detail Modal */}
        {selectedExpense && (
          <Modal
            isOpen={Boolean(selectedExpense)}
            onClose={() => setSelectedExpense(null)}
            title={`Expense Details: ${selectedExpense.expenseNumber}`}
          >
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <div>
                  <span className="text-slate-400">Expense Number:</span>
                  <p className="font-mono font-bold text-slate-800 dark:text-white">{selectedExpense.expenseNumber}</p>
                </div>
                <div>
                  <span className="text-slate-400">Date:</span>
                  <p className="font-semibold text-slate-800 dark:text-white">
                    {selectedExpense.paymentDate ? new Date(selectedExpense.paymentDate).toLocaleString() : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Category:</span>
                  <p className="font-semibold text-slate-800 dark:text-white">{selectedExpense.category}</p>
                </div>
                <div>
                  <span className="text-slate-400">Amount:</span>
                  <p className="font-mono font-bold text-rose-600 text-sm">
                    Rs. {Number(selectedExpense.amount || 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Paid To:</span>
                  <p className="font-semibold text-slate-800 dark:text-white">{selectedExpense.paidTo}</p>
                </div>
                <div>
                  <span className="text-slate-400">Paid From Account:</span>
                  <p className="font-mono text-slate-800 dark:text-white">{selectedExpense.paidFromAccount}</p>
                </div>
                <div>
                  <span className="text-slate-400">Operating Expense Code:</span>
                  <p className="font-mono text-slate-800 dark:text-white">{selectedExpense.expenseAccountCode || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Approved By:</span>
                  <p className="font-semibold text-slate-800 dark:text-white">{selectedExpense.approvedBy || 'System'}</p>
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-bold block mb-1">Description:</span>
                <p className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300">
                  {selectedExpense.title}
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedExpense(null)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 font-bold rounded-xl text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </Layout>
  );
}
