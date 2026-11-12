'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import RecordDeleteButton from '@/components/RecordDeleteButton';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  RotateCcw,
  Plus,
  Search,
  Filter,
  Building,
  Calendar,
  FileText,
  DollarSign,
  Warehouse,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Trash2,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Layers,
  Package,
  Receipt,
  Check,
} from 'lucide-react';

export default function PurchaseReturnsPage() {
  const { addToast } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL'); // ALL, Processed, Draft
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modals
  const [isNewReturnOpen, setIsNewReturnOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [processingReturn, setProcessingReturn] = useState(false);
  const returnRequestIdRef = useRef(null);

  // New Purchase Return Form State
  const [newReturn, setNewReturn] = useState({
    supplierId: '',
    supplierName: '',
    poNumber: '',
    grnNumber: '',
    supplierInvoiceNumber: '',
    warehouseLocation: '',
    inventoryAccountCode: '',
    payableAccountCode: '',
    returnDate: new Date().toISOString().slice(0, 10),
    reason: '',
    taxPercentage: 0,
    notes: '',
    status: 'Processed', // 'Processed' (immediate post) or 'Draft'
    items: [],
  });

  // Line item draft state
  const [itemDraft, setItemDraft] = useState({
    stockItemType: 'Fabric',
    stockItemId: '',
    rollNumber: '',
    quantity: '',
    unitPrice: '',
    reason: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/procurement');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        const accounts = json.data.financialAccounts || [];
        setNewReturn((prev) => ({
          ...prev,
          inventoryAccountCode: prev.inventoryAccountCode || accounts.find((a) => a.type === 'Asset')?.code || '',
          payableAccountCode: prev.payableAccountCode || accounts.find((a) => a.type === 'Liability')?.code || '',
        }));
      } else {
        addToast(json.message || 'Failed to load procurement data', 'error');
      }
    } catch {
      addToast('Error communicating with procurement service', 'error');
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

  const suppliers = useMemo(() => data?.suppliers || [], [data]);
  const returns = useMemo(() => data?.returns || [], [data]);
  const fabricItems = useMemo(() => data?.fabricItems || [], [data]);
  const trimItems = useMemo(() => data?.trimItems || [], [data]);
  const purchaseOrders = useMemo(() => data?.purchaseOrders || [], [data]);
  const financialAccounts = useMemo(() => data?.financialAccounts || [], [data]);

  // Filtered suppliers matching selected supplier
  const currentSupplier = useMemo(() => {
    return suppliers.find((s) => s._id === newReturn.supplierId || s.name === newReturn.supplierName);
  }, [suppliers, newReturn.supplierId, newReturn.supplierName]);

  // Available POs for this supplier
  const supplierPOs = useMemo(() => {
    if (!currentSupplier) return [];
    return purchaseOrders.filter((po) => po.supplierName === currentSupplier.name || po.supplierId === currentSupplier._id);
  }, [purchaseOrders, currentSupplier]);

  // Selected item details in modal draft
  const currentSelectedStockItem = useMemo(() => {
    if (itemDraft.stockItemType === 'Fabric') {
      return fabricItems.find((f) => f.id === itemDraft.stockItemId || f.code === itemDraft.stockItemId);
    }
    return trimItems.find((t) => t.id === itemDraft.stockItemId || t.code === itemDraft.stockItemId);
  }, [itemDraft.stockItemType, itemDraft.stockItemId, fabricItems, trimItems]);

  // Available rolls for selected fabric
  const availableRolls = useMemo(() => {
    if (itemDraft.stockItemType !== 'Fabric' || !currentSelectedStockItem) return [];
    return Array.isArray(currentSelectedStockItem.rolls) ? currentSelectedStockItem.rolls : [];
  }, [itemDraft.stockItemType, currentSelectedStockItem]);

  // Reset form when modal opens
  const openNewReturnModal = () => {
    returnRequestIdRef.current = crypto.randomUUID();
    const assetAccount = financialAccounts.find((a) => a.type === 'Asset')?.code || '';
    const liabilityAccount = financialAccounts.find((a) => a.type === 'Liability')?.code || '';
    setNewReturn({
      supplierId: suppliers[0]?._id || '',
      supplierName: suppliers[0]?.name || '',
      poNumber: '',
      grnNumber: '',
      supplierInvoiceNumber: '',
      warehouseLocation: '',
      inventoryAccountCode: assetAccount,
      payableAccountCode: liabilityAccount,
      returnDate: new Date().toISOString().slice(0, 10),
      reason: '',
      taxPercentage: 0,
      notes: '',
      status: 'Processed',
      items: [],
    });
    setItemDraft({
      stockItemType: 'Fabric',
      stockItemId: fabricItems[0]?.id || '',
      rollNumber: '',
      quantity: '',
      unitPrice: fabricItems[0]?.averageCostPerMeter || '',
      reason: 'Defective quality',
    });
    setIsNewReturnOpen(true);
  };

  // Add line item to return
  const handleAddItem = () => {
    if (!currentSelectedStockItem) {
      addToast('Select a valid inventory item', 'error');
      return;
    }
    const qty = Number(itemDraft.quantity);
    const price = Number(itemDraft.unitPrice);
    if (!Number.isFinite(qty) || qty <= 0) {
      addToast('Enter a positive return quantity', 'error');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      addToast('Enter a valid unit price', 'error');
      return;
    }

    if (itemDraft.stockItemType === 'Fabric' && itemDraft.rollNumber) {
      const roll = availableRolls.find((r) => r.rollNumber === itemDraft.rollNumber);
      if (roll && Number(roll.remainingMeters) < qty) {
        addToast(`Roll ${roll.rollNumber} only has ${roll.remainingMeters}m available`, 'error');
        return;
      }
    } else if (Number(currentSelectedStockItem.available) < qty) {
      addToast(`Available stock is only ${currentSelectedStockItem.available} ${currentSelectedStockItem.unit}`, 'error');
      return;
    }

    const newItem = {
      lineId: crypto.randomUUID(),
      stockItemType: itemDraft.stockItemType,
      stockItemId: currentSelectedStockItem.id,
      stockItemCode: currentSelectedStockItem.code,
      description: currentSelectedStockItem.name,
      unit: currentSelectedStockItem.unit,
      quantity: qty,
      unitPrice: price,
      totalAmount: qty * price,
      rollNumber: itemDraft.rollNumber || '',
      reason: itemDraft.reason || newReturn.reason || 'Vendor Return',
    };

    setNewReturn((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));

    setItemDraft((prev) => ({
      ...prev,
      quantity: '',
      rollNumber: '',
    }));
  };

  const handleRemoveItem = (index) => {
    setNewReturn((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index),
    }));
  };

  // Calculate return totals
  const subtotal = useMemo(() => {
    return newReturn.items.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);
  }, [newReturn.items]);

  const taxAmount = useMemo(() => {
    const rate = Number(newReturn.taxPercentage) || 0;
    return (subtotal * rate) / 100;
  }, [subtotal, newReturn.taxPercentage]);

  const grandTotal = subtotal + taxAmount;

  // Submit new return
  const handleSubmitReturn = async (e) => {
    e.preventDefault();
    if (!newReturn.items.length) {
      addToast('Add at least one item to return', 'error');
      return;
    }

    const payload = {
      action: 'CREATE_PURCHASE_RETURN',
      returnRequestId: returnRequestIdRef.current,
      supplierId: newReturn.supplierId,
      supplierName: currentSupplier?.name || newReturn.supplierName,
      poNumber: newReturn.poNumber,
      grnNumber: newReturn.grnNumber,
      supplierInvoiceNumber: newReturn.supplierInvoiceNumber,
      warehouseLocation: newReturn.warehouseLocation,
      inventoryAccountCode: newReturn.inventoryAccountCode,
      payableAccountCode: newReturn.payableAccountCode,
      returnDate: newReturn.returnDate,
      reason: newReturn.reason,
      taxPercentage: Number(newReturn.taxPercentage) || 0,
      notes: newReturn.notes,
      status: newReturn.status,
      items: newReturn.items,
    };

    try {
      const res = await apiFetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create purchase return', 'error');
        return;
      }
      addToast(json.message || 'Purchase return recorded successfully', 'success');
      setIsNewReturnOpen(false);
      await fetchData(true);
    } catch {
      addToast('Network error while recording purchase return', 'error');
    }
  };

  // Process a draft return
  const handleProcessDraft = async (returnId) => {
    if (!window.confirm('Process this purchase return now? Stock will be deducted and a debit note journal entry will be posted.')) return;
    setProcessingReturn(true);
    try {
      const res = await apiFetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'PROCESS_PURCHASE_RETURN',
          returnId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to process purchase return', 'error');
        return;
      }
      addToast('Purchase return processed successfully', 'success');
      setSelectedReturn(null);
      await fetchData(true);
    } catch {
      addToast('Error processing return', 'error');
    } finally {
      setProcessingReturn(false);
    }
  };

  // Filter & Search
  const filteredReturns = useMemo(() => {
    return returns.filter((r) => {
      if (selectedStatus !== 'ALL' && r.status !== selectedStatus) return false;
      if (selectedSupplierFilter !== 'ALL' && r.supplierName !== selectedSupplierFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchNum = r.returnNumber?.toLowerCase().includes(q);
        const matchSup = r.supplierName?.toLowerCase().includes(q);
        const matchPo = r.poNumber?.toLowerCase().includes(q);
        const matchGrn = r.grnNumber?.toLowerCase().includes(q);
        const matchReason = r.reason?.toLowerCase().includes(q);
        if (!matchNum && !matchSup && !matchPo && !matchGrn && !matchReason) return false;
      }
      return true;
    });
  }, [returns, selectedStatus, selectedSupplierFilter, search]);

  const totalPages = Math.ceil(filteredReturns.length / pageSize) || 1;
  const paginatedReturns = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredReturns.slice(start, start + pageSize);
  }, [filteredReturns, currentPage, pageSize]);

  // Statistics
  const totalReturnCount = returns.length;
  const totalReturnValue = useMemo(() => {
    return returns.reduce((sum, r) => sum + (Number(r.grandTotal) || 0), 0);
  }, [returns]);
  const processedCount = useMemo(() => returns.filter((r) => r.status === 'Processed').length, [returns]);
  const draftCount = useMemo(() => returns.filter((r) => r.status === 'Draft').length, [returns]);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Top Header Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-1">
                <RotateCcw className="w-3.5 h-3.5 text-teal-600" />
                PURCHASE & VENDOR RETURNS
              </span>
              <span className="text-xs text-slate-500">• Debit Notes & Reversals</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Purchase Return List
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Defective fabric rolls, reject trims returned to suppliers, debit note vouchers, and inventory reversals
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
            <button
              type="button"
              onClick={openNewReturnModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Purchase Return</span>
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Total Purchase Returns</p>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <RotateCcw className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-[#0F172A] mt-2">{totalReturnCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Recorded return transactions</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Total Returned Value</p>
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-teal-700 mt-2">
              Rs. {Math.round(totalReturnValue).toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Debit notes applied to payables</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Processed & Posted</p>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-emerald-600 mt-2">{processedCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Stock & GL accounts adjusted</p>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Draft / Pending Post</p>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-amber-600 mt-2">{draftCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Awaiting physical dispatch</p>
          </div>
        </div>

        {/* Filter and Control Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by return #, supplier, PO #, GRN #, or reason..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
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
                <option value="Processed">Processed</option>
                <option value="Draft">Draft</option>
              </select>
            </div>

            {suppliers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-500">Supplier:</span>
                <select
                  value={selectedSupplierFilter}
                  onChange={(e) => {
                    setSelectedSupplierFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="ALL">All Suppliers</option>
                  {suppliers.map((s) => (
                    <option key={s._id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Returns Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                  <th className="py-3 px-4">Return Number</th>
                  <th className="py-3 px-4">Return Date</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">PO / GRN Ref</th>
                  <th className="py-3 px-4">Returned Items</th>
                  <th className="py-3 px-4">Warehouse</th>
                  <th className="py-3 px-4">Debit Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      Loading purchase returns...
                    </td>
                  </tr>
                ) : paginatedReturns.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center">
                      <div className="max-w-sm mx-auto text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                          <RotateCcw className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-bold text-slate-800">No Purchase Returns Recorded</p>
                        <p className="text-xs text-slate-500">
                          When defective goods or rejected materials are returned to suppliers, record them here to issue debit notes.
                        </p>
                        <button
                          type="button"
                          onClick={openNewReturnModal}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Create Purchase Return</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedReturns.map((r) => {
                    const isProcessed = r.status === 'Processed';
                    return (
                      <tr key={r._id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-[#4F46E5]">{r.returnNumber}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {new Date(r.returnDate).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">{r.supplierName}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {r.poNumber || r.grnNumber ? (
                            <span>{r.poNumber} {r.grnNumber ? `(${r.grnNumber})` : ''}</span>
                          ) : (
                            <span className="text-slate-400 italic">Direct Return</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          <span className="font-medium">
                            {(r.items || []).map((i) => `${i.quantity} ${i.unit} ${i.description}`).join(', ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <div className="flex items-center gap-1">
                            <Warehouse className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{r.warehouseLocation || '—'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900 font-mono text-sm">
                            Rs. {Number(r.grandTotal || 0).toLocaleString()}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                            isProcessed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {isProcessed ? <CheckCircle2 className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                            <span>{r.status}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedReturn(r)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                          >
                            <Eye className="w-3 h-3 text-slate-500" />
                            <span>View</span>
                          </button>
                          {!isProcessed && (
                            <>
                              <button
                                type="button"
                                disabled={processingReturn}
                                onClick={() => handleProcessDraft(r._id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                              >
                                <Check className="w-3 h-3" />
                                <span>Post</span>
                              </button>
                              <RecordDeleteButton
                                endpoint="/api/procurement"
                                action="DELETE_PURCHASE_RETURN"
                                idField="returnId"
                                recordId={r._id}
                                recordLabel={r.returnNumber}
                                onDeleted={() => fetchData(true)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors"
                              />
                            </>
                          )}
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

        {/* Modal: New Purchase Return */}
        {isNewReturnOpen && (
          <Modal
            isOpen={isNewReturnOpen}
            onClose={() => setIsNewReturnOpen(false)}
            title="Create New Purchase Return"
            subtitle="Deduct inventory and generate a supplier debit note voucher"
          >
            <form onSubmit={(e) => preventDuplicateSubmit(e, handleSubmitReturn)} className="space-y-4 text-xs">
              {/* Supplier and Reference Section */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Supplier *</label>
                  <select
                    required
                    value={newReturn.supplierId}
                    onChange={(e) => {
                      const sup = suppliers.find((s) => s._id === e.target.value);
                      setNewReturn((prev) => ({
                        ...prev,
                        supplierId: e.target.value,
                        supplierName: sup?.name || '',
                        poNumber: '',
                      }));
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map((s) => (
                      <option key={s._id} value={s._id}>{s.name} ({s.city || 'Vendor'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Linked PO Reference</label>
                  <select
                    value={newReturn.poNumber}
                    onChange={(e) => setNewReturn({ ...newReturn, poNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  >
                    <option value="">None / Manual Return</option>
                    {supplierPOs.map((po) => (
                      <option key={po._id} value={po.poNumber}>{po.poNumber} (Rs. {po.grandTotal?.toLocaleString()})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Warehouse Location *</label>
                  <input
                    type="text"
                    required
                    value={newReturn.warehouseLocation}
                    onChange={(e) => setNewReturn({ ...newReturn, warehouseLocation: e.target.value })}
                    placeholder="e.g. Warehouse A, Bin 101"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Return Date *</label>
                  <input
                    type="date"
                    required
                    value={newReturn.returnDate}
                    onChange={(e) => setNewReturn({ ...newReturn, returnDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Primary Return Reason *</label>
                  <select
                    value={newReturn.reason}
                    onChange={(e) => setNewReturn({ ...newReturn, reason: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  >
                    <option value="Defective fabric">Defective fabric / weaving defects</option>
                    <option value="Quality rejection">Quality inspection rejection</option>
                    <option value="Wrong shade/color">Wrong shade / color mismatch</option>
                    <option value="Specification mismatch">Specification / GSM mismatch</option>
                    <option value="Excess supply">Excess shipment / over-delivery</option>
                    <option value="Damaged in transit">Damaged in transit</option>
                    <option value="Other">Other supplier issue</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Processing Action *</label>
                  <select
                    value={newReturn.status}
                    onChange={(e) => setNewReturn({ ...newReturn, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-bold text-indigo-700 focus:outline-none focus:border-[#4F46E5]"
                  >
                    <option value="Processed">Process Immediately (Deduct Stock & Post GL)</option>
                    <option value="Draft">Save as Draft (Post Later)</option>
                  </select>
                </div>
              </div>

              {/* Accounting Accounts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Inventory Asset Account (Credit) *</label>
                  <select
                    required
                    value={newReturn.inventoryAccountCode}
                    onChange={(e) => setNewReturn({ ...newReturn, inventoryAccountCode: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-xs focus:outline-none focus:border-[#4F46E5]"
                  >
                    {financialAccounts.filter((a) => a.type === 'Asset').map((a) => (
                      <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Supplier Payable Liability Account (Debit) *</label>
                  <select
                    required
                    value={newReturn.payableAccountCode}
                    onChange={(e) => setNewReturn({ ...newReturn, payableAccountCode: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-xs focus:outline-none focus:border-[#4F46E5]"
                  >
                    {financialAccounts.filter((a) => a.type === 'Liability').map((a) => (
                      <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Line Items Entry Box */}
              <div className="border border-indigo-100 bg-indigo-50/30 p-3.5 rounded-xl space-y-3">
                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                  <PlusCircle className="w-4 h-4 text-indigo-600" />
                  <span>Add Material Line to Return</span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Item Type</label>
                    <select
                      value={itemDraft.stockItemType}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        const firstItem = nextType === 'Fabric' ? fabricItems[0] : trimItems[0];
                        setItemDraft({
                          stockItemType: nextType,
                          stockItemId: firstItem?.id || '',
                          rollNumber: '',
                          quantity: '',
                          unitPrice: nextType === 'Fabric' ? (firstItem?.averageCostPerMeter || '') : (firstItem?.unitCost || ''),
                          reason: 'Defective quality',
                        });
                      }}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-xs"
                    >
                      <option value="Fabric">Fabric Roll</option>
                      <option value="Trim">Trim / Accessory</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Inventory Item *</label>
                    <select
                      value={itemDraft.stockItemId}
                      onChange={(e) => {
                        const targetId = e.target.value;
                        const item = itemDraft.stockItemType === 'Fabric'
                          ? fabricItems.find((f) => f.id === targetId)
                          : trimItems.find((t) => t.id === targetId);
                        setItemDraft((prev) => ({
                          ...prev,
                          stockItemId: targetId,
                          rollNumber: '',
                          unitPrice: itemDraft.stockItemType === 'Fabric' ? (item?.averageCostPerMeter || '') : (item?.unitCost || ''),
                        }));
                      }}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-xs"
                    >
                      {itemDraft.stockItemType === 'Fabric'
                        ? fabricItems.map((f) => (
                          <option key={f.id} value={f.id}>{f.code} - {f.name} ({f.available}m available)</option>
                        ))
                        : trimItems.map((t) => (
                          <option key={t.id} value={t.id}>{t.code} - {t.name} ({t.available} {t.unit} available)</option>
                        ))}
                    </select>
                  </div>

                  {itemDraft.stockItemType === 'Fabric' && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Specific Fabric Roll (Optional)</label>
                      <select
                        value={itemDraft.rollNumber}
                        onChange={(e) => setItemDraft({ ...itemDraft, rollNumber: e.target.value })}
                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-xs"
                      >
                        <option value="">Any available roll</option>
                        {availableRolls.map((r) => (
                          <option key={r.rollNumber} value={r.rollNumber}>
                            {r.rollNumber} ({r.remainingMeters}m - {r.warehouseLocation || 'Store'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Return Quantity *</label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      placeholder={`e.g. 100 ${currentSelectedStockItem?.unit || ''}`}
                      value={itemDraft.quantity}
                      onChange={(e) => setItemDraft({ ...itemDraft, quantity: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Unit Purchase Cost (PKR) *</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Unit purchase cost"
                      value={itemDraft.unitPrice}
                      onChange={(e) => setItemDraft({ ...itemDraft, unitPrice: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-xs"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="w-full py-2 px-3 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-xs"
                    >
                      + Add Item to Return
                    </button>
                  </div>
                </div>
              </div>

              {/* Items List Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-2.5 px-3">Item Details</th>
                      <th className="py-2.5 px-3">Roll / Ref</th>
                      <th className="py-2.5 px-3">Quantity</th>
                      <th className="py-2.5 px-3">Unit Price</th>
                      <th className="py-2.5 px-3">Total Amount</th>
                      <th className="py-2.5 px-3 text-right">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {newReturn.items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                          No items added yet. Add items above to build the purchase return note.
                        </td>
                      </tr>
                    ) : (
                      newReturn.items.map((item, idx) => (
                        <tr key={item.lineId || idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {item.description}
                            <span className="block text-[10px] font-mono text-[#4F46E5]">{item.stockItemCode}</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">{item.rollNumber || '-'}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-800">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">Rs. {Number(item.unitPrice).toLocaleString()}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900 font-mono">
                            Rs. {Number(item.totalAmount).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-red-600 hover:text-red-800 p-1 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 p-3 rounded-xl border border-slate-200 gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700">Tax / WHT Rate (%):</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={newReturn.taxPercentage}
                    onChange={(e) => setNewReturn({ ...newReturn, taxPercentage: e.target.value })}
                    className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white font-mono"
                  />
                </div>
                <div className="text-right">
                  <span className="text-slate-500 mr-2">Grand Total Return Debit:</span>
                  <span className="text-base font-black text-indigo-700 font-mono">
                    Rs. {Math.round(grandTotal).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Additional Notes / Challan Remarks</label>
                <input
                  type="text"
                  value={newReturn.notes}
                  onChange={(e) => setNewReturn({ ...newReturn, notes: e.target.value })}
                  placeholder="Gate pass number, driver name, vehicle reference..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              {/* Form Action Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewReturnOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={newReturn.items.length === 0}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  {newReturn.status === 'Processed' ? 'Submit & Post Return' : 'Save Draft'}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Modal: View Purchase Return & Debit Note Details */}
        {selectedReturn && (
          <Modal
            isOpen={Boolean(selectedReturn)}
            onClose={() => setSelectedReturn(null)}
            title={`Purchase Return & Debit Note: ${selectedReturn.returnNumber}`}
            subtitle={`Supplier: ${selectedReturn.supplierName} • Date: ${new Date(selectedReturn.returnDate).toLocaleDateString()}`}
          >
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[10px]">Status</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                    selectedReturn.status === 'Processed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {selectedReturn.status}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Grand Total</span>
                  <span className="font-bold text-sm text-slate-900 font-mono">
                    Rs. {Number(selectedReturn.grandTotal || 0).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">PO Reference</span>
                  <span className="font-bold text-slate-700 font-mono">
                    {selectedReturn.poNumber || 'Direct Return'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Warehouse</span>
                  <span className="font-bold text-slate-700">
                    {selectedReturn.warehouseLocation || 'Main Store'}
                  </span>
                </div>
              </div>

              {/* Items Returned */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2">Returned Stock Items:</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-2 px-3">Item</th>
                        <th className="py-2 px-3">Roll / Bin</th>
                        <th className="py-2 px-3">Quantity</th>
                        <th className="py-2 px-3">Rate</th>
                        <th className="py-2 px-3">Total</th>
                        <th className="py-2 px-3">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedReturn.items || []).map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            {item.description}
                            <span className="block text-[10px] font-mono text-indigo-600">{item.stockItemCode}</span>
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-600">{item.rollNumber || '-'}</td>
                          <td className="py-2 px-3 font-bold text-slate-800">{item.quantity} {item.unit}</td>
                          <td className="py-2 px-3 font-mono">Rs. {Number(item.unitPrice).toLocaleString()}</td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">
                            Rs. {Number(item.totalAmount).toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{item.reason || selectedReturn.reason || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Accounts Info */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                <p className="font-bold text-slate-800">Double-Entry Financial Impact:</p>
                <p className="text-slate-600">
                  Debited Supplier Accounts Payable: <span className="font-mono font-bold text-slate-900">{selectedReturn.payableAccountCode}</span>
                </p>
                <p className="text-slate-600">
                  Credited Inventory Asset Stock: <span className="font-mono font-bold text-slate-900">{selectedReturn.inventoryAccountCode}</span>
                </p>
                {selectedReturn.notes && (
                  <p className="text-slate-600 pt-1 border-t border-slate-200 mt-1">
                    Notes: <span className="italic">{selectedReturn.notes}</span>
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedReturn(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Close
                </button>
                {selectedReturn.status === 'Draft' && (
                  <button
                    type="button"
                    disabled={processingReturn}
                    onClick={() => handleProcessDraft(selectedReturn._id)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Process & Post Now</span>
                  </button>
                )}
              </div>
            </div>
          </Modal>
        )}
      </div>
    </Layout>
  );
}

