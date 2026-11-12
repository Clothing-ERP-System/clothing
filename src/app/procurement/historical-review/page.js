'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  RefreshCw,
  Search,
  FileText,
  DollarSign,
  Truck,
  AlertCircle,
  Eye,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Package,
  Layers,
} from 'lucide-react';

export default function HistoricalReviewPage() {
  const { addToast, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('grn');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/procurement');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        addToast(json.message || 'Failed to load historical data', 'error');
      }
    } catch {
      addToast('Error loading historical data', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addToast]);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  const purchaseOrders = useMemo(() => data?.purchaseOrders || [], [data]);
  const supplierInvoices = useMemo(() => data?.supplierInvoices || [], [data]);
  const fabricItems = useMemo(() => data?.fabricItems || [], [data]);
  const trimItems = useMemo(() => data?.trimItems || [], [data]);
  const designArticles = useMemo(() => data?.designArticles || [], [data]);

  const historicalGRNs = useMemo(() => {
    const results = [];
    for (const po of purchaseOrders) {
      const grns = Array.isArray(po.grns) ? po.grns : [];
      for (const grn of grns) {
        if (!grn.grnNumber) continue;
        const acceptedValue = Number(grn.acceptedValue || grn.totalReceivedValue || 0);
        const grnDate = grn.inspectionDate || grn.receivedDate || '';
        results.push({
          grnNumber: grn.grnNumber,
          poNumber: po.poNumber,
          supplierName: po.supplierName || '',
          acceptedValue,
          grnDate,
          inspectionStatus: grn.inspectionStatus || 'pending',
          grniAccounted: grn.grniAccounted || false,
          hasFinancialEntry: Boolean(grn.financialEntryId),
        });
      }
    }
    return results.sort((a, b) => new Date(b.grnDate || 0) - new Date(a.grnDate || 0));
  }, [purchaseOrders]);

  const historicalInvoices = useMemo(() => {
    return supplierInvoices.filter(inv => {
      return !inv.grnNumber || !inv.financialEntryId;
    }).sort((a, b) => new Date(b.invoiceDate || 0) - new Date(a.invoiceDate || 0));
  }, [supplierInvoices]);

  const stockWithTextLocation = useMemo(() => {
    const results = [];
    for (const f of fabricItems) {
      const rolls = Array.isArray(f.rolls) ? f.rolls : [];
      for (const roll of rolls) {
        if (roll.warehouseLocation && !roll.locationId) {
          results.push({
            itemCode: f.fabricCode,
            itemName: f.name,
            itemType: 'Fabric Roll',
            rollNumber: roll.rollNumber,
            warehouseLocation: roll.warehouseLocation,
            quantity: roll.quantity || 0,
            unit: 'Meters',
            hasLocationId: false,
          });
        }
      }
    }
    for (const t of trimItems) {
      if (t.warehouseLocation && !t.locationId) {
        results.push({
          itemCode: t.trimCode,
          itemName: t.name,
          itemType: 'Trim',
          rollNumber: '',
          warehouseLocation: t.warehouseLocation,
          quantity: Number(t.currentStock || 0),
          unit: t.unit || 'pcs',
          hasLocationId: false,
        });
      }
    }
    for (const d of designArticles) {
      if (d.warehouseLocation && !d.locationId) {
        results.push({
          itemCode: d.designCode,
          itemName: d.name,
          itemType: 'Design Article',
          rollNumber: '',
          warehouseLocation: d.warehouseLocation,
          quantity: Number(d.currentStock || 0),
          unit: d.unit || 'pcs',
          hasLocationId: false,
        });
      }
    }
    return results.sort((a, b) => a.itemType.localeCompare(b.itemType));
  }, [fabricItems, trimItems, designArticles]);

  const tabItems = useMemo(() => [
    { key: 'grn', label: 'Historical GRNs', icon: Wallet, count: historicalGRNs.length },
    { key: 'invoice', label: 'Invoices Without GRNI', icon: Package, count: historicalInvoices.length },
    { key: 'stock', label: 'Stock Without LocationId', icon: Layers, count: stockWithTextLocation.length },
  ], [historicalGRNs.length, historicalInvoices.length, stockWithTextLocation.length]);

  const currentItems = useMemo(() => {
    if (view === 'grn') return historicalGRNs;
    if (view === 'invoice') return historicalInvoices;
    return stockWithTextLocation;
  }, [view, historicalGRNs, historicalInvoices, stockWithTextLocation]);

  const filteredItems = useMemo(() => {
    return currentItems.filter((item) => {
      if (search) {
        const q = search.toLowerCase();
        return (
          (item.grnNumber || '').toLowerCase().includes(q) ||
          (item.poNumber || '').toLowerCase().includes(q) ||
          (item.supplierName || '').toLowerCase().includes(q) ||
          (item.invoiceNumber || '').toLowerCase().includes(q) ||
          (item.itemCode || '').toLowerCase().includes(q) ||
          (item.itemName || '').toLowerCase().includes(q) ||
          (item.warehouseLocation || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [currentItems, search]);

  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-50 text-slate-700 border border-slate-200 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-600" />
                HISTORICAL DATA
              </span>
              <span className="text-xs text-slate-500">Read-Only Preview</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Historical Data Review
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Preview historical GRNs, invoices, and stock records that may need migration.
              No data is modified automatically.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-600' : 'text-slate-500'}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-slate-200 mb-4">
          {tabItems.map((tab) => {
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 ${
                  view === tab.key
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                } transition-colors`}
              >
                <TabIcon className="w-3 h-3" />
                {tab.label}
                <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] bg-slate-200 text-slate-600">{tab.count}</span>
              </button>
            );
          })}
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder={`Search by ${view === 'grn' ? 'GRN #, PO #, or supplier' : view === 'invoice' ? 'invoice # or supplier' : 'item code, name, or location'}...`}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                  {view === 'grn' && (
                    <>
                      <th className="py-3 px-4">GRN #</th>
                      <th className="py-3 px-4">PO #</th>
                      <th className="py-3 px-4">Supplier</th>
                      <th className="py-3 px-4 text-right">Accepted Value</th>
                      <th className="py-3 px-4">GRN Date</th>
                      <th className="py-3 px-4 text-center">GRNI Accounted</th>
                      <th className="py-3 px-4 text-center">Financial Entry</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </>
                  )}
                  {view === 'invoice' && (
                    <>
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Supplier</th>
                      <th className="py-3 px-4">GRN #</th>
                      <th className="py-3 px-4 text-right">Grand Total</th>
                      <th className="py-3 px-4">Invoice Date</th>
                      <th className="py-3 px-4 text-center">Financial Entry</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </>
                  )}
                  {view === 'stock' && (
                    <>
                      <th className="py-3 px-4">Item Code</th>
                      <th className="py-3 px-4">Item Name</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Roll #</th>
                      <th className="py-3 px-4">Warehouse Location</th>
                      <th className="py-3 px-4 text-right">Quantity</th>
                      <th className="py-3 px-4 text-center">LocationId</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Loading historical data...
                    </td>
                  </tr>
                ) : paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <div className="max-w-sm mx-auto text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                          <FileText className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-bold text-slate-800">No Records</p>
                        <p className="text-xs text-slate-500">
                          No historical records found for this view.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item) => (
                    <tr
                      key={view === 'stock' ? `${item.itemCode}:${item.warehouseLocation}` : view === 'grn' ? item.grnNumber : item.invoiceNumber}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      {view === 'grn' && (
                        <>
                          <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{item.grnNumber}</td>
                          <td className="py-3 px-4 text-slate-700 font-mono">{item.poNumber || '—'}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{item.supplierName}</td>
                          <td className="py-3 px-4 text-right font-mono text-slate-500">
                            Rs. {item.acceptedValue.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500">
                            {item.grnDate ? new Date(item.grnDate).toLocaleDateString() : '—'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.grniAccounted ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                            }`}>
                              {item.grniAccounted ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.hasFinancialEntry ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {item.hasFinancialEntry ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View</span>
                            </button>
                          </td>
                        </>
                      )}
                      {view === 'invoice' && (
                        <>
                          <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{item.invoiceNumber}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{item.supplierName}</td>
                          <td className="py-3 px-4 text-slate-700 font-mono">{item.grnNumber || 'Direct'}</td>
                          <td className="py-3 px-4 text-right font-mono text-slate-500">
                            Rs. {Number(item.grandTotal || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500">
                            {item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString() : '—'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.financialEntryId ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {item.financialEntryId ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View</span>
                            </button>
                          </td>
                        </>
                      )}
                      {view === 'stock' && (
                        <>
                          <td className="py-3 px-4 font-mono font-bold">{item.itemCode}</td>
                          <td className="py-3 px-4 text-slate-700">{item.itemName}</td>
                          <td className="py-3 px-4 text-slate-500">{item.itemType}</td>
                          <td className="py-3 px-4 font-mono text-slate-500">{item.rollNumber || '—'}</td>
                          <td className="py-3 px-4 text-slate-500">{item.warehouseLocation}</td>
                          <td className="py-3 px-4 text-right font-mono text-slate-500">
                            {item.quantity.toLocaleString()} {item.unit}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">
                              No
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View</span>
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>
                Page <span className="font-bold text-slate-900">{currentPage}</span> of{' '}
                <span className="font-bold text-slate-900">{totalPages}</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h3 className="text-xs font-bold text-amber-800 mb-1">Historical Data Safety Notice</h3>
              <p className="text-xs text-amber-700 mb-2">
                This page is read-only. No historical journal entries or stock records are automatically modified.
                Any migration of historical data requires:
              </p>
              <ul className="text-xs text-amber-700 list-disc list-inside space-y-1 mb-2">
                <li>Separate client approval and sign-off</li>
                <li>Database backup before any changes</li>
                <li>Preview and validation of all proposed changes</li>
                <li>Audit trail of all migration actions</li>
              </ul>
              <p className="text-xs text-amber-700">
                Contact your system administrator to plan and execute any historical data migration.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}