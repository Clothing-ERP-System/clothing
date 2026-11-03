'use client';

import React, { useCallback, useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import RecordEditModal from '@/components/RecordEditModal';
import RecordDeleteButton from '@/components/RecordDeleteButton';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';
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
  const { addToast, currentBranch } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('jobcards'); // 'jobcards', 'recipes'
  const [outputMetersByJob, setOutputMetersByJob] = useState({});
  const [outputFabricByJob, setOutputFabricByJob] = useState({});
  const [editingRecipe, setEditingRecipe] = useState(null);

  // Modals
  const [isNewJobOpen, setIsNewJobOpen] = useState(false);
  const [isNewRecipeOpen, setIsNewRecipeOpen] = useState(false);
  const [newRecipe, setNewRecipe] = useState({
    shadeName: '',
    pantoneCode: '',
    fabricCompatibility: '',
    ingredients: [{ chemicalName: '', ratioGramsPerKg: '' }],
    liquorRatio: '',
    temperatureCelsius: '',
    processTimeMinutes: '',
    approvedBy: '',
  });
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
          fabricAllocations: newJob.issuedRollNumbers.split(',').map((entry) => {
            const [rollNumber, meters] = entry.split(':');
            return { rollNumber: rollNumber?.trim(), meters: Number(meters) };
          }),
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

  const handleCreateRecipe = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch('/api/dyeing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_RECIPE', ...newRecipe }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Recipe creation failed', 'error');
        return;
      }
      addToast(`Dye recipe ${result.data.recipe.recipeCode} created`, 'success');
      setIsNewRecipeOpen(false);
      setNewRecipe({
        shadeName: '',
        pantoneCode: '',
        fabricCompatibility: '',
        ingredients: [{ chemicalName: '', ratioGramsPerKg: '' }],
        liquorRatio: '',
        temperatureCelsius: '',
        processTimeMinutes: '',
        approvedBy: '',
      });
      await fetchData();
    } catch {
      addToast('Error creating dye recipe', 'error');
    }
  };

  const handleUpdateJobStatus = async (jobCardId, status, labDipApproved, outputMeters, outputFabricId) => {
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
          outputFabricId,
          outputWarehouseLocation: currentBranch,
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

  const handleUpdateRecipe = async (recipeId, updates) => {
    try {
      const response = await fetch('/api/dyeing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_RECIPE', recipeId, ...updates }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Recipe update failed', 'error');
        return false;
      }
      addToast('Dye recipe updated successfully', 'success');
      setEditingRecipe(null);
      await fetchData();
      return true;
    } catch {
      addToast('Error updating dye recipe', 'error');
      return false;
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

          <div className="flex flex-wrap gap-2">
            {activeTab === 'recipes' && (
              <button
                type="button"
                onClick={() => setIsNewRecipeOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Recipe</span>
              </button>
            )}
            {activeTab === 'jobcards' && (
              <button
                type="button"
                onClick={() => setIsNewJobOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Dye Job Card</span>
              </button>
            )}
          </div>
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

                    {job.status !== 'Completed' && job.labDipApproved && (
                      <>
                        <input
                          type="number"
                          min="0.01"
                          max={job.inputMeters}
                          step="0.01"
                          placeholder="Actual output m"
                          value={outputMetersByJob[job._id] || ''}
                          onChange={(e) => setOutputMetersByJob({
                            ...outputMetersByJob,
                            [job._id]: e.target.value,
                          })}
                          className="w-28 px-2 py-1.5 text-xs border border-slate-200 rounded-lg"
                        />
                        <select
                          required
                          value={outputFabricByJob[job._id] || ''}
                          onChange={(event) => setOutputFabricByJob({
                            ...outputFabricByJob,
                            [job._id]: event.target.value,
                          })}
                          className="max-w-40 px-2 py-1.5 text-xs border border-slate-200 rounded-lg"
                          aria-label="Output fabric stock item"
                        >
                          <option value="">Output fabric</option>
                          {(data?.fabricItems || []).map((fabric) => (
                            <option key={fabric.id} value={fabric.id}>{fabric.code} · {fabric.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleUpdateJobStatus(
                            job._id,
                            'Completed',
                            undefined,
                            Number(outputMetersByJob[job._id]),
                            outputFabricByJob[job._id]
                          )}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm"
                        >
                          Mark Completed
                        </button>
                      </>
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
                <button
                  type="button"
                  onClick={() => setEditingRecipe(rcp)}
                  className="w-full rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Edit Recipe Details
                </button>
                {!jobCards.some((job) => String(job.recipeId?._id || job.recipeId || '') === String(rcp._id)) && (
                  <RecordDeleteButton
                    endpoint="/api/dyeing"
                    action="DELETE_RECIPE"
                    idField="recipeId"
                    recordId={rcp._id}
                    recordLabel={`dye recipe ${rcp.recipeCode}`}
                    onDeleted={fetchData}
                    className="w-full rounded-lg border border-red-200 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Modal: Create Dye Job Card */}
        <Modal
          isOpen={isNewRecipeOpen}
          onClose={() => setIsNewRecipeOpen(false)}
          title="Create Dye Recipe"
          subtitle="Define shade, fabric compatibility, and chemical ratios"
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleCreateRecipe)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-slate-700">
                Shade Name
                <input required value={newRecipe.shadeName} onChange={(event) => setNewRecipe({ ...newRecipe, shadeName: event.target.value })} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Pantone Code
                <input value={newRecipe.pantoneCode} onChange={(event) => setNewRecipe({ ...newRecipe, pantoneCode: event.target.value })} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Fabric Compatibility
                <input value={newRecipe.fabricCompatibility} onChange={(event) => setNewRecipe({ ...newRecipe, fabricCompatibility: event.target.value })} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Liquor Ratio
                <input value={newRecipe.liquorRatio} onChange={(event) => setNewRecipe({ ...newRecipe, liquorRatio: event.target.value })} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-slate-700">
                Temperature (°C)
                <input type="number" min="0" step="any" value={newRecipe.temperatureCelsius} onChange={(event) => setNewRecipe({ ...newRecipe, temperatureCelsius: event.target.value })} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Process Time (minutes)
                <input type="number" min="0" step="any" value={newRecipe.processTimeMinutes} onChange={(event) => setNewRecipe({ ...newRecipe, processTimeMinutes: event.target.value })} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
              </label>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Chemical Ingredients</span>
                <button
                  type="button"
                  onClick={() => setNewRecipe((current) => ({
                    ...current,
                    ingredients: [...current.ingredients, { chemicalName: '', ratioGramsPerKg: '' }],
                  }))}
                  className="text-xs font-bold text-indigo-700 hover:text-indigo-800"
                >
                  Add Ingredient
                </button>
              </div>
              {newRecipe.ingredients.map((ingredient, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <label className="block text-[11px] font-bold text-slate-600">
                    Chemical
                    <input required value={ingredient.chemicalName} onChange={(event) => setNewRecipe((current) => ({
                      ...current,
                      ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, chemicalName: event.target.value } : item),
                    }))} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
                  </label>
                  <label className="block text-[11px] font-bold text-slate-600">
                    Ratio (g/kg)
                    <input required type="number" min="0.000001" step="any" value={ingredient.ratioGramsPerKg} onChange={(event) => setNewRecipe((current) => ({
                      ...current,
                      ingredients: current.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, ratioGramsPerKg: event.target.value } : item),
                    }))} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
                  </label>
                  <button
                    type="button"
                    disabled={newRecipe.ingredients.length === 1}
                    onClick={() => setNewRecipe((current) => ({
                      ...current,
                      ingredients: current.ingredients.filter((_, itemIndex) => itemIndex !== index),
                    }))}
                    className="pb-2 text-xs font-bold text-red-600 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Approved By
              <input value={newRecipe.approvedBy} onChange={(event) => setNewRecipe({ ...newRecipe, approvedBy: event.target.value })} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setIsNewRecipeOpen(false)} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="submit" className="rounded-lg bg-[#4F46E5] px-4 py-2 text-xs font-bold text-white hover:bg-[#4338CA]">Save Recipe</button>
            </div>
          </form>
        </Modal>
        <Modal
          isOpen={isNewJobOpen}
          onClose={() => setIsNewJobOpen(false)}
          title="Create Dye Job Card"
          subtitle="Issue greige fabric rolls to dyeing jet and set shade formulation"
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleCreateJob)} className="space-y-4">
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
                <label className="block text-xs font-bold text-slate-700 mb-1">Roll allocations (roll number: meters)</label>
                <input
                  type="text"
                  required
                  value={newJob.issuedRollNumbers}
                  onChange={(e) => setNewJob({ ...newJob, issuedRollNumbers: e.target.value })}
                  placeholder="e.g. ROL-2025-00001:50, ROL-2025-00002:40"
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
        <RecordEditModal
          isOpen={Boolean(editingRecipe)}
          onClose={() => setEditingRecipe(null)}
          record={editingRecipe}
          title={`Edit Recipe: ${editingRecipe?.recipeCode || ''}`}
          fields={DYE_RECIPE_EDIT_FIELDS}
          onSave={handleUpdateRecipe}
        />
      </div>
    </Layout>
  );
}

const DYE_RECIPE_EDIT_FIELDS = [
  { name: 'shadeName', label: 'Shade Name', required: true },
  { name: 'pantoneCode', label: 'Pantone Code' },
  { name: 'fabricCompatibility', label: 'Fabric Compatibility' },
  { name: 'liquorRatio', label: 'Liquor Ratio' },
  { name: 'temperatureCelsius', label: 'Temperature (°C)', type: 'number', min: 0, step: 'any' },
  { name: 'processTimeMinutes', label: 'Process Time (Minutes)', type: 'number', min: 0, step: 'any' },
  { name: 'approvedBy', label: 'Approved By' },
  {
    name: 'ingredients',
    label: 'Chemical Ingredients',
    type: 'array',
    itemLabel: 'ingredient',
    itemFields: [
      { name: 'chemicalName', label: 'Chemical', required: true },
      { name: 'ratioGramsPerKg', label: 'Ratio (g/kg)', type: 'number', required: true, min: 0, step: 'any' },
    ],
  },
];
