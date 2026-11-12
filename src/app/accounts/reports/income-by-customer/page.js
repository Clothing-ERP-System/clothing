'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  Users,
  Search,
  Printer,
  Calendar,
  DollarSign,
  ArrowUpRight,
  Receipt,
  Building,
} from 'lucide-react';

export default function IncomeByCustomerPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

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
      setLoadError(err.message || 'Error loading customer income report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const customers = useMemo(() => data?.customers || [], [data]);
  const salesOrders = useMemo(() => data?.salesOrders || [], [data]);
  const incomes = useMemo(() => data?.incomes || [], [data]);

  // Aggregate by customer: total invoiced orders, total receipts, outstanding balance
  const customerBreakdown = useMemo(() => {
    return customers.map((c) => {
      const custOrders = salesOrders.filter((o) => o.customerId === c._id || o.customerName === c.name);
      const custIncomes = incomes.filter(
        (inc) => (inc.receivedFrom && inc.receivedFrom.toLowerCase().includes(c.name.toLowerCase()))
      );

      const totalBilled = custOrders.reduce((sum, o) => sum + Number(o.grandTotal || o.totalAmount || 0), 0);
      const totalAdvance = custOrders.reduce((sum, o) => sum + Number(o.advancePaid || o.paidAmount || 0), 0);
      const totalDirectIncome = custIncomes.reduce((sum, inc) => sum + Number(inc.amount || 0), 0);
      const totalReceived = totalAdvance + totalDirectIncome;
      const outstandingBalance = Number(c.balance ?? (totalBilled - totalReceived));

      return {
        _id: c._id,
        name: c.name,
        company: c.company || c.brandName || '',
        tier: c.tier || 'Standard',
        ordersCount: custOrders.length,
        incomesCount: custIncomes.length,
        totalBilled,
        totalReceived,
        outstandingBalance,
      };
    });
  }, [customers, salesOrders, incomes]);

  const filteredCustomers = useMemo(() => {
    return customerBreakdown.filter((c) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return c.name.toLowerCase().includes(term) || c.company.toLowerCase().includes(term);
    });
  }, [customerBreakdown, searchTerm]);

  const summary = useMemo(() => {
    let billed = 0;
    let received = 0;
    let outstanding = 0;
    filteredCustomers.forEach((c) => {
      billed += c.totalBilled;
      received += c.totalReceived;
      outstanding += c.outstandingBalance;
    });
    return { billed, received, outstanding };
  }, [filteredCustomers]);

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <Users className="w-7 h-7 text-indigo-600" />
              Income by Customer Report
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Detailed breakdown of garment sales billing, receipts collected, and receivables outstanding per customer.
            </p>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Report
          </button>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Total Invoiced Billing
            </span>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-2 font-mono">
              Rs. {summary.billed.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400">Total order billings</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Total Receipts Collected
            </span>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-2 font-mono">
              Rs. {summary.received.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400">Bank & cash received</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Total Receivables Outstanding
            </span>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-2 font-mono">
              Rs. {summary.outstanding.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400">Accounts receivable</span>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by customer name, brand or company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading customer income report…</div>
          ) : loadError ? (
            <div className="p-8 text-center text-xs text-rose-500">{loadError}</div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No customer records found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5">Customer / Company</th>
                    <th className="px-4 py-3.5">Tier</th>
                    <th className="px-4 py-3.5 text-center">Orders</th>
                    <th className="px-4 py-3.5 text-right">Total Billed (PKR)</th>
                    <th className="px-4 py-3.5 text-right">Total Received (PKR)</th>
                    <th className="px-4 py-3.5 text-right">Outstanding (PKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredCustomers.map((c) => (
                    <tr key={c._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        <div>{c.name}</div>
                        {c.company && <div className="text-[10px] text-slate-400">{c.company}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                          {c.tier}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono">
                        {c.ordersCount}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                        Rs. {c.totalBilled.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        Rs. {c.totalReceived.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                        Rs. {c.outstandingBalance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100/80 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-700 font-mono font-black text-xs">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 uppercase tracking-wider text-slate-900 dark:text-white">
                      TOTALS
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900 dark:text-white">
                      Rs. {summary.billed.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">
                      Rs. {summary.received.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-rose-600 dark:text-rose-400">
                      Rs. {summary.outstanding.toLocaleString()}
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
