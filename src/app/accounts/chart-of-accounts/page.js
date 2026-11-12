'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import RecordEditModal from '@/components/RecordEditModal';
import RecordDeleteButton from '@/components/RecordDeleteButton';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  BookOpen,
  PlusCircle,
  Search,
  Filter,
  Layers,
  ArrowUpRight,
  TrendingUp,
  DollarSign,
  Scale,
  ShieldAlert,
  Eye,
} from 'lucide-react';

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'CostOfGoodsSold', 'OperatingExpense'];

const TYPE_COLORS = {
  Asset: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  Liability: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  Equity: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  Revenue: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
  CostOfGoodsSold: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  OperatingExpense: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
};

export default function ChartOfAccountsPage() {
  const { addToast } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewAccount, setViewAccount] = useState(null);

  const [newAccount, setNewAccount] = useState({
    code: '',
    name: '',
    type: 'Asset',
    balance: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/finance');
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Unable to load chart of accounts');
      }
      setData(json.data);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Error loading chart of accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const accounts = useMemo(() => data?.accounts || [], [data]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      const matchesSearch =
        !searchTerm ||
        a.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = selectedType === 'ALL' || a.type === selectedType;
      return matchesSearch && matchesType;
    });
  }, [accounts, searchTerm, selectedType]);

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    if (!newAccount.code.trim() || !newAccount.name.trim()) {
      addToast('Account code and name are required', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_ACCOUNT',
          code: newAccount.code.trim(),
          name: newAccount.name.trim(),
          type: newAccount.type,
          balance: Number(newAccount.balance || 0),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to create account');
      }

      addToast(`Account ${json.data?.account?.code} created`, 'success');
      setIsAddModalOpen(false);
      setNewAccount({ code: '', name: '', type: 'Asset', balance: '' });
      fetchData();
    } catch (err) {
      addToast(err.message || 'Error creating account', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateAccount = async (accountId, updates) => {
    try {
      const response = await apiFetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_ACCOUNT', accountId, ...updates }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Account update failed', 'error');
        return false;
      }
      addToast('Account updated successfully', 'success');
      setEditingAccount(null);
      await fetchData();
      return true;
    } catch {
      addToast('Error updating account', 'error');
      return false;
    }
  };

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <BookOpen className="w-7 h-7 text-indigo-600" />
              Chart of Accounts (COA)
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Standardized general ledger chart of accounts classified into Assets, Liabilities, Equity, Revenue, COGS, and Expenses.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600 rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Add Account Head
          </button>
        </div>

        {/* Type Breakdown Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {ACCOUNT_TYPES.map((type) => {
            const count = accounts.filter((a) => a.type === type).length;
            const isSelected = selectedType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(isSelected ? 'ALL' : type)}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/50 ring-2 ring-indigo-500/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                }`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                  {type}
                </span>
                <p className="text-lg font-black text-slate-900 dark:text-white mt-1">
                  {count}
                </p>
                <span className="text-[10px] text-slate-500">Heads registered</span>
              </button>
            );
          })}
        </div>

        {/* Filter and Search */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by account code or title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full sm:w-48 px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Account Types</option>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Accounts Table */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading chart of accounts…</div>
          ) : loadError ? (
            <div className="p-8 text-center text-xs text-rose-500">{loadError}</div>
          ) : filteredAccounts.length === 0 ? (
            <div className="p-10 text-center text-slate-500 space-y-1.5">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {accounts.length === 0 ? 'No Chart of Accounts heads registered yet.' : 'No account heads match your search query.'}
              </p>
              <p className="text-xs text-slate-400">
                {accounts.length === 0 ? 'Click "Add Account Head" above to create your first General Ledger head.' : 'Try adjusting your search terms or account type filter.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3.5">Code</th>
                    <th className="px-4 py-3.5">Account Title</th>
                    <th className="px-4 py-3.5">Type / Classification</th>
                    <th className="px-4 py-3.5">Bank / Channel Info</th>
                    <th className="px-4 py-3.5 text-right">Current Balance (PKR)</th>
                    <th className="px-4 py-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {filteredAccounts.map((acc) => (
                    <tr key={acc._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {acc.code}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        {acc.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${TYPE_COLORS[acc.type] || 'bg-slate-100 text-slate-700'}`}>
                          {acc.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-[11px]">
                        {acc.isBank ? `${acc.bankName || 'Bank'} (${acc.accountNumber || '—'})` : 'Standard Ledger Head'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        Rs. {Number(acc.balance || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setViewAccount(acc)}
                            className="px-2 py-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" /> View
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingAccount(acc)}
                            className="px-2 py-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                          >
                            Edit
                          </button>
                          <RecordDeleteButton
                            endpoint="/api/finance"
                            action="DELETE_ACCOUNT"
                            idField="accountId"
                            recordId={acc._id}
                            recordLabel={`account ${acc.code} (${acc.name})`}
                            onDeleted={fetchData}
                            className="px-2 py-1 text-[11px] font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 rounded-lg transition-colors cursor-pointer"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add Account Modal */}
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="Create New Chart of Accounts Head"
        >
          <form
            onSubmit={(event) => preventDuplicateSubmit(event, handleCreateAccount)}
            className="space-y-4 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Account Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1060, 6050"
                  value={newAccount.code}
                  onChange={(e) => setNewAccount({ ...newAccount, code: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Account Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={newAccount.type}
                  onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Account Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Factory Boiler Maintenance, Printing & Stationery"
                  value={newAccount.name}
                  onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Opening Balance (PKR)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={newAccount.balance}
                  onChange={(e) => setNewAccount({ ...newAccount, balance: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs cursor-pointer"
              >
                {submitting ? 'Creating…' : 'Create Account'}
              </button>
            </div>
          </form>
        </Modal>

        {/* Edit Account Modal */}
        {editingAccount && (
          <RecordEditModal
            isOpen={Boolean(editingAccount)}
            onClose={() => setEditingAccount(null)}
            title={`Edit Account: ${editingAccount.code}`}
            record={editingAccount}
            fields={[
              { name: 'name', label: 'Account Title', type: 'text', required: true },
              {
                name: 'type',
                label: 'Account Classification',
                type: 'select',
                options: ACCOUNT_TYPES.map((t) => ({ value: t, label: t })),
              },
            ]}
            onSave={(updates) => handleUpdateAccount(editingAccount._id, updates)}
          />
        )}

        {/* View Account Detail Modal */}
        {viewAccount && (
          <Modal
            isOpen={Boolean(viewAccount)}
            onClose={() => setViewAccount(null)}
            title={`Account ${viewAccount.code} — ${viewAccount.name}`}
          >
            <div className="text-xs space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Account Code</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{viewAccount.code}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Classification</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${TYPE_COLORS[viewAccount.type] || 'bg-slate-100 text-slate-700'}`}>
                    {viewAccount.type}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Account Title</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{viewAccount.name}</span>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-3 col-span-2">
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase block mb-1">Current Ledger Balance</span>
                  <span className="font-mono font-black text-emerald-700 dark:text-emerald-300 text-base">
                    Rs. {Number(viewAccount.balance || 0).toLocaleString()}
                  </span>
                </div>
              </div>
              {/* Journal lines for this account */}
              {(() => {
                const entries = (data?.journalEntries || []).filter(
                  (je) => (je.lines || []).some((l) => l.accountCode === viewAccount.code)
                );
                if (!entries.length) {
                  return (
                    <div className="text-center text-slate-400 py-4 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                      No journal entries posted to this account yet.
                    </div>
                  );
                }
                return (
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase mb-2">Journal Activity ({entries.length} entries)</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {entries.slice(0, 30).map((je) => {
                        const line = (je.lines || []).find((l) => l.accountCode === viewAccount.code);
                        return (
                          <div key={je._id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2 gap-2">
                            <div className="min-w-0">
                              <span className="font-mono text-[10px] text-slate-500">{je.voucherNumber || je.referenceNumber || '—'}</span>
                              <p className="font-semibold text-slate-800 dark:text-white truncate text-[11px]">{je.narration}</p>
                              <span className="text-[10px] text-slate-400">{je.postedAt ? new Date(je.postedAt).toLocaleDateString() : ''}</span>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {Number(line?.debit || 0) > 0 && (
                                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-[11px] flex items-center gap-0.5 justify-end">
                                  <ArrowUpRight className="w-3 h-3" /> Dr {Number(line.debit).toLocaleString()}
                                </span>
                              )}
                              {Number(line?.credit || 0) > 0 && (
                                <span className="font-mono font-bold text-rose-500 text-[11px] flex items-center gap-0.5 justify-end">
                                  Cr {Number(line.credit).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setViewAccount(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    </Layout>
  );
}
