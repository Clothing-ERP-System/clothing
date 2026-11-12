'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import RecordEditModal from '@/components/RecordEditModal';
import RecordDeleteButton from '@/components/RecordDeleteButton';
import RecordAttachments from '@/components/RecordAttachments';
import RecordViewModal from '@/components/RecordViewModal';
import PurchaseOrderApproval from '@/components/PurchaseOrderApproval';
import GRNInspectionModal from '@/components/GRNInspectionModal';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  ShoppingBag,
  Plus,
  PackageCheck,
  Building,
  Calendar,
  FileText,
  DollarSign,
  Truck,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Eye,
} from 'lucide-react';

export default function ProcurementPage() {
  const { addToast, user, currentBranch } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'suppliers'

  // Modals
  const [isNewPOOpen, setIsNewPOOpen] = useState(false);
  const [isNewSupplierOpen, setIsNewSupplierOpen] = useState(false);
  const [isGrnOpen, setIsGrnOpen] = useState(false);
  const [isSupplierPaymentOpen, setIsSupplierPaymentOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [approvalPO, setApprovalPO] = useState(null);
  const [inspectionTarget, setInspectionTarget] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [attachmentSupplier, setAttachmentSupplier] = useState(null);
  const [editingPurchaseOrder, setEditingPurchaseOrder] = useState(null);
  // View modals
  const [viewPO, setViewPO] = useState(null);
  const [viewSupplier, setViewSupplier] = useState(null);
  const supplierPaymentRequestId = useRef(null);

  // New PO Form
  const [newPO, setNewPO] = useState({
    supplierName: '',
    paymentTerms: '',
    expectedDeliveryDate: '',
    inventoryAccountCode: '',
    payableAccountCode: '',
    notes: '',
    items: [],
  });
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    category: '',
    creditPeriodDays: '',
  });

  // GRN Form
  const [grnForm, setGrnForm] = useState({
    challanNumber: '',
    warehouseLocation: '',
    receivedBy: '',
    receivedItems: [],
  });

  const [supplierPaymentForm, setSupplierPaymentForm] = useState({
    amount: '',
    payableAccountCode: '',
    paymentAccountCode: '',
    method: '',
    referenceNumber: '',
  });

  const fetchData = async () => {
    try {
      const res = await apiFetch('/api/procurement');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        const accounts = json.data.financialAccounts || [];
        setNewPO((current) => ({
          ...current,
          inventoryAccountCode: current.inventoryAccountCode || accounts.find((account) => account.type === 'Asset')?.code || '',
          payableAccountCode: current.payableAccountCode || accounts.find((account) => account.type === 'Liability')?.code || '',
        }));
      }
    } catch (err) {
      console.error('Error fetching procurement:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, []);

  const handleAddItemToPO = () => {
    setNewPO({
      ...newPO,
      items: [
        ...newPO.items,
        { stockItemType: '', stockItemId: '', description: '', unit: '', orderedQty: '', unitPrice: '' },
      ],
    });
  };

  const handleRemovePOItem = (index) => {
    const updated = newPO.items.filter((_, idx) => idx !== index);
    setNewPO({ ...newPO, items: updated });
  };

  const handleCreatePO = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_PO', ...newPO }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create PO', 'error');
        return;
      }
      addToast('Purchase order generated successfully!', 'success');
      setIsNewPOOpen(false);
      fetchData();
    } catch {
      addToast('Error saving purchase order', 'error');
    }
  };

  const handleCreateSupplier = async (event) => {
    event.preventDefault();
    try {
      const response = await apiFetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_SUPPLIER', ...newSupplier }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Supplier creation failed', 'error');
        return;
      }
      addToast(`Supplier ${result.data.supplier.supplierCode} created`, 'success');
      setIsNewSupplierOpen(false);
      setNewSupplier({
        name: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        category: '',
        creditPeriodDays: '',
      });
      await fetchData();
    } catch {
      addToast('Error creating supplier', 'error');
    }
  };

  const handleUpdateSupplier = async (supplierId, updates) => {
    try {
      const response = await apiFetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_SUPPLIER', supplierId, ...updates }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Supplier update failed', 'error');
        return false;
      }
      addToast('Supplier updated successfully', 'success');
      setEditingSupplier(null);
      await fetchData();
      return true;
    } catch {
      addToast('Error updating supplier', 'error');
      return false;
    }
  };

  const handleUpdatePurchaseOrder = async (poId, updates) => {
    try {
      const response = await apiFetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_PO', poId, ...updates }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Purchase order update failed', 'error');
        return false;
      }
      addToast('Purchase order details updated', 'success');
      setEditingPurchaseOrder(null);
      await fetchData();
      return true;
    } catch {
      addToast('Error updating purchase order', 'error');
      return false;
    }
  };

  const openGrnModal = (po) => {
    setSelectedPO(po);
    setGrnForm({
      challanNumber: '',
      warehouseLocation: currentBranch || '',
      receivedBy: user?.name || '',
      receivedItems: (po.items || []).map((i) => ({
        lineId: i.lineId,
        stockItemType: i.stockItemType,
        stockItemId: i.stockItemId,
        description: i.description,
        quantityReceived: '',
        rollNumbers: [],
        rollLengths: '',
        remarks: '',
      })),
    });
    setIsGrnOpen(true);
  };

  const handleProcessGRN = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RECEIVE_GRN',
          poNumber: selectedPO.poNumber,
          ...grnForm,
          receivedItems: grnForm.receivedItems.map((item) => ({
            ...item,
            rolls: item.stockItemType === 'Fabric'
              ? item.rollLengths.split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0)
                .map((meters, index) => ({
                  meters,
                  supplierRollNumber: item.rollNumbers[index] || '',
                }))
              : [],
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'GRN processing failed', 'error');
        return;
      }
      addToast(`Goods Receipt Note ${json.data.grnNumber} recorded and held pending inspection.`, 'success');
      setIsGrnOpen(false);
      fetchData();
    } catch {
      addToast('Error processing GRN', 'error');
    }
  };

  const openSupplierPayment = (supplier) => {
    const accounts = data?.financialAccounts || [];
    const accountCodes = Object.keys(supplier.payableBalances || {});
    const payableAccountCode = accountCodes.find((code) =>
      accounts.some((account) => account.code === code && account.type === 'Liability')
    ) || '';
    setSelectedSupplier(supplier);
    supplierPaymentRequestId.current = globalThis.crypto.randomUUID();
    setSupplierPaymentForm({
      amount: Number(supplier.payableBalances?.[payableAccountCode] || 0),
      payableAccountCode,
      paymentAccountCode: accounts.find((account) => account.type === 'Asset')?.code || '',
      method: '',
      referenceNumber: '',
    });
    setIsSupplierPaymentOpen(true);
  };

  const handleSupplierPayment = async (event) => {
    event.preventDefault();
    if (!selectedSupplier) return;
    try {
      const response = await apiFetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RECORD_SUPPLIER_PAYMENT',
          supplierId: selectedSupplier._id,
          paymentRequestId: supplierPaymentRequestId.current,
          paidBy: user?.name || '',
          ...supplierPaymentForm,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Supplier payment failed', 'error');
        return;
      }
      addToast('Supplier payment recorded in finance', 'success');
      setIsSupplierPaymentOpen(false);
      supplierPaymentRequestId.current = null;
      setSelectedSupplier(null);
      await fetchData();
    } catch {
      addToast('Error recording supplier payment', 'error');
    }
  };

  const suppliers = data?.suppliers || [];
  const purchaseOrders = data?.purchaseOrders || [];
  const fabricItems = data?.fabricItems || [];
  const trimItems = data?.trimItems || [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-[#4F46E5] border border-indigo-100">
                SUPPLY CHAIN & SOURCING
              </span>
              <span className="text-xs text-slate-500">• Purchase Orders & GRN</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Procurement & Vendor Management
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Fabric mills, thread, buttons, dyes procurement, and goods received note reconciliation
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {activeTab === 'suppliers' && (
              <button
                type="button"
                onClick={() => setIsNewSupplierOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Supplier</span>
              </button>
            )}
            {activeTab === 'orders' && (
              <button
                type="button"
                onClick={() => setIsNewPOOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Purchase Order</span>
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'orders'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Purchase Orders ({purchaseOrders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('suppliers')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'suppliers'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>Approved Suppliers ({suppliers.length})</span>
          </button>

          <Link
            href="/procurement/stock-alerts"
            className="px-4 py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-500 hover:text-[#4F46E5] transition-colors flex items-center gap-1.5"
          >
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>Stock Alert List</span>
          </Link>

          <Link
            href="/procurement/returns"
            className="px-4 py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-500 hover:text-[#4F46E5] transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4 text-teal-500" />
            <span>Purchase Return List</span>
          </Link>
        </div>

        {/* Tab 1: Purchase Orders */}
        {activeTab === 'orders' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Purchase Orders Registry</h3>
                <p className="text-xs text-slate-500">Track delivery status, goods received notes, and supplier reconciliation</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                    <th className="py-3 px-4">PO Number</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Order Date</th>
                    <th className="py-3 px-4">Items Summary</th>
                    <th className="py-3 px-4">Grand Total</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchaseOrders.map((po) => {
                    let statusBadge = 'bg-slate-100 text-slate-700';
                    if (po.status === 'Completed') statusBadge = 'bg-emerald-100 text-emerald-800';
                    if (po.status === 'Partially Received') statusBadge = 'bg-amber-100 text-amber-800';
                    if (po.status === 'Approved') statusBadge = 'bg-indigo-100 text-indigo-800';

                    return (
                      <tr key={po._id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{po.poNumber}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{po.supplierName}</td>
                        <td className="py-3 px-4 text-slate-500 font-mono">
                          {new Date(po.orderDate).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {(po.items || []).map((i) => `${i.orderedQty} ${i.unit} ${i.description}`).join(', ')}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          Rs. {po.grandTotal?.toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusBadge}`}>
                            {po.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setViewPO(po)}
                            className="inline-flex items-center gap-1 mr-2 px-2.5 py-1 text-[11px] font-bold rounded bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View
                          </button>
                          {(po.status === 'PendingApproval' || po.approvalRequestId) && (
                            <button
                              type="button"
                              onClick={() => setApprovalPO(po)}
                              className="inline-flex items-center gap-1 mr-2 px-2.5 py-1 text-[11px] font-bold rounded bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                            >
                              Approval
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditingPurchaseOrder(po)}
                            className="inline-flex items-center gap-1 mr-2 px-2.5 py-1 text-[11px] font-bold rounded bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors"
                          >
                            Edit Details
                          </button>
                          {!(po.grns || []).length &&
                            !(po.items || []).some((item) => Number(item.receivedQty) > 0) && (
                              <RecordDeleteButton
                                endpoint="/api/procurement"
                                action="DELETE_PO"
                                idField="poId"
                                recordId={po._id}
                                recordLabel={`purchase order ${po.poNumber}`}
                                onDeleted={fetchData}
                                className="inline-flex items-center gap-1 mr-2 px-2.5 py-1 text-[11px] font-bold rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
                              />
                            )}
                          {po.status !== 'Completed' && (
                            <button
                              onClick={() => openGrnModal(po)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                            >
                              <PackageCheck className="w-3.5 h-3.5" />
                              <span>Receive GRN</span>
                            </button>
                          )}
                          {user?.role === 'SuperAdmin' || user?.permissions?.includes('procurement:approve')
                            ? (po.grns || []).filter((grn) => grn.status === 'PendingInspection').map((grn) => (
                              <button
                                key={grn.grnNumber}
                                type="button"
                                onClick={() => setInspectionTarget({ order: po, grn })}
                                className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors"
                              >
                                Inspect {grn.grnNumber}
                              </button>
                            ))
                            : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Suppliers Directory */}
        {activeTab === 'suppliers' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map((sup) => (
              <div key={sup._id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-[#4F46E5]">{sup.supplierCode}</span>
                    <h3 className="text-sm font-bold text-slate-900 leading-snug">{sup.name}</h3>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                      {sup.category}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-amber-500">★ {sup.rating}</span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Contact Person:</span>
                    <span className="font-medium text-slate-800">{sup.contactPerson}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Phone:</span>
                    <span className="font-mono text-slate-800">{sup.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Credit Terms:</span>
                    <span className="font-semibold text-slate-800">{sup.creditPeriodDays} Days</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Current Payable:</span>
                    <span className="font-bold text-[#DC2626]">Rs. {sup.currentBalance?.toLocaleString()}</span>
                  </div>
                </div>
                {Number(sup.currentBalance || 0) > 0 && (
                  <button
                    onClick={() => openSupplierPayment(sup)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                  >
                    Record Supplier Payment
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewSupplier(sup)}
                  className="w-full rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Eye className="w-3 h-3 mr-1" />
                  View Details
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSupplier(sup)}
                  className="w-full rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Edit Supplier
                </button>
                <button
                  type="button"
                  onClick={() => setAttachmentSupplier(sup)}
                  className="w-full rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Supplier Documents
                </button>
                {!purchaseOrders.some((order) =>
                  String(order.supplierId || '') === String(sup._id) || order.supplierName === sup.name
                ) && (
                  <RecordDeleteButton
                    endpoint="/api/procurement"
                    action="DELETE_SUPPLIER"
                    idField="supplierId"
                    recordId={sup._id}
                    recordLabel={`supplier ${sup.supplierCode}`}
                    onDeleted={fetchData}
                    className="w-full rounded-lg border border-red-200 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <Modal
          isOpen={isNewSupplierOpen}
          onClose={() => setIsNewSupplierOpen(false)}
          title="Add Supplier"
          subtitle="Register a supplier before creating purchase orders"
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleCreateSupplier)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-slate-700">
                Supplier Name
                <input required value={newSupplier.name} onChange={(event) => setNewSupplier({ ...newSupplier, name: event.target.value })} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Phone
                <input required value={newSupplier.phone} onChange={(event) => setNewSupplier({ ...newSupplier, phone: event.target.value })} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Email
                <input type="email" value={newSupplier.email} onChange={(event) => setNewSupplier({ ...newSupplier, email: event.target.value })} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Category
                <input value={newSupplier.category} onChange={(event) => setNewSupplier({ ...newSupplier, category: event.target.value })} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                City
                <input value={newSupplier.city} onChange={(event) => setNewSupplier({ ...newSupplier, city: event.target.value })} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Credit Period (Days)
                <input type="number" min="0" step="1" value={newSupplier.creditPeriodDays} onChange={(event) => setNewSupplier({ ...newSupplier, creditPeriodDays: event.target.value })} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Address
              <textarea rows={2} value={newSupplier.address} onChange={(event) => setNewSupplier({ ...newSupplier, address: event.target.value })} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setIsNewSupplierOpen(false)} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="submit" className="rounded-lg bg-[#4F46E5] px-4 py-2 text-xs font-bold text-white hover:bg-[#4338CA]">Save Supplier</button>
            </div>
          </form>
        </Modal>
        <GRNInspectionModal
          target={inspectionTarget}
          onClose={() => setInspectionTarget(null)}
          onCompleted={fetchData}
        />
        <Modal
          isOpen={isSupplierPaymentOpen}
          onClose={() => {
            setIsSupplierPaymentOpen(false);
            supplierPaymentRequestId.current = null;
          }}
          title="Record Supplier Payment"
          subtitle={`${selectedSupplier?.name} • Payable: Rs. ${Number(selectedSupplier?.currentBalance || 0).toLocaleString()}`}
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleSupplierPayment)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Amount</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={supplierPaymentForm.amount}
                  onChange={(event) => setSupplierPaymentForm({ ...supplierPaymentForm, amount: Number(event.target.value) })}
                  max={Number(selectedSupplier?.payableBalances?.[supplierPaymentForm.payableAccountCode] || 0)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Method</label>
                <select
                  required
                  value={supplierPaymentForm.method}
                  onChange={(event) => setSupplierPaymentForm({ ...supplierPaymentForm, method: event.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="">Select method</option>
                  <option value="Cash">Cash</option>
                  <option value="BankTransfer">Bank transfer</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Supplier Payable Account</label>
                <select
                  required
                  value={supplierPaymentForm.payableAccountCode}
                  onChange={(event) => {
                    const payableAccountCode = event.target.value;
                    const accountBalance = Number(selectedSupplier?.payableBalances?.[payableAccountCode] || 0);
                    setSupplierPaymentForm((current) => ({
                      ...current,
                      payableAccountCode,
                      amount: Math.min(Number(current.amount || 0), accountBalance),
                    }));
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="">Select liability account</option>
                  {(data?.financialAccounts || []).filter((account) =>
                    account.type === 'Liability' && Number(selectedSupplier?.payableBalances?.[account.code] || 0) > 0
                  ).map((account) => (
                    <option key={account.code} value={account.code}>{account.code} — {account.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cash or Bank Account</label>
                <select
                  required
                  value={supplierPaymentForm.paymentAccountCode}
                  onChange={(event) => setSupplierPaymentForm({ ...supplierPaymentForm, paymentAccountCode: event.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="">Select payment account</option>
                  {(data?.financialAccounts || []).filter((account) => account.type === 'Asset').map((account) => (
                    <option key={account.code} value={account.code}>{account.code} — {account.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Reference Number</label>
              <input
                type="text"
                value={supplierPaymentForm.referenceNumber}
                onChange={(event) => setSupplierPaymentForm({ ...supplierPaymentForm, referenceNumber: event.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setIsSupplierPaymentOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm">
                Confirm Payment
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Create PO */}
        <Modal
          isOpen={isNewPOOpen}
          onClose={() => setIsNewPOOpen(false)}
          title="Create New Purchase Order"
          subtitle="Generate purchase order for raw fabric, yarn, buttons, or packaging"
          maxWidth="max-w-3xl"
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleCreatePO)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Supplier</label>
                <select
                  value={newPO.supplierName}
                  onChange={(e) => setNewPO({ ...newPO, supplierName: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  {suppliers.map((s) => (
                    <option key={s._id} value={s.name}>
                      {s.name} ({s.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Terms</label>
                <input
                  type="text"
                  value={newPO.paymentTerms}
                  onChange={(e) => setNewPO({ ...newPO, paymentTerms: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="block text-xs font-bold text-slate-700">
                Inventory Asset Account
                <select
                  required
                  value={newPO.inventoryAccountCode}
                  onChange={(e) => setNewPO({ ...newPO, inventoryAccountCode: e.target.value })}
                  className="mt-1 w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                >
                  <option value="">Select inventory account</option>
                  {(data?.financialAccounts || []).filter((account) => account.type === 'Asset').map((account) => (
                    <option key={account.code} value={account.code}>{account.code} · {account.name}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Supplier Payable Account
                <select
                  required
                  value={newPO.payableAccountCode}
                  onChange={(e) => setNewPO({ ...newPO, payableAccountCode: e.target.value })}
                  className="mt-1 w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                >
                  <option value="">Select payable account</option>
                  {(data?.financialAccounts || []).filter((account) => account.type === 'Liability').map((account) => (
                    <option key={account.code} value={account.code}>{account.code} · {account.name}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Line Items */}
            <div className="pt-2">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-slate-700">Order Line Items</label>
                <button
                  type="button"
                  onClick={handleAddItemToPO}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#4F46E5] hover:text-[#4338CA]"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Add Line</span>
                </button>
              </div>

              <div className="space-y-2">
                {newPO.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <select
                      required
                      value={item.stockItemType && item.stockItemId ? `${item.stockItemType}:${item.stockItemId}` : ''}
                      onChange={(e) => {
                        const [stockItemType, stockItemId] = e.target.value.split(':');
                        const stockItem = stockItemType === 'Fabric'
                          ? fabricItems.find((candidate) => candidate.id === stockItemId)
                          : trimItems.find((candidate) => candidate.id === stockItemId);
                        const updated = [...newPO.items];
                        updated[idx] = {
                          ...updated[idx],
                          stockItemType: stockItem ? stockItemType : '',
                          stockItemId: stockItem?.id || '',
                          description: stockItem?.name || '',
                          unit: stockItem?.unit || '',
                        };
                        setNewPO({ ...newPO, items: updated });
                      }}
                      className="min-w-0 flex-2 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:border-[#4F46E5]"
                    >
                      <option value="">Select stock item</option>
                      <optgroup label="Fabric">
                        {fabricItems.map((stockItem) => (
                          <option key={stockItem.id} value={`Fabric:${stockItem.id}`}>
                            {stockItem.code} - {stockItem.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Trims">
                        {trimItems.map((stockItem) => (
                          <option key={stockItem.id} value={`Trim:${stockItem.id}`}>
                            {stockItem.code} - {stockItem.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>

                    <input
                      type="number"
                      placeholder="Qty"
                      required
                      value={item.orderedQty}
                      onChange={(e) => {
                        const updated = [...newPO.items];
                        updated[idx].orderedQty = Number(e.target.value);
                        setNewPO({ ...newPO, items: updated });
                      }}
                      className="w-20 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:border-[#4F46E5]"
                    />

                    <select
                      value={item.unit}
                      onChange={(e) => {
                        const updated = [...newPO.items];
                        updated[idx].unit = e.target.value;
                        setNewPO({ ...newPO, items: updated });
                      }}
                      className="w-24 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:border-[#4F46E5]"
                    >
                      <option value="Meters">Meters</option>
                      <option value="Yards">Yards</option>
                      <option value="Cones">Cones</option>
                      <option value="Gross">Gross</option>
                      <option value="Pieces">Pieces</option>
                      <option value="Kg">Kg</option>
                    </select>

                    <input
                      type="number"
                      placeholder="Rate"
                      required
                      value={item.unitPrice}
                      onChange={(e) => {
                        const updated = [...newPO.items];
                        updated[idx].unitPrice = Number(e.target.value);
                        setNewPO({ ...newPO, items: updated });
                      }}
                      className="w-24 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:border-[#4F46E5]"
                    />

                    {newPO.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemovePOItem(idx)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Special Instructions</label>
              <textarea
                rows={2}
                value={newPO.notes}
                onChange={(e) => setNewPO({ ...newPO, notes: e.target.value })}
                placeholder="Purchase order notes"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewPOOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm"
              >
                Issue Purchase Order
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Process GRN */}
        <Modal
          isOpen={Boolean(approvalPO)}
          onClose={() => setApprovalPO(null)}
          title={`Purchase Order Approval: ${approvalPO?.poNumber || ''}`}
          subtitle={approvalPO?.supplierName || ''}
          maxWidth="max-w-2xl"
        >
          {approvalPO && (
            <PurchaseOrderApproval
              order={approvalPO}
              onUpdated={async () => {
                await fetchData();
                setApprovalPO(null);
              }}
            />
          )}
        </Modal>
        <Modal
          isOpen={isGrnOpen}
          onClose={() => setIsGrnOpen(false)}
          title={`Process Goods Receipt Note (GRN)`}
          subtitle={`PO Reference: ${selectedPO?.poNumber} (${selectedPO?.supplierName})`}
          maxWidth="max-w-2xl"
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleProcessGRN)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Supplier Delivery Challan #</label>
                <input
                  type="text"
                  required
                  value={grnForm.challanNumber}
                  onChange={(e) => setGrnForm({ ...grnForm, challanNumber: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Receiving Storekeeper</label>
                <input
                  type="text"
                  required
                  value={grnForm.receivedBy}
                  onChange={(e) => setGrnForm({ ...grnForm, receivedBy: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Receiving Warehouse</label>
              <input
                type="text"
                required
                value={grnForm.warehouseLocation}
                onChange={(e) => setGrnForm({ ...grnForm, warehouseLocation: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-xs font-bold text-slate-700 block">Received Items & Quantities</label>
              {grnForm.receivedItems.map((item, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <div className="font-bold text-slate-800">{item.description}</div>
                  <div className={`grid ${item.stockItemType === 'Fabric' ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-0.5">Quantity Received</label>
                      <input
                        type="number"
                        required
                        value={item.quantityReceived}
                        onChange={(e) => {
                          const updated = [...grnForm.receivedItems];
                          updated[idx].quantityReceived = Number(e.target.value);
                          setGrnForm({ ...grnForm, receivedItems: updated });
                        }}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded focus:outline-none"
                      />
                    </div>
                    {item.stockItemType === 'Fabric' && (
                      <>
                        <div>
                          <label className="text-[11px] text-slate-500 block mb-0.5">Roll lengths in meters</label>
                          <input
                            type="text"
                            placeholder="e.g. 50, 45.5"
                            value={item.rollLengths}
                            onChange={(e) => {
                              const updated = [...grnForm.receivedItems];
                              updated[idx].rollLengths = e.target.value;
                              setGrnForm({ ...grnForm, receivedItems: updated });
                            }}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-500 block mb-0.5">Supplier roll refs (optional)</label>
                          <input
                            type="text"
                            placeholder="Same order as lengths"
                            value={item.rollNumbers?.join(', ')}
                            onChange={(e) => {
                              const updated = [...grnForm.receivedItems];
                              updated[idx].rollNumbers = e.target.value.split(',').map((value) => value.trim());
                              setGrnForm({ ...grnForm, receivedItems: updated });
                            }}
                            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded focus:outline-none"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsGrnOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
              >
                Post GRN & Update Stock
              </button>
            </div>
          </form>
        </Modal>
        <RecordEditModal
          isOpen={Boolean(editingSupplier)}
          onClose={() => setEditingSupplier(null)}
          record={editingSupplier}
          title={`Edit Supplier: ${editingSupplier?.supplierCode || ''}`}
          fields={SUPPLIER_EDIT_FIELDS}
          onSave={handleUpdateSupplier}
        />
        <RecordAttachments
          module="procurement"
          record={attachmentSupplier}
          onClose={() => setAttachmentSupplier(null)}
        />
        <RecordEditModal
          isOpen={Boolean(editingPurchaseOrder)}
          onClose={() => setEditingPurchaseOrder(null)}
          record={editingPurchaseOrder}
          title={`Edit Purchase Order: ${editingPurchaseOrder?.poNumber || ''}`}
          fields={PURCHASE_ORDER_EDIT_FIELDS}
          onSave={handleUpdatePurchaseOrder}
        />

        {/* View Purchase Order Modal */}
        <RecordViewModal
          isOpen={Boolean(viewPO)}
          onClose={() => setViewPO(null)}
          record={viewPO}
          title={`Purchase Order: ${viewPO?.poNumber || ''}`}
          subtitle={`Supplier: ${viewPO?.supplierName || ''} • Status: ${viewPO?.status || ''}`}
          fields={[
            { name: 'poNumber', label: 'PO Number', type: 'text' },
            { name: 'supplierName', label: 'Supplier', type: 'text' },
            { name: 'status', label: 'Status', type: 'text' },
            { name: 'subtotal', label: 'Subtotal', type: 'money' },
            { name: 'grandTotal', label: 'Grand Total', type: 'money' },
            { name: 'paymentTerms', label: 'Payment Terms', type: 'text' },
            { name: 'expectedDeliveryDate', label: 'Expected Delivery', type: 'date' },
            { name: 'notes', label: 'Notes', type: 'text' },
            {
              name: 'items',
              label: 'Order Items',
              type: 'array',
              itemFields: [
                { name: 'stockItemCode', label: 'Item Code' },
                { name: 'description', label: 'Description' },
                { name: 'unit', label: 'Unit' },
                { name: 'orderedQty', label: 'Ordered Qty', type: 'text' },
                { name: 'receivedQty', label: 'Received Qty', type: 'text' },
                { name: 'unitPrice', label: 'Unit Price', type: 'money' },
                { name: 'totalPrice', label: 'Total Price', type: 'money' },
              ],
            },
            { name: 'grns', label: 'Goods Receipt Notes', type: 'array', itemFields: [
              { name: 'grnNumber', label: 'GRN Number' },
              { name: 'challanNumber', label: 'Challan Number' },
              { name: 'receivedValue', label: 'Received Value', type: 'money' },
              { name: 'status', label: 'Status' },
            ] },
          ]}
        />

        {/* View Supplier Modal */}
        <RecordViewModal
          isOpen={Boolean(viewSupplier)}
          onClose={() => setViewSupplier(null)}
          record={viewSupplier}
          title={`Supplier: ${viewSupplier?.name || ''}`}
          subtitle={`Code: ${viewSupplier?.supplierCode || ''} • Category: ${viewSupplier?.category || ''}`}
          fields={[
            { name: 'supplierCode', label: 'Supplier Code', type: 'text' },
            { name: 'name', label: 'Supplier Name', type: 'text' },
            { name: 'phone', label: 'Phone', type: 'text' },
            { name: 'email', label: 'Email', type: 'text' },
            { name: 'address', label: 'Address', type: 'text' },
            { name: 'city', label: 'City', type: 'text' },
            { name: 'category', label: 'Category', type: 'text' },
            { name: 'creditPeriodDays', label: 'Credit Period (Days)', type: 'text' },
            { name: 'currentBalance', label: 'Current Payable Balance', type: 'money' },
          ]}
        />
      </div>
    </Layout>
  );
}

const SUPPLIER_EDIT_FIELDS = [
  { name: 'name', label: 'Supplier Name', required: true },
  { name: 'phone', label: 'Phone', required: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'address', label: 'Address' },
  { name: 'city', label: 'City' },
  { name: 'category', label: 'Category' },
  { name: 'creditPeriodDays', label: 'Credit Period (Days)', type: 'number', min: 0 },
];

const PURCHASE_ORDER_EDIT_FIELDS = [
  { name: 'paymentTerms', label: 'Payment Terms' },
  { name: 'expectedDeliveryDate', label: 'Expected Delivery Date', type: 'date' },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];
