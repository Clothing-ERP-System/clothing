'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  Landmark,
  Search,
  Filter,
  Printer,
  CheckCircle2,
  AlertCircle,
  Scale,
} from 'lucide-react';

export default function AccountBalanceTrialBalancePage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

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
      setLoadError(err.message || 'Error loading account balance report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const accounts = useMemo(() => data?.accounts || [], [data]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      const matchesSearch =
        !searchTerm ||
        a.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === 'ALL' || a.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [accounts, searchTerm, typeFilter]);

  // Compute trial balance columns (Debit vs Credit)
  const trialBalanceRows = useMemo(() => {
    return filteredAccounts.map((a) => {
      const balance = Number(a.balance || 0);
      const isNormalDebit = ['Asset', 'CostOfGoodsSold', 'OperatingExpense'].includes(a.type);
      let debit = 0;
      let credit = 0;

      if (isNormalDebit) {
        if (balance >= 0) debit = balance;
        else credit = Math.abs(balance);
      } else {
        if (balance >= 0) credit = balance;
        else debit = Math.abs(balance);
      }

      return {
        ...a,
        debit,
        credit,
      };
    });
  }, [filteredAccounts]);

  const totalDebit = useMemo(() => {
    return trialBalanceRows.reduce((sum, r) => sum + r.debit, 0);
  }, [trialBalanceRows]);

  const totalCredit = useMemo(() => {
    return trialBalanceRows.reduce((sum, r) => sum + r.credit, 0);
  }, [trialBalanceRows]);

  const isBalanced = useMemo(() => {
    return Math.abs(totalDebit - totalCredit) < 0.01;
  }, [totalDebit, totalCredit]);

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <Landmark className="w-7 h-7 text-indigo-600" />
              Trial Balance & Account Balances
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              General ledger trial balance report validating debit and credit equality across all chart of accounts heads.
            </p>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Trial Balance
          </button>
        </div>

        {/* Verification Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Total Trial Balance Debits
            </span>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-2 font-mono">
              Rs. {totalDebit.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400">Assets, COGS, Expenses</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Total Trial Balance Credits
            </span>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-2 font-mono">
              Rs. {totalCredit.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400">Liabilities, Equity, Revenue</span>
          </div>

          <div className={`p-4 rounded-2xl border shadow-xs ${isBalanced ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20' : 'bg-rose-50/50 border-rose-200 dark:bg-rose-950/20'}`}>
            <span className="text-xs font-bold uppercase tracking-wider block text-slate-600 dark:text-slate-300">
              Double-Entry Balance Verification
            </span>
            <div className="flex items-center gap-2 mt-2">
              {isBalanced ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm font-black text-emerald-700 dark:text-emerald-400">
                    BALANCED (Diff: Rs. 0.00)
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-rose-600" />
                  <span className="text-sm font-black text-rose-700 dark:text-rose-400">
                    DISCREPANCY: Rs. {Math.abs(totalDebit - totalCredit).toFixed(2)}
                  </span>
                </>
              )}
            </div>
            <span className="text-[10px] text-slate-400">Debits match credits exactly</span>
          </div>
        </div>

        {/* Filter and Search */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by code or account title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full sm:w-48 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Account Types</option>
              {['Asset', 'Liability', 'Equity', 'Revenue', 'CostOfGoodsSold', 'OperatingExpense'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Trial Balance Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading trial balance…</div>
          ) : loadError ? (
            <div className="p-8 text-center text-xs text-rose-500">{loadError}</div>
          ) : trialBalanceRows.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No account balances found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5">Code</th>
                    <th className="px-4 py-3.5">Account Title</th>
                    <th className="px-4 py-3.5">Classification</th>
                    <th className="px-4 py-3.5 text-right">Debit Balance (PKR)</th>
                    <th className="px-4 py-3.5 text-right">Credit Balance (PKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {trialBalanceRows.map((row) => (
                    <tr key={row._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {row.code}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        {row.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {row.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {row.debit > 0 ? `Rs. ${row.debit.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                        {row.credit > 0 ? `Rs. ${row.credit.toLocaleString()}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100/80 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-700 font-mono font-black text-xs">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 uppercase tracking-wider text-slate-900 dark:text-white">
                      TOTAL TRIAL BALANCE
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">
                      Rs. {totalDebit.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900 dark:text-white">
                      Rs. {totalCredit.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
