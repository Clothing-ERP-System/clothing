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
  RefreshCw,
  Plus,
  Search,
  FileText,
  DollarSign,
  Truck,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Wallet,
} from 'lucide-react';

export default function SupplierInvoicesPage() {
  const { addToast } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [isNewOpen, setIsNewOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const invoiceRequestIdRef = useRef(null);

  const [newInvoice, setNewInvoice] = useState({
    supplierId: '',
    supplierName: '',
    poNumber: '',
    grnNumber: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    items: [],
    taxPercentage: 0,
    notes: '',
    status: 'Posted',
    paidAmount: 0,
  });

  const [itemDraft, setItemDraft] = useState({
    description: '',
    quantity: '',
    unit: '',
    unitPrice: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/procurement');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        addToast(json.message || 'Failed to load supplier invoices', 'error');
      }
    } catch {
      addToast('Error loading supplier invoice data', 'error');
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

  const invoices = useMemo(() => data?.supplierInvoices || [], [data]);
  const suppliers = useMemo(() => data?.suppliers || [], [data]);

  const filteredInvoices = useMemo(() => {
    return invoices
      .filter((i) => {
        if (selectedStatus !== 'ALL' && i.status !== selectedStatus) return false;
        if (search) {
          const q = search.toLowerCase();
          return (
            i.invoiceNumber?.toLowerCase().includes(q) ||
            i.supplierName?.toLowerCase().includes(q) ||
            i.poNumber?.toLowerCase().includes(q) ||
            i.grnNumber?.toLowerCase().includes(q) ||
            i.notes?.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [invoices, selectedStatus, search]);

  const totalPages = Math.ceil(filteredInvoices.length / pageSize) || 1;
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredInvoices.slice(start, start + pageSize);
  }, [filteredInvoices, currentPage, pageSize]);

  const openNewInvoiceModal = () => {
    invoiceRequestIdRef.current = crypto.randomUUID();
    setNewInvoice({
      supplierId: '',
      supplierName: '',
      poNumber: '',
      grnNumber: '',
      invoiceDate: new Date().toISOString().slice(0, 10),
      dueDate: '',
      items: [],
      taxPercentage: 0,
      notes: '',
      status: 'Posted',
      paidAmount: 0,
    });
    setItemDraft({ description: '', quantity: '', unit: '', unitPrice: '' });
    setIsNewOpen(true);
  };

  const handleAddItem = () => {
    const qty = Number(itemDraft.quantity);
    const price = Number(itemDraft.unitPrice || 0);
    if (!itemDraft.description) {
      addToast('Enter an item description', 'error');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      addToast('Enter a positive quantity', 'error');
      return;
    }
    const newItem = {
      lineId: crypto.randomUUID(),
      description: itemDraft.description,
      quantity: qty,
      unit: itemDraft.unit || '',
      unitPrice: price,
      totalAmount: qty * price,
    };
    setNewInvoice((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    setItemDraft({ description: '', quantity: '', unit: '', unitPrice: '' });
  };

  const handleRemoveItem = (index) => {
    setNewInvoice((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index),
    }));
  };

  const subtotal = useMemo(() => {
    return newInvoice.items.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);
  }, [newInvoice.items]);

  const taxAmount = useMemo(() => {
    const rate = Number(newInvoice.taxPercentage) || 0;
    return (subtotal * rate) / 100;
  }, [subtotal, newInvoice.taxPercentage]);

  const grandTotal = subtotal + taxAmount;
  const outstandingBalance = grandTotal - Number(newInvoice.paidAmount || 0);

  const handleSubmitInvoice = async (e) => {
    e.preventDefault();
    if (!newInvoice.supplierId) {
      addToast('Please select a supplier from the list', 'error');
      return;
    }
    if (!newInvoice.invoiceDate) {
      addToast('Invoice date is required', 'error');
      return;
    }
    if (!newInvoice.items.length) {
      addToast('Add at least one item to the invoice', 'error');
      return;
    }
    try {
      const res = await apiFetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_SUPPLIER_INVOICE',
          supplierId: newInvoice.supplierId,
          supplierName: newInvoice.supplierName,
          poNumber: newInvoice.poNumber,
          grnNumber: newInvoice.grnNumber,
          invoiceDate: newInvoice.invoiceDate,
          dueDate: newInvoice.dueDate,
          items: newInvoice.items,
          taxPercentage: Number(newInvoice.taxPercentage) || 0,
          notes: newInvoice.notes,
          status: newInvoice.status,
          paidAmount: Number(newInvoice.paidAmount || 0),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create supplier invoice', 'error');
        return;
      }
      addToast(json.message || 'Supplier invoice recorded successfully', 'success');
      setIsNewOpen(false);
      await fetchData(true);
    } catch {
      addToast('Network error while creating supplier invoice', 'error');
    }
  };

  const handleUpdateInvoice = async (invId, updates) => {
    try {
      const res = await apiFetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_SUPPLIER_INVOICE', invoiceId: invId, ...updates }),
      });
      const result = await res.json();
      if (!res.ok) {
        addToast(result.message || 'Invoice update failed', 'error');
        return false;
      }
      addToast('Supplier invoice updated', 'success');
      await fetchData();
      return true;
    } catch {
      addToast('Error updating supplier invoice', 'error');
      return false;
    }
  };

  const handleDeleteInvoice = async (invId) => {
    if (!window.confirm('Delete this supplier invoice?')) return;
    try {
      const res = await apiFetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE_SUPPLIER_INVOICE', invoiceId: invId }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to delete supplier invoice', 'error');
        return;
      }
      addToast('Supplier invoice deleted', 'success');
      await fetchData();
    } catch {
      addToast('Error deleting supplier invoice', 'error');
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                SUPPLIER INVOICES
              </span>
              <span className="text-xs text-slate-500">• Debit Notes & Payables</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Supplier Invoice Registry
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Record supplier invoices, track payables, and manage outstanding balances
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
              onClick={openNewInvoiceModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Invoice</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Total Invoices</p>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-[#0F172A] mt-2">{invoices.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">All supplier invoices</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Posted</p>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-indigo-700 mt-2">{invoices.filter((i) => i.status === 'Posted').length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Posted invoices</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Paid</p>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-emerald-700 mt-2">{invoices.filter((i) => i.status === 'Paid').length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Fully paid</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Outstanding</p>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-rose-700 mt-2">
              Rs. {invoices.reduce((sum, i) => sum + (Number(i.outstandingBalance || 0)), 0).toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Total outstanding balance</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by invoice #, supplier, PO #, or GRN #..."
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
                <option value="Posted">Posted</option>
                <option value="Paid">Paid</option>
                <option value="PartiallyPaid">Partially Paid</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">PO / GRN</th>
                  <th className="py-3 px-4">Invoice Date</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Grand Total</th>
                  <th className="py-3 px-4">Outstanding</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500">
                      Loading supplier invoices...
                    </td>
                  </tr>
                ) : paginatedInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center">
                      <div className="max-w-sm mx-auto text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                          <Receipt className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-bold text-slate-800">No Supplier Invoices</p>
                        <p className="text-xs text-slate-500">
                          Record supplier invoices to track payables and outstanding balances.
                        </p>
                        <button
                          type="button"
                          onClick={openNewInvoiceModal}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Record Invoice</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedInvoices.map((inv) => {
                    const statusBadge = {
                      Posted: 'bg-indigo-100 text-indigo-800',
                      Paid: 'bg-emerald-100 text-emerald-800',
                      PartiallyPaid: 'bg-amber-100 text-amber-800',
                    }[inv.status] || 'bg-slate-100 text-slate-800';
                    return (
                      <tr key={inv._id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{inv.invoiceNumber}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{inv.supplierName}</td>
                        <td className="py-3 px-4 text-slate-700 font-mono">
                          {inv.poNumber || inv.grnNumber ? (
                            <span>{inv.poNumber} {inv.grnNumber ? `(${inv.grnNumber})` : ''}</span>
                          ) : (
                            <span className="text-slate-400 italic">Direct</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 font-mono">
                          Rs. {Number(inv.grandTotal || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 font-mono">
                          Rs. {Number(inv.outstandingBalance || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${statusBadge}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedInvoice(inv)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                          >
                            <Eye className="w-3 h-3 text-slate-500" />
                            <span>View</span>
                          </button>
                          {inv.status === 'Posted' || inv.status === 'PartiallyPaid' ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteInvoice(inv._id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
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
          title="Record Supplier Invoice"
          subtitle="Record a supplier invoice and track payables"
          maxWidth="max-w-3xl"
        >
          <form onSubmit={(e) => preventDuplicateSubmit(e, handleSubmitInvoice)} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Supplier *</label>
                <select
                  required
                  value={newInvoice.supplierId}
                  onChange={(e) => {
                    const selected = suppliers.find((s) => s._id === e.target.value);
                    setNewInvoice({
                      ...newInvoice,
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
                <label className="block text-xs font-bold text-slate-700 mb-1">PO #</label>
                <input
                  type="text"
                  value={newInvoice.poNumber}
                  onChange={(e) => setNewInvoice({ ...newInvoice, poNumber: e.target.value })}
                  placeholder="Linked PO (optional)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">GRN #</label>
                <input
                  type="text"
                  value={newInvoice.grnNumber}
                  onChange={(e) => setNewInvoice({ ...newInvoice, grnNumber: e.target.value })}
                  placeholder="Linked GRN (optional)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Invoice Date *</label>
                <input
                  type="date"
                  required
                  value={newInvoice.invoiceDate}
                  onChange={(e) => setNewInvoice({ ...newInvoice, invoiceDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={newInvoice.dueDate}
                  onChange={(e) => setNewInvoice({ ...newInvoice, dueDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-slate-700">Invoice Items</label>
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
                {newInvoice.items.map((item, idx) => (
                  <div key={item.lineId || idx} className="p-2 bg-white rounded-lg border border-slate-200 flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-800">{item.description}</div>
                      <div className="text-[10px] text-slate-500 flex gap-2">
                        <span>{item.quantity} {item.unit}</span>
                        <span>Rs. {Number(item.unitPrice).toLocaleString()}</span>
                        <span>Rs. {Number(item.totalAmount).toLocaleString()}</span>
                      </div>
                    </div>
                    {newInvoice.items.length > 1 && (
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
                {newInvoice.items.length === 0 && (
                  <p className="text-xs text-slate-400 italic p-3 text-center">No items added yet.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tax Percentage (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={newInvoice.taxPercentage}
                  onChange={(e) => setNewInvoice({ ...newInvoice, taxPercentage: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Paid Amount (PKR)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={newInvoice.paidAmount}
                  onChange={(e) => setNewInvoice({ ...newInvoice, paidAmount: Number(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="flex justify-between items-end mb-2">
              <span className="text-xs font-bold text-slate-700">Subtotal:</span>
              <span className="font-mono font-bold text-slate-900">Rs. {subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-end mb-2">
              <span className="text-xs font-bold text-slate-700">Tax:</span>
              <span className="font-mono font-bold text-slate-900">Rs. {taxAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-end mt-1">
              <span className="text-xs font-bold text-slate-700">Grand Total:</span>
              <span className="font-mono font-bold text-slate-900">Rs. {grandTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-end">
              <span className="text-xs font-bold text-slate-700">Outstanding:</span>
              <span className="font-mono font-bold text-slate-900">Rs. {outstandingBalance.toLocaleString()}</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Notes</label>
              <input
                type="text"
                value={newInvoice.notes}
                onChange={(e) => setNewInvoice({ ...newInvoice, notes: e.target.value })}
                placeholder="Additional notes"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
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
                Record Invoice
              </button>
            </div>
          </form>
        </Modal>

        <RecordViewModal
          isOpen={Boolean(selectedInvoice)}
          onClose={() => setSelectedInvoice(null)}
          record={selectedInvoice}
          title={`Invoice: ${selectedInvoice?.invoiceNumber || ''}`}
          subtitle={`Supplier: ${selectedInvoice?.supplierName || ''} • PO: ${selectedInvoice?.poNumber || ''} • GRN: ${selectedInvoice?.grnNumber || ''}`}
          fields={[
            { name: 'invoiceNumber', label: 'Invoice Number', type: 'text' },
            { name: 'supplierName', label: 'Supplier Name', type: 'text' },
            { name: 'poNumber', label: 'PO Number', type: 'text' },
            { name: 'grnNumber', label: 'GRN Number', type: 'text' },
            { name: 'invoiceDate', label: 'Invoice Date', type: 'date' },
            { name: 'dueDate', label: 'Due Date', type: 'date' },
            { name: 'subtotal', label: 'Subtotal', type: 'money' },
            { name: 'taxPercentage', label: 'Tax Percentage (%)', type: 'text' },
            { name: 'taxAmount', label: 'Tax Amount', type: 'money' },
            { name: 'grandTotal', label: 'Grand Total', type: 'money' },
            { name: 'paidAmount', label: 'Paid Amount', type: 'money' },
            { name: 'outstandingBalance', label: 'Outstanding Balance', type: 'money' },
            { name: 'status', label: 'Status', type: 'text' },
            { name: 'notes', label: 'Notes', type: 'text' },
            {
              name: 'items',
              label: 'Items',
              type: 'array',
              itemFields: [
                { name: 'description', label: 'Description' },
                { name: 'quantity', label: 'Quantity', type: 'text' },
                { name: 'unit', label: 'Unit' },
                { name: 'unitPrice', label: 'Unit Price', type: 'money' },
                { name: 'totalAmount', label: 'Total', type: 'money' },
              ],
            },
          ]}
        />
      </div>
    </Layout>
  );
}