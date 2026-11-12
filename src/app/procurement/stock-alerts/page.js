'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  AlertTriangle,
  Search,
  Filter,
  ArrowUpDown,
  ShoppingBag,
  Layers,
  Package,
  Shirt,
  Warehouse,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  Building,
} from 'lucide-react';

export default function StockAlertListPage() {
  const { addToast } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('ALL'); // ALL, Fabric, Trim, Finished Goods
  const [selectedStatus, setSelectedStatus] = useState('ALL'); // ALL, Out of Stock, Low Stock
  const [selectedWarehouse, setSelectedWarehouse] = useState('ALL');
  const [sortField, setSortField] = useState('currentStock'); // currentStock, requiredReorderQty, itemName
  const [sortOrder, setSortOrder] = useState('asc'); // asc, desc
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Modals
  const [selectedAlert, setSelectedAlert] = useState(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await apiFetch('/api/procurement');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        addToast(json.message || 'Failed to load stock alerts', 'error');
      }
    } catch {
      addToast('Error loading stock alert data', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addToast]);

  useEffect(() => {
    void Promise.resolve().then(fetchAlerts);
  }, [fetchAlerts]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAlerts();
  };

  const stockAlerts = useMemo(() => data?.stockAlerts || [], [data]);
  const fabricItems = useMemo(() => data?.fabricItems || [], [data]);
  const trimItems = useMemo(() => data?.trimItems || [], [data]);

  // Extract unique warehouses
  const warehouses = useMemo(() => {
    const set = new Set();
    stockAlerts.forEach((item) => {
      if (item.warehouseLocation) {
        item.warehouseLocation.split(',').forEach((loc) => set.add(loc.trim()));
      }
    });
    return Array.from(set).filter(Boolean);
  }, [stockAlerts]);

  // Filtered & Sorted items
  const filteredAlerts = useMemo(() => {
    return stockAlerts
      .filter((item) => {
        if (selectedType !== 'ALL' && item.itemType !== selectedType) return false;
        if (selectedStatus !== 'ALL' && item.status !== selectedStatus) return false;
        if (selectedWarehouse !== 'ALL' && !item.warehouseLocation?.toLowerCase().includes(selectedWarehouse.toLowerCase())) return false;
        if (search) {
          const q = search.toLowerCase();
          const matchCode = item.itemCode?.toLowerCase().includes(q);
          const matchName = item.itemName?.toLowerCase().includes(q);
          const matchCategory = item.category?.toLowerCase().includes(q);
          const matchSupplier = item.supplierName?.toLowerCase().includes(q);
          if (!matchCode && !matchName && !matchCategory && !matchSupplier) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (typeof valA === 'string') {
          return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return sortOrder === 'asc' ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
      });
  }, [stockAlerts, selectedType, selectedStatus, selectedWarehouse, search, sortField, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredAlerts.length / pageSize) || 1;
  const paginatedAlerts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAlerts.slice(start, start + pageSize);
  }, [filteredAlerts, currentPage, pageSize]);

  // Statistics
  const outOfStockCount = useMemo(() => stockAlerts.filter((a) => a.status === 'Out of Stock').length, [stockAlerts]);
  const lowStockCount = useMemo(() => stockAlerts.filter((a) => a.status === 'Low Stock').length, [stockAlerts]);
  const estimatedReorderValue = useMemo(() => {
    return stockAlerts.reduce((sum, a) => sum + (Number(a.requiredReorderQty || 0) * Number(a.unitCost || 0)), 0);
  }, [stockAlerts]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Find linked stock details for inspection modal
  const selectedStockDetails = useMemo(() => {
    if (!selectedAlert) return null;
    if (selectedAlert.itemType === 'Fabric') {
      return fabricItems.find((f) => f.code === selectedAlert.itemCode || f.id === selectedAlert.id);
    }
    if (selectedAlert.itemType === 'Trim') {
      return trimItems.find((t) => t.code === selectedAlert.itemCode || t.id === selectedAlert.id);
    }
    return null;
  }, [selectedAlert, fabricItems, trimItems]);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Top Header Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                PURCHASE & INVENTORY
              </span>
              <span className="text-xs text-slate-500">• Reorder Thresholds</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Stock Alert List
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Real-time low-stock, out-of-stock items, and automated reorder replenishment schedules
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
            <Link
              href="/procurement"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Go to Purchase Orders</span>
            </Link>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Critical Out of Stock</p>
              <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-red-600 mt-2">{outOfStockCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Inventory completely depleted</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Low Stock Warnings</p>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-amber-600 mt-2">{lowStockCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">At or below reorder threshold</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Total Alerts Active</p>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-[#0F172A] mt-2">{stockAlerts.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Monitored raw materials & items</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Estimated Reorder Cost</p>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Building className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xl font-black text-emerald-700 mt-2">
              Rs. {Math.round(estimatedReorderValue).toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">To restore minimum buffer levels</p>
          </div>
        </div>

        {/* Filter and Control Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by code, item name, category, or supplier..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            {/* Item Type Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {['ALL', 'Fabric', 'Trim', 'Finished Goods'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setSelectedType(type);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                    selectedType === type
                      ? 'bg-[#4F46E5] text-white shadow-xs'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {type === 'ALL' ? 'All Types' : type}
                </button>
              ))}
            </div>
          </div>

          {/* Secondary Filter Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {/* Status Filter */}
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-500">Status:</span>
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Out of Stock">Out of Stock</option>
                  <option value="Low Stock">Low Stock</option>
                </select>
              </div>

              {/* Warehouse Filter */}
              {warehouses.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-500">Warehouse:</span>
                  <select
                    value={selectedWarehouse}
                    onChange={(e) => {
                      setSelectedWarehouse(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-[#4F46E5]"
                  >
                    <option value="ALL">All Warehouses</option>
                    {warehouses.map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="text-slate-500 text-xs font-medium">
              Showing <span className="font-bold text-slate-900">{filteredAlerts.length}</span> matching alerts
            </div>
          </div>
        </div>

        {/* Table Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                  <th className="py-3 px-4">Item Code & Name</th>
                  <th className="py-3 px-4">Category / Type</th>
                  <th className="py-3 px-4">Warehouse Location</th>
                  <th className="py-3 px-4 cursor-pointer select-none" onClick={() => handleSort('currentStock')}>
                    <span className="inline-flex items-center gap-1">
                      Current Available
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </span>
                  </th>
                  <th className="py-3 px-4">Min. Reorder Level</th>
                  <th className="py-3 px-4 cursor-pointer select-none" onClick={() => handleSort('requiredReorderQty')}>
                    <span className="inline-flex items-center gap-1">
                      Required Reorder
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </span>
                  </th>
                  <th className="py-3 px-4">Supplier Information</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      Loading inventory stock alerts...
                    </td>
                  </tr>
                ) : paginatedAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center">
                      <div className="max-w-sm mx-auto text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                          <Layers className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-bold text-slate-800">All Stock Levels Healthy</p>
                        <p className="text-xs text-slate-500">
                          No items match the selected alert filters. All fabrics, trims, and finished goods are above minimum reorder points.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedAlerts.map((item) => {
                    const isOut = item.status === 'Out of Stock';
                    const typeIcon = item.itemType === 'Fabric' ? (
                      <Layers className="w-3.5 h-3.5 text-indigo-500" />
                    ) : item.itemType === 'Trim' ? (
                      <Package className="w-3.5 h-3.5 text-teal-500" />
                    ) : (
                      <Shirt className="w-3.5 h-3.5 text-purple-500" />
                    );

                    return (
                      <tr key={`${item.itemType}-${item.id}`} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="p-1 rounded bg-slate-100 shrink-0">{typeIcon}</span>
                            <div>
                              <p className="font-bold text-slate-900">{item.itemName}</p>
                              <p className="text-[11px] font-mono font-bold text-[#4F46E5]">{item.itemCode}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-700">{item.category}</span>
                          {item.variant && <span className="block text-[10px] text-slate-400">{item.variant}</span>}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <div className="flex items-center gap-1">
                            <Warehouse className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[140px]">{item.warehouseLocation || 'Main Store'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`font-mono font-bold text-sm ${isOut ? 'text-red-600' : 'text-amber-600'}`}>
                            {Number(item.currentStock).toLocaleString()}
                          </span>
                          <span className="text-[11px] text-slate-500 ml-1">{item.unit}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700 font-semibold">
                          {Number(item.reorderLevel).toLocaleString()} {item.unit}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-red-600">
                            +{Number(item.requiredReorderQty).toLocaleString()}
                          </span>
                          <span className="text-[11px] text-slate-500 ml-1">{item.unit}</span>
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-800">{item.supplierName || 'Not Assigned'}</p>
                          {item.unitCost > 0 && (
                            <p className="text-[10px] text-slate-400">Est. Rs. {item.unitCost.toLocaleString()} / {item.unit}</p>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            isOut ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isOut ? 'bg-red-500' : 'bg-amber-500'}`} />
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedAlert(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                            title="View Stock Breakdown"
                          >
                            <Eye className="w-3 h-3 text-slate-500" />
                            <span>Inspect</span>
                          </button>
                          <Link
                            href="/procurement"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg transition-colors shadow-xs"
                            title="Order via Purchase Order"
                          >
                            <ShoppingBag className="w-3 h-3" />
                            <span>Order</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
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

        {/* Modal: Item Stock Inspection & Breakdown */}
        {selectedAlert && (
          <Modal
            isOpen={Boolean(selectedAlert)}
            onClose={() => setSelectedAlert(null)}
            title={`Stock Inspection: ${selectedAlert.itemName}`}
            subtitle={`${selectedAlert.itemType} • Code: ${selectedAlert.itemCode}`}
          >
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[10px]">Current Stock</span>
                  <span className="font-bold text-sm text-slate-900">
                    {selectedAlert.currentStock} {selectedAlert.unit}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Reorder Threshold</span>
                  <span className="font-bold text-sm text-amber-700">
                    {selectedAlert.reorderLevel} {selectedAlert.unit}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Deficit / Required</span>
                  <span className="font-bold text-sm text-red-600">
                    +{selectedAlert.requiredReorderQty} {selectedAlert.unit}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Unit Purchase Rate</span>
                  <span className="font-bold text-sm text-slate-900">
                    Rs. {selectedAlert.unitCost?.toLocaleString() || '-'}
                  </span>
                </div>
              </div>

              {/* Fabric Roll Details if Fabric */}
              {selectedAlert.itemType === 'Fabric' && selectedStockDetails && (
                <div>
                  <h4 className="font-bold text-slate-800 mb-2">Available Rolls in Inventory:</h4>
                  {Array.isArray(selectedStockDetails.rolls) && selectedStockDetails.rolls.length > 0 ? (
                    <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                      {selectedStockDetails.rolls.map((roll, idx) => (
                        <div key={roll.rollNumber || idx} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                          <div>
                            <span className="font-mono font-bold text-indigo-600">{roll.rollNumber}</span>
                            <span className="text-[10px] text-slate-400 ml-2">Loc: {roll.warehouseLocation || 'Main Store'}</span>
                          </div>
                          <span className="font-mono font-bold text-slate-800">{roll.remainingMeters} Meters</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic p-3 border border-dashed border-slate-200 rounded-xl text-center">
                      No active fabric rolls remaining in stock.
                    </p>
                  )}
                </div>
              )}

              {/* Trim Warehouse Balances if Trim */}
              {selectedAlert.itemType === 'Trim' && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <p className="font-bold text-slate-800">Storage Location & Bin:</p>
                  <p className="text-slate-600">
                    Warehouse: <span className="font-semibold text-slate-900">{selectedAlert.warehouseLocation}</span>
                  </p>
                  <p className="text-slate-600">
                    Supplier: <span className="font-semibold text-slate-900">{selectedAlert.supplierName}</span>
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedAlert(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Close
                </button>
                <Link
                  href="/procurement"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Create Purchase Order</span>
                </Link>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </Layout>
  );
}

