'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  FileText,
  Search,
  Filter,
  Calendar,
  ChevronDown,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  Printer,
  Download,
} from 'lucide-react';

export default function TransactionsReportPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedVouchers, setExpandedVouchers] = useState({});

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/finance');
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Unable to load transaction records');
      }
      setData(json.data);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Error loading transaction report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const journalEntries = useMemo(() => data?.journalEntries || [], [data]);

  const voucherTypes = useMemo(() => {
    const set = new Set(journalEntries.map((jv) => jv.voucherType || 'General').filter(Boolean));
    return ['ALL', ...Array.from(set)];
  }, [journalEntries]);

  const toggleExpand = (id) => {
    setExpandedVouchers((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const filteredEntries = useMemo(() => {
    return journalEntries.filter((jv) => {
      const matchesSearch =
        !searchTerm ||
        jv.voucherNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (jv.narration && jv.narration.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (jv.referenceNumber && jv.referenceNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (jv.lines || []).some(
          (l) =>
            l.accountCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
            l.accountName.toLowerCase().includes(searchTerm.toLowerCase())
        );

      const matchesType = typeFilter === 'ALL' || (jv.voucherType || 'General') === typeFilter;

      let matchesDate = true;
      if (startDate && jv.date) {
        matchesDate = matchesDate && new Date(jv.date) >= new Date(startDate);
      }
      if (endDate && jv.date) {
        matchesDate = matchesDate && new Date(jv.date) <= new Date(`${endDate}T23:59:59`);
      }

      return matchesSearch && matchesType && matchesDate;
    });
  }, [journalEntries, searchTerm, typeFilter, startDate, endDate]);

  const totals = useMemo(() => {
    let debits = 0;
    let credits = 0;
    filteredEntries.forEach((jv) => {
      debits += Number(jv.totalDebit || 0);
      credits += Number(jv.totalCredit || 0);
    });
    return { debits, credits };
  }, [filteredEntries]);

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <FileText className="w-7 h-7 text-indigo-600" />
              General Ledger Transactions
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Chronological registry of all posted accounting vouchers, journal adjustments, expenses, and revenues.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Ledger
            </button>
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Total Posted Debits
            </span>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-2 font-mono">
              Rs. {totals.debits.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Active ledger entries
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Total Posted Credits
            </span>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-2 font-mono">
              Rs. {totals.credits.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Balanced journal entries
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Net Balance Discrepancy
            </span>
            <p className={`text-xl font-black mt-2 font-mono ${Math.abs(totals.debits - totals.credits) < 0.01 ? 'text-emerald-600' : 'text-rose-600'}`}>
              Rs. {Math.abs(totals.debits - totals.credits).toFixed(2)}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {Math.abs(totals.debits - totals.credits) < 0.01 ? 'Perfect Zero Discrepancy' : 'Out of balance'}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search voucher #, narration, account name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {voucherTypes.map((t) => (
                <option key={t} value={t}>
                  {t === 'ALL' ? 'All Voucher Types' : t}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading ledger transactions…</div>
          ) : loadError ? (
            <div className="p-8 text-center text-xs text-rose-500">{loadError}</div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No transactions found matching your criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5 w-10"></th>
                    <th className="px-4 py-3.5">Voucher #</th>
                    <th className="px-4 py-3.5">Date</th>
                    <th className="px-4 py-3.5">Type</th>
                    <th className="px-4 py-3.5">Narration / Description</th>
                    <th className="px-4 py-3.5">Reference</th>
                    <th className="px-4 py-3.5 text-right">Debit (PKR)</th>
                    <th className="px-4 py-3.5 text-right">Credit (PKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredEntries.map((jv) => {
                    const isExpanded = Boolean(expandedVouchers[jv._id]);
                    return (
                      <React.Fragment key={jv._id}>
                        <tr
                          onClick={() => toggleExpand(jv._id)}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3 text-center">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {jv.voucherNumber}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {jv.date ? new Date(jv.date).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {jv.voucherType || 'Journal'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-white max-w-md">
                            {jv.narration}
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                            {jv.referenceNumber || '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            Rs. {Number(jv.totalDebit || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-600 dark:text-slate-400">
                            Rs. {Number(jv.totalCredit || 0).toLocaleString()}
                          </td>
                        </tr>

                        {/* Expandable Journal Lines Sub-table */}
                        {isExpanded && (
                          <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                            <td colSpan={8} className="p-3 pl-12 pr-6">
                              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-100/60 dark:bg-slate-800/80 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                                    <tr>
                                      <th className="px-3 py-2">Account Code</th>
                                      <th className="px-3 py-2">Account Title</th>
                                      <th className="px-3 py-2">Memo / Note</th>
                                      <th className="px-3 py-2 text-right">Debit (PKR)</th>
                                      <th className="px-3 py-2 text-right">Credit (PKR)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                                    {(jv.lines || []).map((line, lIdx) => (
                                      <tr key={lIdx}>
                                        <td className="px-3 py-2 font-bold text-indigo-600">{line.accountCode}</td>
                                        <td className="px-3 py-2 font-sans font-medium text-slate-800 dark:text-slate-200">
                                          {line.accountName}
                                        </td>
                                        <td className="px-3 py-2 font-sans text-slate-500">{line.memo || '—'}</td>
                                        <td className="px-3 py-2 text-right font-bold text-emerald-600">
                                          {Number(line.debit || 0) > 0 ? `Rs. ${Number(line.debit).toLocaleString()}` : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-bold text-slate-700 dark:text-slate-300">
                                          {Number(line.credit || 0) > 0 ? `Rs. ${Number(line.credit).toLocaleString()}` : '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
