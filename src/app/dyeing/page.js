'use client';

import React, { useCallback, useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import {
  Droplets,
  Plus,
  CheckCircle2,
  Clock,
  FlaskConical,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Layers,
} from 'lucide-react';

export default function DyeingProcessingPage() {
  const { addToast } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('jobcards'); // 'jobcards', 'recipes'

  // Modals
  const [isNewJobOpen, setIsNewJobOpen] = useState(false);
  const [newJob, setNewJob] = useState({
    targetShade: '',
    recipeId: '',
    fabricType: '',
    issuedRollNumbers: '',
    inputMeters: '',
    vatMachineNumber: '',
    operatorName: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dyeing');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        if (json.data.recipes?.length > 0) {
          setNewJob((prev) => prev.recipeId ? prev : { ...prev, recipeId: json.data.recipes[0]._id });
        }
      }
    } catch (err) {
      console.error('Error fetching dyeing data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const handleCreateJob = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/dyeing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_JOB_CARD',
          ...newJob,
          issuedRollNumbers: newJob.issuedRollNumbers.split(',').map((s) => s.trim()),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create job card', 'error');
        return;
      }
      addToast(`Job Card ${json.data.jobCard?.jobCardNumber} created!`, 'success');
      setIsNewJobOpen(false);
      fetchData();
    } catch {
      addToast('Error saving job card', 'error');
    }
  };

  const handleUpdateJobStatus = async (jobCardId, status, labDipApproved, outputMeters) => {
    try {
      const res = await fetch('/api/dyeing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_JOB_STATUS',
          jobCardId,
          status,
          labDipApproved,
          outputMeters,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Status update failed', 'error');
        return;
      }
      addToast('Dyeing job card updated!', 'success');
      fetchData();
    } catch {
      addToast('Error updating status', 'error');
    }
  };

  const recipes = data?.recipes || [];
  const jobCards = data?.jobCards || [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-[#0D9488] border border-teal-100">
                WET PROCESSING
              </span>
              <span className="text-xs text-slate-500">• Dyeing & Chemical Processing</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Dye Job Cards & Shade Formulations
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Pantone shade recipes, vat liquor ratios, shrinkage tracking, and lab dip swatch approval
            </p>
          </div>

          <button
            onClick={() => setIsNewJobOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Dye Job Card</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('jobcards')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'jobcards'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Droplets className="w-4 h-4" />
            <span>Active Dye Job Cards ({jobCards.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('recipes')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'recipes'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FlaskConical className="w-4 h-4" />
            <span>Formulated Recipes ({recipes.length})</span>
          </button>
        </div>

        {/* Tab 1: Dye Job Cards */}
        {activeTab === 'jobcards' && (
          <div className="space-y-4">
            {jobCards.map((job) => {
              let statusBadge = 'bg-amber-100 text-amber-800';
              if (job.status === 'Completed') statusBadge = 'bg-emerald-100 text-emerald-800';
              if (job.status === 'Dyeing') statusBadge = 'bg-indigo-100 text-indigo-800';

              return (
                <div
                  key={job._id}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#4F46E5]">{job.jobCardNumber}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusBadge}`}>
                        {job.status}
                      </span>
                      {job.labDipApproved && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800">
                          Lab Dip Approved
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-slate-900">{job.targetShade}</h3>
                    <p className="text-xs text-slate-500">
                      Fabric: {job.fabricType} • Rolls: {(job.issuedRollNumbers || []).join(', ')} • {job.vatMachineNumber}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Input Length</span>
                      <span className="font-bold text-slate-900">{job.inputMeters} m</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Output Length</span>
                      <span className="font-bold text-emerald-600">
                        {job.outputMeters ? `${job.outputMeters} m` : 'In Process'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Dyeing Cost</span>
                      <span className="font-bold text-slate-900">Rs. {job.totalDyeingCost?.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!job.labDipApproved && (
                      <button
                        onClick={() => handleUpdateJobStatus(job._id, job.status, true, null)}
                        className="px-3 py-1.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 text-xs font-bold hover:bg-teal-100 transition-colors"
                      >
                        Approve Lab Dip
                      </button>
                    )}

                    {job.status !== 'Completed' && (
                      <button
                        onClick={() => handleUpdateJobStatus(job._id, 'Completed', true, Math.round(job.inputMeters * 0.97))}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm"
                      >
                        Mark Completed
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Recipes Catalog */}
        {activeTab === 'recipes' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recipes.map((rcp) => (
              <div key={rcp._id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-[#4F46E5]">{rcp.recipeCode} (v{rcp.version})</span>
                    <h3 className="text-base font-bold text-slate-900">{rcp.shadeName}</h3>
                    <p className="text-xs text-slate-500 font-mono">Pantone: {rcp.pantoneCode}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold text-xs">
                    {rcp.fabricCompatibility}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <span className="font-bold text-slate-700 block">Chemical & Reactive Dyestuff Ratios:</span>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1 font-mono text-[11px]">
                    {(rcp.ingredients || []).map((ing, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="text-slate-700">{ing.chemicalName}</span>
                        <span className="font-bold text-indigo-600">{ing.ratioGramsPerKg} g/kg</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Liquor Ratio</span>
                    <span className="font-bold">{rcp.liquorRatio}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Temperature</span>
                    <span className="font-bold">{rcp.temperatureCelsius}°C</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Process Time</span>
                    <span className="font-bold">{rcp.processTimeMinutes} mins</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal: Create Dye Job Card */}
        <Modal
          isOpen={isNewJobOpen}
          onClose={() => setIsNewJobOpen(false)}
          title="Create Dye Job Card"
          subtitle="Issue greige fabric rolls to dyeing jet and set shade formulation"
        >
          <form onSubmit={handleCreateJob} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Target Shade & Recipe</label>
              <select
                value={newJob.recipeId}
                onChange={(e) => {
                  const sel = recipes.find((r) => r._id === e.target.value);
                  setNewJob({
                    ...newJob,
                    recipeId: e.target.value,
                    targetShade: sel ? sel.shadeName : newJob.targetShade,
                  });
                }}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              >
                {recipes.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.shadeName} ({r.recipeCode})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Input Fabric Meters</label>
                <input
                  type="number"
                  required
                  value={newJob.inputMeters}
                  onChange={(e) => setNewJob({ ...newJob, inputMeters: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Dyeing Vat / Jet Machine</label>
                <input
                  type="text"
                  value={newJob.vatMachineNumber}
                  onChange={(e) => setNewJob({ ...newJob, vatMachineNumber: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Issued Roll Number(s)</label>
                <input
                  type="text"
                  required
                  value={newJob.issuedRollNumbers}
                  onChange={(e) => setNewJob({ ...newJob, issuedRollNumbers: e.target.value })}
                  placeholder="Roll numbers"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Dye Master / Operator</label>
                <input
                  type="text"
                  value={newJob.operatorName}
                  onChange={(e) => setNewJob({ ...newJob, operatorName: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewJobOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm"
              >
                Issue Dye Job Card
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </Layout>
  );
}
