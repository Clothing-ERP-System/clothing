'use client';

import React, { useState, useEffect, useRef } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import RecordEditModal from '@/components/RecordEditModal';
import RecordDeleteButton from '@/components/RecordDeleteButton';
import RecordAttachments from '@/components/RecordAttachments';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';
import {
  CheckCircle2,
  Plus,
  AlertOctagon,
  Wrench,
  Sparkles,
  ShieldCheck,
  Search,
  Package,
} from 'lucide-react';

export default function QualityFinishingPage() {
  const { addToast, currentBranch } = useAuth();
  const [inspections, setInspections] = useState([]);
  const [finalQcOrders, setFinalQcOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingInspection, setEditingInspection] = useState(null);
  const [attachmentInspection, setAttachmentInspection] = useState(null);
  const submissionRequestId = useRef(null);

  // New Inspection Form
  const [newAudit, setNewAudit] = useState({
    stage: '',
    referenceOrder: '',
    articleCode: '',
    inspectorName: '',
    totalSampleChecked: '',
    passedQuantity: '',
    reworkQuantity: '',
    rejectedQuantity: '',
    acceptedForStockQuantity: '',
    finalVerdict: '',
    remarks: '',
  });

  const fetchData = async () => {
    try {
      const res = await fetch('/api/quality');
      const json = await res.json();
      if (json.success) {
        setInspections(json.data.inspections || []);
        setFinalQcOrders(json.data.finalQcOrders || []);
      }
    } catch (err) {
      console.error('Error fetching QC data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, []);

  const handleCreateAudit = async (e) => {
    e.preventDefault();
    try {
      if (!submissionRequestId.current) {
        submissionRequestId.current = globalThis.crypto.randomUUID();
      }
      const res = await fetch('/api/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_INSPECTION',
          submissionRequestId: submissionRequestId.current,
          warehouseLocation: currentBranch,
          ...newAudit,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to log QC audit', 'error');
        return;
      }
      addToast(`QC Report ${json.data.inspection?.inspectionNumber} logged successfully!`, 'success');
      submissionRequestId.current = null;
      setIsAddOpen(false);
      fetchData();
    } catch {
      addToast('Error saving QC report', 'error');
    }
  };

  const handleUpdateInspection = async (inspectionId, updates) => {
    try {
      const response = await fetch('/api/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_INSPECTION', inspectionId, ...updates }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Inspection update failed', 'error');
        return false;
      }
      addToast('Inspection details updated', 'success');
      setEditingInspection(null);
      await fetchData();
      return true;
    } catch {
      addToast('Error updating inspection', 'error');
      return false;
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-[#059669] border border-emerald-100">
                QUALITY ASSURANCE & AQL 2.5
              </span>
              <span className="text-xs text-slate-500">• Quality Control & Finishing</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Quality Inspections, Defect Logs & Finishing
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Incoming raw fabric testing, in-process inline audits, defect rework loops, and steam pressing approval
            </p>
          </div>

          <button
            onClick={() => {
              setNewAudit({
                stage: '',
                referenceOrder: '',
                articleCode: '',
                inspectorName: '',
                totalSampleChecked: '',
                passedQuantity: '',
                reworkQuantity: '',
                rejectedQuantity: '',
                acceptedForStockQuantity: '',
                finalVerdict: '',
                remarks: '',
              });
              submissionRequestId.current = null;
              setIsAddOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Quality Audit</span>
          </button>
        </div>

        {/* Inspections Grid */}
        <div className="space-y-4">
          {inspections.map((qc) => {
            const isPassed = qc.passRatePercentage >= 95;

            return (
              <div
                key={qc._id}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 hover:border-indigo-300 transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#4F46E5]">{qc.inspectionNumber}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {qc.stage}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {qc.passRatePercentage}% Pass Rate
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-1">
                      Reference: {qc.referenceOrder} ({qc.articleCode})
                    </h3>
                  </div>

                  <div className="text-xs text-slate-500 font-medium">
                    Inspector: <span className="font-bold text-slate-800">{qc.inspectorName}</span>
                  </div>
                </div>
                {qc.stage !== 'FinalGarmentQC' && Number(qc.acceptedForStockQuantity || 0) === 0 && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingInspection(qc)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      Edit Inspection
                    </button>
                    <RecordDeleteButton
                      endpoint="/api/quality"
                      action="DELETE_INSPECTION"
                      idField="inspectionId"
                      recordId={qc._id}
                      recordLabel={`inspection ${qc.inspectionNumber}`}
                      onDeleted={fetchData}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setAttachmentInspection(qc)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Inspection Evidence
                </button>

                {/* Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">Sample Tested</span>
                    <span className="font-bold text-slate-900">{qc.totalSampleChecked} Pcs</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">Passed Quality</span>
                    <span className="font-bold text-emerald-600">{qc.passedQuantity} Pcs</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">Rework Required</span>
                    <span className="font-bold text-amber-600">{qc.reworkQuantity} Pcs</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">Scrap Rejected</span>
                    <span className="font-bold text-red-600">{qc.rejectedQuantity} Pcs</span>
                  </div>
                </div>

                {/* Finishing Stages Status */}
                <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-slate-600">
                  <span className="font-bold text-slate-700">Finishing Checklist:</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg ${qc.finishingStatus?.steamIroning ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-400'}`}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Steam Pressing
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg ${qc.finishingStatus?.taggingAndBarcode ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-400'}`}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Barcode & Hangtags
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg ${qc.finishingStatus?.polybagPackaged ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-400'}`}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Polybag Packing
                  </span>
                </div>

                <div className="text-xs text-slate-600 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                  <span className="font-bold text-slate-800">Final Verdict: </span>
                  <span className="font-semibold text-emerald-700">{qc.finalVerdict}</span> — {qc.remarks}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal: New Audit */}
        <Modal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          title="Log Quality Inspection Audit"
          subtitle="Record pass/rework metrics, defects, and finishing approvals"
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleCreateAudit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Inspection Stage</label>
                <select
                  value={newAudit.stage}
                  onChange={(e) => setNewAudit({ ...newAudit, stage: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="">Select inspection stage</option>
                  <option value="IncomingFabric">Incoming Raw Fabric</option>
                  <option value="InProcessStitching">In-Process Inline Sewing</option>
                  <option value="FinalGarmentQC">Final Garment Audit (AQL 2.5)</option>
                  <option value="PreShipmentAudit">Pre-Shipment Cartons</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reference Order #</label>
                {newAudit.stage === 'FinalGarmentQC' ? (
                  <select
                    required
                    value={newAudit.referenceOrder}
                    onChange={(event) => {
                      const order = finalQcOrders.find((item) =>
                        item.productionOrderNumber === event.target.value
                      );
                      setNewAudit({
                        ...newAudit,
                        referenceOrder: order?.productionOrderNumber || '',
                        articleCode: order?.designCode || '',
                      });
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  >
                    <option value="">Select a finishing-complete production order</option>
                    {finalQcOrders.map((order) => (
                      <option key={order._id} value={order.productionOrderNumber}>
                        {order.productionOrderNumber} — {order.articleName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={newAudit.referenceOrder}
                    onChange={(e) => setNewAudit({ ...newAudit, referenceOrder: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                )}
              </div>
            </div>

            {newAudit.stage === 'FinalGarmentQC' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Final Verdict</label>
                  <select
                    required
                    value={newAudit.finalVerdict}
                    onChange={(e) => setNewAudit({ ...newAudit, finalVerdict: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  >
                    <option value="">Select verdict</option>
                    <option value="Passed">Passed</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Quantity approved for finished stock</label>
                  <input
                    type="number"
                    min={newAudit.finalVerdict === 'Passed' ? '1' : '0'}
                    step="1"
                    required={newAudit.finalVerdict === 'Passed'}
                    value={newAudit.acceptedForStockQuantity}
                    onChange={(e) => setNewAudit({ ...newAudit, acceptedForStockQuantity: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <p className="col-span-2 text-[11px] text-slate-500">Only production orders with completed finishing are available for final QC.</p>
              </div>
            )}

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Sample Checked</label>
                <input
                  type="number"
                  required
                  value={newAudit.totalSampleChecked}
                  onChange={(e) => setNewAudit({ ...newAudit, totalSampleChecked: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Passed Qty</label>
                <input
                  type="number"
                  required
                  value={newAudit.passedQuantity}
                  onChange={(e) => setNewAudit({ ...newAudit, passedQuantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rework Qty</label>
                <input
                  type="number"
                  value={newAudit.reworkQuantity}
                  onChange={(e) => setNewAudit({ ...newAudit, reworkQuantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rejected</label>
                <input
                  type="number"
                  value={newAudit.rejectedQuantity}
                  onChange={(e) => setNewAudit({ ...newAudit, rejectedQuantity: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Inspector Name</label>
              <input
                type="text"
                required
                value={newAudit.inspectorName}
                onChange={(e) => setNewAudit({ ...newAudit, inspectorName: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Remarks / Audit Verdict</label>
              <textarea
                rows={2}
                value={newAudit.remarks}
                onChange={(e) => setNewAudit({ ...newAudit, remarks: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
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
                Save Inspection
              </button>
            </div>
          </form>
        </Modal>
        <RecordEditModal
          isOpen={Boolean(editingInspection)}
          onClose={() => setEditingInspection(null)}
          record={editingInspection}
          title={`Edit Inspection: ${editingInspection?.inspectionNumber || ''}`}
          fields={QUALITY_INSPECTION_EDIT_FIELDS}
          onSave={handleUpdateInspection}
        />
        <RecordAttachments
          module="quality"
          record={attachmentInspection}
          onClose={() => setAttachmentInspection(null)}
        />
      </div>
    </Layout>
  );
}

const QUALITY_INSPECTION_EDIT_FIELDS = [
  { name: 'stage', label: 'Inspection Stage', type: 'select', required: true, options: ['IncomingFabric', 'InProcessStitching', 'PreShipmentAudit'] },
  { name: 'referenceOrder', label: 'Reference Order', required: true },
  { name: 'articleCode', label: 'Article Code' },
  { name: 'inspectorName', label: 'Inspector', required: true },
  { name: 'totalSampleChecked', label: 'Sample Checked', type: 'number', required: true, min: 1, step: 1 },
  { name: 'passedQuantity', label: 'Passed Quantity', type: 'number', required: true, min: 0, step: 1 },
  { name: 'reworkQuantity', label: 'Rework Quantity', type: 'number', min: 0, step: 1 },
  { name: 'rejectedQuantity', label: 'Rejected Quantity', type: 'number', min: 0, step: 1 },
  { name: 'remarks', label: 'Remarks', type: 'textarea' },
];
