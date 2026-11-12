'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  TrendingUp,
  Calendar,
  Printer,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  CheckCircle2,
} from 'lucide-react';

export default function ProfitAndLossPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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
      setLoadError(err.message || 'Error loading P&L data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const accounts = useMemo(() => data?.accounts || [], [data]);
  const journalEntries = useMemo(() => data?.journalEntries || [], [data]);

  // Compute period revenue, COGS, and operating expenses from journal entries if dates are set,
  // or from account balances as lifetime totals
  const pnlData = useMemo(() => {
    const isFiltered = Boolean(startDate || endDate);

    // If date filtered, accumulate from journal entry lines
    if (isFiltered) {
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(`${endDate}T23:59:59`) : new Date(8640000000000000);

      const revenueByAccount = {};
      const cogsByAccount = {};
      const expenseByAccount = {};

      const accountsMap = new Map(accounts.map((a) => [a.code, a]));

      journalEntries.forEach((jv) => {
        const jvDate = jv.date ? new Date(jv.date) : new Date(jv.createdAt);
        if (jvDate >= start && jvDate <= end) {
          (jv.lines || []).forEach((line) => {
            const acc = accountsMap.get(line.accountCode);
            if (!acc) return;
            const debit = Number(line.debit || 0);
            const credit = Number(line.credit || 0);

            if (acc.type === 'Revenue') {
              const net = credit - debit;
              revenueByAccount[acc.code] = (revenueByAccount[acc.code] || 0) + net;
            } else if (acc.type === 'CostOfGoodsSold') {
              const net = debit - credit;
              cogsByAccount[acc.code] = (cogsByAccount[acc.code] || 0) + net;
            } else if (acc.type === 'OperatingExpense') {
              const net = debit - credit;
              expenseByAccount[acc.code] = (expenseByAccount[acc.code] || 0) + net;
            }
          });
        }
      });

      const revenueItems = accounts
        .filter((a) => a.type === 'Revenue')
        .map((a) => ({ code: a.code, name: a.name, amount: revenueByAccount[a.code] || 0 }));

      const cogsItems = accounts
        .filter((a) => a.type === 'CostOfGoodsSold')
        .map((a) => ({ code: a.code, name: a.name, amount: cogsByAccount[a.code] || 0 }));

      const expenseItems = accounts
        .filter((a) => a.type === 'OperatingExpense')
        .map((a) => ({ code: a.code, name: a.name, amount: expenseByAccount[a.code] || 0 }));

      const totalRevenue = revenueItems.reduce((s, i) => s + i.amount, 0);
      const totalCogs = cogsItems.reduce((s, i) => s + i.amount, 0);
      const grossProfit = totalRevenue - totalCogs;
      const totalExpenses = expenseItems.reduce((s, i) => s + i.amount, 0);
      const netProfit = grossProfit - totalExpenses;

      return {
        revenueItems,
        totalRevenue,
        cogsItems,
        totalCogs,
        grossProfit,
        expenseItems,
        totalExpenses,
        netProfit,
      };
    }

    // Default: use general ledger account current balances
    const revenueItems = accounts
      .filter((a) => a.type === 'Revenue')
      .map((a) => ({ code: a.code, name: a.name, amount: Number(a.balance || 0) }));

    const cogsItems = accounts
      .filter((a) => a.type === 'CostOfGoodsSold')
      .map((a) => ({ code: a.code, name: a.name, amount: Number(a.balance || 0) }));

    const expenseItems = accounts
      .filter((a) => a.type === 'OperatingExpense')
      .map((a) => ({ code: a.code, name: a.name, amount: Number(a.balance || 0) }));

    const totalRevenue = revenueItems.reduce((s, i) => s + i.amount, 0);
    const totalCogs = cogsItems.reduce((s, i) => s + i.amount, 0);
    const grossProfit = totalRevenue - totalCogs;
    const totalExpenses = expenseItems.reduce((s, i) => s + i.amount, 0);
    const netProfit = grossProfit - totalExpenses;

    return {
      revenueItems,
      totalRevenue,
      cogsItems,
      totalCogs,
      grossProfit,
      expenseItems,
      totalExpenses,
      netProfit,
    };
  }, [accounts, journalEntries, startDate, endDate]);

  const grossMargin = useMemo(() => {
    if (!pnlData.totalRevenue) return 0;
    return ((pnlData.grossProfit / pnlData.totalRevenue) * 100).toFixed(1);
  }, [pnlData]);

  const netMargin = useMemo(() => {
    if (!pnlData.totalRevenue) return 0;
    return ((pnlData.netProfit / pnlData.totalRevenue) * 100).toFixed(1);
  }, [pnlData]);

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <TrendingUp className="w-7 h-7 text-indigo-600" />
              Profit & Loss Statement (Income Statement)
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Comprehensive report of operational performance, gross margins, and net earnings derived from posted ledger transactions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print P&L
            </button>
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-slate-500">Period:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
            >
              Reset to All-Time
            </button>
          )}
        </div>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Total Revenue
            </span>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-2 font-mono">
              Rs. {pnlData.totalRevenue.toLocaleString()}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Cost of Goods (COGS)
            </span>
            <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-2 font-mono">
              Rs. {pnlData.totalCogs.toLocaleString()}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Gross Profit
            </span>
            <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-2 font-mono">
              Rs. {pnlData.grossProfit.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400">Margin: {grossMargin}%</span>
          </div>

          <div className={`p-4 rounded-2xl border shadow-xs ${pnlData.netProfit >= 0 ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900' : 'bg-rose-50/50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900'}`}>
            <span className="text-[11px] font-bold uppercase tracking-wider block text-slate-600 dark:text-slate-300">
              Net Profit / (Loss)
            </span>
            <p className={`text-xl font-black mt-2 font-mono ${pnlData.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              Rs. {pnlData.netProfit.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-500">Net Margin: {netMargin}%</span>
          </div>
        </div>

        {/* Structured Income Statement Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs p-6 space-y-6">
          {/* 1. Operating Revenue Section */}
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                1. Operating Revenue & Sales
              </h3>
              <span className="text-xs font-mono font-bold text-emerald-600">
                Rs. {pnlData.totalRevenue.toLocaleString()}
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 mt-2">
              {pnlData.revenueItems.length === 0 ? (
                <div className="py-2 text-xs text-slate-400 italic">No revenue heads recorded.</div>
              ) : (
                pnlData.revenueItems.map((item) => (
                  <div key={item.code} className="py-2 flex items-center justify-between text-xs">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      <span className="font-mono text-slate-400 mr-2">[{item.code}]</span>
                      {item.name}
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      Rs. {item.amount.toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 2. Cost of Goods Sold Section */}
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                2. Cost of Goods Sold (COGS)
              </h3>
              <span className="text-xs font-mono font-bold text-amber-600">
                (Rs. {pnlData.totalCogs.toLocaleString()})
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 mt-2">
              {pnlData.cogsItems.length === 0 ? (
                <div className="py-2 text-xs text-slate-400 italic">No direct manufacturing costs recorded.</div>
              ) : (
                pnlData.cogsItems.map((item) => (
                  <div key={item.code} className="py-2 flex items-center justify-between text-xs">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      <span className="font-mono text-slate-400 mr-2">[{item.code}]</span>
                      {item.name}
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      Rs. {item.amount.toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* GROSS PROFIT SUB-TOTAL */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between font-bold text-xs border border-slate-200 dark:border-slate-700">
            <span className="text-slate-900 dark:text-white uppercase tracking-wider">
              GROSS PROFIT
            </span>
            <span className="font-mono text-sm font-black text-indigo-600 dark:text-indigo-400">
              Rs. {pnlData.grossProfit.toLocaleString()}
            </span>
          </div>

          {/* 3. Operating Expenses Section */}
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                3. Operating, Administrative & Selling Expenses
              </h3>
              <span className="text-xs font-mono font-bold text-rose-600">
                (Rs. {pnlData.totalExpenses.toLocaleString()})
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 mt-2">
              {pnlData.expenseItems.length === 0 ? (
                <div className="py-2 text-xs text-slate-400 italic">No operating expenses recorded.</div>
              ) : (
                pnlData.expenseItems.map((item) => (
                  <div key={item.code} className="py-2 flex items-center justify-between text-xs">
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      <span className="font-mono text-slate-400 mr-2">[{item.code}]</span>
                      {item.name}
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">
                      Rs. {item.amount.toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* NET PROFIT TOTAL */}
          <div className={`p-4 rounded-xl flex items-center justify-between font-bold text-sm border ${pnlData.netProfit >= 0 ? 'bg-emerald-500/10 border-emerald-500 text-emerald-800 dark:text-emerald-300' : 'bg-rose-500/10 border-rose-500 text-rose-800 dark:text-rose-300'}`}>
            <span className="uppercase tracking-wider font-black">
              NET OPERATING PROFIT / (LOSS)
            </span>
            <span className="font-mono text-base font-black">
              Rs. {pnlData.netProfit.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </Layout>
  );
}
