'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  Truck,
  Search,
  Printer,
  Calendar,
  Receipt,
  RotateCcw,
  Building,
} from 'lucide-react';

export default function ExpenseBySupplierPage() {
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
      setLoadError(err.message || 'Error loading supplier expense report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const suppliers = useMemo(() => data?.suppliers || [], [data]);
  const purchaseOrders = useMemo(() => data?.purchaseOrders || [], [data]);
  const purchaseReturns = useMemo(() => data?.purchaseReturns || [], [data]);
  const expenses = useMemo(() => data?.expenses || [], [data]);

  // Aggregate procurement purchases, deducted returns, direct expenses, and payables per supplier
  const supplierBreakdown = useMemo(() => {
    return suppliers.map((s) => {
      const suppPOs = purchaseOrders.filter(
        (po) => po.supplierId === s._id || po.supplierName === s.name
      );
      const suppReturns = purchaseReturns.filter(
        (pr) => pr.supplierId === s._id || pr.supplierName === s.name
      );
      const suppDirectExpenses = expenses.filter(
        (exp) => exp.paidTo && exp.paidTo.toLowerCase().includes(s.name.toLowerCase())
      );

      const grossPurchases = suppPOs.reduce(
        (sum, po) => sum + Number(po.totalCost || po.totalAmount || 0),
        0
      );
      const returnsDeduction = suppReturns.reduce(
        (sum, pr) => sum + Number(pr.totalRefundAmount || 0),
        0
      );
      const netPurchases = Math.max(0, grossPurchases - returnsDeduction);
      const directExpenseAmount = suppDirectExpenses.reduce(
        (sum, exp) => sum + Number(exp.amount || 0),
        0
      );
      const totalPaid = suppPOs.reduce((sum, po) => sum + Number(po.paidAmount || 0), 0) + directExpenseAmount;
      const payableBalance = Number(s.balance ?? Math.max(0, netPurchases - totalPaid));

      return {
        _id: s._id,
        name: s.name,
        contactPerson: s.contactPerson || '',
        category: s.category || 'Fabric & Trims',
        posCount: suppPOs.length,
        returnsCount: suppReturns.length,
        grossPurchases,
        returnsDeduction,
        netPurchases,
        directExpenseAmount,
        totalPaid,
        payableBalance,
      };
    });
  }, [suppliers, purchaseOrders, purchaseReturns, expenses]);

  const filteredSuppliers = useMemo(() => {
    return supplierBreakdown.filter((s) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        s.name.toLowerCase().includes(term) ||
        s.contactPerson.toLowerCase().includes(term) ||
        s.category.toLowerCase().includes(term)
      );
    });
  }, [supplierBreakdown, searchTerm]);

  const summary = useMemo(() => {
    let gross = 0;
    let returns = 0;
    let net = 0;
    let paid = 0;
    let payable = 0;
    filteredSuppliers.forEach((s) => {
      gross += s.grossPurchases;
      returns += s.returnsDeduction;
      net += s.netPurchases;
      paid += s.totalPaid;
      payable += s.payableBalance;
    });
    return { gross, returns, net, paid, payable };
  }, [filteredSuppliers]);

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <Truck className="w-7 h-7 text-indigo-600" />
              Expense & Purchases by Supplier
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Accurate breakdown of purchase orders, purchase returns deduction, payments made, and accounts payable per vendor.
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
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Gross Purchases
            </span>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-2 font-mono">
              Rs. {summary.gross.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400">Total vendor POs</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Returns Deductions
            </span>
            <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-2 font-mono">
              (Rs. {summary.returns.toLocaleString()})
            </p>
            <span className="text-[10px] text-slate-400">Stock returns credit</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Total Payments Made
            </span>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-2 font-mono">
              Rs. {summary.paid.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400">Disbursements to date</span>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              Accounts Payable
            </span>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-2 font-mono">
              Rs. {summary.payable.toLocaleString()}
            </p>
            <span className="text-[10px] text-slate-400">Net vendor liability</span>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by supplier name, category or contact person..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading supplier expense report…</div>
          ) : loadError ? (
            <div className="p-8 text-center text-xs text-rose-500">{loadError}</div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No supplier records found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5">Supplier Name</th>
                    <th className="px-4 py-3.5">Category</th>
                    <th className="px-4 py-3.5 text-center">POs / Returns</th>
                    <th className="px-4 py-3.5 text-right">Gross Purchases</th>
                    <th className="px-4 py-3.5 text-right">Returns (Credit)</th>
                    <th className="px-4 py-3.5 text-right">Net Purchases</th>
                    <th className="px-4 py-3.5 text-right">Paid Amount</th>
                    <th className="px-4 py-3.5 text-right">Payable Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredSuppliers.map((s) => (
                    <tr key={s._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        <div>{s.name}</div>
                        {s.contactPerson && <div className="text-[10px] text-slate-400">{s.contactPerson}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {s.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono">
                        <span className="font-bold">{s.posCount}</span> / <span className="text-amber-600 font-bold">{s.returnsCount}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                        Rs. {s.grossPurchases.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-amber-600">
                        {s.returnsDeduction > 0 ? `Rs. ${s.returnsDeduction.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        Rs. {s.netPurchases.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        Rs. {s.totalPaid.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                        Rs. {s.payableBalance.toLocaleString()}
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
                      Rs. {summary.gross.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-amber-600">
                      Rs. {summary.returns.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900 dark:text-white">
                      Rs. {summary.net.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400">
                      Rs. {summary.paid.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-rose-600 dark:text-rose-400">
                      Rs. {summary.payable.toLocaleString()}
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
