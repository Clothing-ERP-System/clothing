'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';

export default function GRNInspectionModal({ target, onClose, onCompleted }) {
  const { addToast } = useAuth();
  const [acceptedQuantities, setAcceptedQuantities] = useState({});
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [saving, setSaving] = useState(false);

  if (!target) return null;

  const setAccepted = (key, value) => {
    setAcceptedQuantities((current) => ({ ...current, [key]: value }));
  };
  const setReason = (key, value) => {
    setRejectionReasons((current) => ({ ...current, [key]: value }));
  };

  const submitInspection = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const decisions = [];
      for (const item of target.grn.items || []) {
        const quantityReceived = Number(item.quantityReceived);
        const lineReason = String(rejectionReasons[item.lineId] || '').trim();
        let acceptedQuantity = 0;
        let rejectedQuantity = 0;
        let rolls = [];

        if (item.stockItemType === 'Fabric') {
          rolls = item.rolls.map((roll, rollIndex) => {
            const key = `${item.lineId}:${rollIndex}`;
            const rawAccepted = acceptedQuantities[key];
            const acceptedMeters = rawAccepted === undefined || rawAccepted === ''
              ? NaN
              : Number(rawAccepted);
            const meters = Number(roll.meters);
            const rejectedMeters = meters - acceptedMeters;
            if (!Number.isFinite(acceptedMeters) || acceptedMeters < 0 ||
              acceptedMeters > meters || rejectedMeters > meters) {
              throw new Error(`Enter accepted meters between 0 and ${meters} for roll ${roll.supplierRollNumber || rollIndex + 1}`);
            }
            const reason = String(rejectionReasons[key] || lineReason).trim();
            if (rejectedMeters > 0 && !reason) {
              throw new Error(`Enter a rejection reason for roll ${roll.supplierRollNumber || rollIndex + 1}`);
            }
            acceptedQuantity += acceptedMeters;
            rejectedQuantity += rejectedMeters;
            return {
              rollIndex,
              acceptedMeters,
              rejectedMeters,
              rejectionReason: reason,
            };
          });
        } else {
          const rawAccepted = acceptedQuantities[item.lineId];
          acceptedQuantity = rawAccepted === undefined || rawAccepted === ''
            ? NaN
            : Number(rawAccepted);
          rejectedQuantity = quantityReceived - acceptedQuantity;
          if (!Number.isFinite(acceptedQuantity) || acceptedQuantity < 0 ||
            acceptedQuantity > quantityReceived) {
            throw new Error(`Enter accepted quantity between 0 and ${quantityReceived} for ${item.itemDescription}`);
          }
          if (rejectedQuantity > 0 && !lineReason) {
            throw new Error(`Enter a rejection reason for ${item.itemDescription}`);
          }
        }

        decisions.push({
          lineId: item.lineId,
          acceptedQuantity,
          rejectedQuantity,
          rejectionReason: lineReason,
          rolls,
        });
      }

      const response = await fetch('/api/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'APPROVE_GRN_INSPECTION',
          poId: target.order._id,
          grnNumber: target.grn.grnNumber,
          decisions,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Goods inspection could not be recorded');
      addToast(result.message || 'Goods inspection recorded', 'success');
      await onCompleted();
      onClose();
    } catch (error) {
      addToast(error.message || 'Goods inspection could not be recorded', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(target)}
      onClose={onClose}
      title={`Inspect ${target.grn.grnNumber}`}
      subtitle={`${target.order.poNumber} · ${target.order.supplierName} · ${target.grn.warehouseLocation}`}
      maxWidth="max-w-3xl"
    >
      <form onSubmit={(event) => preventDuplicateSubmit(event, submitInspection)} className="space-y-4">
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Only accepted quantities will be posted to usable stock and supplier payable. Rejected quantities remain excluded from both.
        </p>
        {(target.grn.items || []).map((item) => (
          <section key={item.lineId} className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-900">{item.itemDescription}</h4>
                <p className="text-[11px] text-slate-500">{item.stockItemCode} · Received {item.quantityReceived} {item.unit}</p>
              </div>
              <span className="text-[11px] font-semibold text-amber-700">Pending inspection</span>
            </div>

            {item.stockItemType === 'Fabric' ? (
              <div className="space-y-2">
                {(item.rolls || []).map((roll, rollIndex) => {
                  const key = `${item.lineId}:${rollIndex}`;
                  return (
                    <div key={key} className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                      <div className="text-xs text-slate-700">
                        Supplier roll: <span className="font-bold">{roll.supplierRollNumber || `Roll ${rollIndex + 1}`}</span>
                        <span className="ml-2 text-slate-500">received {roll.meters} m</span>
                      </div>
                      <label className="text-xs font-semibold text-slate-700">
                        Accepted meters
                        <input
                          type="number"
                          min="0"
                          max={roll.meters}
                          step="any"
                          value={acceptedQuantities[key] ?? ''}
                          onChange={(event) => setAccepted(key, event.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal"
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                        Rejection reason (required if any meters are rejected)
                        <input
                          value={rejectionReasons[key] ?? ''}
                          onChange={(event) => setReason(key, event.target.value)}
                          maxLength={1000}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                <label className="block text-xs font-semibold text-slate-700">
                  Accepted quantity
                  <input
                    type="number"
                    min="0"
                    max={item.quantityReceived}
                    step="any"
                    value={acceptedQuantities[item.lineId] ?? ''}
                    onChange={(event) => setAccepted(item.lineId, event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Rejection reason (required if any quantity is rejected)
                  <input
                    value={rejectionReasons[item.lineId] ?? ''}
                    onChange={(event) => setReason(item.lineId, event.target.value)}
                    maxLength={1000}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal"
                  />
                </label>
              </>
            )}
          </section>
        ))}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
            {saving ? 'Recording…' : 'Record inspection'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
