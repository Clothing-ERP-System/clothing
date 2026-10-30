'use client';

import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
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
} from 'lucide-react';

export default function ProcurementPage() {
  const { addToast, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'suppliers'

  // Modals
  const [isNewPOOpen, setIsNewPOOpen] = useState(false);
  const [isGrnOpen, setIsGrnOpen] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);

  // New PO Form
  const [newPO, setNewPO] = useState({
    supplierName: '',
    paymentTerms: '',
    expectedDeliveryDate: '',
    notes: '',
    items: [],
  });

  // GRN Form
  const [grnForm, setGrnForm] = useState({
    challanNumber: '',
    receivedBy: '',
    receivedItems: [],
  });

  const fetchData = async () => {
    try {
      const res = await fetch('/api/procurement');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
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
        { itemType: '', description: '', unit: '', orderedQty: '', unitPrice: '' },
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
      const res = await fetch('/api/procurement', {
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

  const openGrnModal = (po) => {
    setSelectedPO(po);
    setGrnForm({
      challanNumber: '',
      receivedBy: user?.name || '',
      receivedItems: (po.items || []).map((i) => ({
        description: i.description,
        quantityReceived: '',
        rollNumbers: [],
        remarks: '',
      })),
    });
    setIsGrnOpen(true);
  };

  const handleProcessGRN = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RECEIVE_GRN',
          poNumber: selectedPO.poNumber,
          ...grnForm,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'GRN processing failed', 'error');
        return;
      }
      addToast(`Goods Receipt Note ${json.data.grnNumber} generated! Inventory updated.`, 'success');
      setIsGrnOpen(false);
      fetchData();
    } catch {
      addToast('Error processing GRN', 'error');
    }
  };

  const suppliers = data?.suppliers || [];
  const purchaseOrders = data?.purchaseOrders || [];

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

          <button
            onClick={() => setIsNewPOOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Purchase Order</span>
          </button>
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
                          {po.status !== 'Completed' && (
                            <button
                              onClick={() => openGrnModal(po)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                            >
                              <PackageCheck className="w-3.5 h-3.5" />
                              <span>Receive GRN</span>
                            </button>
                          )}
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
              </div>
            ))}
          </div>
        )}

        {/* Modal: Create PO */}
        <Modal
          isOpen={isNewPOOpen}
          onClose={() => setIsNewPOOpen(false)}
          title="Create New Purchase Order"
          subtitle="Generate purchase order for raw fabric, yarn, buttons, or packaging"
          maxWidth="max-w-3xl"
        >
          <form onSubmit={handleCreatePO} className="space-y-4">
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
                    <input
                      type="text"
                      placeholder="Item description / specification"
                      required
                      value={item.description}
                      onChange={(e) => {
                        const updated = [...newPO.items];
                        updated[idx].description = e.target.value;
                        setNewPO({ ...newPO, items: updated });
                      }}
                      className="flex-2 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:border-[#4F46E5]"
                    />

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
          isOpen={isGrnOpen}
          onClose={() => setIsGrnOpen(false)}
          title={`Process Goods Receipt Note (GRN)`}
          subtitle={`PO Reference: ${selectedPO?.poNumber} (${selectedPO?.supplierName})`}
          maxWidth="max-w-2xl"
        >
          <form onSubmit={handleProcessGRN} className="space-y-4">
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

            <div className="space-y-3 pt-2">
              <label className="text-xs font-bold text-slate-700 block">Received Items & Quantities</label>
              {grnForm.receivedItems.map((item, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                  <div className="font-bold text-slate-800">{item.description}</div>
                  <div className="grid grid-cols-2 gap-3">
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

                    <div>
                      <label className="text-[11px] text-slate-500 block mb-0.5">Assigned Roll/Lot #</label>
                      <input
                        type="text"
                        value={item.rollNumbers?.join(', ')}
                        onChange={(e) => {
                          const updated = [...grnForm.receivedItems];
                          updated[idx].rollNumbers = e.target.value.split(',').map((s) => s.trim());
                          setGrnForm({ ...grnForm, receivedItems: updated });
                        }}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded focus:outline-none"
                      />
                    </div>
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
      </div>
    </Layout>
  );
}
