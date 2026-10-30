'use client';

import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import {
  Layers,
  Plus,
  ArrowRightLeft,
  Barcode,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  History,
  Scissors,
  Droplets,
  PackageCheck,
  Package,
} from 'lucide-react';

export default function FabricInventoryPage() {
  const { addToast, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchRoll, setSearchRoll] = useState('');
  const [activeTab, setActiveTab] = useState('rolls'); // 'rolls', 'catalog', 'movements'

  // Modals
  const [isAddRollOpen, setIsAddRollOpen] = useState(false);
  const [isAddFabricOpen, setIsAddFabricOpen] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [selectedRoll, setSelectedRoll] = useState(null);

  // Add Fabric Variety Form
  const [newFabric, setNewFabric] = useState({
    name: '',
    fabricType: '',
    composition: '',
    weave: '',
    widthInches: '',
    defaultGsm: '',
    averageCostPerMeter: '',
    reorderLevelMeters: '',
    supplierName: '',
  });

  // Add Roll Form
  const [newRoll, setNewRoll] = useState({
    fabricId: '',
    initialMeters: '',
    widthInches: '',
    weightKg: '',
    gsm: '',
    warehouseLocation: '',
    lotNumber: '',
  });

  // Issue Roll Form
  const [issueForm, setIssueForm] = useState({
    metersToConsume: '',
    destinationModule: '',
    referenceDoc: '',
    operator: '',
  });

  const fetchData = async () => {
    try {
      const res = await fetch('/api/fabric');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        if (json.data.fabrics?.length > 0) {
          setNewRoll((prev) => ({
            ...prev,
            fabricId: prev.fabricId || json.data.fabrics[0]._id,
          }));
        }
      }
    } catch (err) {
      console.error('Error fetching fabrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, []);

  const handleCreateFabric = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/fabric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_FABRIC', ...newFabric }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create fabric', 'error');
        return;
      }
      addToast(`Fabric ${json.data.fabric?.name} created successfully!`, 'success');
      setIsAddFabricOpen(false);
      fetchData();
    } catch {
      addToast('Error saving fabric', 'error');
    }
  };

  const handleAddRoll = async (e) => {
    e.preventDefault();
    if (!newRoll.fabricId) {
      addToast('Please select or create a fabric variety first', 'error');
      return;
    }
    try {
      const res = await fetch('/api/fabric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ADD_ROLL', ...newRoll }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to add roll', 'error');
        return;
      }
      addToast(`Roll ${json.data.roll?.rollNumber} added successfully!`, 'success');
      setIsAddRollOpen(false);
      fetchData();
    } catch {
      addToast('Error saving roll', 'error');
    }
  };

  const openIssueModal = (roll) => {
    setSelectedRoll(roll);
    setIssueForm({
      metersToConsume: '',
      destinationModule: '',
      referenceDoc: '',
      operator: user?.name || '',
    });
    setIsIssueModalOpen(true);
  };

  const handleIssueRoll = async (e) => {
    e.preventDefault();
    if (!selectedRoll) return;

    try {
      const res = await fetch('/api/fabric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ISSUE_ROLL',
          fabricCode: selectedRoll.fabricCode,
          rollNumber: selectedRoll.rollNumber,
          metersToConsume: issueForm.metersToConsume,
          destinationModule: issueForm.destinationModule,
          referenceDoc: issueForm.referenceDoc,
          operator: issueForm.operator,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Material issue failed', 'error');
        return;
      }
      addToast(`Issued ${issueForm.metersToConsume}m from ${selectedRoll.rollNumber} to ${issueForm.destinationModule}`, 'success');
      setIsIssueModalOpen(false);
      fetchData();
    } catch {
      addToast('Error issuing fabric', 'error');
    }
  };

  const fabrics = data?.fabrics || [];
  const rolls = (data?.rolls || []).filter(
    (r) =>
      r.rollNumber?.toLowerCase().includes(searchRoll.toLowerCase()) ||
      r.barcode?.includes(searchRoll) ||
      r.fabricName?.toLowerCase().includes(searchRoll.toLowerCase())
  );

  return (
    <Layout>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/90 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-100">
                RAW MATERIAL INVENTORY
              </span>
              <span className="text-xs text-slate-500 font-medium">• Kora Kapra & Finished Rolls</span>
            </div>
            <h1 className="text-xl font-black text-slate-900 mt-1.5 tracking-tight">
              Fabric Roll Tracking & Stock Ledger
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Trace individual fabric rolls by barcode, GSM, warehouse rack, and issue to cutting/dyeing
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsAddFabricOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-md shadow-slate-900/10 cursor-pointer active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Fabric Variety</span>
            </button>

            <button
              onClick={() => {
                if (fabrics.length === 0) {
                  addToast('Please add a Fabric Variety first', 'info');
                  setIsAddFabricOpen(true);
                } else {
                  setIsAddRollOpen(true);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 cursor-pointer active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Receive New Roll</span>
            </button>
          </div>
        </div>

        {/* Tab & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('rolls')}
              className={`px-3.5 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'rolls'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Barcode className="w-4 h-4" />
              <span>Active Fabric Rolls ({rolls.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-3.5 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'catalog'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Fabric Catalog ({fabrics.length})</span>
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Roll # or Barcode..."
              value={searchRoll}
              onChange={(e) => setSearchRoll(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 font-medium"
            />
          </div>
        </div>

        {/* Tab 1: Rolls Register */}
        {activeTab === 'rolls' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            {rolls.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                  <Barcode className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">No Fabric Rolls Registered</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Add your fabric varieties and receive your physical rolls into the warehouse to start cutting & manufacturing.
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    onClick={() => setIsAddFabricOpen(true)}
                    className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white cursor-pointer hover:bg-slate-800"
                  >
                    + Add Fabric Master
                  </button>
                  <button
                    onClick={() => {
                      if (fabrics.length === 0) {
                        setIsAddFabricOpen(true);
                      } else {
                        setIsAddRollOpen(true);
                      }
                    }}
                    className="px-3 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white cursor-pointer hover:bg-indigo-700"
                  >
                    + Receive First Roll
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold">
                      <th className="py-3 px-4">Roll #</th>
                      <th className="py-3 px-4">Barcode</th>
                      <th className="py-3 px-4">Fabric Spec</th>
                      <th className="py-3 px-4">Initial / Remaining</th>
                      <th className="py-3 px-4">Rack & Bin</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rolls.map((r) => (
                      <tr key={r._id || r.rollNumber} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{r.rollNumber}</td>
                        <td className="py-3 px-4 font-mono text-slate-500">{r.barcode}</td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-800 block">{r.fabricName}</span>
                          <span className="text-[10px] text-slate-400">
                            {r.widthInches}&quot; • {r.gsm} GSM • Lot: {r.lotNumber}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{r.remainingMeters}m</span>
                            <span className="text-[10px] text-slate-400">/ {r.initialMeters}m</span>
                          </div>
                          <div className="w-24 bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden">
                            <div
                              className="bg-indigo-600 h-1.5 rounded-full"
                              style={{ width: `${Math.round((r.remainingMeters / r.initialMeters) * 100)}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{r.warehouseLocation}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              r.status === 'Available'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : r.status === 'Exhausted'
                                ? 'bg-slate-100 text-slate-500'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {r.remainingMeters > 0 && (
                            <button
                              onClick={() => openIssueModal(r)}
                              className="px-2.5 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            >
                              Issue Material
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Catalog Master */}
        {activeTab === 'catalog' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-900">Fabric Catalog & Varieties</h3>
              <button
                onClick={() => setIsAddFabricOpen(true)}
                className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 cursor-pointer shadow-sm"
              >
                + Add Variety
              </button>
            </div>

            {fabrics.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Layers className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-600">No fabric varieties found</p>
                <p className="text-[11px] text-slate-400">Click &apos;+ Add Variety&apos; to define fabrics.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {fabrics.map((f) => (
                  <div key={f._id} className="p-4 rounded-xl border border-slate-200 hover:border-indigo-300 transition-all bg-slate-50/50">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-bold text-slate-900 block">{f.name}</span>
                        <span className="text-[11px] font-mono text-indigo-600">{f.fabricCode}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-700">Rs. {f.averageCostPerMeter}/m</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-200/60 text-[11px] text-slate-500 space-y-1">
                      <p>Type: {f.fabricType} • {f.composition}</p>
                      <p>Weave: {f.weave} • Width: {f.widthInches}&quot;</p>
                      <p className="font-semibold text-slate-700">Available: {f.totalAvailableMeters || 0} Meters</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modal: Add Fabric Variety */}
        <Modal
          isOpen={isAddFabricOpen}
          onClose={() => setIsAddFabricOpen(false)}
          title="Add New Fabric Variety"
          subtitle="Define fabric master specification in the central catalog"
        >
          <form onSubmit={handleCreateFabric} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Fabric Title</label>
              <input
                type="text"
                required
                value={newFabric.name}
                onChange={(e) => setNewFabric({ ...newFabric, name: e.target.value })}
                placeholder="Fabric name"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Fabric Category/Type</label>
                <input
                  type="text"
                  required
                  value={newFabric.fabricType}
                  onChange={(e) => setNewFabric({ ...newFabric, fabricType: e.target.value })}
                  placeholder="Fabric type"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Composition</label>
                <input
                  type="text"
                  value={newFabric.composition}
                  onChange={(e) => setNewFabric({ ...newFabric, composition: e.target.value })}
                  placeholder="Composition"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cost Per Meter (PKR)</label>
                <input
                  type="number"
                  required
                  value={newFabric.averageCostPerMeter}
                  onChange={(e) => setNewFabric({ ...newFabric, averageCostPerMeter: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Width (Inches)</label>
                <input
                  type="number"
                  value={newFabric.widthInches}
                  onChange={(e) => setNewFabric({ ...newFabric, widthInches: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reorder Level (m)</label>
                <input
                  type="number"
                  value={newFabric.reorderLevelMeters}
                  onChange={(e) => setNewFabric({ ...newFabric, reorderLevelMeters: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddFabricOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                Save Fabric
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Add New Roll */}
        <Modal
          isOpen={isAddRollOpen}
          onClose={() => setIsAddRollOpen(false)}
          title="Register Incoming Fabric Roll"
          subtitle="Generate roll barcode ticket and assign warehouse rack bin"
        >
          <form onSubmit={handleAddRoll} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Fabric Quality</label>
              <select
                value={newRoll.fabricId}
                onChange={(e) => setNewRoll({ ...newRoll, fabricId: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 cursor-pointer"
              >
                {fabrics.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name} ({f.fabricType})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Initial Meters</label>
                <input
                  type="number"
                  required
                  value={newRoll.initialMeters}
                  onChange={(e) => setNewRoll({ ...newRoll, initialMeters: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Width (Inches)</label>
                <input
                  type="number"
                  value={newRoll.widthInches}
                  onChange={(e) => setNewRoll({ ...newRoll, widthInches: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">GSM</label>
                <input
                  type="number"
                  value={newRoll.gsm}
                  onChange={(e) => setNewRoll({ ...newRoll, gsm: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Lot / Batch Number</label>
                <input
                  type="text"
                  value={newRoll.lotNumber}
                  onChange={(e) => setNewRoll({ ...newRoll, lotNumber: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Warehouse Bin</label>
                <input
                  type="text"
                  value={newRoll.warehouseLocation}
                  onChange={(e) => setNewRoll({ ...newRoll, warehouseLocation: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddRollOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                Save Roll
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Issue Roll */}
        <Modal
          isOpen={isIssueModalOpen}
          onClose={() => setIsIssueModalOpen(false)}
          title={`Issue Fabric Roll: ${selectedRoll?.rollNumber}`}
          subtitle={`Available Balance: ${selectedRoll?.remainingMeters} Meters`}
        >
          <form onSubmit={handleIssueRoll} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Meters to Issue</label>
                <input
                  type="number"
                  required
                  max={selectedRoll?.remainingMeters}
                  value={issueForm.metersToConsume}
                  onChange={(e) => setIssueForm({ ...issueForm, metersToConsume: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Destination</label>
                <select
                  value={issueForm.destinationModule}
                  onChange={(e) => setIssueForm({ ...issueForm, destinationModule: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600 cursor-pointer"
                >
                  <option value="Cutting">Cutting Section</option>
                  <option value="Dyeing">Dyeing & Color Processing</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reference Doc / Order #</label>
                <input
                  type="text"
                  required
                  value={issueForm.referenceDoc}
                  onChange={(e) => setIssueForm({ ...issueForm, referenceDoc: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Operator Name</label>
                <input
                  type="text"
                  required
                  value={issueForm.operator}
                  onChange={(e) => setIssueForm({ ...issueForm, operator: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-600"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsIssueModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                Confirm Issue
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </Layout>
  );
}
