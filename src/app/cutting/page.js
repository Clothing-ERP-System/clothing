'use client';

import React, { useCallback, useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import {
  Scissors,
  Plus,
  Barcode,
  Layers,
  ArrowRight,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Shirt,
  Sparkles,
} from 'lucide-react';

export default function CuttingDepartmentPage() {
  const { addToast } = useAuth();
  const [cuttingOrders, setCuttingOrders] = useState([]);
  const [fabrics, setFabrics] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newOrder, setNewOrder] = useState({
    designCode: '',
    designTitle: '',
    targetQuantity: '',
    fabricType: '',
    markerLengthMeters: '',
    pliesCount: '',
    actualFabricConsumedMeters: '',
    offcutsMeters: '',
    cuttingMaster: '',
    rollsAllocated: [{ rollNumber: '', metersIssued: '' }],
    bundles: [],
    remarks: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const [resCut, resFab, resDsn] = await Promise.all([
        fetch('/api/cutting'),
        fetch('/api/fabric'),
        fetch('/api/design'),
      ]);

      const [jsonCut, jsonFab, jsonDsn] = await Promise.all([
        resCut.json(),
        resFab.json(),
        resDsn.json(),
      ]);

      if (jsonCut.success) {
        setCuttingOrders(jsonCut.data.cuttingOrders || []);
        if (jsonCut.data.cuttingOrders?.length > 0) {
          setSelectedOrder((current) => current || jsonCut.data.cuttingOrders[0]);
        }
      }
      if (jsonFab.success) setFabrics(jsonFab.data.rolls || []);
      if (jsonDsn.success) setDesigns(jsonDsn.data.designs || []);
    } catch (err) {
      console.error('Error fetching cutting data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/cutting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_CUTTING_ORDER', ...newOrder }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create cutting order', 'error');
        return;
      }
      addToast(`Cutting Order ${json.data.cuttingOrder?.orderNumber} created with bundles!`, 'success');
      setIsAddOpen(false);
      fetchData();
    } catch {
      addToast('Error saving cutting order', 'error');
    }
  };

  const handleHandover = async (orderId) => {
    try {
      const res = await fetch('/api/cutting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'HANDOVER_TO_STITCHING',
          orderId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Handover failed', 'error');
        return;
      }
      addToast('Bundles transferred to stitching floor!', 'success');
      fetchData();
    } catch {
      addToast('Error during handover', 'error');
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-[#D97706] border border-amber-100">
                FABRIC SPREADING & LAY PLANNING
              </span>
              <span className="text-xs text-slate-500">• Cutting Department</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Cutting Orders & Barcoded Bundle Tickets
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Marker planning, plies lay efficiency, fabric shrinkage & offcut calculation, and bundle handover
            </p>
          </div>

          <button
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Cutting Order</span>
          </button>
        </div>

        {/* 2 Column View: Orders List + Bundle Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Orders List */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Active Cutting Orders ({cuttingOrders.length})
            </h2>

            {cuttingOrders.map((order) => {
              const isSelected = selectedOrder?._id === order._id;
              let statusBadge = 'bg-amber-100 text-amber-800';
              if (order.status === 'TransferredToStitching') statusBadge = 'bg-emerald-100 text-emerald-800';

              return (
                <div
                  key={order._id}
                  onClick={() => setSelectedOrder(order)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#4F46E5] bg-indigo-50/40 shadow-xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-mono font-bold text-[#4F46E5]">{order.orderNumber}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusBadge}`}>
                      {order.status}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 mt-1">{order.designTitle}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{order.fabricType}</p>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Target</span>
                      <span className="font-bold text-slate-900">{order.targetQuantity} pcs</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Bundles</span>
                      <span className="font-bold text-indigo-600">{order.bundles?.length || 0}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Wastage</span>
                      <span className="font-bold text-emerald-600">{order.wastagePercentage}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Order Detailed View & Bundles Table */}
          {selectedOrder && (
            <div className="lg:col-span-2 space-y-6">
              {/* Order Overview Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <span className="text-xs font-mono font-bold text-[#4F46E5]">{selectedOrder.orderNumber}</span>
                    <h2 className="text-lg font-black text-slate-900">{selectedOrder.designTitle}</h2>
                    <p className="text-xs text-slate-500">
                      Master: {selectedOrder.cuttingMaster} • Article: {selectedOrder.designCode}
                    </p>
                  </div>

                  {selectedOrder.status !== 'TransferredToStitching' && (
                    <button
                      onClick={() => handleHandover(selectedOrder._id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-sm"
                    >
                      <Shirt className="w-4 h-4" />
                      <span>Handover to Stitching</span>
                    </button>
                  )}
                </div>

                {/* Lay & Consumption Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">Total Fabric Issued</span>
                    <span className="font-bold text-slate-900">{selectedOrder.totalFabricIssuedMeters} Meters</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">Consumed / Cut</span>
                    <span className="font-bold text-indigo-600">{selectedOrder.actualFabricConsumedMeters} Meters</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">Usable Offcuts</span>
                    <span className="font-bold text-slate-900">{selectedOrder.offcutsMeters} Meters</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">Wastage Loss</span>
                    <span className="font-bold text-emerald-600">
                      {selectedOrder.wastageMeters} m ({selectedOrder.wastagePercentage}%)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-600 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                  <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>
                    Marker Length: <strong>{selectedOrder.markerLengthMeters}m</strong> across{' '}
                    <strong>{selectedOrder.pliesCount} Plies</strong>. Rolls Allocated:{' '}
                    {(selectedOrder.rollsAllocated || []).map((r) => `${r.rollNumber} (${r.metersIssued}m)`).join(', ')}
                  </span>
                </div>
              </div>

              {/* Bundle Barcode Tickets */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Size-Graded Cut Bundles & Barcode Tickets</h3>
                    <p className="text-xs text-slate-500">Each bundle carries its unique barcode ticket for sewing floor tracking</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold">
                    {selectedOrder.bundles?.length || 0} Bundles
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                        <th className="py-2.5 px-4">Bundle #</th>
                        <th className="py-2.5 px-4">Size</th>
                        <th className="py-2.5 px-4">Quantity (Pcs)</th>
                        <th className="py-2.5 px-4">Barcode Ticket</th>
                        <th className="py-2.5 px-4">Assigned Line</th>
                        <th className="py-2.5 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedOrder.bundles || []).map((b, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{b.bundleNumber}</td>
                          <td className="py-2.5 px-4">
                            <span className="w-6 h-6 rounded-md bg-indigo-100 text-[#4F46E5] font-bold text-xs flex items-center justify-center">
                              {b.size}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-bold text-slate-800">{b.quantityPieces} pcs</td>
                          <td className="py-2.5 px-4 font-mono text-slate-500 flex items-center gap-1.5">
                            <Barcode className="w-3.5 h-3.5 text-slate-400" />
                            <span>{b.barcode}</span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">{b.assignedStitchingLine}</td>
                          <td className="py-2.5 px-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                              {b.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal: Create Cutting Order */}
        <Modal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          title="Create Cutting Order & Bundle Tickets"
          subtitle="Select article, allocate fabric rolls, and specify marker layout"
        >
          <form onSubmit={handleCreateOrder} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Production Article</label>
              <select
                value={newOrder.designCode}
                onChange={(e) => {
                  const sel = designs.find((d) => d.designCode === e.target.value);
                  setNewOrder({
                    ...newOrder,
                    designCode: e.target.value,
                    designTitle: sel?.title || '',
                    bundles: (sel?.sizeGrading || []).map(({ sizeName }) => ({
                      size: sizeName,
                      quantityPieces: '',
                    })),
                  });
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              >
                <option value="">Select a design</option>
                {designs.map((d) => (
                  <option key={d._id} value={d.designCode}>
                    {d.title} ({d.designCode})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Pieces</label>
                <input
                  type="number"
                  required
                  value={newOrder.targetQuantity}
                  onChange={(e) => setNewOrder({ ...newOrder, targetQuantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Marker Length (m)</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={newOrder.markerLengthMeters}
                  onChange={(e) => setNewOrder({ ...newOrder, markerLengthMeters: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Plies Count</label>
                <input
                  type="number"
                  required
                  value={newOrder.pliesCount}
                  onChange={(e) => setNewOrder({ ...newOrder, pliesCount: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Actual Fabric Consumed (m)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={newOrder.actualFabricConsumedMeters}
                  onChange={(e) => setNewOrder({ ...newOrder, actualFabricConsumedMeters: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reusable Offcuts (m)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={newOrder.offcutsMeters}
                  onChange={(e) => setNewOrder({ ...newOrder, offcutsMeters: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Cut quantity by design size</label>
              {newOrder.bundles.length ? newOrder.bundles.map((bundle, index) => (
                <div key={bundle.size} className="grid grid-cols-[1fr_2fr] items-center gap-3">
                  <span className="text-xs text-slate-600">{bundle.size}</span>
                  <input
                    type="number"
                    min="1"
                    required
                    value={bundle.quantityPieces}
                    onChange={(e) => setNewOrder({
                      ...newOrder,
                      bundles: newOrder.bundles.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, quantityPieces: e.target.value } : item
                      )),
                    })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
              )) : (
                <p className="text-xs text-slate-500">Choose a design with size grading before setting quantities.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Allocated Fabric Roll #</label>
                <input
                  type="text"
                  required
                  value={newOrder.rollsAllocated[0]?.rollNumber || ''}
                  onChange={(e) =>
                    setNewOrder({
                      ...newOrder,
                      rollsAllocated: [{ rollNumber: e.target.value, metersIssued: newOrder.rollsAllocated[0]?.metersIssued || '' }],
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Meters Issued from Roll</label>
                <input
                  type="number"
                  required
                  value={newOrder.rollsAllocated[0]?.metersIssued || ''}
                  onChange={(e) =>
                    setNewOrder({
                      ...newOrder,
                      rollsAllocated: [{ rollNumber: newOrder.rollsAllocated[0]?.rollNumber || '', metersIssued: e.target.value }],
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm"
              >
                Generate Cutting Order & Bundles
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </Layout>
  );
}
