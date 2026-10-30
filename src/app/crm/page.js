'use client';

import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import {
  Megaphone,
  Plus,
  Users,
  Target,
  ArrowRight,
  Calendar,
  CheckCircle2,
  DollarSign,
  TrendingUp,
} from 'lucide-react';

export default function MarketingCRMPage() {
  const { addToast } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [isUpdateStageOpen, setIsUpdateStageOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);

  // New Lead Form
  const [newLead, setNewLead] = useState({
    contactPerson: '',
    companyName: '',
    phone: '',
    email: '',
    channel: '',
    stage: 'NewLead',
    estimatedOrderValuePKR: '',
    assignedSalesOfficer: '',
    lastDiscussionSummary: '',
  });

  // Update Stage Form
  const [stageForm, setStageForm] = useState({
    stage: '',
    lastDiscussionSummary: '',
  });

  const fetchData = async () => {
    try {
      const res = await fetch('/api/crm');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (err) {
      console.error('Error fetching CRM:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, []);

  const handleCreateLead = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_LEAD', ...newLead }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create lead', 'error');
        return;
      }
      addToast('Lead recorded in sales pipeline!', 'success');
      setIsAddLeadOpen(false);
      fetchData();
    } catch {
      addToast('Error saving lead', 'error');
    }
  };

  const openStageModal = (lead) => {
    setSelectedLead(lead);
    setStageForm({
      stage: lead.stage,
      lastDiscussionSummary: lead.lastDiscussionSummary || '',
    });
    setIsUpdateStageOpen(true);
  };

  const handleUpdateStage = async (e) => {
    e.preventDefault();
    if (!selectedLead) return;

    try {
      const res = await fetch('/api/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_LEAD_STAGE',
          leadId: selectedLead._id,
          ...stageForm,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Stage update failed', 'error');
        return;
      }
      addToast('Pipeline stage advanced!', 'success');
      setIsUpdateStageOpen(false);
      fetchData();
    } catch {
      addToast('Error updating stage', 'error');
    }
  };

  const leads = data?.leads || [];
  const campaigns = data?.campaigns || [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-violet-50 text-[#7C3AED] border border-violet-100">
                BUSINESS ACQUISITION
              </span>
              <span className="text-xs text-slate-500">• B2B Leads & Campaigns</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Marketing Campaigns & Buyer Pipeline
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Track trade inquiries, swatch kit requests, sampling feedback, and campaign ROI
            </p>
          </div>

          <button
            onClick={() => setIsAddLeadOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Buyer Inquiry</span>
          </button>
        </div>

        {/* Marketing Campaigns Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaigns.map((camp) => (
            <div key={camp._id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400">{camp.seasonOrTheme}</span>
                  <h3 className="text-base font-bold text-slate-900 mt-0.5">{camp.campaignTitle}</h3>
                  <p className="text-xs text-slate-500">{camp.targetAudience}</p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  {camp.status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Budget</span>
                  <span className="font-bold text-slate-800">Rs. {camp.budgetPKR?.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Spend</span>
                  <span className="font-bold text-slate-800">Rs. {camp.actualSpendPKR?.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Revenue Generated</span>
                  <span className="font-bold text-emerald-600">Rs. {camp.revenueGeneratedPKR?.toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Buyer Pipeline Leads */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">B2B Apparel Buyers Pipeline ({leads.length})</h3>
            <p className="text-xs text-slate-500">Stages: New Inquiry → Sample Sent → Price Negotiation → Order Won</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                  <th className="py-3 px-4">Lead #</th>
                  <th className="py-3 px-4">Buyer & Company</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Est. Order Value</th>
                  <th className="py-3 px-4">Stage</th>
                  <th className="py-3 px-4">Latest Notes</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((l) => {
                  let badge = 'bg-slate-100 text-slate-700';
                  if (l.stage === 'SampleSent') badge = 'bg-indigo-100 text-indigo-800';
                  if (l.stage === 'PriceNegotiation') badge = 'bg-amber-100 text-amber-800';
                  if (l.stage === 'WonOrder') badge = 'bg-emerald-100 text-emerald-800';

                  return (
                    <tr key={l._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{l.leadCode}</td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{l.contactPerson}</div>
                        <div className="text-[11px] text-slate-500">{l.companyName}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{l.phone}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        Rs. {l.estimatedOrderValuePKR?.toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badge}`}>
                          {l.stage}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{l.lastDiscussionSummary}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => openStageModal(l)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                        >
                          <span>Advance</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Add Lead */}
        <Modal
          isOpen={isAddLeadOpen}
          onClose={() => setIsAddLeadOpen(false)}
          title="Record Buyer Inquiry"
          subtitle="Log prospective wholesale buyer or boutique inquiry"
        >
          <form onSubmit={handleCreateLead} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Contact Person</label>
                <input
                  type="text"
                  required
                  value={newLead.contactPerson}
                  onChange={(e) => setNewLead({ ...newLead, contactPerson: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Company / Brand Name</label>
                <input
                  type="text"
                  value={newLead.companyName}
                  onChange={(e) => setNewLead({ ...newLead, companyName: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  required
                  value={newLead.phone}
                  onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Estimated Order Value (PKR)</label>
                <input
                  type="number"
                  value={newLead.estimatedOrderValuePKR}
                  onChange={(e) => setNewLead({ ...newLead, estimatedOrderValuePKR: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Inquiry Details</label>
              <textarea
                rows={2}
                value={newLead.lastDiscussionSummary}
                onChange={(e) => setNewLead({ ...newLead, lastDiscussionSummary: e.target.value })}
                placeholder="Fabric type, required pieces, target price..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddLeadOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm"
              >
                Save Inquiry
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Update Stage */}
        <Modal
          isOpen={isUpdateStageOpen}
          onClose={() => setIsUpdateStageOpen(false)}
          title={`Update Pipeline: ${selectedLead?.contactPerson}`}
          subtitle={`Current Stage: ${selectedLead?.stage}`}
        >
          <form onSubmit={handleUpdateStage} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Next Pipeline Stage</label>
              <select
                value={stageForm.stage}
                onChange={(e) => setStageForm({ ...stageForm, stage: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              >
                <option value="NewLead">New Inquiry</option>
                <option value="Contacted">Contacted & Discussed</option>
                <option value="SampleSent">Sample Swatches Sent</option>
                <option value="PriceNegotiation">Price Negotiation</option>
                <option value="WonOrder">Order Won / Converted</option>
                <option value="Lost">Lost</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Discussion Summary / Next Action</label>
              <textarea
                rows={2}
                value={stageForm.lastDiscussionSummary}
                onChange={(e) => setStageForm({ ...stageForm, lastDiscussionSummary: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsUpdateStageOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
              >
                Update Pipeline
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </Layout>
  );
}
