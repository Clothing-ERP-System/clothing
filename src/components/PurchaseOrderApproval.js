'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { canAccessModule } from '@/lib/role-access.js';

export default function PurchaseOrderApproval({ order, onUpdated }) {
  const { addToast, user } = useAuth();
  const [approval, setApproval] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const hasPermission = user?.role === 'SuperAdmin' ||
    user?.permissions?.includes('procurement:approve');
  const canSubmit = canAccessModule(user, 'procurement', 'edit');
  const stage = approval?.stages?.[approval.currentStageIndex];
  const assigned = Boolean(stage && (
    stage.approverRole === user?.role ||
    (stage.approverUserId && String(stage.approverUserId) === String(user?.id))
  ));
  const isRequester = approval?.requesterId && String(approval.requesterId) === String(user?.id);

  const loadApproval = useCallback(async () => {
    try {
      const response = await fetch('/api/approvals?module=procurement');
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Approval status could not be loaded');
      const match = (result.data.approvals || []).find((item) =>
        item.documentType === 'purchase_order' && String(item.documentId) === String(order._id)
      );
      setApproval(match || null);
    } catch (error) {
      addToast(error.message || 'Approval status could not be loaded', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, order._id]);

  useEffect(() => {
    void Promise.resolve().then(loadApproval);
  }, [loadApproval]);

  const submitAction = async (action, endpoint = '/api/approvals') => {
    if (saving) return;
    if (action === 'REJECT' && !reason.trim()) {
      addToast('Enter a reason before rejecting this purchase order', 'error');
      return;
    }
    setSaving(true);
    try {
      const requestBody = action === 'SUBMIT'
        ? {
          action,
          module: 'procurement',
          documentType: 'purchase_order',
          documentId: order._id,
          requestId: crypto.randomUUID(),
          amount: Number(order.grandTotal || 0),
          intent: 'EDIT',
        }
        : action === 'APPROVE_PO'
          ? { action, poId: order._id }
          : {
            action,
            approvalId: approval?.id,
            reason: reason.trim(),
          };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Approval action failed');
      addToast(result.message || 'Approval action completed', 'success');
      setReason('');
      await Promise.all([loadApproval(), onUpdated()]);
    } catch (error) {
      addToast(error.message || 'Approval action failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-xs text-slate-500">Loading approval status…</p>;

  if (!approval) {
    if (order.approvalPolicyActive) {
      return (
        <div className="space-y-3">
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">An active approval policy exists, but this purchase order has no approval request. Submit it to the configured approval stages before receiving goods.</p>
          {canSubmit && order.status === 'PendingApproval' && (
            <button type="button" disabled={saving} onClick={() => submitAction('SUBMIT')} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
              {saving ? 'Submitting…' : 'Submit for approval'}
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-xs text-slate-600">No approval request is recorded for this purchase order.</p>
        {order.status === 'PendingApproval' && hasPermission && (
          <button type="button" disabled={saving} onClick={() => submitAction('APPROVE_PO', '/api/procurement')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
            {saving ? 'Approving…' : 'Approve Purchase Order'}
          </button>
        )}
      </div>
    );
  }

  const canDecide = hasPermission && assigned && approval.status === 'PendingApproval' &&
    (!isRequester || stage?.allowSelfApproval);
  const canResubmit = approval.status === 'Rejected' && approval.resubmissionAllowed && isRequester;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3">
        <div>
          <p className="text-xs font-bold text-slate-800">{approval.documentReference} · {approval.status}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Stage {approval.currentStageIndex + 1} of {approval.stages.length}: {stage?.name || 'Complete'} · Requested by {approval.requesterName}
          </p>
        </div>
        <span className="text-xs font-semibold text-slate-600">Amount: Rs. {Number(approval.amount || 0).toLocaleString()}</span>
      </div>

      <ol className="space-y-2">
        {(approval.history || []).map((entry, index) => (
          <li key={`${entry.action}-${entry.timestamp}-${index}`} className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs font-bold text-slate-800">{entry.action} {entry.stage ? `· ${entry.stage}` : ''}</p>
            <p className="mt-1 text-[11px] text-slate-500">{entry.userName || 'System'} · {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}</p>
            {entry.reason && <p className="mt-1 text-xs text-slate-700">{entry.reason}</p>}
          </li>
        ))}
      </ol>

      {(canDecide || canResubmit) && (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <label className="block text-xs font-bold text-slate-700">
            {canDecide ? 'Decision comment' : 'Resubmission comment'}
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" />
          </label>
          <div className="flex flex-wrap gap-2">
            {canDecide && (
              <>
                <button type="button" disabled={saving} onClick={() => submitAction('APPROVE')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Approve stage'}</button>
                <button type="button" disabled={saving || !reason.trim()} onClick={() => submitAction('REJECT')} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Reject with reason</button>
              </>
            )}
            {canResubmit && (
              <button type="button" disabled={saving} onClick={() => submitAction('RESUBMIT')} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Resubmitting…' : 'Resubmit for approval'}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
