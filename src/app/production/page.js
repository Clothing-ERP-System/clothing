'use client';

import React, { useCallback, useState, useEffect, useRef } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import RecordEditModal from '@/components/RecordEditModal';
import RecordDeleteButton from '@/components/RecordDeleteButton';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';
import {
  Shirt,
  Plus,
  Play,
  CheckCircle2,
  Clock,
  TrendingUp,
  UserCheck,
  AlertCircle,
  Scissors,
  Layers,
  Sparkles,
  Wrench,
} from 'lucide-react';

export default function ProductionStitchingPage() {
  const { addToast, currentBranch } = useAuth();
  const [productionOrders, setProductionOrders] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [editingProductionOrder, setEditingProductionOrder] = useState(null);

  // Modals
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [isLogOutputOpen, setIsLogOutputOpen] = useState(false);
  const [isConsumptionOpen, setIsConsumptionOpen] = useState(false);
  const [consumptionItems, setConsumptionItems] = useState([]);
  const consumptionRequestId = useRef(null);
  const productionOrderRequestId = useRef(null);
  const [isFinishingOpen, setIsFinishingOpen] = useState(false);
  const [finishingChecklist, setFinishingChecklist] = useState({
    steamIroning: false,
    taggingAndBarcode: false,
    polybagPackaged: false,
  });
  const [isReworkOpen, setIsReworkOpen] = useState(false);
  const [reworkForm, setReworkForm] = useState({ quantity: '', notes: '' });

  // New Production Order Form
  const [newOrder, setNewOrder] = useState({
    designCode: '',
    articleName: '',
    cuttingOrderRef: '',
    stitchingLine: '',
    targetQuantity: '',
    supervisor: '',
  });

  // Daily Output Log Form
  const [outputForm, setOutputForm] = useState({
    piecesProduced: '',
    hoursWorked: '',
    operatorCount: '',
    efficiencyPercentage: '',
    supervisorNotes: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/production');
      const json = await res.json();
      if (json.success) {
        setProductionOrders(json.data.productionOrders || []);
        setDesigns(json.data.designs || []);
        setSelectedOrder((current) =>
          json.data.productionOrders?.find((order) => order._id === current?._id) ||
          current ||
          json.data.productionOrders?.[0] ||
          null
        );
      }
    } catch (err) {
      console.error('Error fetching production orders:', err);
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
      if (!productionOrderRequestId.current) {
        productionOrderRequestId.current = globalThis.crypto.randomUUID();
      }
      const res = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_PRODUCTION_ORDER',
          creationRequestId: productionOrderRequestId.current,
          warehouseLocation: currentBranch,
          ...newOrder,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to schedule production order', 'error');
        return;
      }
      addToast(`Production Order ${json.data.productionOrder?.productionOrderNumber} scheduled!`, 'success');
      setIsNewOrderOpen(false);
      productionOrderRequestId.current = null;
      await fetchData();
    } catch {
      addToast('Error saving order', 'error');
    }
  };

  const handleUpdateProductionOrder = async (orderId, updates) => {
    try {
      const response = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_PRODUCTION_ORDER', orderId, ...updates }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Production order update failed', 'error');
        return false;
      }
      addToast('Production order details updated', 'success');
      setEditingProductionOrder(null);
      await fetchData();
      return true;
    } catch {
      addToast('Error updating production order', 'error');
      return false;
    }
  };

  const openMaterialConsumption = () => {
    if (!selectedOrder) return;
    setConsumptionItems((selectedOrder.materialRequirements || [])
      .filter((line) => line.stockItemType === 'Trim')
      .map((line) => ({
        stockItemType: line.stockItemType,
        stockItemId: line.stockItemId,
        quantityConsumed: line.requiredQuantity,
        wastageQuantity: 0,
      })));
    consumptionRequestId.current = globalThis.crypto.randomUUID();
    setIsConsumptionOpen(true);
  };

  const handleConsumeMaterials = async (event) => {
    event.preventDefault();
    if (!selectedOrder) return;
    try {
      const response = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CONSUME_BOM_MATERIALS',
          orderId: selectedOrder._id,
          consumptionRequestId: consumptionRequestId.current,
          items: consumptionItems,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'BOM material issue failed', 'error');
        return;
      }
      addToast('BOM materials issued and consumption recorded', 'success');
      setIsConsumptionOpen(false);
      consumptionRequestId.current = null;
      await fetchData();
    } catch {
      addToast('Error issuing BOM materials', 'error');
    }
  };

  const handleCompleteFinishing = async (event) => {
    event.preventDefault();
    if (!selectedOrder) return;
    try {
      const response = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'COMPLETE_FINISHING',
          orderId: selectedOrder._id,
          finishingChecklist,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Finishing could not be completed', 'error');
        return;
      }
      addToast('Finishing completed; order is ready for final QC', 'success');
      setIsFinishingOpen(false);
      setFinishingChecklist({ steamIroning: false, taggingAndBarcode: false, polybagPackaged: false });
      await fetchData();
    } catch {
      addToast('Error completing finishing', 'error');
    }
  };

  const handleCompleteRework = async (event) => {
    event.preventDefault();
    if (!selectedOrder) return;
    try {
      const response = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'COMPLETE_REWORK',
          orderId: selectedOrder._id,
          quantity: Number(reworkForm.quantity),
          notes: reworkForm.notes,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Rework could not be recorded', 'error');
        return;
      }
      addToast(result.data.productionOrder?.status === 'FinishingStage'
        ? 'Rework completed; repeat finishing before final QC'
        : 'Rework progress recorded', 'success');
      setIsReworkOpen(false);
      setReworkForm({ quantity: '', notes: '' });
      await fetchData();
    } catch {
      addToast('Error recording rework', 'error');
    }
  };

  const handleLogOutput = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;

    try {
      const res = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'LOG_DAILY_OUTPUT',
          orderId: selectedOrder._id,
          ...outputForm,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to log output', 'error');
        return;
      }
      addToast(`Logged ${outputForm.piecesProduced} pcs finished!`, 'success');
      setIsLogOutputOpen(false);
      fetchData();
    } catch {
      addToast('Error logging output', 'error');
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
                GARMENT ASSEMBLY FLOOR
              </span>
              <span className="text-xs text-slate-500">• Stitching Lines & WIP</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Stitching Lines & Operation Routing
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Operation-level tracking (collar, placket, sleeve, hem), tailor piece-rates, and line balancing
            </p>
          </div>

          <button
            onClick={() => {
              productionOrderRequestId.current = globalThis.crypto.randomUUID();
              setNewOrder({
                designCode: '',
                articleName: '',
                cuttingOrderRef: '',
                stitchingLine: '',
                targetQuantity: '',
                supervisor: '',
              });
              setIsNewOrderOpen(true);
            }}
            disabled={!designs.length}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{designs.length ? 'Schedule Production Order' : 'No Production-Ready Designs'}</span>
          </button>
        </div>

        {/* 2 Column View: Orders List + Live Line Details */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Orders List */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Active Production Orders ({productionOrders.length})
            </h2>

            {productionOrders.map((order) => {
              const isSelected = selectedOrder?._id === order._id;
              const pct = Math.min(100, Math.round(((order.completedQuantity || 0) / order.targetQuantity) * 100));

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
                    <span className="text-xs font-mono font-bold text-[#4F46E5]">
                      {order.productionOrderNumber}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                      {order.status}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 mt-1">{order.articleName}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{order.stitchingLine}</p>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-700 mb-1">
                      <span>Progress</span>
                      <span>{order.completedQuantity} / {order.targetQuantity} pcs ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div style={{ width: `${pct}%` }} className="bg-[#4F46E5] h-full rounded-full transition-all" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detailed Routing & Daily Logs */}
          {selectedOrder && (
            <div className="lg:col-span-2 space-y-6">
              {/* Order Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <span className="text-xs font-mono font-bold text-[#4F46E5]">
                      {selectedOrder.productionOrderNumber}
                    </span>
                    <h2 className="text-lg font-black text-slate-900">{selectedOrder.articleName}</h2>
                    <p className="text-xs text-slate-500">
                      Supervisor: {selectedOrder.supervisor} • Allocated: {selectedOrder.stitchingLine}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingProductionOrder(selectedOrder)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
                    >
                      Edit Schedule
                    </button>
                    <RecordDeleteButton
                      endpoint="/api/production"
                      action="DELETE_ORDER"
                      idField="orderId"
                      recordId={selectedOrder._id}
                      recordLabel={selectedOrder.productionOrderNumber}
                      onDeleted={() => {
                        setSelectedOrder(null);
                        fetchData();
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer"
                    />
                    {selectedOrder.status === 'FinishingStage' && !selectedOrder.finishingCompletedAt && (
                      <button
                        onClick={() => setIsFinishingOpen(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-xs font-bold transition-colors"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Complete Finishing</span>
                      </button>
                    )}
                    {selectedOrder.status === 'ReworkRequired' && (
                      <button
                        onClick={() => {
                          setReworkForm({ quantity: selectedOrder.reworkPendingQuantity || '', notes: '' });
                          setIsReworkOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-500 text-amber-700 hover:bg-amber-50 text-xs font-bold transition-colors"
                      >
                        <Wrench className="w-4 h-4" />
                        <span>Record Rework</span>
                      </button>
                    )}
                    {(selectedOrder.materialRequirements || []).some((line) => line.stockItemType === 'Trim') &&
                      !selectedOrder.materialsConsumedAt &&
                      selectedOrder.status === 'InProduction' && (
                        <button
                          onClick={openMaterialConsumption}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#4F46E5] text-[#4F46E5] hover:bg-indigo-50 text-xs font-bold transition-colors"
                        >
                          <Layers className="w-4 h-4" />
                          <span>Issue BOM Materials</span>
                        </button>
                      )}
                    <button
                      onClick={() => setIsLogOutputOpen(true)}
                      disabled={selectedOrder.status !== 'InProduction'}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-50 text-white text-xs font-bold transition-colors shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Log Daily Output</span>
                    </button>
                  </div>
                </div>

                {(selectedOrder.materialRequirements || []).length > 0 && (
                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xs font-bold text-slate-900">Linked BOM Requirements</h3>
                      {selectedOrder.materialsConsumedAt && (
                        <span className="text-[10px] font-bold text-emerald-700">Materials issued</span>
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      {selectedOrder.materialRequirements.map((line) => (
                        <p key={`${line.stockItemType}:${line.stockItemId}`} className="text-xs text-slate-600">
                          {line.itemName} — {line.requiredQuantity} {line.unit} ({line.stockItemType})
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">Target Qty</span>
                    <span className="font-bold text-slate-900">{selectedOrder.targetQuantity} pcs</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">Completed Qty</span>
                    <span className="font-bold text-emerald-600">{selectedOrder.completedQuantity} pcs</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">Line WIP</span>
                    <span className="font-bold text-indigo-600">{selectedOrder.wipQuantity} pcs</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">Defect Rejections</span>
                    <span className="font-bold text-red-600">{selectedOrder.rejectedQuantity} pcs</span>
                  </div>
                </div>
                {(selectedOrder.reworkPendingQuantity > 0 || selectedOrder.reworkCompletedQuantity > 0) && (
                  <p className="text-xs text-amber-700">
                    Rework pending: {selectedOrder.reworkPendingQuantity || 0} pcs • Completed:
                    {' '}{selectedOrder.reworkCompletedQuantity || 0} pcs
                  </p>
                )}
              </div>

              {/* Operation Sequences & Piece Rates */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">Operation Sequence & Tailor Assignments</h3>
                  <p className="text-xs text-slate-500">Piece-rate compensation and completed pieces per workstation</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                        <th className="py-2.5 px-4">#</th>
                        <th className="py-2.5 px-4">Operation Name</th>
                        <th className="py-2.5 px-4">Assigned Tailor</th>
                        <th className="py-2.5 px-4">Piece-Rate</th>
                        <th className="py-2.5 px-4">Completed</th>
                        <th className="py-2.5 px-4">Rework</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedOrder.operations || []).map((op, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-400">{op.sequence}</td>
                          <td className="py-2.5 px-4 font-bold text-slate-900">{op.operationName}</td>
                          <td className="py-2.5 px-4 text-slate-700">{op.assignedWorkerName}</td>
                          <td className="py-2.5 px-4 font-bold text-indigo-600">Rs. {op.pieceRatePKR}/pc</td>
                          <td className="py-2.5 px-4 font-bold text-emerald-600">{op.completedPieces} pcs</td>
                          <td className="py-2.5 px-4 font-bold text-amber-600">{op.reworkCount || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Daily Output Shift History */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">Daily Line Productivity & Efficiency Log</h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                        <th className="py-2.5 px-4">Date</th>
                        <th className="py-2.5 px-4">Shift</th>
                        <th className="py-2.5 px-4">Finished Pieces</th>
                        <th className="py-2.5 px-4">Operators</th>
                        <th className="py-2.5 px-4">Efficiency %</th>
                        <th className="py-2.5 px-4">Supervisor Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedOrder.dailyLogs || []).map((log, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-mono text-slate-500">
                            {new Date(log.date).toLocaleDateString()}
                          </td>
                          <td className="py-2.5 px-4 font-medium">{log.shift}</td>
                          <td className="py-2.5 px-4 font-bold text-slate-900">{log.piecesProduced} pcs</td>
                          <td className="py-2.5 px-4 text-slate-600">{log.operatorCount} Tailors</td>
                          <td className="py-2.5 px-4 font-bold text-emerald-600">{log.efficiencyPercentage}%</td>
                          <td className="py-2.5 px-4 text-slate-600">{log.supervisorNotes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal: Schedule Production Order */}
        <Modal
          isOpen={isNewOrderOpen}
          onClose={() => setIsNewOrderOpen(false)}
          title="Schedule Stitching Production Order"
          subtitle="Allocate stitching line, assign supervisor, and set delivery target"
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleCreateOrder)} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Production Article</label>
              <select
                required
                value={newOrder.designCode}
                onChange={(e) => {
                  const design = designs.find((item) => item.designCode === e.target.value);
                  setNewOrder({
                    ...newOrder,
                    designCode: design?.designCode || '',
                    articleName: design?.title || '',
                  });
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              >
                <option value="">Select a production-ready design</option>
                {designs.map((design) => (
                  <option key={design._id} value={design.designCode}>
                    {design.designCode} — {design.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Stitching Line</label>
                <input
                  type="text"
                  required
                  value={newOrder.stitchingLine}
                  onChange={(e) => setNewOrder({ ...newOrder, stitchingLine: e.target.value })}
                  placeholder="Stitching line"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Quantity (Pcs)</label>
                <input
                  type="number"
                  required
                  value={newOrder.targetQuantity}
                  onChange={(e) => setNewOrder({ ...newOrder, targetQuantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cutting Order Ref</label>
                <input
                  type="text"
                  value={newOrder.cuttingOrderRef}
                  onChange={(e) => setNewOrder({ ...newOrder, cuttingOrderRef: e.target.value })}
                  placeholder="Cutting order reference"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Production Supervisor</label>
                <input
                  type="text"
                  value={newOrder.supervisor}
                  onChange={(e) => setNewOrder({ ...newOrder, supervisor: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewOrderOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm"
              >
                Initiate Production Order
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={isConsumptionOpen}
          onClose={() => {
            setIsConsumptionOpen(false);
            consumptionRequestId.current = null;
          }}
          title="Issue BOM Materials"
          subtitle={`Production Order: ${selectedOrder?.productionOrderNumber} • Location: ${selectedOrder?.warehouseLocation}`}
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleConsumeMaterials)} className="space-y-4">
            {consumptionItems.map((item, index) => {
              const requirement = selectedOrder.materialRequirements.find((line) =>
                line.stockItemType === item.stockItemType && line.stockItemId === item.stockItemId
              );
              return (
                <div key={`${item.stockItemType}:${item.stockItemId}`} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-3">
                    <p className="text-xs font-bold text-slate-900">{requirement?.itemName}</p>
                    <p className="text-[11px] text-slate-500">
                      Required: {requirement?.requiredQuantity} {requirement?.unit}
                    </p>
                  </div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Wastage Quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={item.wastageQuantity}
                    onChange={(event) => {
                      const wastageQuantity = Number(event.target.value);
                      setConsumptionItems((current) => current.map((entry, entryIndex) =>
                        entryIndex === index
                          ? {
                              ...entry,
                              wastageQuantity,
                              quantityConsumed: Number(requirement?.requiredQuantity || 0) + wastageQuantity,
                            }
                          : entry
                      ));
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Total inventory issue: {item.quantityConsumed} {requirement?.unit}
                  </p>
                </div>
              );
            })}
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsConsumptionOpen(false);
                  consumptionRequestId.current = null;
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!consumptionItems.length}
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-50 rounded-lg shadow-sm"
              >
                Confirm Material Issue
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={isFinishingOpen}
          onClose={() => setIsFinishingOpen(false)}
          title="Complete Production Finishing"
          subtitle={`Production Order: ${selectedOrder?.productionOrderNumber}`}
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleCompleteFinishing)} className="space-y-4">
            {[
              ['steamIroning', 'Steam ironing complete'],
              ['taggingAndBarcode', 'Barcode and tagging complete'],
              ['polybagPackaged', 'Polybag packing complete'],
            ].map(([field, label]) => (
              <label key={field} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={finishingChecklist[field]}
                  onChange={(event) => setFinishingChecklist((current) => ({
                    ...current,
                    [field]: event.target.checked,
                  }))}
                />
                {label}
              </label>
            ))}
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setIsFinishingOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancel
              </button>
              <button
                type="submit"
                disabled={Object.values(finishingChecklist).some((complete) => !complete)}
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] disabled:opacity-50 rounded-lg shadow-sm"
              >
                Confirm Finishing
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={isReworkOpen}
          onClose={() => setIsReworkOpen(false)}
          title="Record Production Rework"
          subtitle={`Pending: ${selectedOrder?.reworkPendingQuantity || 0} pieces`}
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleCompleteRework)} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Quantity Reworked</label>
              <input
                type="number"
                min="1"
                max={selectedOrder?.reworkPendingQuantity || 0}
                step="1"
                required
                value={reworkForm.quantity}
                onChange={(event) => setReworkForm({ ...reworkForm, quantity: event.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Rework Notes</label>
              <textarea
                rows={2}
                value={reworkForm.notes}
                onChange={(event) => setReworkForm({ ...reworkForm, notes: event.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => setIsReworkOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm">
                Record Rework
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Log Daily Output */}
        <Modal
          isOpen={isLogOutputOpen}
          onClose={() => setIsLogOutputOpen(false)}
          title="Log Daily Shift Output"
          subtitle={`Stitching Order: ${selectedOrder?.productionOrderNumber} (${selectedOrder?.articleName})`}
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleLogOutput)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Finished Pieces Produced</label>
                <input
                  type="number"
                  required
                  value={outputForm.piecesProduced}
                  onChange={(e) => setOutputForm({ ...outputForm, piecesProduced: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Line Efficiency (%)</label>
                <input
                  type="number"
                  required
                  value={outputForm.efficiencyPercentage}
                  onChange={(e) => setOutputForm({ ...outputForm, efficiencyPercentage: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Hours Worked</label>
                <input
                  type="number"
                  value={outputForm.hoursWorked}
                  onChange={(e) => setOutputForm({ ...outputForm, hoursWorked: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Active Tailors Count</label>
                <input
                  type="number"
                  value={outputForm.operatorCount}
                  onChange={(e) => setOutputForm({ ...outputForm, operatorCount: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Shift Notes / Bottlenecks</label>
              <textarea
                rows={2}
                value={outputForm.supervisorNotes}
                onChange={(e) => setOutputForm({ ...outputForm, supervisorNotes: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsLogOutputOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm"
              >
                Record Daily Output
              </button>
            </div>
          </form>
        </Modal>
        <RecordEditModal
          isOpen={Boolean(editingProductionOrder)}
          onClose={() => setEditingProductionOrder(null)}
          record={editingProductionOrder}
          title={`Edit Production Order: ${editingProductionOrder?.productionOrderNumber || ''}`}
          fields={PRODUCTION_ORDER_EDIT_FIELDS}
          onSave={handleUpdateProductionOrder}
        />
      </div>
    </Layout>
  );
}

const PRODUCTION_ORDER_EDIT_FIELDS = [
  { name: 'stitchingLine', label: 'Stitching Line' },
  { name: 'supervisor', label: 'Supervisor' },
  { name: 'targetDate', label: 'Target Date', type: 'date' },
];
