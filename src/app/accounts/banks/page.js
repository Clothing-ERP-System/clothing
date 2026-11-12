'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  Building2,
  PlusCircle,
  CreditCard,
  Search,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  ShieldCheck,
  CheckCircle2,
  Eye,
} from 'lucide-react';

export default function BankAccountsPage() {
  const { user, addToast } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewBank, setViewBank] = useState(null);

  const [newBank, setNewBank] = useState({
    code: '',
    name: '',
    bankName: '',
    accountNumber: '',
    branchCode: '',
    openingBalance: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/finance');
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Unable to load finance data');
      }
      setData(json.data);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message || 'Error loading bank accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  // Only display actual client-configured bank accounts (with an explicit bankName or accountNumber)
  const bankAccounts = useMemo(() => {
    const all = data?.accounts || [];
    return all.filter(
      (a) =>
        a.type === 'Asset' &&
        Boolean(a.isBank) &&
        Boolean((a.bankName && a.bankName.trim()) || (a.accountNumber && a.accountNumber.trim()))
    );
  }, [data]);

  const filteredBanks = useMemo(() => {
    return bankAccounts.filter((b) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        b.code.toLowerCase().includes(term) ||
        b.name.toLowerCase().includes(term) ||
        (b.bankName && b.bankName.toLowerCase().includes(term)) ||
        (b.accountNumber && b.accountNumber.toLowerCase().includes(term))
      );
    });
  }, [bankAccounts, searchTerm]);

  const totalBankBalance = useMemo(() => {
    return filteredBanks.reduce((sum, b) => sum + Number(b.balance || 0), 0);
  }, [filteredBanks]);

  const handleCreateBank = async (e) => {
    e.preventDefault();
    if (!newBank.code.trim() || !newBank.name.trim() || !newBank.bankName.trim()) {
      addToast('Account code, display name and bank name are required', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_BANK_ACCOUNT',
          code: newBank.code.trim(),
          name: newBank.name.trim(),
          bankName: newBank.bankName.trim(),
          accountNumber: newBank.accountNumber.trim(),
          branchCode: newBank.branchCode.trim(),
          openingBalance: Number(newBank.openingBalance || 0),
          postedBy: user?.name || user?.email || 'Admin',
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Failed to create bank account');
      }

      addToast(`Bank account ${json.data?.account?.code} created`, 'success');
      setIsAddModalOpen(false);
      setNewBank({ code: '', name: '', bankName: '', accountNumber: '', branchCode: '', openingBalance: '' });
      fetchData();
    } catch (err) {
      addToast(err.message || 'Error creating bank account', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Mask account number for security (show only last 4 digits)
  const maskAccountNumber = (accNum) => {
    if (!accNum) return '••••••••••••';
    const str = String(accNum);
    if (str.length <= 4) return str;
    return `••••••••${str.slice(-4)}`;
  };

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
              <Building2 className="w-7 h-7 text-indigo-600" />
              Bank & Cash Accounts
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Manage corporate banking facilities, cash registers, branch accounts, and real-time ledger balances.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600 rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Add Bank Account
          </button>
        </div>

        {/* Total Liquidity Card */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-900 to-slate-900 text-white shadow-md relative overflow-hidden sm:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
                  Total Liquid Cash & Bank Funds
                </span>
                <h2 className="text-3xl font-black mt-2 font-mono tracking-tight">
                  Rs. {totalBankBalance.toLocaleString()}
                </h2>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                <Wallet className="w-6 h-6 text-indigo-300" />
              </div>
            </div>
            <p className="text-xs text-indigo-200/80 mt-3 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Fully reconciled with General Ledger double-entry system
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Configured Accounts
            </span>
            <div className="my-2">
              <p className="text-3xl font-black text-slate-900 dark:text-white">
                {filteredBanks.length}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Active cash books & bank channels
              </p>
            </div>
            <div className="text-[11px] text-indigo-600 font-bold">
              All accounts audit verified
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search bank name, account title, code or account number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            />
          </div>
        </div>

        {/* Bank Account Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {loading ? (
            <div className="col-span-full p-8 text-center text-xs text-slate-500">Loading bank accounts…</div>
          ) : loadError ? (
            <div className="col-span-full p-8 text-center text-xs text-rose-500">{loadError}</div>
          ) : filteredBanks.length === 0 ? (
            <div className="col-span-full p-12 text-center text-slate-500 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Building2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                No bank accounts configured yet. Add your first bank account to get started.
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Connect your business banking facilities, assign account codes, and set opening balances. All bank transactions reconcile directly with the General Ledger.
              </p>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                Add Bank Account
              </button>
            </div>
          ) : (
            filteredBanks.map((bank) => (
              <div
                key={bank._id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-800 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-mono">
                      Code: {bank.code}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">
                      {bank.bankName || 'Bank Account'}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                    {bank.name}
                  </h3>

                  <div className="space-y-1.5 mt-3 text-xs text-slate-600 dark:text-slate-400">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Account No:</span>
                      <span className="font-mono font-medium">{maskAccountNumber(bank.accountNumber)}</span>
                    </div>
                    {bank.branchCode && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Branch:</span>
                        <span>{bank.branchCode}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-400">Classification:</span>
                      <span>Asset / Liquid</span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Ledger Balance
                    </span>
                    <span className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                      Rs. {Number(bank.balance || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewBank(bank)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-lg transition-colors cursor-pointer"
                      title="View account details"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View
                    </button>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 dark:ring-emerald-950" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add Bank Account Modal */}
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title="Add New Bank / Cash Account"
        >
          <form
            onSubmit={(event) => preventDuplicateSubmit(event, handleCreateBank)}
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
                  placeholder="e.g. 1025"
                  value={newBank.code}
                  onChange={(e) => setNewBank({ ...newBank, code: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Bank Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Operating Bank, Commercial Bank, Cash Drawer"
                  value={newBank.bankName}
                  onChange={(e) => setNewBank({ ...newBank, bankName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Account Title / Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Primary Operating Account"
                  value={newBank.name}
                  onChange={(e) => setNewBank({ ...newBank, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Account / IBAN Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 012345678901 or PK00BANK..."
                  value={newBank.accountNumber}
                  onChange={(e) => setNewBank({ ...newBank, accountNumber: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Branch Code / Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Main Cloth Market Branch"
                  value={newBank.branchCode}
                  onChange={(e) => setNewBank({ ...newBank, branchCode: e.target.value })}
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
                  value={newBank.openingBalance}
                  onChange={(e) => setNewBank({ ...newBank, openingBalance: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Balanced against Account 3100 (Opening Balance Equity) automatically.
                </p>
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
                {submitting ? 'Creating…' : 'Create Bank Account'}
              </button>
            </div>
          </form>
        </Modal>

        {/* View Bank Account Modal */}
        {viewBank && (
          <Modal
            isOpen={Boolean(viewBank)}
            onClose={() => setViewBank(null)}
            title={`Account: ${viewBank.code} — ${viewBank.name}`}
          >
            <div className="text-xs space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Account Code</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{viewBank.code}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Account Type</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{viewBank.type}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Account Title</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{viewBank.name}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Bank Name</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{viewBank.bankName || '—'}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Branch</span>
                  <span className="text-slate-900 dark:text-white">{viewBank.branchCode || '—'}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Account / IBAN</span>
                  <span className="font-mono text-slate-900 dark:text-white">{maskAccountNumber(viewBank.accountNumber)}</span>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase block mb-1">Ledger Balance</span>
                  <span className="font-mono font-black text-emerald-700 dark:text-emerald-300 text-base">
                    Rs. {Number(viewBank.balance || 0).toLocaleString()}
                  </span>
                </div>
              </div>
              {/* Journal entries for this account */}
              {(() => {
                const entries = (data?.journalEntries || []).filter(
                  (je) => (je.lines || []).some((l) => l.accountCode === viewBank.code)
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
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase mb-2">Recent Journal Entries</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {entries.slice(0, 20).map((je) => {
                        const line = (je.lines || []).find((l) => l.accountCode === viewBank.code);
                        return (
                          <div key={je._id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2 gap-2">
                            <div className="min-w-0">
                              <span className="font-mono text-[10px] text-slate-500">{je.voucherNumber || je.referenceNumber}</span>
                              <p className="font-semibold text-slate-800 dark:text-white truncate">{je.narration}</p>
                              <span className="text-[10px] text-slate-400">{je.postedAt ? new Date(je.postedAt).toLocaleDateString() : ''}</span>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {Number(line?.debit || 0) > 0 && (
                                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                  <ArrowUpRight className="w-3 h-3" /> Rs. {Number(line.debit).toLocaleString()}
                                </span>
                              )}
                              {Number(line?.credit || 0) > 0 && (
                                <span className="font-mono font-bold text-rose-500 flex items-center gap-0.5">
                                  <ArrowDownLeft className="w-3 h-3" /> Rs. {Number(line.credit).toLocaleString()}
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
                  onClick={() => setViewBank(null)}
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
