'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  FileBarChart,
  Search,
  Filter,
  Calendar,
  Building,
  Printer,
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
} from 'lucide-react';

export default function AccountStatementsPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedAccountCode, setSelectedAccountCode] = useState('');
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
      if (json.data?.accounts?.length > 0 && !selectedAccountCode) {
        setSelectedAccountCode(json.data.accounts[0].code);
      }
    } catch (err) {
      setLoadError(err.message || 'Error loading statements');
    } finally {
      setLoading(false);
    }
  }, [selectedAccountCode]);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const accounts = useMemo(() => data?.accounts || [], [data]);
  const journalEntries = useMemo(() => data?.journalEntries || [], [data]);

  const selectedAccount = useMemo(() => {
    return accounts.find((a) => a.code === selectedAccountCode) || null;
  }, [accounts, selectedAccountCode]);

  const isNormalDebit = useMemo(() => {
    if (!selectedAccount) return true;
    return ['Asset', 'CostOfGoodsSold', 'OperatingExpense'].includes(selectedAccount.type);
  }, [selectedAccount]);

  // Extract all movements for the selected account sorted chronologically
  const movements = useMemo(() => {
    if (!selectedAccountCode) return [];
    const list = [];
    journalEntries.forEach((jv) => {
      (jv.lines || []).forEach((line) => {
        if (line.accountCode === selectedAccountCode) {
          list.push({
            date: jv.date ? new Date(jv.date) : new Date(jv.createdAt || Date.now()),
            voucherNumber: jv.voucherNumber,
            voucherType: jv.voucherType || 'JV',
            narration: line.memo || jv.narration || '',
            referenceNumber: jv.referenceNumber || '',
            debit: Number(line.debit || 0),
            credit: Number(line.credit || 0),
          });
        }
      });
    });

    // Sort ascending by date
    list.sort((a, b) => a.date - b.date);

    // Compute running balance
    let running = 0;
    return list.map((item) => {
      const movement = isNormalDebit ? item.debit - item.credit : item.credit - item.debit;
      running += movement;
      return {
        ...item,
        runningBalance: running,
      };
    });
  }, [journalEntries, selectedAccountCode, isNormalDebit]);

  // Filter by date range if provided
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      let matches = true;
      if (startDate) {
        matches = matches && m.date >= new Date(startDate);
      }
      if (endDate) {
        matches = matches && m.date <= new Date(`${endDate}T23:59:59`);
      }
      return matches;
    });
  }, [movements, startDate, endDate]);

  const totalDebits = useMemo(() => {
    return filteredMovements.reduce((sum, m) => sum + m.debit, 0);
  }, [filteredMovements]);

  const totalCredits = useMemo(() => {
    return filteredMovements.reduce((sum, m) => sum + m.credit, 0);
  }, [filteredMovements]);

  const closingBalance = useMemo(() => {
    if (filteredMovements.length === 0) return Number(selectedAccount?.balance || 0);
    return filteredMovements[filteredMovements.length - 1].runningBalance;
  }, [filteredMovements, selectedAccount]);

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <FileBarChart className="w-7 h-7 text-indigo-600" />
              Account Statement & Ledger
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              View individual ledger account statements with running balances and opening/closing totals.
            </p>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Statement
          </button>
        </div>

        {/* Account Selector & Filters Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-[280px]">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Select Ledger Account
            </label>
            <select
              value={selectedAccountCode}
              onChange={(e) => setSelectedAccountCode(e.target.value)}
              className="w-full px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {accounts.map((acc) => (
                <option key={acc.code} value={acc.code}>
                  [{acc.code}] {acc.name} ({acc.type}) — Bal: Rs. {Number(acc.balance || 0).toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                From Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                To Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Selected Account Overview Header Card */}
        {selectedAccount && (
          <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white shadow-md flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 text-indigo-300">
                  Code: {selectedAccount.code}
                </span>
                <span className="text-xs font-semibold text-slate-300">
                  {selectedAccount.type}
                </span>
              </div>
              <h2 className="text-xl font-black">{selectedAccount.name}</h2>
              <p className="text-xs text-slate-400 mt-1">
                Normal balance: {isNormalDebit ? 'Debit (Dr)' : 'Credit (Cr)'}
              </p>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-bold">
                  Period Debits
                </span>
                <span className="text-base font-black font-mono text-emerald-400">
                  Rs. {totalDebits.toLocaleString()}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 block font-bold">
                  Period Credits
                </span>
                <span className="text-base font-black font-mono text-slate-300">
                  Rs. {totalCredits.toLocaleString()}
                </span>
              </div>
              <div className="text-right pl-4 border-l border-white/10">
                <span className="text-[10px] uppercase tracking-wider text-indigo-300 block font-bold">
                  Closing Balance
                </span>
                <span className="text-xl font-black font-mono text-white">
                  Rs. {closingBalance.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Statements Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading ledger statement…</div>
          ) : loadError ? (
            <div className="p-8 text-center text-xs text-rose-500">{loadError}</div>
          ) : filteredMovements.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No transactions recorded for this account head in the selected date range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5">Date</th>
                    <th className="px-4 py-3.5">Voucher #</th>
                    <th className="px-4 py-3.5">Type</th>
                    <th className="px-4 py-3.5">Narration / Description</th>
                    <th className="px-4 py-3.5">Ref</th>
                    <th className="px-4 py-3.5 text-right">Debit (Dr)</th>
                    <th className="px-4 py-3.5 text-right">Credit (Cr)</th>
                    <th className="px-4 py-3.5 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredMovements.map((m, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {m.date ? m.date.toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {m.voucherNumber}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {m.voucherType}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white max-w-sm">
                        {m.narration}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                        {m.referenceNumber || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600">
                        {m.debit > 0 ? `Rs. ${m.debit.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-600 dark:text-slate-400">
                        {m.credit > 0 ? `Rs. ${m.credit.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white bg-slate-50/40 dark:bg-slate-800/20">
                        Rs. {m.runningBalance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
