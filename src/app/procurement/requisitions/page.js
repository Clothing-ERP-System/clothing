'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import RecordEditModal from '@/components/RecordEditModal';
import RecordDeleteButton from '@/components/RecordDeleteButton';
import RecordViewModal from '@/components/RecordViewModal';
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
  ClipboardList,
  User,
} from 'lucide-react';

export default function PurchaseRequisitionsPage() {
  const { addToast } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [isNewOpen, setIsNewOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);
  const [processingReq, setProcessingReq] = useState(false);
  const requisitionRequestIdRef = useRef(null);

  const [newRequisition, setNewRequisition] = useState({
    department: '',
    requester: '',
    requiredDate: '',
    notes: '',
    status: 'Draft',
    items: [],
  });

  const [itemDraft, setItemDraft] = useState({
    stockItemType: 'Fabric',
    stockItemId: '',
    stockItemCode: '',
    description: '',
    unit: '',
    quantity: '',
    estimatedUnitCost: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/procurement');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        addToast(json.message || 'Failed to load purchase requisitions', 'error');
      }
    } catch {
      addToast('Error loading purchase requisition data', 'error');
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

  const requisitions = useMemo(() => data?.purchaseRequisitions || [], [data]);
  const fabricItems = useMemo(() => data?.fabricItems || [], [data]);
  const trimItems = useMemo(() => data?.trimItems || [], [data]);

  const filteredRequisitions = useMemo(() => {
    return requisitions
      .filter((r) => {
        if (selectedStatus !== 'ALL' && r.status !== selectedStatus) return false;
        if (search) {
          const q = search.toLowerCase();
          return (
            r.requisitionNumber?.toLowerCase().includes(q) ||
            r.department?.toLowerCase().includes(q) ||
            r.requester?.toLowerCase().includes(q) ||
            r.notes?.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [requisitions, selectedStatus, search]);

  const totalPages = Math.ceil(filteredRequisitions.length / pageSize) || 1;
  const paginatedRequisitions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRequisitions.slice(start, start + pageSize);
  }, [filteredRequisitions, currentPage, pageSize]);

  const openNewRequisitionModal = () => {
    requisitionRequestIdRef.current = crypto.randomUUID();
    setNewRequisition({
      department: '',
      requester: '',
      requiredDate: new Date().toISOString().slice(0, 10),
      notes: '',
      status: 'Draft',
      items: [],
    });
    setItemDraft({
      stockItemType: 'Fabric',
      stockItemId: '',
      stockItemCode: '',
      description: '',
      unit: '',
      quantity: '',
      estimatedUnitCost: '',
    });
    setIsNewOpen(true);
  };

  const handleAddItem = () => {
    const qty = Number(itemDraft.quantity);
    const price = Number(itemDraft.estimatedUnitCost || 0);
    if (!itemDraft.stockItemId || !itemDraft.description) {
      addToast('Select a valid stock item and enter a description', 'error');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      addToast('Enter a positive quantity', 'error');
      return;
    }
    const newItem = {
      lineId: crypto.randomUUID(),
      stockItemType: itemDraft.stockItemType,
      stockItemId: itemDraft.stockItemId,
      stockItemCode: itemDraft.stockItemCode,
      description: itemDraft.description,
      unit: itemDraft.unit || '',
      quantity: qty,
      estimatedUnitCost: price,
      totalAmount: qty * price,
    };
    setNewRequisition((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    setItemDraft({
      stockItemType: 'Fabric',
      stockItemId: '',
      stockItemCode: '',
      description: '',
      unit: '',
      quantity: '',
      estimatedUnitCost: '',
    });
  };

  const handleRemoveItem = (index) => {
    setNewRequisition((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index),
    }));
  };

  const subtotal = useMemo(() => {
    return newRequisition.items.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);
  }, [newRequisition.items]);

  const handleSubmitRequisition = async (e) => {
    e.preventDefault();
    if (!newRequisition.items.length) {
      addToast('Add at least one item to the requisition', 'error');
      return;
    }
    try {
      const res = await apiFetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_REQUISITION',
          department: newRequisition.department,
          requester: newRequisition.requester,
          items: newRequisition.items,
          requiredDate: newRequisition.requiredDate,
          notes: newRequisition.notes,
          status: newRequisition.status,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create purchase requisition', 'error');
        return;
      }
      addToast(json.message || 'Purchase requisition created successfully', 'success');
      setIsNewOpen(false);
      await fetchData(true);
    } catch {
      addToast('Network error while creating purchase requisition', 'error');
    }
  };

  const handleUpdateRequisition = async (reqId, updates) => {
    try {
      const res = await apiFetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_REQUISITION', requisitionId: reqId, ...updates }),
      });
      const result = await res.json();
      if (!res.ok) {
        addToast(result.message || 'Requisition update failed', 'error');
        return false;
      }
      addToast('Purchase requisition updated', 'success');
      await fetchData();
      return true;
    } catch {
      addToast('Error updating purchase requisition', 'error');
      return false;
    }
  };

  const handleDeleteRequisition = async (reqId) => {
    if (!window.confirm('Delete this purchase requisition?')) return;
    try {
      const res = await apiFetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE_REQUISITION', requisitionId: reqId }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to delete purchase requisition', 'error');
        return;
      }
      addToast('Purchase requisition deleted', 'success');
      await fetchData();
    } catch {
      addToast('Error deleting purchase requisition', 'error');
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <ClipboardList className="w-3.5 h-3.5 text-amber-600" />
                PURCHASE REQUISITIONS
              </span>
              <span className="text-xs text-slate-500">• Internal Purchase Requests</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Purchase Requisition Register
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Create, track, and approve internal purchase requisitions before converting to POs or RFQs
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
              onClick={openNewRequisitionModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Requisition</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Total Requisitions</p>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <ClipboardList className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-[#0F172A] mt-2">{requisitions.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">All purchase requisitions</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Draft</p>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-amber-700 mt-2">{requisitions.filter((r) => r.status === 'Draft').length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Pending submission</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Pending Approval</p>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-indigo-700 mt-2">{requisitions.filter((r) => r.status === 'PendingApproval').length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Awaiting approval</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Approved</p>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-emerald-700 mt-2">{requisitions.filter((r) => r.status === 'Approved').length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Ready for PO or RFQ</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by requisition #, department, requester, or notes..."
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
                <option value="Draft">Draft</option>
                <option value="PendingApproval">Pending Approval</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="Converted">Converted</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                  <th className="py-3 px-4">Requisition #</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Requester</th>
                  <th className="py-3 px-4">Required Date</th>
                  <th className="py-3 px-4">Items</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Loading purchase requisitions...
                    </td>
                  </tr>
                ) : paginatedRequisitions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <div className="max-w-sm mx-auto text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                          <ClipboardList className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-bold text-slate-800">No Purchase Requisitions</p>
                        <p className="text-xs text-slate-500">
                          Create purchase requisitions to request materials from suppliers.
                        </p>
                        <button
                          type="button"
                          onClick={openNewRequisitionModal}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Create Requisition</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRequisitions.map((r) => {
                    const statusBadge = {
                      Draft: 'bg-amber-100 text-amber-800',
                      PendingApproval: 'bg-indigo-100 text-indigo-800',
                      Approved: 'bg-emerald-100 text-emerald-800',
                      Rejected: 'bg-rose-100 text-rose-800',
                      Converted: 'bg-slate-100 text-slate-800',
                    }[r.status] || 'bg-slate-100 text-slate-800';
                    return (
                      <tr key={r._id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{r.requisitionNumber}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{r.department}</td>
                        <td className="py-3 px-4 text-slate-700">{r.requester}</td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {r.requiredDate ? new Date(r.requiredDate).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {(r.items || []).map((i) => `${i.quantity} ${i.unit} ${i.description}`).join(', ')}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${statusBadge}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedReq(r)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                          >
                            <Eye className="w-3 h-3 text-slate-500" />
                            <span>View</span>
                          </button>
                          {r.status === 'Draft' || r.status === 'Rejected' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleDeleteRequisition(r._id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Delete</span>
                              </button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
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
          isOpen={isNewOpen}
          onClose={() => setIsNewOpen(false)}
          title="Create Purchase Requisition"
          subtitle="Request materials from suppliers - convert to PO or RFQ after approval"
          maxWidth="max-w-3xl"
        >
          <form onSubmit={(e) => preventDuplicateSubmit(e, handleSubmitRequisition)} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department *</label>
                <input
                  type="text"
                  required
                  value={newRequisition.department}
                  onChange={(e) => setNewRequisition({ ...newRequisition, department: e.target.value })}
                  placeholder="e.g. Stitching, Cutting, Dyeing"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Requester *</label>
                <input
                  type="text"
                  required
                  value={newRequisition.requester}
                  onChange={(e) => setNewRequisition({ ...newRequisition, requester: e.target.value })}
                  placeholder="Requester name"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Required Date *</label>
                <input
                  type="date"
                  required
                  value={newRequisition.requiredDate}
                  onChange={(e) => setNewRequisition({ ...newRequisition, requiredDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Notes</label>
              <input
                type="text"
                value={newRequisition.notes}
                onChange={(e) => setNewRequisition({ ...newRequisition, notes: e.target.value })}
                placeholder="Additional notes"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-slate-700">Requisition Items</label>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#4F46E5] hover:text-[#4338CA]"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Add Item</span>
                </button>
              </div>
              <div className="space-y-2">
                {newRequisition.items.map((item, idx) => (
                  <div key={item.lineId || idx} className="p-2 bg-white rounded-lg border border-slate-200 flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-800">{item.description}</div>
                      <div className="text-[10px] text-slate-500 flex gap-2">
                        <span>{item.stockItemType}</span>
                        <span>{item.stockItemCode}</span>
                        <span>{item.quantity} {item.unit}</span>
                        <span>Rs. {Number(item.estimatedUnitCost).toLocaleString()}</span>
                        <span>Rs. {Number(item.totalAmount).toLocaleString()}</span>
                      </div>
                    </div>
                    {newRequisition.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                {newRequisition.items.length === 0 && (
                  <p className="text-xs text-slate-400 italic p-3 text-center">No items added yet.</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg transition-colors shadow-sm disabled:opacity-50"
              >
                Create Requisition
              </button>
            </div>
          </form>
        </Modal>

        <RecordViewModal
          isOpen={Boolean(selectedReq)}
          onClose={() => setSelectedReq(null)}
          record={selectedReq}
          title={`Requisition: ${selectedReq?.requisitionNumber || ''}`}
          subtitle={`Department: ${selectedReq?.department || ''} • Requester: ${selectedReq?.requester || ''} • Status: ${selectedReq?.status || ''}`}
          fields={[
            { name: 'requisitionNumber', label: 'Requisition Number', type: 'text' },
            { name: 'department', label: 'Department', type: 'text' },
            { name: 'requester', label: 'Requester', type: 'text' },
            { name: 'status', label: 'Status', type: 'text' },
            { name: 'requiredDate', label: 'Required Date', type: 'date' },
            { name: 'notes', label: 'Notes', type: 'text' },
            {
              name: 'items',
              label: 'Items',
              type: 'array',
              itemFields: [
                { name: 'stockItemType', label: 'Type' },
                { name: 'stockItemCode', label: 'Item Code' },
                { name: 'description', label: 'Description' },
                { name: 'unit', label: 'Unit' },
                { name: 'quantity', label: 'Quantity', type: 'text' },
                { name: 'estimatedUnitCost', label: 'Unit Cost', type: 'money' },
                { name: 'totalAmount', label: 'Total', type: 'money' },
              ],
            },
          ]}
        />
      </div>
    </Layout>
  );
}

