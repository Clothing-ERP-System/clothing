'use client';

import React, { useState, useEffect, useRef } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import RecordDeleteButton from '@/components/RecordDeleteButton';
import RecordViewModal from '@/components/RecordViewModal';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  Warehouse,
  Plus,
  Truck,
  CheckCircle2,
  Clock,
  ArrowRightLeft,
  Search,
  Package,
  Layers,
  MapPin,
  Eye,
} from 'lucide-react';

export default function WarehouseLogisticsPage() {
  const { addToast, user } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isNewTransferOpen, setIsNewTransferOpen] = useState(false);
  const [confirmUnlocatedStockLocation, setConfirmUnlocatedStockLocation] = useState(false);
  const transferRequestId = useRef(null);
  const [viewTransfer, setViewTransfer] = useState(null);

  // New Transfer Form
  const [newTransfer, setNewTransfer] = useState({
    sourceWarehouse: '',
    destinationWarehouse: '',
    sourceLocation: { zone: '', aisle: '', rack: '', shelf: '', bin: '' },
    destinationLocation: { zone: '', aisle: '', rack: '', shelf: '', bin: '' },
    vehicleNumber: '',
    driverName: '',
    driverPhone: '',
    dispatchedBy: '',
    notes: '',
    items: [{ stockItemType: '', stockItemId: '', rollNumber: '', quantity: '', unit: '' }],
  });

  const fetchData = async () => {
    try {
      const res = await apiFetch('/api/warehouse');
      const json = await res.json();
      if (json.success) {
        setTransfers(json.data.transfers || []);
        setStockItems(json.data.stockItems || []);
      }
    } catch (err) {
      console.error('Error fetching warehouse transfers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, []);

  const handleCreateTransfer = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/warehouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_TRANSFER',
          transferRequestId: transferRequestId.current || (transferRequestId.current = globalThis.crypto.randomUUID()),
          confirmUnlocatedStockLocation,
          dispatchedBy: user?.name || '',
          ...newTransfer,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to dispatch transfer', 'error');
        return;
      }
      addToast(`Delivery Challan ${json.data.transfer?.challanNumber} dispatched!`, 'success');
      setIsNewTransferOpen(false);
      setConfirmUnlocatedStockLocation(false);
      transferRequestId.current = null;
      fetchData();
    } catch {
      addToast('Error saving transfer', 'error');
    }
  };

  const selectableStockItems = stockItems.filter((item) =>
    !item.warehouseLocation || item.warehouseLocation === newTransfer.sourceWarehouse
  );
  const selectedStockItem = selectableStockItems.find((item) =>
    item.stockItemType === newTransfer.items[0]?.stockItemType &&
    item.stockItemId === newTransfer.items[0]?.stockItemId &&
    item.rollNumber === newTransfer.items[0]?.rollNumber
  );
  const selectStockItem = (key) => {
    const item = selectableStockItems.find((stockItem) =>
      `${stockItem.stockItemType}:${stockItem.stockItemId}:${stockItem.rollNumber || ''}` === key
    );
    setConfirmUnlocatedStockLocation(false);
    setNewTransfer({
      ...newTransfer,
      items: item ? [{
        stockItemType: item.stockItemType,
        stockItemId: item.stockItemId,
        rollNumber: item.rollNumber || '',
        quantity: item.stockItemType === 'Fabric' ? item.quantity : '',
        unit: item.unit,
      }] : [{ stockItemType: '', stockItemId: '', rollNumber: '', quantity: '', unit: '' }],
    });
  };

  const handleConfirmReceipt = async (transferId) => {
    try {
      const res = await apiFetch('/api/warehouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CONFIRM_RECEIPT',
          transferId,
          receivedBy: user?.name || '',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Receipt confirmation failed', 'error');
        return;
      }
      addToast('Transfer confirmed and stock accepted into warehouse inventory!', 'success');
      fetchData();
    } catch {
      addToast('Error confirming receipt', 'error');
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-[#4F46E5] border border-indigo-100">
                DEPOT & LOGISTICS
              </span>
              <span className="text-xs text-slate-500">• Multi-Warehouse Transfers</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Warehouse Transfers & Delivery Challans
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Record a stock transfer between configured warehouse locations
            </p>
          </div>

          <button
            onClick={() => setIsNewTransferOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Stock Transfer</span>
          </button>
        </div>

        {/* Transfers List */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Transfer & Dispatch Challans Registry</h3>
              <p className="text-xs text-slate-500">Track in-transit stock and destination receiving verification</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                  <th className="py-3 px-4">Transfer #</th>
                  <th className="py-3 px-4">Challan #</th>
                  <th className="py-3 px-4">From / To Locations</th>
                  <th className="py-3 px-4">Driver & Vehicle</th>
                  <th className="py-3 px-4">Items Transferred</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.map((t) => {
                  let statusBadge = 'bg-amber-100 text-amber-800';
                  if (t.status === 'ReceivedAndVerified') statusBadge = 'bg-emerald-100 text-emerald-800';

                  return (
                    <tr key={t._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{t.transferNumber}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{t.challanNumber}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{t.sourceWarehouse.split('(')[0]}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <span>→</span>
                          <span>{t.destinationWarehouse.split('(')[0]}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        <div className="font-medium">{t.driverName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{t.vehicleNumber}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {(t.items || []).map((i) => `${i.quantity} ${i.unit} ${i.itemDescription}`).join(', ')}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusBadge}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setViewTransfer(t)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View
                          </button>
                          {t.status !== 'ReceivedAndVerified' && (
                            <button
                              onClick={() => handleConfirmReceipt(t._id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Confirm Receipt</span>
                            </button>
                          )}
                          <RecordDeleteButton
                            endpoint="/api/warehouse"
                            action="DELETE_TRANSFER"
                            idField="transferId"
                            recordId={t._id}
                            recordLabel={t.transferNumber}
                            onDeleted={fetchData}
                            className="px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Create Transfer */}
        <Modal
          isOpen={isNewTransferOpen}
          onClose={() => setIsNewTransferOpen(false)}
          title="Create Stock Transfer & Delivery Challan"
          subtitle="Dispatch raw material or finished garments between units"
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleCreateTransfer)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Source Origin</label>
                <input
                  type="text"
                  required
                  value={newTransfer.sourceWarehouse}
                  onChange={(e) => {
                    setConfirmUnlocatedStockLocation(false);
                    setNewTransfer({
                      ...newTransfer,
                      sourceWarehouse: e.target.value,
                      items: [{ stockItemType: '', stockItemId: '', rollNumber: '', quantity: '', unit: '' }],
                    });
                  }}
                  placeholder="Source warehouse"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Destination Unit</label>
                <input
                  type="text"
                  required
                  value={newTransfer.destinationWarehouse}
                  onChange={(e) => setNewTransfer({ ...newTransfer, destinationWarehouse: e.target.value })}
                  placeholder="Destination warehouse"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            {/* Location Hierarchy */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Storage Location Hierarchy (Zone → Aisle → Rack → Shelf → Bin)
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Source Zone</label>
                  <input
                    type="text"
                    value={newTransfer.sourceLocation.zone}
                    onChange={(e) => setNewTransfer({ ...newTransfer, sourceLocation: { ...newTransfer.sourceLocation, zone: e.target.value } })}
                    placeholder="Zone"
                    className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Source Aisle</label>
                  <input
                    type="text"
                    value={newTransfer.sourceLocation.aisle}
                    onChange={(e) => setNewTransfer({ ...newTransfer, sourceLocation: { ...newTransfer.sourceLocation, aisle: e.target.value } })}
                    placeholder="Aisle"
                    className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Source Rack</label>
                  <input
                    type="text"
                    value={newTransfer.sourceLocation.rack}
                    onChange={(e) => setNewTransfer({ ...newTransfer, sourceLocation: { ...newTransfer.sourceLocation, rack: e.target.value } })}
                    placeholder="Rack"
                    className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Source Shelf</label>
                  <input
                    type="text"
                    value={newTransfer.sourceLocation.shelf}
                    onChange={(e) => setNewTransfer({ ...newTransfer, sourceLocation: { ...newTransfer.sourceLocation, shelf: e.target.value } })}
                    placeholder="Shelf"
                    className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Source Bin</label>
                  <input
                    type="text"
                    value={newTransfer.sourceLocation.bin}
                    onChange={(e) => setNewTransfer({ ...newTransfer, sourceLocation: { ...newTransfer.sourceLocation, bin: e.target.value } })}
                    placeholder="Bin"
                    className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Dest Zone</label>
                  <input
                    type="text"
                    value={newTransfer.destinationLocation.zone}
                    onChange={(e) => setNewTransfer({ ...newTransfer, destinationLocation: { ...newTransfer.destinationLocation, zone: e.target.value } })}
                    placeholder="Zone"
                    className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Dest Aisle</label>
                  <input
                    type="text"
                    value={newTransfer.destinationLocation.aisle}
                    onChange={(e) => setNewTransfer({ ...newTransfer, destinationLocation: { ...newTransfer.destinationLocation, aisle: e.target.value } })}
                    placeholder="Aisle"
                    className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Dest Rack</label>
                  <input
                    type="text"
                    value={newTransfer.destinationLocation.rack}
                    onChange={(e) => setNewTransfer({ ...newTransfer, destinationLocation: { ...newTransfer.destinationLocation, rack: e.target.value } })}
                    placeholder="Rack"
                    className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Dest Shelf</label>
                  <input
                    type="text"
                    value={newTransfer.destinationLocation.shelf}
                    onChange={(e) => setNewTransfer({ ...newTransfer, destinationLocation: { ...newTransfer.destinationLocation, shelf: e.target.value } })}
                    placeholder="Shelf"
                    className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Dest Bin</label>
                  <input
                    type="text"
                    value={newTransfer.destinationLocation.bin}
                    onChange={(e) => setNewTransfer({ ...newTransfer, destinationLocation: { ...newTransfer.destinationLocation, bin: e.target.value } })}
                    placeholder="Bin"
                    className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Vehicle / Reg #</label>
                <input
                  type="text"
                  required
                  value={newTransfer.vehicleNumber}
                  onChange={(e) => setNewTransfer({ ...newTransfer, vehicleNumber: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Driver Name & Phone</label>
                <input
                  type="text"
                  required
                  value={newTransfer.driverName}
                  onChange={(e) => setNewTransfer({ ...newTransfer, driverName: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Referenced Stock Item & Quantity</label>
              <select
                required
                value={[
                  newTransfer.items[0]?.stockItemType || '',
                  newTransfer.items[0]?.stockItemId || '',
                  newTransfer.items[0]?.rollNumber || '',
                ].join(':')}
                onChange={(event) => selectStockItem(event.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              >
                <option value="::">Select an available stock item at the source</option>
                {selectableStockItems.map((item) => {
                  const key = `${item.stockItemType}:${item.stockItemId}:${item.rollNumber || ''}`;
                  return (
                    <option key={key} value={key}>
                      {item.stockItemCode} — {item.itemDescription} ({item.quantity} {item.unit})
                      {item.warehouseLocation ? ` · ${item.warehouseLocation}` : ' · location not assigned'}
                    </option>
                  );
                })}
              </select>
              {selectedStockItem && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    required
                    min="0.001"
                    max={selectedStockItem.quantity}
                    step="any"
                    value={newTransfer.items[0]?.quantity || ''}
                    disabled={selectedStockItem.stockItemType === 'Fabric'}
                    onChange={(event) => setNewTransfer({
                      ...newTransfer,
                      items: [{ ...newTransfer.items[0], quantity: event.target.value }],
                    })}
                    className="w-32 px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5] disabled:bg-slate-100"
                  />
                  <span className="text-xs text-slate-500">
                    {selectedStockItem.unit} · available: {selectedStockItem.quantity}
                    {selectedStockItem.stockItemType === 'Fabric' && ' (whole roll)'}
                  </span>
                </div>
              )}
              {selectedStockItem && !selectedStockItem.warehouseLocation && (
                <label className="flex items-start gap-2 text-[11px] text-amber-800">
                  <input
                    type="checkbox"
                    required
                    checked={confirmUnlocatedStockLocation}
                    onChange={(event) => setConfirmUnlocatedStockLocation(event.target.checked)}
                    className="mt-0.5"
                  />
                  Confirm that this stock is physically located at the selected source. Its existing balance will be assigned there.
                </label>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewTransferOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm"
              >
                Issue Challan & Dispatch
              </button>
            </div>
          </form>
        </Modal>
        {/* View Warehouse Transfer Modal */}
        <RecordViewModal
          isOpen={Boolean(viewTransfer)}
          onClose={() => setViewTransfer(null)}
          record={viewTransfer}
          title={`Transfer: ${viewTransfer?.transferNumber || ''}`}
          subtitle={`Challan: ${viewTransfer?.challanNumber || ''} • ${viewTransfer?.sourceWarehouse || ''} → ${viewTransfer?.destinationWarehouse || ''}`}
          fields={[
            { name: 'transferNumber', label: 'Transfer Number', type: 'text' },
            { name: 'challanNumber', label: 'Delivery Challan #', type: 'text' },
            { name: 'transferRequestId', label: 'Transfer Request ID', type: 'text' },
            { name: 'sourceWarehouse', label: 'Source Warehouse', type: 'text' },
            { name: 'destinationWarehouse', label: 'Destination Warehouse', type: 'text' },
            { name: 'vehicleNumber', label: 'Vehicle / Reg #', type: 'text' },
            { name: 'driverName', label: 'Driver Name', type: 'text' },
            { name: 'driverPhone', label: 'Driver Phone', type: 'text' },
            { name: 'dispatchedBy', label: 'Dispatched By', type: 'text' },
            { name: 'dispatchedDate', label: 'Dispatched Date', type: 'date' },
            { name: 'status', label: 'Transfer Status', type: 'text' },
            { name: 'receivedBy', label: 'Received By', type: 'text' },
            { name: 'receivedDate', label: 'Received Date', type: 'date' },
            { name: 'notes', label: 'Notes', type: 'text' },
            {
              name: 'items',
              label: 'Transferred Items',
              type: 'array',
              itemFields: [
                { name: 'stockItemType', label: 'Item Type' },
                { name: 'stockItemCode', label: 'Item Code' },
                { name: 'itemDescription', label: 'Description' },
                { name: 'rollNumber', label: 'Roll #', type: 'text' },
                { name: 'quantity', label: 'Quantity', type: 'text' },
                { name: 'unit', label: 'Unit' },
              ],
            },
          ]}
        />
      </div>
    </Layout>
  );
}
