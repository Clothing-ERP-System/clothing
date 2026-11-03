'use client';

import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { canAccessModule } from '@/lib/role-access.js';
import {
  BarChart3,
  Download,
  Printer,
  FileSpreadsheet,
  TrendingUp,
  Layers,
  Shirt,
  DollarSign,
  Calendar,
  Filter,
  ShoppingCart,
  Truck,
  Users,
  BookOpen,
} from 'lucide-react';

export default function ReportsAnalyticsPage() {
  const { addToast, currentBranch, user } = useAuth();
  const canExport = canAccessModule(user, 'reports', 'export');
  const [reportType, setReportType] = useState('production'); // 'production', 'fabric', 'valuation', 'sales', 'procurement', 'hr', 'finance'
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [productionOrders, setProductionOrders] = useState([]);
  const [fabrics, setFabrics] = useState([]);
  const [trims, setTrims] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [payrollSlips, setPayrollSlips] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);

  useEffect(() => {
    async function fetchReportsData() {
      try {
        const [resProd, resFab, resTrim, resSales, resProc, resHr, resFin] = await Promise.all([
          fetch('/api/production'),
          fetch('/api/fabric'),
          fetch('/api/trims'),
          fetch('/api/sales'),
          fetch('/api/procurement'),
          fetch('/api/hr'),
          fetch('/api/finance'),
        ]);
        const [jsonProd, jsonFab, jsonTrim, jsonSales, jsonProc, jsonHr, jsonFin] = await Promise.all([
          resProd.json(),
          resFab.json(),
          resTrim.json(),
          resSales.json(),
          resProc.json(),
          resHr.json(),
          resFin.json(),
        ]);
        if (jsonProd.success) setProductionOrders(jsonProd.data.productionOrders || []);
        if (jsonFab.success) setFabrics(jsonFab.data.fabrics || []);
        if (jsonTrim.success) setTrims(jsonTrim.data.trims || []);
        if (jsonSales.success) setSalesOrders(jsonSales.data.salesOrders || jsonSales.data.orders || []);
        if (jsonProc.success) setPurchaseOrders(jsonProc.data.purchaseOrders || []);
        if (jsonHr.success) setPayrollSlips(jsonHr.data.payrollSlips || []);
        if (jsonFin.success) setJournalEntries(jsonFin.data.journalEntries || jsonFin.data.recentJournalEntries || []);
      } catch (err) {
        console.error('Error fetching report data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchReportsData();
  }, []);

  // Compute live production report
  const productionReport = productionOrders.map((po) => ({
    line: po.stitchingLine || '',
    orderNumber: po.productionOrderNumber,
    article: po.articleName || po.designCode,
    target: po.targetQuantity || 0,
    actual: po.completedQuantity || 0,
    efficiency: po.targetQuantity > 0 ? Math.round((po.completedQuantity / po.targetQuantity) * 100) : 0,
    rejects: po.rejectedQuantity || 0,
    status: po.status,
  }));

  // Compute live fabric report
  const fabricReport = fabrics.map((f) => {
    const rolls = f.rolls || [];
    const activeRolls = rolls.filter((roll) => roll.status !== 'Voided');
    const totalRollMeters = rolls.reduce((sum, roll) => sum + (Number(roll.initialMeters) || 0), 0);
    const remainingRollMeters = activeRolls.reduce((sum, roll) => sum + (Number(roll.remainingMeters) || 0), 0);
    const consumed = Math.max(0, totalRollMeters - remainingRollMeters);

    return {
      fabricCode: f.fabricCode,
      name: f.name,
      type: f.fabricType,
      rollsCount: activeRolls.length,
      initialMeters: totalRollMeters,
      remainingMeters: remainingRollMeters,
      consumedMeters: consumed,
      costPerMeter: f.averageCostPerMeter,
      totalValuation: remainingRollMeters * (f.averageCostPerMeter || 0),
    };
  });

  // Stock Valuation Report
  const totalFabricValuation = fabricReport.reduce((sum, f) => sum + f.totalValuation, 0);
  const totalTrimValuation = trims.reduce((sum, t) => sum + (t.currentStock || 0) * (t.unitCost || 0), 0);
  const grandTotalValuation = totalFabricValuation + totalTrimValuation;

  // Sales totals
  const totalSalesRevenue = salesOrders.reduce((sum, o) => sum + Number(o.grandTotal || o.totalAmount || 0), 0);

  // Procurement totals
  const totalProcurementSpend = purchaseOrders.reduce((sum, p) => sum + Number(p.totalAmount || p.grandTotal || 0), 0);

  // Payroll totals
  const totalPayrollPayable = payrollSlips.reduce((sum, s) => sum + Number(s.netPayablePKR || 0), 0);

  const exportReport = async (format) => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ type: reportType, format });
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      const branch = user?.role === 'SuperAdmin' ? branchFilter.trim() : currentBranch;
      if (branch) params.set('branch', branch);
      const response = await fetch(`/api/reports/export?${params}`);
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || 'Report export failed');
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `erp-dost-${reportType}-report.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      addToast(`${format.toUpperCase()} report downloaded`, 'success');
    } catch (error) {
      addToast(error.message || 'Report export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                ERP DOST ANALYTICS
              </span>
              <span className="text-xs text-slate-500 font-medium">• Enterprise Operational & Financial Reports</span>
            </div>
            <h1 className="text-xl font-black text-slate-900 mt-1.5 tracking-tight">
              Reports & Operational Intelligence
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Live manufacturing data, procurement, sales, payroll, inventory, and general ledger reports
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Audit</span>
            </button>

            {canExport && (
              <>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => exportReport('xlsx')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-all cursor-pointer shadow-md shadow-indigo-600/20 active:scale-95"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{exporting ? 'Preparing…' : 'Export Excel'}</span>
                </button>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => exportReport('pdf')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export PDF</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label className="text-[11px] font-bold text-slate-600">
            From
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-normal" />
          </label>
          <label className="text-[11px] font-bold text-slate-600">
            To
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 block rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-normal" />
          </label>
          {user?.role === 'SuperAdmin' && (
            <label className="text-[11px] font-bold text-slate-600">
              Branch filter
              <input value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} placeholder="All branches" className="mt-1 block rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-normal" />
            </label>
          )}
          {['fabric', 'valuation'].includes(reportType) && (
            <span className="text-[11px] text-slate-500">Stock reports show current balances; date range applies to operational transaction reports.</span>
          )}
        </div>

        {/* Report Selector Tabs */}
        <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
          <button
            onClick={() => setReportType('production')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              reportType === 'production'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shirt className="w-4 h-4" />
            <span>Production Output</span>
          </button>

          <button
            onClick={() => setReportType('fabric')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              reportType === 'fabric'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Fabric Consumption</span>
          </button>

          <button
            onClick={() => setReportType('valuation')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              reportType === 'valuation'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Stock Valuation</span>
          </button>

          <button
            onClick={() => setReportType('sales')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              reportType === 'sales'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Sales & Orders</span>
          </button>

          <button
            onClick={() => setReportType('procurement')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              reportType === 'procurement'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Procurement & POs</span>
          </button>

          <button
            onClick={() => setReportType('hr')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              reportType === 'hr'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Payroll Slips</span>
          </button>

          <button
            onClick={() => setReportType('finance')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              reportType === 'finance'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Financial Ledger</span>
          </button>
        </div>

        {/* Print Header */}
        <div className="hidden print:block text-center pb-4 border-b border-slate-300">
          <h2 className="text-lg font-bold">ERP DOST APPAREL & MANUFACTURING</h2>
          <p className="text-xs">Official Enterprise Audit Report</p>
          <p className="text-xs text-slate-500">Generated: {new Date().toLocaleString()}</p>
        </div>

        {/* Report 1: Production Output */}
        {reportType === 'production' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Stitching Line Output & Operator Efficiency</h3>
                <p className="text-xs text-slate-500">Live batches, target vs completed pieces, and line efficiencies</p>
              </div>
            </div>

            {productionReport.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Shirt className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-600">No production orders logged</p>
                <p className="text-[11px] text-slate-400">Start a production batch to view live efficiency data.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold">
                      <th className="py-3 px-4">Order #</th>
                      <th className="py-3 px-4">Line</th>
                      <th className="py-3 px-4">Article</th>
                      <th className="py-3 px-4">Target (Pcs)</th>
                      <th className="py-3 px-4">Completed (Pcs)</th>
                      <th className="py-3 px-4">Efficiency</th>
                      <th className="py-3 px-4">Rejects</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productionReport.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{r.orderNumber}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{r.line}</td>
                        <td className="py-3 px-4 text-slate-600">{r.article}</td>
                        <td className="py-3 px-4 font-semibold">{r.target}</td>
                        <td className="py-3 px-4 font-bold text-indigo-600">{r.actual}</td>
                        <td className="py-3 px-4 font-bold text-emerald-600">{r.efficiency}%</td>
                        <td className="py-3 px-4 text-amber-600 font-semibold">{r.rejects}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700">
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Report 2: Fabric Consumption */}
        {reportType === 'fabric' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Fabric Stock & Consumption Ledger</h3>
              <p className="text-xs text-slate-500">Live meters in rolls vs consumed</p>
            </div>

            {fabricReport.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Layers className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-600">No fabric data recorded</p>
                <p className="text-[11px] text-slate-400">Receive fabric rolls in Inventory to see consumption audit.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold">
                      <th className="py-3 px-4">Code</th>
                      <th className="py-3 px-4">Fabric Name</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Total Received</th>
                      <th className="py-3 px-4">Remaining Balance</th>
                      <th className="py-3 px-4">Consumed</th>
                      <th className="py-3 px-4">Rate (PKR)</th>
                      <th className="py-3 px-4 text-right">Valuation (PKR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fabricReport.map((f, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{f.fabricCode}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{f.name}</td>
                        <td className="py-3 px-4 text-slate-600">{f.type}</td>
                        <td className="py-3 px-4">{f.initialMeters} m</td>
                        <td className="py-3 px-4 font-bold text-indigo-600">{f.remainingMeters} m</td>
                        <td className="py-3 px-4 text-amber-600 font-semibold">{f.consumedMeters} m</td>
                        <td className="py-3 px-4">Rs. {f.costPerMeter}</td>
                        <td className="py-3 px-4 text-right font-black text-slate-900">
                          Rs. {f.totalValuation.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Report 3: Stock Valuation */}
        {reportType === 'valuation' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Total Material Stock Valuation</h3>
                <p className="text-xs text-slate-500">Fabric rolls + trims inventory value</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block">Total Balance Value</span>
                <span className="text-lg font-black text-emerald-600">
                  Rs. {grandTotalValuation.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-bold text-slate-700 block mb-1">Fabric Rolls Inventory</span>
                <span className="text-xl font-black text-slate-900">Rs. {totalFabricValuation.toLocaleString()}</span>
                <p className="text-[11px] text-slate-500 mt-1">{fabricReport.length} Fabric varieties tracked</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-bold text-slate-700 block mb-1">Trims & Accessories Stock</span>
                <span className="text-xl font-black text-slate-900">Rs. {totalTrimValuation.toLocaleString()}</span>
                <p className="text-[11px] text-slate-500 mt-1">{trims.length} Trim items in inventory</p>
              </div>
            </div>
          </div>
        )}

        {/* Report 4: Sales Orders */}
        {reportType === 'sales' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Sales Orders & Commercial Revenue</h3>
                <p className="text-xs text-slate-500">Commercial customer orders, item counts, totals and statuses</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block">Total Revenue</span>
                <span className="text-lg font-black text-indigo-600">
                  Rs. {totalSalesRevenue.toLocaleString()}
                </span>
              </div>
            </div>

            {salesOrders.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <ShoppingCart className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-600">No sales orders logged</p>
                <p className="text-[11px] text-slate-400">Record a sales order to view commercial revenue data.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold">
                      <th className="py-3 px-4">Order #</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Branch</th>
                      <th className="py-3 px-4">Items</th>
                      <th className="py-3 px-4 text-right">Total (PKR)</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {salesOrders.map((o, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{o.orderNumber}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{o.customerName}</td>
                        <td className="py-3 px-4 text-slate-500">{o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '-'}</td>
                        <td className="py-3 px-4 text-slate-600">{o.outletBranch || o.branch || '-'}</td>
                        <td className="py-3 px-4 text-slate-600">{Array.isArray(o.items) ? o.items.length : 0}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                          Rs. {Number(o.grandTotal || o.totalAmount || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700">
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Report 5: Procurement */}
        {reportType === 'procurement' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Procurement & Purchase Orders</h3>
                <p className="text-xs text-slate-500">Fabric & trim purchases, delivery statuses and payments</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block">Total Spend</span>
                <span className="text-lg font-black text-amber-600">
                  Rs. {totalProcurementSpend.toLocaleString()}
                </span>
              </div>
            </div>

            {purchaseOrders.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Truck className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-600">No purchase orders found</p>
                <p className="text-[11px] text-slate-400">Issue purchase orders in Procurement to track procurement audit.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold">
                      <th className="py-3 px-4">PO #</th>
                      <th className="py-3 px-4">Supplier</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Items</th>
                      <th className="py-3 px-4 text-right">Total (PKR)</th>
                      <th className="py-3 px-4">Approval Status</th>
                      <th className="py-3 px-4">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchaseOrders.map((po, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{po.poNumber}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{po.supplierName}</td>
                        <td className="py-3 px-4 text-slate-500">{po.createdAt ? new Date(po.createdAt).toLocaleDateString() : '-'}</td>
                        <td className="py-3 px-4 text-slate-600">{Array.isArray(po.items) ? po.items.length : 0}</td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                          Rs. {Number(po.totalAmount || po.grandTotal || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            po.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {po.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                            {po.paymentStatus || 'Pending'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Report 6: Payroll */}
        {reportType === 'hr' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">HR & Payroll Disbursement Ledger</h3>
                <p className="text-xs text-slate-500">Employee monthly salaries, piece-rate wages and payment audit</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block">Total Payroll</span>
                <span className="text-lg font-black text-emerald-600">
                  Rs. {totalPayrollPayable.toLocaleString()}
                </span>
              </div>
            </div>

            {payrollSlips.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-600">No payroll slips generated</p>
                <p className="text-[11px] text-slate-400">Generate payroll in HR to track wage disbursements.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold">
                      <th className="py-3 px-4">Slip Key</th>
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Designation</th>
                      <th className="py-3 px-4">Month</th>
                      <th className="py-3 px-4 text-right">Basic (PKR)</th>
                      <th className="py-3 px-4 text-right">Overtime (PKR)</th>
                      <th className="py-3 px-4 text-right">Net Payable</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payrollSlips.map((s, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{s.payrollKey}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{s.employeeName}</td>
                        <td className="py-3 px-4 text-slate-600">{s.designation}</td>
                        <td className="py-3 px-4 text-slate-600">{s.payrollMonth}</td>
                        <td className="py-3 px-4 text-right font-medium">Rs. {Number(s.basicOrPiecePay || 0).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-medium">Rs. {Number(s.overtimePay || 0).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-600">
                          Rs. {Number(s.netPayablePKR || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            s.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {s.paymentStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Report 7: Finance */}
        {reportType === 'finance' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">General Ledger & Double-Entry Journal Audit</h3>
                <p className="text-xs text-slate-500">Automated balanced journal entries across all business transactions</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block">Total Entries</span>
                <span className="text-lg font-black text-indigo-600">
                  {journalEntries.length} Vouchers
                </span>
              </div>
            </div>

            {journalEntries.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <BookOpen className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-600">No journal entries logged</p>
                <p className="text-[11px] text-slate-400">Post transactions in Procurement, Sales, POS, HR or Finance to populate the ledger.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold">
                      <th className="py-3 px-4">Voucher #</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Voucher Type</th>
                      <th className="py-3 px-4">Narration</th>
                      <th className="py-3 px-4 text-right">Debit (PKR)</th>
                      <th className="py-3 px-4 text-right">Credit (PKR)</th>
                      <th className="py-3 px-4">Posted By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {journalEntries.map((jv, idx) => {
                      const lines = Array.isArray(jv.lines) ? jv.lines : [];
                      const debit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
                      const credit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{jv.voucherNumber}</td>
                          <td className="py-3 px-4 text-slate-500">{jv.date ? new Date(jv.date).toLocaleDateString() : '-'}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                              {jv.voucherType}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-700 max-w-xs truncate">{jv.narration}</td>
                          <td className="py-3 px-4 text-right font-bold text-indigo-700">Rs. {debit.toLocaleString()}</td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-700">Rs. {credit.toLocaleString()}</td>
                          <td className="py-3 px-4 text-slate-600">{jv.postedBy || 'System'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
