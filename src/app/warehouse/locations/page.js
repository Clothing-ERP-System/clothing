'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import RecordEditModal from '@/components/RecordEditModal';
import RecordDeleteButton from '@/components/RecordDeleteButton';
import RecordViewModal from '@/components/RecordViewModal';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  MapPin,
  Plus,
  Search,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  FileText,
} from 'lucide-react';

export default function LocationManagementPage() {
  const { addToast } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  const [isNewOpen, setIsNewOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);

  const [newLocation, setNewLocation] = useState({
    locationCode: '',
    zone: '',
    aisle: '',
    rack: '',
    shelf: '',
    bin: '',
    isActive: true,
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/location');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        addToast(json.message || 'Failed to load locations', 'error');
      }
    } catch {
      addToast('Error loading location data', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addToast]);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  const locations = useMemo(() => data?.locations || [], [data]);

  const filteredLocations = useMemo(() => {
    return locations
      .filter((l) => {
        if (search) {
          const q = search.toLowerCase();
          return (
            l.locationCode?.toLowerCase().includes(q) ||
            l.zone?.toLowerCase().includes(q) ||
            l.aisle?.toLowerCase().includes(q) ||
            l.rack?.toLowerCase().includes(q) ||
            l.shelf?.toLowerCase().includes(q) ||
            l.bin?.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => (a.locationCode || '').localeCompare(b.locationCode || ''));
  }, [locations, search]);

  const totalPages = Math.ceil(filteredLocations.length / pageSize) || 1;
  const paginatedLocations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLocations.slice(start, start + pageSize);
  }, [filteredLocations, currentPage, pageSize]);

  const locationPath = (l) => [l?.zone, l?.aisle, l?.rack, l?.shelf, l?.bin].filter(Boolean).join(' &gt; ');

  const openNewLocationModal = () => {
    setNewLocation({
      locationCode: '',
      zone: '',
      aisle: '',
      rack: '',
      shelf: '',
      bin: '',
      isActive: true,
    });
    setIsNewOpen(true);
  };

  const handleCreateLocation = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_LOCATION',
          locationCode: newLocation.locationCode,
          zone: newLocation.zone,
          aisle: newLocation.aisle,
          rack: newLocation.rack,
          shelf: newLocation.shelf,
          bin: newLocation.bin,
          isActive: newLocation.isActive,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create location', 'error');
        return;
      }
      addToast(json.message || 'Location created successfully', 'success');
      setIsNewOpen(false);
      await fetchData();
    } catch {
      addToast('Network error while creating location', 'error');
    }
  };

  const handleUpdateLocation = async (locationId, updates) => {
    try {
      const res = await apiFetch('/api/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_LOCATION', locationId, ...updates }),
      });
      const result = await res.json();
      if (!res.ok) {
        addToast(result.message || 'Location update failed', 'error');
        return false;
      }
      addToast('Location updated successfully', 'success');
      setEditingLocation(null);
      await fetchData();
      return true;
    } catch {
      addToast('Error updating location', 'error');
      return false;
    }
  };

  const handleDeleteLocation = async (locationId) => {
    if (!window.confirm('Delete this location? This cannot be undone if it is referenced by stock or transfers.')) return;
    try {
      const res = await apiFetch('/api/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE_LOCATION', locationId }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to delete location', 'error');
        return;
      }
      addToast(json.message || 'Location deleted successfully', 'success');
      await fetchData();
    } catch {
      addToast('Network error while deleting location', 'error');
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                LOCATION MANAGEMENT
              </span>
              <span className="text-xs text-slate-500">• Warehouse Bin/Rack Hierarchy</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Warehouse Location Registry
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Define and manage storage locations (Zone → Aisle → Rack → Shelf → Bin) for stock tracking
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-600' : 'text-slate-500'}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={openNewLocationModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Location</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Total Locations</p>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <MapPin className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-[#0F172A] mt-2">{locations.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">All storage locations</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Active Locations</p>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-emerald-700 mt-2">{locations.filter((l) => l.isActive !== false).length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Locations available for use</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by location code, zone, aisle, rack, shelf, or bin..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                  <th className="py-3 px-4">Location Code</th>
                  <th className="py-3 px-4">Zone</th>
                  <th className="py-3 px-4">Aisle</th>
                  <th className="py-3 px-4">Rack</th>
                  <th className="py-3 px-4">Shelf</th>
                  <th className="py-3 px-4">Bin</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Loading locations…
                    </td>
                  </tr>
                ) : paginatedLocations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <div className="max-w-sm mx-auto text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                          <MapPin className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-bold text-slate-800">No Locations Defined</p>
                        <p className="text-xs text-slate-500">
                          Define storage locations to track stock at the bin level.
                        </p>
                        <button
                          type="button"
                          onClick={openNewLocationModal}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Create Location</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedLocations.map((loc) => (
                    <tr key={loc._id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{loc.locationCode}</td>
                      <td className="py-3 px-4 text-slate-700">{loc.zone || '—'}</td>
                      <td className="py-3 px-4 text-slate-700">{loc.aisle || '—'}</td>
                      <td className="py-3 px-4 text-slate-700">{loc.rack || '—'}</td>
                      <td className="py-3 px-4 text-slate-700">{loc.shelf || '—'}</td>
                      <td className="py-3 px-4 text-slate-700">{loc.bin || '—'}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${loc.isActive !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'}`}>
                          {loc.isActive !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedLocation(loc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          <Eye className="w-3 h-3 text-slate-500" />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingLocation(loc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-indigo-700 border border-indigo-200 hover:bg-indigo-50 transition-colors"
                        >
                          <span>Edit</span>
                        </button>
                        <RecordDeleteButton
                          endpoint="/api/location"
                          action="DELETE_LOCATION"
                          idField="locationId"
                          recordId={loc._id}
                          recordLabel={`location ${loc.locationCode}`}
                          onDeleted={fetchData}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-rose-600 border border-rose-200 hover:bg-rose-50 transition-colors"
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>
                Page <span className="font-bold text-slate-900">{currentPage}</span> of{' '}
                <span className="font-bold text-slate-900">{totalPages}</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <Modal
          isOpen={isNewOpen}
          onClose={() => setIsNewOpen(false)}
          title="Create Warehouse Location"
          subtitle="Define a storage location in the zone → aisle → rack → shelf → bin hierarchy"
          maxWidth="max-w-3xl"
        >
          <form onSubmit={(e) => preventDuplicateSubmit(e, handleCreateLocation)} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Location Code *</label>
                <input
                  type="text"
                  required
                  value={newLocation.locationCode}
                  onChange={(e) => setNewLocation({ ...newLocation, locationCode: e.target.value })}
                  placeholder="e.g. WH-A1-R1-S1-B1"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Zone *</label>
                <input
                  type="text"
                  required
                  value={newLocation.zone}
                  onChange={(e) => setNewLocation({ ...newLocation, zone: e.target.value })}
                  placeholder="Zone"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Aisle *</label>
                <input
                  type="text"
                  required
                  value={newLocation.aisle}
                  onChange={(e) => setNewLocation({ ...newLocation, aisle: e.target.value })}
                  placeholder="Aisle"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rack *</label>
                <input
                  type="text"
                  required
                  value={newLocation.rack}
                  onChange={(e) => setNewLocation({ ...newLocation, rack: e.target.value })}
                  placeholder="Rack"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Shelf *</label>
                <input
                  type="text"
                  required
                  value={newLocation.shelf}
                  onChange={(e) => setNewLocation({ ...newLocation, shelf: e.target.value })}
                  placeholder="Shelf"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Bin *</label>
                <input
                  type="text"
                  required
                  value={newLocation.bin}
                  onChange={(e) => setNewLocation({ ...newLocation, bin: e.target.value })}
                  placeholder="Bin"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 mb-0">
                <strong>Path:</strong> {newLocation.zone || '—'}&gt; {newLocation.aisle || '—'}&gt; {newLocation.rack || '—'}&gt; {newLocation.shelf || '—'}&gt; {newLocation.bin || '—'}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg transition-colors shadow-sm disabled:opacity-50"
              >
                Create Location
              </button>
            </div>
          </form>
        </Modal>

        <RecordViewModal
          isOpen={Boolean(selectedLocation)}
          onClose={() => setSelectedLocation(null)}
          record={selectedLocation}
          title={`Location: ${selectedLocation?.locationCode || ''}`}
          subtitle={`${locationPath(selectedLocation) || ''}`}
          fields={[
            { name: 'locationCode', label: 'Location Code', type: 'text' },
            { name: 'zone', label: 'Zone', type: 'text' },
            { name: 'aisle', label: 'Aisle', type: 'text' },
            { name: 'rack', label: 'Rack', type: 'text' },
            { name: 'shelf', label: 'Shelf', type: 'text' },
            { name: 'bin', label: 'Bin', type: 'text' },
            { name: 'isActive', label: 'Status', type: 'boolean' },
          ]}
        />

        <RecordEditModal
          isOpen={Boolean(editingLocation)}
          onClose={() => setEditingLocation(null)}
          record={editingLocation}
          title={`Edit Location: ${editingLocation?.locationCode || ''}`}
          fields={[
            { name: 'zone', label: 'Zone', required: true },
            { name: 'aisle', label: 'Aisle', required: true },
            { name: 'rack', label: 'Rack', required: true },
            { name: 'shelf', label: 'Shelf', required: true },
            { name: 'bin', label: 'Bin', required: true },
            { name: 'isActive', label: 'Active', type: 'boolean' },
          ]}
          onSave={handleUpdateLocation}
        />
      </div>
    </Layout>
  );
}
