'use client';

import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import {
  Wrench,
  Plus,
  Truck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  DollarSign,
  Fuel,
} from 'lucide-react';

export default function AssetsFleetPage() {
  const { addToast } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('assets'); // 'assets', 'trips'

  // Modals
  const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);
  const [isLogMaintenanceOpen, setIsLogMaintenanceOpen] = useState(false);
  const [isLogTripOpen, setIsLogTripOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);

  // New Asset Form
  const [newAsset, setNewAsset] = useState({
    assetName: '',
    category: '',
    brandModel: '',
    originalCostPKR: '',
    locationFloor: '',
  });

  // Maintenance Form
  const [maintForm, setMaintForm] = useState({
    workDone: '',
    costPKR: '',
    technician: '',
  });

  // Trip Form
  const [tripForm, setTripForm] = useState({
    vehicleRegistrationNumber: '',
    driverName: '',
    startLocation: '',
    destinationLocation: '',
    purpose: '',
    kilometersTraveled: '',
    fuelCostPKR: '',
  });

  const fetchData = async () => {
    try {
      const res = await fetch('/api/assets');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (err) {
      console.error('Error fetching assets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, []);

  const handleCreateAsset = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_ASSET', ...newAsset }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create asset', 'error');
        return;
      }
      addToast('Asset registered into fixed assets ledger!', 'success');
      setIsAddAssetOpen(false);
      fetchData();
    } catch {
      addToast('Error saving asset', 'error');
    }
  };

  const openMaintModal = (asset) => {
    setSelectedAsset(asset);
    setIsLogMaintenanceOpen(true);
  };

  const handleLogMaintenance = async (e) => {
    e.preventDefault();
    if (!selectedAsset) return;

    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'LOG_MAINTENANCE',
          assetId: selectedAsset._id,
          ...maintForm,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to log maintenance', 'error');
        return;
      }
      addToast('Maintenance log updated!', 'success');
      setIsLogMaintenanceOpen(false);
      fetchData();
    } catch {
      addToast('Error logging maintenance', 'error');
    }
  };

  const handleLogTrip = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'LOG_TRIP', ...tripForm }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to log trip', 'error');
        return;
      }
      addToast('Vehicle trip & fuel consumption logged!', 'success');
      setIsLogTripOpen(false);
      fetchData();
    } catch {
      addToast('Error logging trip', 'error');
    }
  };

  const assets = data?.assets || [];
  const trips = data?.trips || [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                EQUIPMENT & FLEET
              </span>
              <span className="text-xs text-slate-500">• Fixed Assets Register</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Plant Machinery, Maintenance & Delivery Fleet
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Register company assets, maintenance activity and fleet usage
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsLogTripOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Log Fleet Trip</span>
            </button>

            <button
              onClick={() => setIsAddAssetOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Machine</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('assets')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'assets'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>Fixed Assets Register ({assets.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('trips')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'trips'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Vehicle Trips & Fuel ({trips.length})</span>
          </button>
        </div>

        {/* Tab 1: Fixed Assets */}
        {activeTab === 'assets' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assets.map((asset) => (
              <div key={asset._id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-mono font-bold text-[#4F46E5]">{asset.assetCode}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {asset.status}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 mt-1">{asset.assetName}</h3>
                  <p className="text-xs text-slate-500">{asset.brandModel} • {asset.locationFloor}</p>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
                    <div className="p-2.5 bg-slate-50 rounded-xl">
                      <span className="text-slate-400 block text-[10px]">Book Value</span>
                      <span className="font-black text-slate-900">Rs. {asset.currentBookValuePKR?.toLocaleString()}</span>
                    </div>

                    <div className="p-2.5 bg-slate-50 rounded-xl">
                      <span className="text-slate-400 block text-[10px]">Service Logs</span>
                      <span className="font-bold text-slate-700">{asset.maintenanceHistory?.length || 0} Records</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => openMaintModal(asset)}
                  className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Log Service Maintenance</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Tab 2: Vehicle Trips */}
        {activeTab === 'trips' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Garment Delivery Vehicle Logbook & Fuel Expenses</h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Vehicle #</th>
                    <th className="py-3 px-4">Driver</th>
                    <th className="py-3 px-4">Route</th>
                    <th className="py-3 px-4">Distance</th>
                    <th className="py-3 px-4">Fuel Expense</th>
                    <th className="py-3 px-4">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trips.map((t) => (
                    <tr key={t._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {new Date(t.tripDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{t.vehicleRegistrationNumber}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{t.driverName}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {t.startLocation} → {t.destinationLocation}
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium">{t.kilometersTraveled} km</td>
                      <td className="py-3 px-4 font-bold text-red-600">Rs. {t.fuelCostPKR?.toLocaleString()}</td>
                      <td className="py-3 px-4 text-slate-600">{t.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Add Machine */}
        <Modal
          isOpen={isAddAssetOpen}
          onClose={() => setIsAddAssetOpen(false)}
          title="Register Fixed Plant Asset"
          subtitle="Add sewing machines, straight knives, boilers, or fleet vans"
        >
          <form onSubmit={handleCreateAsset} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Equipment Name</label>
              <input
                type="text"
                required
                value={newAsset.assetName}
                onChange={(e) => setNewAsset({ ...newAsset, assetName: e.target.value })}
                placeholder="Asset name"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                <select
                  value={newAsset.category}
                  onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="Stitching Machine">Stitching Machine</option>
                  <option value="Cutting Equipment">Cutting Equipment</option>
                  <option value="Dyeing Vat">Dyeing Vat</option>
                  <option value="Finishing & Pressing">Finishing & Pressing</option>
                  <option value="Factory Generator/Boiler">Factory Boiler/Generator</option>
                  <option value="Delivery Vehicle">Delivery Vehicle</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Brand / Model</label>
                <input
                  type="text"
                  value={newAsset.brandModel}
                  onChange={(e) => setNewAsset({ ...newAsset, brandModel: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Original Cost (PKR)</label>
                <input
                  type="number"
                  required
                  value={newAsset.originalCostPKR}
                  onChange={(e) => setNewAsset({ ...newAsset, originalCostPKR: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Floor Location</label>
                <input
                  type="text"
                  value={newAsset.locationFloor}
                  onChange={(e) => setNewAsset({ ...newAsset, locationFloor: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddAssetOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm"
              >
                Save Asset
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Log Maintenance */}
        <Modal
          isOpen={isLogMaintenanceOpen}
          onClose={() => setIsLogMaintenanceOpen(false)}
          title={`Log Maintenance: ${selectedAsset?.assetName}`}
          subtitle={`Asset Code: ${selectedAsset?.assetCode}`}
        >
          <form onSubmit={handleLogMaintenance} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Maintenance / Repair Description</label>
              <textarea
                rows={2}
                required
                value={maintForm.workDone}
                onChange={(e) => setMaintForm({ ...maintForm, workDone: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Repair Cost (PKR)</label>
                <input
                  type="number"
                  value={maintForm.costPKR}
                  onChange={(e) => setMaintForm({ ...maintForm, costPKR: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Technician / Mechanic</label>
                <input
                  type="text"
                  value={maintForm.technician}
                  onChange={(e) => setMaintForm({ ...maintForm, technician: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsLogMaintenanceOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-black rounded-lg shadow-sm"
              >
                Record Service
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Log Trip */}
        <Modal
          isOpen={isLogTripOpen}
          onClose={() => setIsLogTripOpen(false)}
          title="Log Fleet Vehicle Delivery Trip"
          subtitle="Record kilometers, fuel expenses, and purpose"
        >
          <form onSubmit={handleLogTrip} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Vehicle Registration #</label>
                <input
                  type="text"
                  required
                  value={tripForm.vehicleRegistrationNumber}
                  onChange={(e) => setTripForm({ ...tripForm, vehicleRegistrationNumber: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Driver Name</label>
                <input
                  type="text"
                  required
                  value={tripForm.driverName}
                  onChange={(e) => setTripForm({ ...tripForm, driverName: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kilometers Traveled</label>
                <input
                  type="number"
                  required
                  value={tripForm.kilometersTraveled}
                  onChange={(e) => setTripForm({ ...tripForm, kilometersTraveled: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Fuel Cost (PKR)</label>
                <input
                  type="number"
                  required
                  value={tripForm.fuelCostPKR}
                  onChange={(e) => setTripForm({ ...tripForm, fuelCostPKR: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Delivery Purpose</label>
              <input
                type="text"
                required
                value={tripForm.purpose}
                onChange={(e) => setTripForm({ ...tripForm, purpose: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsLogTripOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm"
              >
                Save Trip Entry
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </Layout>
  );
}
