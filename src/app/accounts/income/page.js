'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  DollarSign,
  PlusCircle,
  Search,
  Filter,
  TrendingUp,
  Calendar,
  Building,
  User,
  ArrowDownRight,
  Receipt,
} from 'lucide-react';

export default function IncomeListPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedIncome, setSelectedIncome] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/finance');
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Unable to load income records');
      }
      setData(json.data);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Error loading income records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const incomes = useMemo(() => data?.incomes || [], [data]);

  const categories = useMemo(() => {
    const set = new Set(incomes.map((i) => i.category).filter(Boolean));
    return ['ALL', ...Array.from(set)];
  }, [incomes]);

  const filteredIncomes = useMemo(() => {
    return incomes.filter((item) => {
      const matchesSearch =
        !searchTerm ||
        (item.incomeNumber && item.incomeNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.title && item.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.receivedFrom && item.receivedFrom.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.receivedInAccount && item.receivedInAccount.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [incomes, searchTerm, categoryFilter]);

  const totalIncomeAmount = useMemo(() => {
    return filteredIncomes.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }, [filteredIncomes]);

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <DollarSign className="w-7 h-7 text-emerald-500" />
              Income Lists
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              General ledger registry of wholesale sales receipts, scrap, and other operating revenues.
            </p>
          </div>

          <Link
            href="/accounts/income/new"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Add New Income
          </Link>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Total Revenue Logged
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-2">
              Rs. {totalIncomeAmount.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Across {filteredIncomes.length} filtered entries
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Total Inward Vouchers
              </span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-2">
              {incomes.length}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Double-entry balanced
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Average Receipt
              </span>
              <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-2">
              Rs. {incomes.length > 0 ? Math.round(totalIncomeAmount / incomes.length).toLocaleString() : '0'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Per recorded receipt
            </p>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by income #, title, customer, account..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full sm:w-48 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
            <div className="p-8 text-center text-xs text-slate-500">Loading income records…</div>
          ) : loadError ? (
            <div className="p-8 text-center text-xs text-rose-500">{loadError}</div>
          ) : filteredIncomes.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No income records found. Click &quot;Add New Income&quot; to log your first receipt.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5">Income #</th>
                    <th className="px-4 py-3.5">Date</th>
                    <th className="px-4 py-3.5">Title & Narration</th>
                    <th className="px-4 py-3.5">Category</th>
                    <th className="px-4 py-3.5">Received From</th>
                    <th className="px-4 py-3.5">Deposit Account</th>
                    <th className="px-4 py-3.5 text-right">Amount</th>
                    <th className="px-4 py-3.5 text-center">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredIncomes.map((inc) => (
                    <tr key={inc._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {inc.incomeNumber || 'INC-—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {inc.paymentDate ? new Date(inc.paymentDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white max-w-xs truncate">
                        {inc.title}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                          {inc.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                        {inc.receivedFrom || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                        {inc.receivedInAccount || 'Asset'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono whitespace-nowrap">
                        Rs. {Number(inc.amount || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedIncome(inc)}
                          className="px-2.5 py-1 text-[11px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
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

        {/* Income Detail Modal */}
        {selectedIncome && (
          <Modal
            isOpen={Boolean(selectedIncome)}
            onClose={() => setSelectedIncome(null)}
            title={`Income Details: ${selectedIncome.incomeNumber}`}
          >
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <div>
                  <span className="text-slate-400">Income Number:</span>
                  <p className="font-mono font-bold text-slate-800 dark:text-white">{selectedIncome.incomeNumber}</p>
                </div>
                <div>
                  <span className="text-slate-400">Date:</span>
                  <p className="font-semibold text-slate-800 dark:text-white">
                    {selectedIncome.paymentDate ? new Date(selectedIncome.paymentDate).toLocaleString() : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Category:</span>
                  <p className="font-semibold text-slate-800 dark:text-white">{selectedIncome.category}</p>
                </div>
                <div>
                  <span className="text-slate-400">Amount Received:</span>
                  <p className="font-mono font-bold text-emerald-600 text-sm">
                    Rs. {Number(selectedIncome.amount || 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400">Received From:</span>
                  <p className="font-semibold text-slate-800 dark:text-white">{selectedIncome.receivedFrom}</p>
                </div>
                <div>
                  <span className="text-slate-400">Deposit Account:</span>
                  <p className="font-mono text-slate-800 dark:text-white">{selectedIncome.receivedInAccount}</p>
                </div>
                <div>
                  <span className="text-slate-400">Revenue Head Code:</span>
                  <p className="font-mono text-slate-800 dark:text-white">{selectedIncome.incomeAccountCode || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Reference / Cheque:</span>
                  <p className="font-mono text-slate-800 dark:text-white">{selectedIncome.referenceNumber || '—'}</p>
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-bold block mb-1">Narration:</span>
                <p className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300">
                  {selectedIncome.title}
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedIncome(null)}
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
