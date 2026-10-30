'use client';

import React, { useCallback, useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
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
} from 'lucide-react';

export default function DesignBOMPage() {
  const { addToast } = useAuth();
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDesign, setSelectedDesign] = useState(null);
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
      const res = await fetch('/api/design');
      const json = await res.json();
      if (json.success) {
        setDesigns(json.data.designs || []);
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
      const res = await fetch('/api/design', {
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

  const handleAddBOMItem = () => {
    setNewDesign({
      ...newDesign,
      bom: [
        ...newDesign.bom,
        { itemCategory: '', itemName: '', quantityPerGarment: '', unit: '', estimatedUnitCost: '' },
      ],
    });
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
          maxWidth="max-w-3xl"
        >
          <form onSubmit={handleCreateDesign} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Article Title</label>
                <input
                  type="text"
                  required
                  value={newDesign.title}
                  onChange={(e) => setNewDesign({ ...newDesign, title: e.target.value })}
                  placeholder="Design title"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                <select
                  value={newDesign.category}
                  onChange={(e) => setNewDesign({ ...newDesign, category: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="">Select a category</option>
                  <option value="Men Kurta">Men Kurta</option>
                  <option value="Casual Shirt">Casual Shirt</option>
                  <option value="Women 2-Piece">Women 2-Piece</option>
                  <option value="Women 3-Piece">Women 3-Piece</option>
                  <option value="Trousers">Trousers</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Sample Status</label>
                <select
                  value={newDesign.sampleStatus}
                  onChange={(e) => setNewDesign({ ...newDesign, sampleStatus: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="Draft">Draft</option>
                  <option value="Sampling">Sampling</option>
                  <option value="ProductionReady">Production Ready</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Available Sizes</label>
                <input
                  type="text"
                  value={newDesign.sizeNames}
                  onChange={(e) => setNewDesign({ ...newDesign, sizeNames: e.target.value })}
                  placeholder="Comma-separated sizes"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Fabric Cons. (m)</label>
                <input
                  type="number"
                  step="0.05"
                  required
                  value={newDesign.fabricConsumptionPerPiece}
                  onChange={(e) => setNewDesign({ ...newDesign, fabricConsumptionPerPiece: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Stitching Piece Rate (Rs)</label>
                <input
                  type="number"
                  required
                  value={newDesign.stitchingCostPerPiece}
                  onChange={(e) => setNewDesign({ ...newDesign, stitchingCostPerPiece: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Retail Price</label>
                <input
                  type="number"
                  required
                  value={newDesign.suggestedRetailPrice}
                  onChange={(e) => setNewDesign({ ...newDesign, suggestedRetailPrice: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            {/* Dynamic BOM list */}
            <div className="pt-2">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-slate-700">Bill of Materials (BOM Items)</label>
                <button
                  type="button"
                  onClick={handleAddBOMItem}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#4F46E5]"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Add Line Item</span>
                </button>
              </div>

              <div className="space-y-2">
                {newDesign.bom.map((b, idx) => (
                  <div key={idx} className="flex gap-2 items-center bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                    <input
                      type="text"
                      placeholder="Material name"
                      required
                      value={b.itemName}
                      onChange={(e) => {
                        const updated = [...newDesign.bom];
                        updated[idx].itemName = e.target.value;
                        setNewDesign({ ...newDesign, bom: updated });
                      }}
                      className="flex-2 px-2.5 py-1.5 bg-white border border-slate-200 rounded focus:outline-none"
                    />

                    <input
                      type="number"
                      step="0.1"
                      placeholder="Qty"
                      required
                      value={b.quantityPerGarment}
                      onChange={(e) => {
                        const updated = [...newDesign.bom];
                        updated[idx].quantityPerGarment = Number(e.target.value);
                        setNewDesign({ ...newDesign, bom: updated });
                      }}
                      className="w-20 px-2 py-1.5 bg-white border border-slate-200 rounded focus:outline-none"
                    />

                    <input
                      type="number"
                      placeholder="Rate"
                      required
                      value={b.estimatedUnitCost}
                      onChange={(e) => {
                        const updated = [...newDesign.bom];
                        updated[idx].estimatedUnitCost = Number(e.target.value);
                        setNewDesign({ ...newDesign, bom: updated });
                      }}
                      className="w-24 px-2 py-1.5 bg-white border border-slate-200 rounded focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tech Pack Notes</label>
              <textarea
                rows={2}
                value={newDesign.techPackNotes}
                onChange={(e) => setNewDesign({ ...newDesign, techPackNotes: e.target.value })}
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
                Save Article & BOM
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </Layout>
  );
}
