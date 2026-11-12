'use client';

import React, { useCallback, useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import RecordEditModal from '@/components/RecordEditModal';
import RecordDeleteButton from '@/components/RecordDeleteButton';
import RecordAttachments from '@/components/RecordAttachments';
import RecordViewModal from '@/components/RecordViewModal';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  Palette,
  Plus,
  Scissors,
  DollarSign,
  Tag,
  CheckCircle2,
  FileSpreadsheet,
  PlusCircle,
  Trash2,
  Layers,
  Shirt,
  Eye,
} from 'lucide-react';

export default function DesignBOMPage() {
  const { addToast } = useAuth();
  const [designs, setDesigns] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDesign, setSelectedDesign] = useState(null);
  const [editingDesign, setEditingDesign] = useState(null);
  const [attachmentDesign, setAttachmentDesign] = useState(null);
  const [viewDesign, setViewDesign] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // New Design Form
  const [newDesign, setNewDesign] = useState({
    title: '',
    category: '',
    sampleStatus: 'Draft',
    season: '',
    designerName: '',
    fabricConsumptionPerPiece: '',
    cuttingCostPerPiece: '',
    stitchingCostPerPiece: '',
    finishingCostPerPiece: '',
    overheadCostPerPiece: '',
    suggestedWholesalePrice: '',
    suggestedRetailPrice: '',
    techPackNotes: '',
    bom: [],
    sizeNames: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/design');
      const json = await res.json();
      if (json.success) {
        setDesigns(json.data.designs || []);
        setStockItems(json.data.stockItems || []);
        if (json.data.designs?.length > 0) {
          setSelectedDesign((current) => current || json.data.designs[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching designs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const handleCreateDesign = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_DESIGN',
          ...newDesign,
          sizeGrading: newDesign.sizeNames
            .split(',')
            .map((sizeName) => sizeName.trim())
            .filter(Boolean)
            .map((sizeName) => ({ sizeName })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create design', 'error');
        return;
      }
      addToast('New design and BOM generated!', 'success');
      setIsAddOpen(false);
      fetchData();
    } catch {
      addToast('Error saving design', 'error');
    }
  };

  const handleUpdateDesign = async (designId, updates) => {
    try {
      const response = await apiFetch('/api/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_DESIGN', designId, ...updates }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Design update failed', 'error');
        return false;
      }
      addToast('Design details updated successfully', 'success');
      setEditingDesign(null);
      await fetchData();
      return true;
    } catch {
      addToast('Error updating design', 'error');
      return false;
    }
  };

  const handleAddBOMItem = () => {
    setNewDesign((prev) => ({
      ...prev,
      bom: [
        ...prev.bom,
        { stockItemType: '', stockItemId: '', itemName: '', quantityPerGarment: '', unit: '', estimatedUnitCost: '' },
      ],
    }));
  };

  const handleRemoveBOMItem = (index) => {
    setNewDesign((prev) => ({
      ...prev,
      bom: prev.bom.filter((_, idx) => idx !== index),
    }));
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-[#4F46E5] border border-indigo-100">
                PRODUCT ENGINEERING
              </span>
              <span className="text-xs text-slate-500">• Design, BOM & Tech Packs</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Bill of Materials (BOM) & Garment Costing
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Material consumption per piece, size grading charts, labor piece-rates, and profit margin analysis
            </p>
          </div>

          <button
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Design Article</span>
          </button>
        </div>

        {/* 2 Column View: Articles List + Detailed BOM & Spec Sheet */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Articles List */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Approved Production Articles ({designs.length})
            </h2>

            <div className="space-y-2">
              {designs.map((art) => {
                const isSelected = selectedDesign?._id === art._id;

                return (
                  <div
                    key={art._id}
                    onClick={() => setSelectedDesign(art)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#4F46E5] bg-indigo-50/50 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-mono font-bold text-[#4F46E5]">{art.designCode}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {art.sampleStatus}
                      </span>
                    </div>
                    <h3 className="text-xs font-bold text-slate-900 mt-1">{art.title}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">{art.category} • {art.season}</p>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setViewDesign(art);
                      }}
                      className="mt-2 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingDesign(art);
                      }}
                      className="mt-2 rounded-lg border border-indigo-200 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50"
                    >
                      Edit Design
                    </button>
                    <div className="mt-2 pt-2 border-t border-slate-100 flex justify-between text-[11px] font-semibold">
                      <span className="text-slate-500">Factory Cost: Rs. {art.estimatedFactoryCost?.toLocaleString()}</span>
                      <span className="text-indigo-600">Retail: Rs. {art.suggestedRetailPrice?.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Detailed BOM, Costing & Size Grading */}
          {selectedDesign && (
            <div className="lg:col-span-2 space-y-6">
              {/* Top Overview Card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <span className="text-xs font-mono font-bold text-[#4F46E5]">{selectedDesign.designCode}</span>
                    <h2 className="text-lg font-black text-slate-900">{selectedDesign.title}</h2>
                    <p className="text-xs text-slate-500">Designer: {selectedDesign.designerName} • Barcode: {selectedDesign.barcode}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Suggested Retail Price</span>
                    <span className="text-xl font-black text-slate-900">Rs. {selectedDesign.suggestedRetailPrice?.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAttachmentDesign(selectedDesign)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Manage Design Documents
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingDesign(selectedDesign)}
                    className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition-colors cursor-pointer"
                  >
                    Edit Design & BOM
                  </button>
                  <RecordDeleteButton
                    endpoint="/api/design"
                    action="DELETE_DESIGN"
                    idField="designId"
                    recordId={selectedDesign._id}
                    recordLabel={selectedDesign.title}
                    onDeleted={() => {
                      setSelectedDesign(null);
                      fetchData();
                    }}
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  />
                </div>

                {/* Cost Breakdown Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">Fabric Cons. / Pc</span>
                    <span className="font-bold text-slate-900">{selectedDesign.fabricConsumptionPerPiece} Meters</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">Stitching Piece-Rate</span>
                    <span className="font-bold text-slate-900">Rs. {selectedDesign.stitchingCostPerPiece}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">Total Factory Cost</span>
                    <span className="font-bold text-indigo-600">Rs. {selectedDesign.estimatedFactoryCost}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block text-[10px]">Wholesale Price</span>
                    <span className="font-bold text-emerald-600">Rs. {selectedDesign.suggestedWholesalePrice}</span>
                  </div>
                </div>

                <div className="text-xs text-slate-600 bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                  <span className="font-bold text-amber-900 block mb-0.5">Tech Pack Notes:</span>
                  {selectedDesign.techPackNotes}
                </div>
              </div>

              {/* Bill of Materials Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">Bill of Materials (BOM) per Single Garment</h3>
                  <p className="text-xs text-slate-500">Fabric, thread, buttons, labels, and packaging cost components</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                        <th className="py-2.5 px-4">Category</th>
                        <th className="py-2.5 px-4">Material / Item</th>
                        <th className="py-2.5 px-4">Qty per Pc</th>
                        <th className="py-2.5 px-4">Unit Cost</th>
                        <th className="py-2.5 px-4 text-right">Line Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedDesign.bom || []).map((b, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-semibold text-indigo-600">{b.itemCategory}</td>
                          <td className="py-2.5 px-4 font-bold text-slate-900">{b.itemName}</td>
                          <td className="py-2.5 px-4 text-slate-700">{b.quantityPerGarment} {b.unit}</td>
                          <td className="py-2.5 px-4 text-slate-600">Rs. {b.estimatedUnitCost}</td>
                          <td className="py-2.5 px-4 font-bold text-slate-900 text-right">
                            Rs. {(b.quantityPerGarment * b.estimatedUnitCost).toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Size Grading Specs Sheet */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">Size Grading & Pattern Measurements (Inches)</h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                        <th className="py-2.5 px-4">Size Code</th>
                        <th className="py-2.5 px-4">Chest</th>
                        <th className="py-2.5 px-4">Length</th>
                        <th className="py-2.5 px-4">Shoulder</th>
                        <th className="py-2.5 px-4">Sleeve</th>
                        <th className="py-2.5 px-4">Waist</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {(selectedDesign.sizeGrading || []).map((s, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-bold text-[#4F46E5]">{s.sizeName}</td>
                          <td className="py-2.5 px-4 text-slate-800">{s.chestInches}&quot;</td>
                          <td className="py-2.5 px-4 text-slate-800">{s.lengthInches}&quot;</td>
                          <td className="py-2.5 px-4 text-slate-800">{s.shoulderInches}&quot;</td>
                          <td className="py-2.5 px-4 text-slate-800">{s.sleeveInches}&quot;</td>
                          <td className="py-2.5 px-4 text-slate-800">{s.waistInches}&quot;</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal: Add Design Article */}
        <Modal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          title="Create Design Article & BOM"
          subtitle="Define product specifications, bill of materials, and target pricing"
          maxWidth="max-w-4xl"
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleCreateDesign)} className="space-y-5">
            {/* 1. Article Identity */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Article Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newDesign.title}
                    onChange={(e) => setNewDesign({ ...newDesign, title: e.target.value })}
                    placeholder="e.g. Mens Formal Oxford Shirt Long Sleeve"
                    className="w-full px-3.5 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={newDesign.category}
                    onChange={(e) => setNewDesign({ ...newDesign, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-all"
                  >
                    <option value="">Select a category</option>
                    <option value="Men Kurta">Men Kurta</option>
                    <option value="Casual Shirt">Casual Shirt</option>
                    <option value="Formal Shirts">Formal Shirts</option>
                    <option value="Women 2-Piece">Women 2-Piece</option>
                    <option value="Women 3-Piece">Women 3-Piece</option>
                    <option value="Trousers">Trousers</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Sample Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newDesign.sampleStatus}
                    onChange={(e) => setNewDesign({ ...newDesign, sampleStatus: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-all"
                  >
                    <option value="Draft">Draft (Concept / Development)</option>
                    <option value="Sampling">Sampling (Fitting & Pre-Production)</option>
                    <option value="ProductionReady">Production Ready (Approved for Bulk)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Available Sizes <span className="text-slate-400 font-normal">(Comma-separated)</span>
                  </label>
                  <input
                    type="text"
                    value={newDesign.sizeNames}
                    onChange={(e) => setNewDesign({ ...newDesign, sizeNames: e.target.value })}
                    placeholder="e.g. S, M, L, XL or 32, 34, 36, 38"
                    className="w-full px-3.5 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-all"
                  />
                </div>
              </div>
            </div>

            {/* 2. Production & Costing Parameters Card */}
            <div className="bg-slate-50/80 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Production Costing & Pricing Parameters
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Fabric Cons. (Meters/Pc) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={newDesign.fabricConsumptionPerPiece}
                    onChange={(e) => setNewDesign({ ...newDesign, fabricConsumptionPerPiece: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="e.g. 1.85"
                    className="w-full px-3.5 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Stitching Piece Rate (PKR) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    required
                    value={newDesign.stitchingCostPerPiece}
                    onChange={(e) => setNewDesign({ ...newDesign, stitchingCostPerPiece: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="e.g. 250"
                    className="w-full px-3.5 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Target Retail Price (PKR) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    required
                    value={newDesign.suggestedRetailPrice}
                    onChange={(e) => setNewDesign({ ...newDesign, suggestedRetailPrice: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="e.g. 3850"
                    className="w-full px-3.5 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-all"
                  />
                </div>
              </div>
            </div>

            {/* 3. Dynamic BOM List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Bill of Materials (BOM Items)
                  </label>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/40 text-[#4F46E5] dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800">
                    {newDesign.bom.length} {newDesign.bom.length === 1 ? 'line' : 'lines'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddBOMItem}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] shadow-xs transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Add Line Item</span>
                </button>
              </div>

              {newDesign.bom.length === 0 ? (
                <div className="text-center py-7 px-4 bg-slate-50/60 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  <Layers className="w-7 h-7 text-slate-400 mx-auto mb-2 opacity-80" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    No BOM materials added yet
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Click &quot;+ Add Line Item&quot; to assign fabric rolls, threads, buttons, or trims to this garment.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {newDesign.bom.map((b, idx) => {
                    const lineTotal = (Number(b.quantityPerGarment) || 0) * (Number(b.estimatedUnitCost) || 0);
                    return (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row gap-3 sm:items-center text-xs"
                      >
                        <div className="flex-1 min-w-0">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 sm:hidden">
                            Stock Item
                          </label>
                          <select
                            required
                            value={b.stockItemType && b.stockItemId ? `${b.stockItemType}:${b.stockItemId}` : ''}
                            onChange={(event) => {
                              const [stockItemType, stockItemId] = event.target.value.split(':');
                              const stockItem = stockItems.find((item) =>
                                item.type === stockItemType && item.id === stockItemId
                              );
                              const updated = [...newDesign.bom];
                              updated[idx] = {
                                ...updated[idx],
                                stockItemType: stockItem?.type || '',
                                stockItemId: stockItem?.id || '',
                                itemName: stockItem?.name || '',
                                unit: stockItem?.unit || '',
                                estimatedUnitCost: stockItem?.unitCost || 0,
                              };
                              setNewDesign({ ...newDesign, bom: updated });
                            }}
                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                          >
                            <option value="">Select fabric or trim item...</option>
                            {stockItems.map((item) => (
                              <option key={`${item.type}:${item.id}`} value={`${item.type}:${item.id}`}>
                                [{item.type}] {item.code} — {item.name} ({item.unit})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="w-28 shrink-0">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 sm:hidden">
                              Qty / Garment
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                step="any"
                                min="0.001"
                                placeholder="Qty"
                                required
                                value={b.quantityPerGarment}
                                onChange={(e) => {
                                  const updated = [...newDesign.bom];
                                  updated[idx].quantityPerGarment = e.target.value === '' ? '' : Number(e.target.value);
                                  setNewDesign({ ...newDesign, bom: updated });
                                }}
                                className="w-full px-2.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                              />
                              {b.unit && (
                                <span className="absolute right-2 top-2 text-[10px] font-bold text-slate-400 pointer-events-none">
                                  {b.unit}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="w-28 shrink-0">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1 sm:hidden">
                              Rate (PKR)
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              placeholder="Rate"
                              required
                              value={b.estimatedUnitCost}
                              onChange={(e) => {
                                const updated = [...newDesign.bom];
                                updated[idx].estimatedUnitCost = e.target.value === '' ? '' : Number(e.target.value);
                                setNewDesign({ ...newDesign, bom: updated });
                              }}
                              className="w-full px-2.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5]"
                            />
                          </div>

                          <div className="w-24 text-right shrink-0 hidden sm:block">
                            <span className="text-[10px] text-slate-400 block font-medium">Subtotal</span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              Rs. {lineTotal.toLocaleString()}
                            </span>
                          </div>

                          <button
                            type="button"
                            aria-label="Remove BOM Line"
                            onClick={() => handleRemoveBOMItem(idx)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Tech Pack Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Tech Pack Notes & Instructions <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                rows={3}
                value={newDesign.techPackNotes}
                onChange={(e) => setNewDesign({ ...newDesign, techPackNotes: e.target.value })}
                placeholder="Enter technical specifications, seam allowances, stitching instructions, label placement, or packaging notes..."
                className="w-full px-3.5 py-2.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20 focus:border-[#4F46E5] transition-all"
              />
            </div>

            {/* 5. Footer Actions Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                <span>Total BOM Items: </span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{newDesign.bom.length}</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm transition-all cursor-pointer"
                >
                  Save Article & BOM
                </button>
              </div>
            </div>
          </form>
        </Modal>
        <RecordEditModal
          isOpen={Boolean(editingDesign)}
          onClose={() => setEditingDesign(null)}
          record={editingDesign}
          title={`Edit Design: ${editingDesign?.designCode || ''}`}
          fields={getDesignEditFields(stockItems)}
          onSave={handleUpdateDesign}
        />
        <RecordAttachments
          module="design"
          record={attachmentDesign}
          onClose={() => setAttachmentDesign(null)}
        />

        {/* View Design Article Modal */}
        <RecordViewModal
          isOpen={Boolean(viewDesign)}
          onClose={() => setViewDesign(null)}
          record={viewDesign}
          title={`Design: ${viewDesign?.designCode || ''} — ${viewDesign?.title || ''}`}
          subtitle={`Category: ${viewDesign?.category || ''} • Status: ${viewDesign?.sampleStatus || ''}`}
          maxWidth="max-w-4xl"
          fields={[
            { name: 'designCode', label: 'Design Code', type: 'text' },
            { name: 'title', label: 'Article Title', type: 'text' },
            { name: 'category', label: 'Category', type: 'text' },
            { name: 'sampleStatus', label: 'Sample Status', type: 'text' },
            { name: 'season', label: 'Season', type: 'text' },
            { name: 'designerName', label: 'Designer', type: 'text' },
            { name: 'barcode', label: 'Barcode', type: 'text' },
            { name: 'fabricConsumptionPerPiece', label: 'Fabric Consumption / Piece (m)', type: 'text' },
            { name: 'cuttingCostPerPiece', label: 'Cutting Cost / Piece', type: 'money' },
            { name: 'stitchingCostPerPiece', label: 'Stitching Cost / Piece', type: 'money' },
            { name: 'finishingCostPerPiece', label: 'Finishing Cost / Piece', type: 'money' },
            { name: 'overheadCostPerPiece', label: 'Overhead Cost / Piece', type: 'money' },
            { name: 'estimatedFactoryCost', label: 'Total Factory Cost', type: 'money' },
            { name: 'suggestedWholesalePrice', label: 'Suggested Wholesale Price', type: 'money' },
            { name: 'suggestedRetailPrice', label: 'Suggested Retail Price', type: 'money' },
            { name: 'techPackNotes', label: 'Tech Pack Notes', type: 'text' },
            { name: 'finishedGoodsStock', label: 'Finished Goods Stock', type: 'text' },
            {
              name: 'bom',
              label: 'Bill of Materials',
              type: 'array',
              itemFields: [
                { name: 'stockItemType', label: 'Material Type' },
                { name: 'stockItemCode', label: 'Item Code' },
                { name: 'itemName', label: 'Item Name' },
                { name: 'quantityPerGarment', label: 'Qty per Garment', type: 'text' },
                { name: 'unit', label: 'Unit' },
                { name: 'estimatedUnitCost', label: 'Unit Cost', type: 'money' },
              ],
            },
            {
              name: 'sizeGrading',
              label: 'Size Grading',
              type: 'array',
              itemFields: [
                { name: 'sizeName', label: 'Size Name' },
                { name: 'chestInches', label: 'Chest (in)', type: 'text' },
                { name: 'lengthInches', label: 'Length (in)', type: 'text' },
                { name: 'shoulderInches', label: 'Shoulder (in)', type: 'text' },
                { name: 'sleeveInches', label: 'Sleeve (in)', type: 'text' },
                { name: 'waistInches', label: 'Waist (in)', type: 'text' },
              ],
            },
          ]}
        />
      </div>
    </Layout>
  );
}

function getDesignEditFields(stockItems) {
  return [
  { name: 'title', label: 'Article Title', required: true },
  { name: 'season', label: 'Season' },
  { name: 'category', label: 'Category' },
  { name: 'sampleStatus', label: 'Sample Status', type: 'select', required: true, options: ['Draft', 'Sampling', 'ProductionReady'] },
  { name: 'designerName', label: 'Designer' },
  { name: 'fabricConsumptionPerPiece', label: 'Fabric Consumption / Piece', type: 'number', min: 0, step: 'any' },
  { name: 'cuttingCostPerPiece', label: 'Cutting Cost / Piece', type: 'number', min: 0, step: 'any' },
  { name: 'stitchingCostPerPiece', label: 'Stitching Cost / Piece', type: 'number', min: 0, step: 'any' },
  { name: 'finishingCostPerPiece', label: 'Finishing Cost / Piece', type: 'number', min: 0, step: 'any' },
  { name: 'overheadCostPerPiece', label: 'Overhead Cost / Piece', type: 'number', min: 0, step: 'any' },
  { name: 'suggestedWholesalePrice', label: 'Wholesale Price', type: 'number', min: 0, step: 'any' },
  { name: 'suggestedRetailPrice', label: 'Retail Price', type: 'number', min: 0, step: 'any' },
  { name: 'techPackNotes', label: 'Tech Pack Notes', type: 'textarea' },
  {
    name: 'bom',
    label: 'Bill of Materials',
    type: 'array',
    itemLabel: 'material',
    itemFields: [
      {
        name: 'stockItemType',
        label: 'Material Type',
        type: 'select',
        required: true,
        options: ['Fabric', 'Trim'],
        resetFields: ['stockItemId'],
      },
      {
        name: 'stockItemId',
        label: 'Stock Item',
        type: 'select',
        required: true,
        options: (item) => stockItems
          .filter((stockItem) => stockItem.type === item.stockItemType)
          .map((stockItem) => ({
            value: stockItem.id,
            label: `${stockItem.code} · ${stockItem.name}`,
          })),
      },
      { name: 'quantityPerGarment', label: 'Quantity per Garment', type: 'number', required: true, min: 0, step: 'any' },
    ],
  },
  {
    name: 'sizeGrading',
    label: 'Size Grading',
    type: 'array',
    itemLabel: 'size',
    itemFields: [{ name: 'sizeName', label: 'Size Name', required: true }],
  },
  ];
}
