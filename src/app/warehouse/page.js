'use client';

import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import {
  Warehouse,
  Plus,
  Truck,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
  Search,
  Package,
  Layers,
  MapPin,
} from 'lucide-react';

export default function WarehouseLogisticsPage() {
  const { addToast, user } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isNewTransferOpen, setIsNewTransferOpen] = useState(false);

  // New Transfer Form
  const [newTransfer, setNewTransfer] = useState({
    sourceWarehouse: '',
    destinationWarehouse: '',
    vehicleNumber: '',
    driverName: '',
    driverPhone: '',
    dispatchedBy: '',
    notes: '',
    items: [{ itemDescription: '', quantity: '', unit: '' }],
  });

  const fetchData = async () => {
    try {
      const res = await fetch('/api/warehouse');
      const json = await res.json();
      if (json.success) {
        setTransfers(json.data.transfers || []);
      }
    } catch (err) {
      console.error('Error fetching warehouse transfers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, []);

  const handleCreateTransfer = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/warehouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_TRANSFER', ...newTransfer }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to dispatch transfer', 'error');
        return;
      }
      addToast(`Delivery Challan ${json.data.transfer?.challanNumber} dispatched!`, 'success');
      setIsNewTransferOpen(false);
      fetchData();
    } catch {
      addToast('Error saving transfer', 'error');
    }
  };

  const handleConfirmReceipt = async (transferId) => {
    try {
      const res = await fetch('/api/warehouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CONFIRM_RECEIPT',
          transferId,
          receivedBy: user?.name || '',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Receipt confirmation failed', 'error');
        return;
      }
      addToast('Transfer confirmed and stock accepted into warehouse inventory!', 'success');
      fetchData();
    } catch {
      addToast('Error confirming receipt', 'error');
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-[#4F46E5] border border-indigo-100">
                DEPOT & LOGISTICS
              </span>
              <span className="text-xs text-slate-500">• Multi-Warehouse Transfers</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Warehouse Transfers & Delivery Challans
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Record a stock transfer between configured warehouse locations
            </p>
          </div>

          <button
            onClick={() => setIsNewTransferOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Stock Transfer</span>
          </button>
        </div>

        {/* Transfers List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Transfer & Dispatch Challans Registry</h3>
              <p className="text-xs text-slate-500">Track in-transit stock and destination receiving verification</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                  <th className="py-3 px-4">Transfer #</th>
                  <th className="py-3 px-4">Challan #</th>
                  <th className="py-3 px-4">From / To Locations</th>
                  <th className="py-3 px-4">Driver & Vehicle</th>
                  <th className="py-3 px-4">Items Transferred</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.map((t) => {
                  let statusBadge = 'bg-amber-100 text-amber-800';
                  if (t.status === 'ReceivedAndVerified') statusBadge = 'bg-emerald-100 text-emerald-800';

                  return (
                    <tr key={t._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{t.transferNumber}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{t.challanNumber}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{t.sourceWarehouse.split('(')[0]}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <span>→</span>
                          <span>{t.destinationWarehouse.split('(')[0]}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        <div className="font-medium">{t.driverName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{t.vehicleNumber}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {(t.items || []).map((i) => `${i.quantity} ${i.unit} ${i.itemDescription}`).join(', ')}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusBadge}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {t.status !== 'ReceivedAndVerified' && (
                          <button
                            onClick={() => handleConfirmReceipt(t._id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Confirm Receipt</span>
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

        {/* Modal: Create Transfer */}
        <Modal
          isOpen={isNewTransferOpen}
          onClose={() => setIsNewTransferOpen(false)}
          title="Create Stock Transfer & Delivery Challan"
          subtitle="Dispatch raw material or finished garments between units"
        >
          <form onSubmit={handleCreateTransfer} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Source Origin</label>
                <input
                  type="text"
                  required
                  value={newTransfer.sourceWarehouse}
                  onChange={(e) => setNewTransfer({ ...newTransfer, sourceWarehouse: e.target.value })}
                  placeholder="Source warehouse"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Destination Unit</label>
                <input
                  type="text"
                  required
                  value={newTransfer.destinationWarehouse}
                  onChange={(e) => setNewTransfer({ ...newTransfer, destinationWarehouse: e.target.value })}
                  placeholder="Destination warehouse"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Vehicle / Reg #</label>
                <input
                  type="text"
                  required
                  value={newTransfer.vehicleNumber}
                  onChange={(e) => setNewTransfer({ ...newTransfer, vehicleNumber: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Driver Name & Phone</label>
                <input
                  type="text"
                  required
                  value={newTransfer.driverName}
                  onChange={(e) => setNewTransfer({ ...newTransfer, driverName: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Item Description & Quantity</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={newTransfer.items[0]?.itemDescription || ''}
                  onChange={(e) => {
                    const updated = [...newTransfer.items];
                    updated[0].itemDescription = e.target.value;
                    setNewTransfer({ ...newTransfer, items: updated });
                  }}
                  className="flex-2 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
                <input
                  type="number"
                  required
                  value={newTransfer.items[0]?.quantity || ''}
                  onChange={(e) => {
                    const updated = [...newTransfer.items];
                    updated[0].quantity = Number(e.target.value);
                    setNewTransfer({ ...newTransfer, items: updated });
                  }}
                  className="w-24 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
                <input
                  type="text"
                  required
                  placeholder="Unit"
                  value={newTransfer.items[0]?.unit || ''}
                  onChange={(e) => {
                    const updated = [...newTransfer.items];
                    updated[0].unit = e.target.value;
                    setNewTransfer({ ...newTransfer, items: updated });
                  }}
                  className="w-24 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewTransferOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm"
              >
                Issue Challan & Dispatch
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </Layout>
  );
}
