'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  Percent,
  Search,
  Printer,
  Calendar,
  Receipt,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

export default function SalesTaxReportPage() {
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
      setLoadError(err.message || 'Error loading sales tax data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const salesOrders = useMemo(() => data?.salesOrders || [], [data]);
  const posTransactions = useMemo(() => data?.posTransactions || [], [data]);
  const purchaseOrders = useMemo(() => data?.purchaseOrders || [], [data]);
  const accounts = useMemo(() => data?.accounts || [], [data]);

  // Output Tax (Sales Orders + POS)
  const outputTaxRows = useMemo(() => {
    const rows = [];

    // Sales Orders with Tax
    salesOrders.forEach((so) => {
      const taxRate = Number(so.taxRate || 0);
      const taxAmount = Number(so.taxAmount || 0);
      const taxableAmount = Number(so.subtotal || so.totalAmount || 0);
      if (taxAmount > 0 || taxRate > 0) {
        rows.push({
          source: 'Sales Order',
          ref: so.orderNumber || so._id,
          date: so.orderDate ? new Date(so.orderDate) : new Date(so.createdAt),
          party: so.customerName || 'Customer',
          taxableAmount,
          taxRate: taxRate || (taxableAmount > 0 ? ((taxAmount / taxableAmount) * 100).toFixed(1) : 0),
          taxAmount: taxAmount || (taxableAmount * taxRate) / 100,
          type: 'OUTPUT',
        });
      }
    });

    // POS Transactions with Tax
    posTransactions.forEach((pos) => {
      const taxAmount = Number(pos.taxAmount || pos.tax || 0);
      const taxableAmount = Number(pos.subtotal || (pos.total - taxAmount) || 0);
      if (taxAmount > 0) {
        rows.push({
          source: 'Retail POS',
          ref: pos.receiptNumber || pos._id,
          date: pos.createdAt ? new Date(pos.createdAt) : new Date(),
          party: pos.customerName || 'Walk-in Retail',
          taxableAmount,
          taxRate: taxableAmount > 0 ? ((taxAmount / taxableAmount) * 100).toFixed(1) : 0,
          taxAmount,
          type: 'OUTPUT',
        });
      }
    });

    return rows;
  }, [salesOrders, posTransactions]);

  // Input Tax (Purchase Orders)
  const inputTaxRows = useMemo(() => {
    const rows = [];
    purchaseOrders.forEach((po) => {
      const taxRate = Number(po.taxRate || 0);
      const taxAmount = Number(po.taxAmount || 0);
      const taxableAmount = Number(po.subtotal || po.totalCost || 0);
      if (taxAmount > 0 || taxRate > 0) {
        rows.push({
          source: 'Purchase Order',
          ref: po.poNumber || po._id,
          date: po.orderDate ? new Date(po.orderDate) : new Date(po.createdAt),
          party: po.supplierName || 'Supplier',
          taxableAmount,
          taxRate: taxRate || (taxableAmount > 0 ? ((taxAmount / taxableAmount) * 100).toFixed(1) : 0),
          taxAmount: taxAmount || (taxableAmount * taxRate) / 100,
          type: 'INPUT',
        });
      }
    });
    return rows;
  }, [purchaseOrders]);

  // Filtered rows by date
  const filteredOutput = useMemo(() => {
    return outputTaxRows.filter((r) => {
      let match = true;
      if (startDate) match = match && r.date >= new Date(startDate);
      if (endDate) match = match && r.date <= new Date(`${endDate}T23:59:59`);
      return match;
    });
  }, [outputTaxRows, startDate, endDate]);

  const filteredInput = useMemo(() => {
    return inputTaxRows.filter((r) => {
      let match = true;
      if (startDate) match = match && r.date >= new Date(startDate);
      if (endDate) match = match && r.date <= new Date(`${endDate}T23:59:59`);
      return match;
    });
  }, [inputTaxRows, startDate, endDate]);

  const totalOutputTax = useMemo(() => {
    return filteredOutput.reduce((sum, r) => sum + r.taxAmount, 0);
  }, [filteredOutput]);

  const totalInputTax = useMemo(() => {
    return filteredInput.reduce((sum, r) => sum + r.taxAmount, 0);
  }, [filteredInput]);

  const netTaxPayable = useMemo(() => {
    return Math.max(0, totalOutputTax - totalInputTax);
  }, [totalOutputTax, totalInputTax]);

  const taxAccount = useMemo(() => {
    return accounts.find((a) => a.code === '2020' || /tax/i.test(a.name));
  }, [accounts]);

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <Percent className="w-7 h-7 text-indigo-600" />
              Sales Tax & FBR / PRA Summary Report
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Comprehensive statement of Output Tax collected, Input Tax adjustment, and Net Tax Liability payable.
            </p>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Tax Report
          </button>
        </div>

        {/* Date Filters */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-slate-500">Tax Period:</span>
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

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Output Tax (Sales)
            </span>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-2 font-mono">
              Rs. {totalOutputTax.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400">{filteredOutput.length} taxable invoices</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Input Tax (Purchases)
            </span>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-2 font-mono">
              Rs. {totalInputTax.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400">Eligible input credit</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Net Tax Payable
            </span>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-2 font-mono">
              Rs. {netTaxPayable.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400">Output minus Input</span>
          </div>

          <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider block text-indigo-700 dark:text-indigo-300">
              GL Tax Payable Account
            </span>
            <p className="text-xl font-black text-indigo-900 dark:text-indigo-200 mt-2 font-mono">
              Rs. {Number(taxAccount?.balance || 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-indigo-500">Head: [{taxAccount?.code || '2020'}]</span>
          </div>
        </div>

        {/* Output Tax Breakdown Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Output Tax Collected (Sales Orders & Retail POS)
            </h3>
            <span className="text-xs font-mono font-bold text-indigo-600">
              Rs. {totalOutputTax.toLocaleString()}
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading output tax records…</div>
          ) : filteredOutput.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No taxable sales transactions recorded for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Reference #</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3 text-right">Taxable Base</th>
                    <th className="px-4 py-3 text-center">Tax Rate</th>
                    <th className="px-4 py-3 text-right">Tax Collected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredOutput.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-bold text-indigo-600">{row.source}</td>
                      <td className="px-4 py-2.5 font-mono">{row.ref}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{row.date.toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">{row.party}</td>
                      <td className="px-4 py-2.5 text-right font-mono">Rs. {row.taxableAmount.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-center font-mono">{row.taxRate}%</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                        Rs. {row.taxAmount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Input Tax Breakdown Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Input Tax Paid on Raw Material Purchases (Credit)
            </h3>
            <span className="text-xs font-mono font-bold text-emerald-600">
              Rs. {totalInputTax.toLocaleString()}
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading input tax records…</div>
          ) : filteredInput.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No input tax recorded for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">PO Number</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Supplier</th>
                    <th className="px-4 py-3 text-right">Taxable Base</th>
                    <th className="px-4 py-3 text-center">Tax Rate</th>
                    <th className="px-4 py-3 text-right">Input Tax Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredInput.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5 font-bold text-teal-600">{row.source}</td>
                      <td className="px-4 py-2.5 font-mono">{row.ref}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{row.date.toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-white">{row.party}</td>
                      <td className="px-4 py-2.5 text-right font-mono">Rs. {row.taxableAmount.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-center font-mono">{row.taxRate}%</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-600">
                        Rs. {row.taxAmount.toLocaleString()}
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
