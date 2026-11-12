'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  RefreshCw,
  Plus,
  Search,
  Filter,
  FileText,
  DollarSign,
  Truck,
  AlertCircle,
  PlusCircle,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Mail,
  Package,
  Wallet,
  Clock,
} from 'lucide-react';

export default function ResidualGRNIPage() {
  const { addToast, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [newAdjustment, setNewAdjustment] = useState({
    grnNumber: '',
    supplierId: '',
    supplierName: '',
    adjustmentAmount: '',
    counterAccountCode: '',
    reason: '',
    approvalReference: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/procurement');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        addToast(json.message || 'Failed to load GRNI data', 'error');
      }
    } catch {
      addToast('Error loading GRNI data', 'error');
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
  const suppliers = useMemo(() => data?.suppliers || [], [data]);
  const supplierInvoices = useMemo(() => data?.supplierInvoices || [], [data]);

  // Calculate residual GRNI per GRN per supplier
  const residualGRNI = useMemo(() => {
    const grniMap = new Map();

    for (const po of purchaseOrders) {
      const grns = Array.isArray(po.grns) ? po.grns : [];
      for (const grn of grns) {
        const grnNumber = grn.grnNumber;
        const acceptedValue = Number(grn.acceptedValue || grn.totalReceivedValue || 0);
        if (!grnNumber) continue;

        // Find invoices against this GRN
        const grnInvoices = supplierInvoices.filter(
          inv => inv.grnNumber === grnNumber
        );

        // Group by supplier
        const bySupplier = new Map();
        for (const inv of grnInvoices) {
          const sid = inv.supplierId || '';
          if (!bySupplier.has(sid)) {
            bySupplier.set(sid, {
              supplierId: sid,
              supplierName: inv.supplierName || '',
              invoicedValue: 0,
              grniCleared: 0,
              invoices: [],
            });
          }
          const sInfo = bySupplier.get(sid);
          sInfo.invoicedValue += Number(inv.subtotal || 0);
          sInfo.invoices.push(inv);

          // Check journal for GRNI cleared amount
          // We need to look up journal entries, but they're not in the data
          // For now, use invoiced value as proxy for GRNI cleared
          sInfo.grniCleared += Number(inv.subtotal || 0);
        }

        for (const [supplierId, sInfo] of bySupplier) {
          const remainingGRNI = Math.max(0, acceptedValue - sInfo.grniCleared);
          if (remainingGRNI > 0) {
            const key = `${grnNumber}:${supplierId}`;
            grniMap.set(key, {
              grnNumber,
              supplierId,
              supplierName: sInfo.supplierName,
              poNumber: po.poNumber,
              acceptedValue,
              invoicedValue: sInfo.invoicedValue,
              grniCleared: sInfo.grniCleared,
              remainingGRNI,
              invoiceCount: sInfo.invoices.length,
            });
          }
        }
      }
    }

    return Array.from(grniMap.values()).sort((a, b) => b.remainingGRNI - a.remainingGRNI);
  }, [purchaseOrders, supplierInvoices]);

  const filteredResidual = useMemo(() => {
    return residualGRNI.filter((r) => {
      if (search) {
        const q = search.toLowerCase();
        return (
          r.grnNumber?.toLowerCase().includes(q) ||
          r.supplierName?.toLowerCase().includes(q) ||
          r.poNumber?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [residualGRNI, search]);

  const totalPages = Math.ceil(filteredResidual.length / pageSize) || 1;
  const paginatedResidual = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredResidual.slice(start, start + pageSize);
  }, [filteredResidual, currentPage, pageSize]);

  const totalOutstanding = useMemo(() => {
    return residualGRNI.reduce((sum, r) => sum + r.remainingGRNI, 0);
  }, [residualGRNI]);

  const handleSubmitAdjustment = async (e) => {
    e.preventDefault();
    if (!newAdjustment.grnNumber) {
      addToast('GRN number is required', 'error');
      return;
    }
    if (!newAdjustment.supplierId) {
      addToast('Supplier is required', 'error');
      return;
    }
    const amount = Number(newAdjustment.adjustmentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      addToast('Enter a positive adjustment amount', 'error');
      return;
    }
    if (!newAdjustment.counterAccountCode) {
      addToast('Counter account is required', 'error');
      return;
    }
    if (!newAdjustment.reason) {
      addToast('Reason is required', 'error');
      return;
    }
    if (!newAdjustment.approvalReference) {
      addToast('Approval reference is required', 'error');
      return;
    }
    try {
      const res = await apiFetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_GRNI_ADJUSTMENT',
          grnNumber: newAdjustment.grnNumber,
          supplierId: newAdjustment.supplierId,
          adjustmentAmount: amount,
          counterAccountCode: newAdjustment.counterAccountCode,
          reason: newAdjustment.reason,
          approvalReference: newAdjustment.approvalReference,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'GRNI adjustment failed', 'error');
        return;
      }
      addToast('GRNI residual adjustment recorded', 'success');
      setIsAdjustmentOpen(false);
      setNewAdjustment({
        grnNumber: '', supplierId: '', supplierName: '',
        adjustmentAmount: '', counterAccountCode: '', reason: '', approvalReference: '',
      });
      await fetchData();
    } catch {
      addToast('Network error recording GRNI adjustment', 'error');
    }
  };

  const openAdjustment = (record) => {
    setNewAdjustment({
      grnNumber: record.grnNumber,
      supplierId: record.supplierId,
      supplierName: record.supplierName,
      adjustmentAmount: record.remainingGRNI.toString(),
      counterAccountCode: '',
      reason: '',
      approvalReference: '',
    });
    setIsAdjustmentOpen(true);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                RESIDUAL GRNI
              </span>
              <span className="text-xs text-slate-500">• Goods Received Not Invoiced</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Residual GRNI Review
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Review outstanding GRNI balances and record authorized residual adjustments
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
              onClick={() => setIsAdjustmentOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Adjustment</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">GRNs with Residual</p>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-[#0F172A] mt-2">{residualGRNI.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">GRNs with outstanding balance</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Total Outstanding</p>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-[#0F172A] mt-2">
              Rs. {totalOutstanding.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Total residual GRNI</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Suppliers Affected</p>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-[#0F172A] mt-2">
              {new Set(residualGRNI.map(r => r.supplierId)).size}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Unique suppliers</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Adjustments</p>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-[#0F172A] mt-2">0</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Pending approval</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by GRN #, supplier, or PO #..."
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
                  <th className="py-3 px-4">GRN #</th>
                  <th className="py-3 px-4">PO #</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4 text-right">Accepted Value</th>
                  <th className="py-3 px-4 text-right">Invoiced Value</th>
                  <th className="py-3 px-4 text-right">GRNI Cleared</th>
                  <th className="py-3 px-4 text-right">Remaining GRNI</th>
                  <th className="py-3 px-4 text-center">Invoices</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      Loading residual GRNI data...
                    </td>
                  </tr>
                ) : paginatedResidual.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center">
                      <div className="max-w-sm mx-auto text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                          <Wallet className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-bold text-slate-800">No Residual GRNI</p>
                        <p className="text-xs text-slate-500">
                          All GRN balances have been fully cleared by supplier invoices.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedResidual.map((r) => (
                    <tr key={`${r.grnNumber}:${r.supplierId}`} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{r.grnNumber}</td>
                      <td className="py-3 px-4 text-slate-700 font-mono">{r.poNumber || '—'}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{r.supplierName}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">
                        Rs. {r.acceptedValue.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">
                        Rs. {r.invoicedValue.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">
                        Rs. {r.grniCleared.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-700">
                        Rs. {r.remainingGRNI.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-500">{r.invoiceCount}</td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => openAdjustment(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors"
                        >
                          <PlusCircle className="w-3 h-3" />
                          <span>Adjust</span>
                        </button>
                      </td>
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

        <Modal
          isOpen={isAdjustmentOpen}
          onClose={() => setIsAdjustmentOpen(false)}
          title="Record GRNI Residual Adjustment"
          subtitle="Authorized adjustment for outstanding GRNI balance"
          maxWidth="max-w-md"
        >
          <form onSubmit={(e) => preventDuplicateSubmit(e, handleSubmitAdjustment)} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">GRN Number *</label>
                <input
                  type="text"
                  required
                  value={newAdjustment.grnNumber}
                  onChange={(e) => setNewAdjustment({ ...newAdjustment, grnNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Supplier *</label>
                <select
                  required
                  value={newAdjustment.supplierId}
                  onChange={(e) => {
                    const selected = suppliers.find((s) => s._id === e.target.value);
                    setNewAdjustment({
                      ...newAdjustment,
                      supplierId: e.target.value,
                      supplierName: selected ? selected.name : '',
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="">Select a supplier</option>
                  {suppliers.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name} ({s.supplierCode || 'N/A'})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Adjustment Amount *</label>
                <input
                  type="number"
                  required
                  min="0"
                  step="any"
                  value={newAdjustment.adjustmentAmount}
                  onChange={(e) => setNewAdjustment({ ...newAdjustment, adjustmentAmount: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Counter Account *</label>
                <input
                  type="text"
                  required
                  value={newAdjustment.counterAccountCode}
                  onChange={(e) => setNewAdjustment({ ...newAdjustment, counterAccountCode: e.target.value })}
                  placeholder="e.g. 5020"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason *</label>
                <input
                  type="text"
                  required
                  value={newAdjustment.reason}
                  onChange={(e) => setNewAdjustment({ ...newAdjustment, reason: e.target.value })}
                  placeholder="e.g. Price variance write-off, short shipment"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Approval Reference *</label>
                <input
                  type="text"
                  required
                  value={newAdjustment.approvalReference}
                  onChange={(e) => setNewAdjustment({ ...newAdjustment, approvalReference: e.target.value })}
                  placeholder="Approval policy reference #"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-amber-800">
                <strong className="font-bold">Important:</strong> This adjustment creates a balanced journal entry:
                Debit counter account, Credit GRNI. The original GRN and invoice history is preserved.
                Residual balances are never automatically written off.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAdjustmentOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg transition-colors shadow-sm disabled:opacity-50"
              >
                Record Adjustment
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </Layout>
  );
}