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
  ArrowRight,
  Mail,
  Users2,
} from 'lucide-react';

export default function SalesQuotationsPage() {
  const { addToast } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [isNewOpen, setIsNewOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState(null);
  const quotationRequestIdRef = useRef(null);

  const [newQuotation, setNewQuotation] = useState({
    customerId: '',
    customerName: '',
    customerTier: '',
    items: [],
    validFrom: '',
    validTo: '',
    salesRep: '',
    notes: '',
    status: 'Draft',
  });

  const [itemDraft, setItemDraft] = useState({
    articleCode: '',
    title: '',
    size: '',
    quantity: '',
    unitPrice: '',
    discountPercent: 0,
  });

  const [designs, setDesigns] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      const [salesRes, designRes] = await Promise.all([
        apiFetch('/api/sales'),
        apiFetch('/api/design'),
      ]);
      const [salesJson, designJson] = await Promise.all([salesRes.json(), designRes.json()]);
      if (salesJson.success) {
        setData(salesJson.data);
      }
      if (designJson.success) {
        setDesigns(designJson.data.designs || []);
      }
    } catch {
      addToast('Error loading sales quotation data', 'error');
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

  const quotations = useMemo(() => data?.salesQuotations || [], [data]);

  const filteredQuotations = useMemo(() => {
    return quotations
      .filter((q) => {
        if (selectedStatus !== 'ALL' && q.status !== selectedStatus) return false;
        if (search) {
          const q2 = search.toLowerCase();
          return (
            q.quotationNumber?.toLowerCase().includes(q2) ||
            q.customerName?.toLowerCase().includes(q2) ||
            q.notes?.toLowerCase().includes(q2)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [quotations, selectedStatus, search]);

  const totalPages = Math.ceil(filteredQuotations.length / pageSize) || 1;
  const paginatedQuotations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredQuotations.slice(start, start + pageSize);
  }, [filteredQuotations, currentPage, pageSize]);

  const openNewQuotationModal = () => {
    quotationRequestIdRef.current = crypto.randomUUID();
    setNewQuotation({
      customerId: '',
      customerName: '',
      customerTier: '',
      items: [],
      validFrom: '',
      validTo: '',
      salesRep: '',
      notes: '',
      status: 'Draft',
    });
    setItemDraft({ articleCode: '', title: '', size: '', quantity: '', unitPrice: '', discountPercent: 0 });
    setIsNewOpen(true);
  };

  const handleAddItem = () => {
    const qty = Number(itemDraft.quantity);
    const price = Number(itemDraft.unitPrice || 0);
    const discountPct = Number(itemDraft.discountPercent || 0);
    if (!itemDraft.articleCode || !itemDraft.title) {
      addToast('Select a valid article and enter a title', 'error');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      addToast('Enter a positive quantity', 'error');
      return;
    }
    const discountAmount = Math.round(price * (discountPct / 100)) * qty;
    const netPrice = price - (price * (discountPct / 100));
    const lineTotal = Math.round(netPrice * qty);
    const newItem = {
      lineId: crypto.randomUUID(),
      articleCode: itemDraft.articleCode,
      title: itemDraft.title,
      size: itemDraft.size || '',
      quantity: qty,
      unitPrice: price,
      discountPercent: discountPct,
      discountAmount,
      netPrice,
      lineTotal,
    };
    setNewQuotation((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }));
    setItemDraft({ articleCode: '', title: '', size: '', quantity: '', unitPrice: '', discountPercent: 0 });
  };

  const handleRemoveItem = (index) => {
    setNewQuotation((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index),
    }));
  };

  const subtotal = useMemo(() => {
    return newQuotation.items.reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * Number(item.quantity), 0);
  }, [newQuotation.items]);

  const totalDiscount = useMemo(() => {
    return newQuotation.items.reduce((sum, item) => sum + (Number(item.discountAmount) || 0), 0);
  }, [newQuotation.items]);

  const grandTotal = subtotal - totalDiscount;

  const handleSubmitQuotation = async (e) => {
    e.preventDefault();
    if (!newQuotation.customerName) {
      addToast('Customer name is required', 'error');
      return;
    }
    if (!newQuotation.items.length) {
      addToast('Add at least one item to the quotation', 'error');
      return;
    }
    try {
      const res = await apiFetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_SALES_QUOTATION',
          customerId: newQuotation.customerId,
          customerName: newQuotation.customerName,
          customerTier: newQuotation.customerTier,
          items: newQuotation.items,
          validFrom: newQuotation.validFrom,
          validTo: newQuotation.validTo,
          salesRep: newQuotation.salesRep,
          notes: newQuotation.notes,
          status: newQuotation.status,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create sales quotation', 'error');
        return;
      }
      addToast(json.message || 'Sales quotation created successfully', 'success');
      setIsNewOpen(false);
      await fetchData(true);
    } catch {
      addToast('Network error while creating sales quotation', 'error');
    }
  };

  const handleUpdateQuotation = async (qtId, updates) => {
    try {
      const res = await apiFetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_SALES_QUOTATION', quotationId: qtId, ...updates }),
      });
      const result = await res.json();
      if (!res.ok) {
        addToast(result.message || 'Quotation update failed', 'error');
        return false;
      }
      addToast('Sales quotation updated', 'success');
      await fetchData();
      return true;
    } catch {
      addToast('Error updating sales quotation', 'error');
      return false;
    }
  };

  const handleDeleteQuotation = async (qtId) => {
    if (!window.confirm('Delete this sales quotation?')) return;
    try {
      const res = await apiFetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE_SALES_QUOTATION', quotationId: qtId }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to delete sales quotation', 'error');
        return;
      }
      addToast('Sales quotation deleted', 'success');
      await fetchData();
    } catch {
      addToast('Error deleting sales quotation', 'error');
    }
  };

  const handleConvertToOrder = async (qtId) => {
    if (!window.confirm('Convert this quotation to a sales order?')) return;
    try {
      const res = await apiFetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CONVERT_SALES_QUOTATION_TO_ORDER',
          quotationId: qtId,
          warehouseLocation: '',
          revenueAccountCode: '',
          receivableAccountCode: '',
          paymentAccountCode: '',
          paymentMethod: 'Cash',
          amountPaid: 0,
          shippingFee: 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to convert quotation to order', 'error');
        return;
      }
      addToast(json.message || 'Sales quotation converted to order', 'success');
      await fetchData(true);
    } catch {
      addToast('Network error while converting quotation', 'error');
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-indigo-600" />
                SALES QUOTATIONS
              </span>
              <span className="text-xs text-slate-500">• Quotation-to-Order Conversion</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Sales Quotation Registry
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Create sales quotations and convert accepted quotations to sales orders
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
              onClick={openNewQuotationModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Quotation</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Total Quotations</p>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Mail className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-[#0F172A] mt-2">{quotations.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">All sales quotations</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Draft</p>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-amber-700 mt-2">{quotations.filter((q) => q.status === 'Draft').length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Not yet sent</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Sent</p>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <Users2 className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-blue-700 mt-2">{quotations.filter((q) => q.status === 'Sent').length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Sent to customers</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Accepted</p>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-emerald-700 mt-2">{quotations.filter((q) => q.status === 'Accepted').length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Ready for conversion</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by quotation #, customer, or notes..."
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
                <option value="Sent">Sent</option>
                <option value="Accepted">Accepted</option>
                <option value="Converted">Converted</option>
                <option value="Expired">Expired</option>
                <option value="Lost">Lost</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                  <th className="py-3 px-4">Quotation #</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Valid To</th>
                  <th className="py-3 px-4">Grand Total</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Loading sales quotations...
                    </td>
                  </tr>
                ) : paginatedQuotations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center">
                      <div className="max-w-sm mx-auto text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                          <Mail className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-bold text-slate-800">No Sales Quotations</p>
                        <p className="text-xs text-slate-500">
                          Create sales quotations for customers and convert to orders when accepted.
                        </p>
                        <button
                          type="button"
                          onClick={openNewQuotationModal}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Create Quotation</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedQuotations.map((q) => {
                    const statusBadge = {
                      Draft: 'bg-amber-100 text-amber-800',
                      Sent: 'bg-blue-100 text-blue-800',
                      Accepted: 'bg-emerald-100 text-emerald-800',
                      Converted: 'bg-indigo-100 text-indigo-800',
                      Expired: 'bg-slate-100 text-slate-800',
                      Lost: 'bg-rose-100 text-rose-800',
                    }[q.status] || 'bg-slate-100 text-slate-800';
                    return (
                      <tr key={q._id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{q.quotationNumber}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{q.customerName}</td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {q.validTo ? new Date(q.validTo).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 font-mono">
                          Rs. {Number(q.grandTotal || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${statusBadge}`}>
                            {q.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedQuotation(q)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                          >
                            <Eye className="w-3 h-3 text-slate-500" />
                            <span>View</span>
                          </button>
                          {q.status === 'Accepted' ? (
                            <button
                              type="button"
                              onClick={() => handleConvertToOrder(q._id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 border border-emerald-700 rounded-lg hover:bg-emerald-700 transition-colors"
                            >
                              <ArrowRight className="w-3 h-3" />
                              <span>Convert</span>
                            </button>
                          ) : null}
                          {q.status === 'Draft' || q.status === 'Sent' || q.status === 'Expired' || q.status === 'Lost' ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteQuotation(q._id)}
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
          title="Create Sales Quotation"
          subtitle="Create a sales quotation and convert to sales order when accepted"
          maxWidth="max-w-3xl"
        >
          <form onSubmit={(e) => preventDuplicateSubmit(e, handleSubmitQuotation)} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={newQuotation.customerName}
                  onChange={(e) => setNewQuotation({ ...newQuotation, customerName: e.target.value })}
                  placeholder="Customer name"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Customer Tier</label>
                <input
                  type="text"
                  value={newQuotation.customerTier}
                  onChange={(e) => setNewQuotation({ ...newQuotation, customerTier: e.target.value })}
                  placeholder="Customer tier"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Valid From</label>
                <input
                  type="date"
                  value={newQuotation.validFrom}
                  onChange={(e) => setNewQuotation({ ...newQuotation, validFrom: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Valid To</label>
                <input
                  type="date"
                  value={newQuotation.validTo}
                  onChange={(e) => setNewQuotation({ ...newQuotation, validTo: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Sales Rep</label>
              <input
                type="text"
                value={newQuotation.salesRep}
                onChange={(e) => setNewQuotation({ ...newQuotation, salesRep: e.target.value })}
                placeholder="Sales representative"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Notes</label>
              <input
                type="text"
                value={newQuotation.notes}
                onChange={(e) => setNewQuotation({ ...newQuotation, notes: e.target.value })}
                placeholder="Additional notes"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-slate-700">Quotation Items</label>
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
                {newQuotation.items.map((item, idx) => (
                  <div key={item.lineId || idx} className="p-2 bg-white rounded-lg border border-slate-200 flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-800">{item.title}</div>
                      <div className="text-[10px] text-slate-500 flex gap-2">
                        <span>{item.articleCode}</span>
                        <span>{item.size}</span>
                        <span>{item.quantity} pcs</span>
                        <span>Rs. {Number(item.unitPrice).toLocaleString()}</span>
                        <span>Rs. {Number(item.lineTotal).toLocaleString()}</span>
                      </div>
                    </div>
                    {newQuotation.items.length > 1 && (
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
                {newQuotation.items.length === 0 && (
                  <p className="text-xs text-slate-400 italic p-3 text-center">No items added yet.</p>
                )}
              </div>
            </div>

            <div className="flex justify-between items-end mb-2">
              <span className="text-xs font-bold text-slate-700">Grand Total:</span>
              <span className="font-mono font-bold text-slate-900">Rs. {grandTotal.toLocaleString()}</span>
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
                Create Quotation
              </button>
            </div>
          </form>
        </Modal>

        <RecordViewModal
          isOpen={Boolean(selectedQuotation)}
          onClose={() => setSelectedQuotation(null)}
          record={selectedQuotation}
          title={`Quotation: ${selectedQuotation?.quotationNumber || ''}`}
          subtitle={`Customer: ${selectedQuotation?.customerName || ''} • Tier: ${selectedQuotation?.customerTier || ''} • Status: ${selectedQuotation?.status || ''}`}
          fields={[
            { name: 'quotationNumber', label: 'Quotation Number', type: 'text' },
            { name: 'customerName', label: 'Customer Name', type: 'text' },
            { name: 'customerTier', label: 'Customer Tier', type: 'text' },
            { name: 'status', label: 'Status', type: 'text' },
            { name: 'subtotal', label: 'Subtotal', type: 'money' },
            { name: 'totalDiscount', label: 'Total Discount', type: 'money' },
            { name: 'grandTotal', label: 'Grand Total', type: 'money' },
            { name: 'validFrom', label: 'Valid From', type: 'date' },
            { name: 'validTo', label: 'Valid To', type: 'date' },
            { name: 'salesRep', label: 'Sales Rep', type: 'text' },
            { name: 'notes', label: 'Notes', type: 'text' },
            { name: 'convertedOrderNumber', label: 'Converted Order #', type: 'text' },
            {
              name: 'items',
              label: 'Items',
              type: 'array',
              itemFields: [
                { name: 'articleCode', label: 'Article Code' },
                { name: 'title', label: 'Title' },
                { name: 'size', label: 'Size' },
                { name: 'quantity', label: 'Quantity', type: 'text' },
                { name: 'unitPrice', label: 'Unit Price', type: 'money' },
                { name: 'discountPercent', label: 'Discount %', type: 'text' },
                { name: 'discountAmount', label: 'Discount Amount', type: 'money' },
                { name: 'netPrice', label: 'Net Price', type: 'money' },
                { name: 'lineTotal', label: 'Line Total', type: 'money' },
              ],
            },
          ]}
        />
      </div>
    </Layout>
  );
}