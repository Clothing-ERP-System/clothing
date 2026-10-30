'use client';

import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
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
} from 'lucide-react';

export default function ReportsAnalyticsPage() {
  const { addToast } = useAuth();
  const [reportType, setReportType] = useState('production'); // 'production', 'fabric', 'valuation'
  const [loading, setLoading] = useState(true);
  const [productionOrders, setProductionOrders] = useState([]);
  const [fabrics, setFabrics] = useState([]);
  const [trims, setTrims] = useState([]);

  useEffect(() => {
    async function fetchReportsData() {
      try {
        const [resProd, resFab, resTrim] = await Promise.all([
          fetch('/api/production'),
          fetch('/api/fabric'),
          fetch('/api/trims'),
        ]);
        const [jsonProd, jsonFab, jsonTrim] = await Promise.all([
          resProd.json(),
          resFab.json(),
          resTrim.json(),
        ]);
        if (jsonProd.success) setProductionOrders(jsonProd.data.productionOrders || []);
        if (jsonFab.success) setFabrics(jsonFab.data.fabrics || []);
        if (jsonTrim.success) setTrims(jsonTrim.data.trims || []);
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
    const totalRollMeters = (f.rolls || []).reduce((sum, r) => sum + (r.initialMeters || 0), 0);
    const remainingRollMeters = (f.rolls || []).reduce((sum, r) => sum + (r.remainingMeters || 0), 0);
    const consumed = Math.max(0, totalRollMeters - remainingRollMeters);

    return {
      fabricCode: f.fabricCode,
      name: f.name,
      type: f.fabricType,
      rollsCount: (f.rolls || []).length,
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

  const exportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';

    if (reportType === 'production') {
      csvContent += 'Order #,Line,Article,Target Pcs,Actual Finished Pcs,Efficiency %,Defect Rejects,Status\n';
      productionReport.forEach((r) => {
        csvContent += `"${r.orderNumber}","${r.line}","${r.article}",${r.target},${r.actual},${r.efficiency}%,${r.rejects},"${r.status}"\n`;
      });
    } else if (reportType === 'fabric') {
      csvContent += 'Code,Fabric Name,Type,Rolls,Total Received (m),Remaining (m),Consumed (m),Rate,Valuation (PKR)\n';
      fabricReport.forEach((r) => {
        csvContent += `"${r.fabricCode}","${r.name}","${r.type}",${r.rollsCount},${r.initialMeters},${r.remainingMeters},${r.consumedMeters},${r.costPerMeter},${r.totalValuation}\n`;
      });
    } else {
      csvContent += 'Item,Category,Current Stock,Unit Cost,Total Valuation PKR\n';
      trims.forEach((t) => {
        csvContent += `"${t.name}","${t.category}",${t.currentStock},${t.unitCost},${t.currentStock * t.unitCost}\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ERPDOST_${reportType}_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('Report exported successfully!', 'success');
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
              <span className="text-xs text-slate-500 font-medium">• Production, Material & Inventory Ledger</span>
            </div>
            <h1 className="text-xl font-black text-slate-900 mt-1.5 tracking-tight">
              Reports & Operational Intelligence
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Live manufacturing data, material consumption, and inventory stock valuations
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

            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-all cursor-pointer shadow-md shadow-indigo-600/20 active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Report Selector Tabs */}
        <div className="flex border-b border-slate-200 gap-2">
          <button
            onClick={() => setReportType('production')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              reportType === 'production'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shirt className="w-4 h-4" />
            <span>Production Output Report</span>
          </button>

          <button
            onClick={() => setReportType('fabric')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              reportType === 'fabric'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Fabric Consumption & Rolls</span>
          </button>

          <button
            onClick={() => setReportType('valuation')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              reportType === 'valuation'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Stock Valuation Ledger</span>
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
      </div>
    </Layout>
  );
}
