'use client';

import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import {
  Package,
  Plus,
  Sliders,
  AlertTriangle,
  Search,
  CheckCircle,
  Tag,
  Warehouse,
} from 'lucide-react';

export default function TrimsInventoryPage() {
  const { addToast } = useAuth();
  const [trims, setTrims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [search, setSearch] = useState('');

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [selectedTrim, setSelectedTrim] = useState(null);

  // New Trim Form
  const [newTrim, setNewTrim] = useState({
    name: '',
    category: '',
    variant: '',
    color: '',
    unit: '',
    currentStock: '',
    minimumStock: '',
    unitCost: '',
    binLocation: '',
  });

  // Stock Adjustment Form
  const [adjustmentForm, setAdjustmentForm] = useState({
    quantityChange: '',
    reason: '',
  });

  const fetchData = async () => {
    try {
      const res = await fetch('/api/trims');
      const json = await res.json();
      if (json.success) {
        setTrims(json.data.trims || []);
      }
    } catch (err) {
      console.error('Error fetching trims:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, []);

  const handleCreateTrim = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/trims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_TRIM', ...newTrim }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create trim', 'error');
        return;
      }
      addToast('Trim item created successfully!', 'success');
      setIsAddOpen(false);
      fetchData();
    } catch {
      addToast('Error saving trim', 'error');
    }
  };

  const openAdjustModal = (trim) => {
    setSelectedTrim(trim);
    setAdjustmentForm({ quantityChange: 0, reason: 'Physical cycle count adjustment' });
    setIsAdjustOpen(true);
  };

  const handleAdjustStock = async (e) => {
    e.preventDefault();
    if (!selectedTrim) return;

    try {
      const res = await fetch('/api/trims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ADJUST_STOCK',
          trimId: selectedTrim._id,
          quantityChange: Number(adjustmentForm.quantityChange),
          reason: adjustmentForm.reason,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Stock adjustment failed', 'error');
        return;
      }
      addToast(`Stock for ${selectedTrim.name} adjusted!`, 'success');
      setIsAdjustOpen(false);
      fetchData();
    } catch {
      addToast('Error adjusting stock', 'error');
    }
  };

  const filteredTrims = trims.filter((t) => {
    const matchesCat = filterCategory === 'ALL' || t.category === filterCategory;
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.trimCode.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const categories = ['ALL', 'Thread', 'Buttons', 'Zippers', 'Labels & Tags', 'Polybags & Packaging', 'Lace'];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-violet-50 text-[#7C3AED] border border-violet-100">
                ACCESSORIES & PACKAGING
              </span>
              <span className="text-xs text-slate-500">• Trims Inventory</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Trims, Threads & Fasteners Store
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Manage threads, antique buttons, concealed zippers, damask labels, and BOPP garment packaging
            </p>
          </div>

          <button
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Trim Item</span>
          </button>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setFilterCategory(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  filterCategory === c
                    ? 'bg-[#172554] text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Trims & Codes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
            />
          </div>
        </div>

        {/* Trims Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTrims.map((trim) => {
            const isLowStock = trim.currentStock <= trim.minimumStock;

            return (
              <div
                key={trim._id}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between hover:border-indigo-300 transition-all"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-mono font-bold text-[#4F46E5]">{trim.trimCode}</span>
                    {isLowStock ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Reorder</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        <CheckCircle className="w-3 h-3" />
                        <span>In Stock</span>
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 leading-snug">{trim.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {trim.variant} {trim.color && `• ${trim.color}`}
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 bg-slate-50 rounded-xl">
                      <span className="text-slate-400 block text-[10px]">Current Stock</span>
                      <span className={`text-base font-black ${isLowStock ? 'text-amber-600' : 'text-slate-900'}`}>
                        {trim.currentStock} {trim.unit}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 rounded-xl">
                      <span className="text-slate-400 block text-[10px]">Min. Threshold</span>
                      <span className="text-base font-bold text-slate-700">
                        {trim.minimumStock} {trim.unit}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <span>Rate: Rs. {trim.unitCost}/{trim.unit}</span>
                    <span className="font-mono">{trim.binLocation}</span>
                  </div>
                </div>

                <button
                  onClick={() => openAdjustModal(trim)}
                  className="mt-4 flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Adjust Physical Count</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Modal: Add Trim Item */}
        <Modal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          title="Create Trim Item"
          subtitle="Add buttons, threads, zippers, hangtags, or packaging to inventory"
        >
          <form onSubmit={handleCreateTrim} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Item Name</label>
              <input
                type="text"
                required
                value={newTrim.name}
                onChange={(e) => setNewTrim({ ...newTrim, name: e.target.value })}
                placeholder="Trim item name"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                <select
                  value={newTrim.category}
                  onChange={(e) => setNewTrim({ ...newTrim, category: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="Thread">Thread</option>
                  <option value="Buttons">Buttons</option>
                  <option value="Zippers">Zippers</option>
                  <option value="Labels & Tags">Labels & Tags</option>
                  <option value="Polybags & Packaging">Polybags & Packaging</option>
                  <option value="Lace">Lace</option>
                  <option value="Tassels">Tassels</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Unit of Measure</label>
                <select
                  value={newTrim.unit}
                  onChange={(e) => setNewTrim({ ...newTrim, unit: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="Pieces">Pieces</option>
                  <option value="Cones">Cones</option>
                  <option value="Gross">Gross (144 pcs)</option>
                  <option value="Dozens">Dozens</option>
                  <option value="Yards">Yards</option>
                  <option value="Packets">Packets</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Opening Stock</label>
                <input
                  type="number"
                  required
                  value={newTrim.currentStock}
                  onChange={(e) => setNewTrim({ ...newTrim, currentStock: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Min. Alert Level</label>
                <input
                  type="number"
                  required
                  value={newTrim.minimumStock}
                  onChange={(e) => setNewTrim({ ...newTrim, minimumStock: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Unit Cost (PKR)</label>
                <input
                  type="number"
                  required
                  value={newTrim.unitCost}
                  onChange={(e) => setNewTrim({ ...newTrim, unitCost: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
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
                Save Trim
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Adjust Stock */}
        <Modal
          isOpen={isAdjustOpen}
          onClose={() => setIsAdjustOpen(false)}
          title={`Adjust Stock: ${selectedTrim?.name}`}
          subtitle={`Current Recorded Balance: ${selectedTrim?.currentStock} ${selectedTrim?.unit}`}
        >
          <form onSubmit={handleAdjustStock} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Quantity Adjustment (+ Addition or - Deduction)
              </label>
              <input
                type="number"
                required
                value={adjustmentForm.quantityChange}
                onChange={(e) => setAdjustmentForm({ ...adjustmentForm, quantityChange: Number(e.target.value) })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Resulting stock: {(selectedTrim?.currentStock || 0) + (Number(adjustmentForm.quantityChange) || 0)} {selectedTrim?.unit}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Adjustment</label>
              <input
                type="text"
                required
                value={adjustmentForm.reason}
                onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAdjustOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm"
              >
                Post Adjustment
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </Layout>
  );
}
