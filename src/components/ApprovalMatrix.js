'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

const blankStage = (index = 0) => ({
  name: `Stage ${index + 1}`,
  approverRole: 'SuperAdmin',
  approverUserId: '',
  minimumAmount: '',
  maximumAmount: '',
  allowSelfApproval: false,
});

export default function ApprovalMatrix({ roles = [], users = [] }) {
  const { addToast } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(null);
  const approvalRoles = roles.filter((role) =>
    role.permissions?.includes('procurement:approve')
  );
  const roleOptions = [...new Set(['SuperAdmin', ...approvalRoles.map((role) => role.name)])];
  const approverUsers = users.filter((user) =>
    user.isActive !== false &&
    (user.role === 'SuperAdmin' || approvalRoles.some((role) => role.name === user.role))
  );

  const loadPolicies = useCallback(async () => {
    try {
      const response = await fetch('/api/approvals?view=policies');
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Approval policies could not be loaded');
      setPolicies(result.data.policies || []);
    } catch (error) {
      addToast(error.message || 'Approval policies could not be loaded', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void Promise.resolve().then(loadPolicies);
  }, [loadPolicies]);

  const startNew = () => setDraft({
    module: 'procurement',
    documentType: 'purchase_order',
    description: '',
    isActive: true,
    resubmissionAllowed: false,
    conditions: { branches: '', departments: '' },
    stages: [blankStage()],
  });

  const editPolicy = (policy) => setDraft({
    ...policy,
    conditions: {
      branches: (policy.conditions?.branches || []).join(', '),
      departments: (policy.conditions?.departments || []).join(', '),
    },
    stages: (policy.stages || []).map((stage) => ({
      ...stage,
      minimumAmount: stage.minimumAmount ?? '',
      maximumAmount: stage.maximumAmount ?? '',
    })),
  });

  const updateStage = (index, key, value) => {
    setDraft((current) => ({
      ...current,
      stages: current.stages.map((stage, stageIndex) => stageIndex === index
        ? {
          ...stage,
          [key]: value,
          ...(key === 'approverRole' && value ? { approverUserId: '' } : {}),
          ...(key === 'approverUserId' && value ? { approverRole: '' } : {}),
        }
        : stage),
    }));
  };

  const save = async (event) => {
    event.preventDefault();
    if (saving || !draft) return;
    setSaving(true);
    try {
      const stages = draft.stages.map((stage) => ({
        ...stage,
        minimumAmount: stage.minimumAmount === '' ? undefined : Number(stage.minimumAmount),
        maximumAmount: stage.maximumAmount === '' ? undefined : Number(stage.maximumAmount),
      }));
      const response = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: draft._id ? 'UPDATE_POLICY' : 'CREATE_POLICY',
          ...(draft._id ? { policyId: draft._id } : {}),
          module: draft.module,
          documentType: draft.documentType,
          description: draft.description,
          isActive: draft.isActive,
          resubmissionAllowed: draft.resubmissionAllowed,
          conditions: {
            branches: draft.conditions.branches.split(',').map((item) => item.trim()).filter(Boolean),
            departments: draft.conditions.departments.split(',').map((item) => item.trim()).filter(Boolean),
          },
          stages,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Approval policy could not be saved');
      addToast('Approval policy saved', 'success');
      setDraft(null);
      await loadPolicies();
    } catch (error) {
      addToast(error.message || 'Approval policy could not be saved', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deletePolicy = async (policy) => {
    if (!window.confirm('Delete this approval policy? Pending requests must be resolved first.')) return;
    try {
      const response = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE_POLICY', policyId: policy._id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Approval policy could not be deleted');
      addToast('Approval policy deleted', 'success');
      await loadPolicies();
    } catch (error) {
      addToast(error.message || 'Approval policy could not be deleted', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Approval Matrix</h2>
          <p className="mt-1 text-xs text-slate-500">
            Configure sequential purchase-order approval stages, amount limits, branch rules, and resubmission.
          </p>
        </div>
        <button type="button" onClick={startNew} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700">
          Configure Purchase Order Approvals
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-500">Loading approval policies…</p>
      ) : policies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
          No purchase-order approval policy is configured. Purchase orders remain pending until an approver explicitly approves them.
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map((policy) => (
            <div key={policy._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <p className="text-xs font-bold text-slate-900">Procurement · Purchase Order</p>
                <p className="mt-1 text-[11px] text-slate-600">{policy.stages?.map((stage) => stage.name).join(' → ')}</p>
                <p className="text-[11px] text-slate-500">{policy.isActive === false ? 'Inactive' : 'Active'} · {policy.resubmissionAllowed ? 'Resubmission allowed' : 'Resubmission disabled'}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => editPolicy(policy)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Edit</button>
                <button type="button" onClick={() => deletePolicy(policy)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{draft._id ? 'Edit' : 'Create'} Purchase Order Approval Policy</h3>
              <p className="mt-1 text-xs text-slate-500">Stages are sequential. Each request captures an immutable stage snapshot and decision history.</p>
            </div>
            <button type="button" onClick={() => setDraft(null)} className="text-xs font-bold text-slate-500 hover:text-slate-900">Close</button>
          </div>

          <label className="block text-xs font-bold text-slate-700">
            Description
            <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">
              Branch conditions (comma-separated)
              <input value={draft.conditions.branches} onChange={(event) => setDraft({ ...draft, conditions: { ...draft.conditions, branches: event.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Department conditions (comma-separated)
              <input value={draft.conditions.departments} onChange={(event) => setDraft({ ...draft, conditions: { ...draft.conditions, departments: event.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-normal" />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">Sequential stages</h4>
              <button type="button" disabled={draft.stages.length >= 10} onClick={() => setDraft({ ...draft, stages: [...draft.stages, blankStage(draft.stages.length)] })} className="text-xs font-bold text-indigo-700 disabled:opacity-50">Add stage</button>
            </div>
            {draft.stages.map((stage, index) => (
              <section key={index} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Stage {index + 1}</span>
                  {draft.stages.length > 1 && (
                    <button type="button" onClick={() => setDraft({ ...draft, stages: draft.stages.filter((_, stageIndex) => stageIndex !== index) })} className="text-[11px] font-bold text-red-700">Remove stage</button>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-bold text-slate-700">
                    Stage name
                    <input required value={stage.name} onChange={(event) => updateStage(index, 'name', event.target.value)} maxLength={80} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal" />
                  </label>
                  <label className="text-xs font-bold text-slate-700">
                    Approver role
                    <select value={stage.approverRole} onChange={(event) => updateStage(index, 'approverRole', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal">
                      <option value="">Use a specific user instead</option>
                      {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-700">
                    Approver user
                    <select value={stage.approverUserId} onChange={(event) => updateStage(index, 'approverUserId', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal">
                      <option value="">Use the selected role instead</option>
                      {approverUsers.map((user) => (
                        <option key={user._id} value={user._id}>{user.name} · {user.role}</option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-bold text-slate-700">
                      Minimum amount
                      <input type="number" min="0" step="any" value={stage.minimumAmount} onChange={(event) => updateStage(index, 'minimumAmount', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal" />
                    </label>
                    <label className="text-xs font-bold text-slate-700">
                      Maximum amount
                      <input type="number" min="0" step="any" value={stage.maximumAmount} onChange={(event) => updateStage(index, 'maximumAmount', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-normal" />
                    </label>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input type="checkbox" checked={stage.allowSelfApproval} onChange={(event) => updateStage(index, 'allowSelfApproval', event.target.checked)} />
                  Allow the requester to approve this stage (not recommended)
                </label>
              </section>
            ))}
          </div>

          <div className="flex flex-wrap gap-5 border-t border-slate-100 pt-4">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={draft.isActive !== false} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />
              Policy active
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={draft.resubmissionAllowed} onChange={(event) => setDraft({ ...draft, resubmissionAllowed: event.target.checked })} />
              Allow rejected requester to resubmit
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save approval policy'}</button>
          </div>
        </form>
      )}
    </div>
  );
}
