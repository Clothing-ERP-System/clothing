'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  RefreshCw,
  Plus,
  Search,
  Filter,
  FileText,
  DollarSign,
  Truck,
  AlertCircle,
  Eye,
  ChevronLeft,
  ChevronRight,
  Mail,
  Package,
  Wallet,
  Clock,
  Check,
  X,
} from 'lucide-react';

export default function GrniReconciliationPage() {
  const { addToast, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [reviewerNotes, setReviewerNotes] = useState('');

  const isAccountantOrSuperAdmin = useMemo(() => {
    const role = user?.role || '';
    return role === 'SuperAdmin' || role === 'Accountant';
  }, [user?.role]);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/procurement/reconciliation');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        addToast(json.message || 'Failed to load reconciliation data', 'error');
      }
    } catch {
      addToast('Error loading reconciliation data', 'error');
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

  const proposals = useMemo(() => data?.reconciliation || [], [data]);

  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        return (
          (p.grnNumber || '').toLowerCase().includes(q) ||
          (p.poNumber || '').toLowerCase().includes(q) ||
          (p.supplierName || '').toLowerCase().includes(q) ||
          (p.reason || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [proposals, search]);

  const pendingProposals = useMemo(() => {
    return proposals.filter((p) => p.status === 'Pending');
  }, [proposals]);

  const totalPages = Math.ceil(filteredProposals.length / pageSize) || 1;
  const paginatedProposals = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProposals.slice(start, start + pageSize);
  }, [filteredProposals, currentPage, pageSize]);

  const totalPending = useMemo(() => {
    return pendingProposals.reduce((sum, p) => sum + p.proposedAmount, 0);
  }, [pendingProposals]);

  const handleApprove = async (e) => {
    e.preventDefault();
    if (!selectedProposal) return;
    try {
      const res = await apiFetch('/api/procurement/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'APPROVE_RECONCILIATION',
          proposalId: selectedProposal._id,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Approval failed', 'error');
        return;
      }
      addToast('Reconciliation approved and posted', 'success');
      setIsModalOpen(false);
      setSelectedProposal(null);
      setReviewerNotes('');
      await fetchData();
    } catch {
      addToast('Network error approving reconciliation', 'error');
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!selectedProposal) return;
    try {
      const res = await apiFetch('/api/procurement/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REVIEW_RECONCILIATION',
          proposalId: selectedProposal._id,
          status: 'Rejected',
          reviewerNotes: reviewerNotes || 'Rejected',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Rejection failed', 'error');
        return;
      }
      addToast('Reconciliation proposal rejected', 'success');
      setIsModalOpen(false);
      setSelectedProposal(null);
      setReviewerNotes('');
      await fetchData();
    } catch {
      addToast('Network error rejecting reconciliation', 'error');
    }
  };

  const openProposal = (proposal) => {
    setSelectedProposal(proposal);
    setReviewerNotes('');
    setIsModalOpen(true);
  };

  const statusBadge = (status) => {
    const styles = {
      Pending: 'bg-amber-50 text-amber-700 border border-amber-200',
      Reviewed: 'bg-blue-50 text-blue-700 border border-blue-200',
      Approved: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      Rejected: 'bg-rose-50 text-rose-700 border border-rose-200',
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${styles[status] || styles.Pending}`}>
        {status}
      </span>
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                GRNI RECONCILIATION
              </span>
              <span className="text-xs text-slate-500">• Goods Received Not Invoiced</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              GRNI Reconciliation Approval
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Review and approve GRNI residual adjustment proposals. Requires Accountant or SuperAdmin role.
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
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Pending Proposals</p>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-[#0F172A] mt-2">{pendingProposals.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Awaiting approval</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Total Pending Amount</p>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-[#0F172A] mt-2">
              Rs. {totalPending.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Total proposed adjustments</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Total Outstanding</p>
              <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-[#0F172A] mt-2">
              Rs. {data?.totalOutstanding?.toLocaleString() || '0'}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Residual GRNI across all GRNs</p>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">Your Role</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center">
                {isAccountantOrSuperAdmin ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <X className="w-4 h-4 text-rose-600" />
                )}
              </div>
            </div>
            <p className="text-2xl font-black text-[#0F172A] mt-2">
              {user?.role || 'Unknown'}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isAccountantOrSuperAdmin ? 'Can approve' : 'Cannot approve'}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by GRN #, PO #, supplier, or reason..."
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
                  <th className="py-3 px-4">GRN #</th>
                  <th className="py-3 px-4">PO #</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4 text-right">Proposed Amount</th>
                  <th className="py-3 px-4 text-right">Remaining GRNI</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Proposed By</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Loading reconciliation data...
                    </td>
                  </tr>
                ) : paginatedProposals.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <div className="max-w-sm mx-auto text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                          <FileText className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-bold text-slate-800">No Reconciliation Proposals</p>
                        <p className="text-xs text-slate-500">
                          No GRNI reconciliation proposals found.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedProposals.map((p) => (
                    <tr key={p._id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{p.grnNumber}</td>
                      <td className="py-3 px-4 text-slate-700 font-mono">{p.poNumber || '—'}</td>
                      <td className="py-3 px-4 font-bold text-slate-900">{p.supplierName}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">
                        Rs. {p.proposedAmount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">
                        Rs. {p.remainingGRNI.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center">{statusBadge(p.status)}</td>
                      <td className="py-3 px-4 text-slate-500 text-xs">{p.proposedBy || '—'}</td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => openProposal(p)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View</span>
                        </button>
                        {p.status === 'Pending' && isAccountantOrSuperAdmin && (
                          <button
                            type="button"
                            onClick={() => openProposal(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors"
                          >
                            {p.status === 'Pending' ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Approve</span>
                              </>
                            ) : (
                              <>
                                <X className="w-3 h-3" />
                                <span>Reject</span>
                              </>
                            )}
                          </button>
                        )}
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
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={selectedProposal ? `GRNI Reconciliation: ${selectedProposal.grnNumber}` : ''}
          subtitle="Review and approve or reject the adjustment proposal"
          maxWidth="max-w-md"
        >
          {selectedProposal && (
            <form onSubmit={handleApprove} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">GRN Number</label>
                  <input
                    type="text"
                    value={selectedProposal.grnNumber}
                    readOnly
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Supplier</label>
                  <input
                    type="text"
                    value={selectedProposal.supplierName}
                    readOnly
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">PO Number</label>
                  <input
                    type="text"
                    value={selectedProposal.poNumber || '—'}
                    readOnly
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Proposed Amount</label>
                  <input
                    type="text"
                    value={`Rs. ${selectedProposal.proposedAmount.toLocaleString()}`}
                    readOnly
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Remaining GRNI</label>
                  <input
                    type="text"
                    value={`Rs. ${selectedProposal.remainingGRNI.toLocaleString()}`}
                    readOnly
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Reason</label>
                  <input
                    type="text"
                    value={selectedProposal.reason}
                    readOnly
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Counter Account</label>
                  <input
                    type="text"
                    value={`${selectedProposal.counterAccountCode} - ${selectedProposal.counterAccountName}`}
                    readOnly
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Proposed By</label>
                  <input
                    type="text"
                    value={selectedProposal.proposedBy || '—'}
                    readOnly
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Proposed At</label>
                  <input
                    type="text"
                    value={selectedProposal.proposedAt ? new Date(selectedProposal.proposedAt).toLocaleString() : '—'}
                    readOnly
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50"
                  />
                </div>
              </div>

              {selectedProposal.status === 'Pending' && isAccountantOrSuperAdmin && (
                <>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Reviewer Notes</label>
                    <textarea
                      value={reviewerNotes}
                      onChange={(e) => setReviewerNotes(e.target.value)}
                      rows={2}
                      placeholder="Optional notes for approval or rejection..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                    />
                  </div>
                  <div className="sm:col-span-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                    <p className="text-xs text-amber-800">
                      <strong className="font-bold">Important:</strong> Approving will post a balanced journal entry:
                      Debit GRNI liability, Credit counter account. The original GRN and invoice history is preserved.
                    </p>
                  </div>
                  <div className="sm:col-span-2 flex gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleReject}
                      className="px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm"
                    >
                      Approve
                    </button>
                  </div>
                </>
              )}
              {selectedProposal.status !== 'Pending' && (
                <div className="sm:col-span-2 bg-slate-50 border border-slate-200 rounded-lg p-3 mt-2">
                  <p className="text-xs text-slate-600">
                    <strong className="font-bold">Status:</strong> {selectedProposal.status}
                    {selectedProposal.approvedBy && (
                      <span className="ml-2">Approved by {selectedProposal.approvedBy}</span>
                    )}
                    {selectedProposal.approvedAt && (
                      <span className="ml-2">at {new Date(selectedProposal.approvedAt).toLocaleString()}</span>
                    )}
                  </p>
                  {selectedProposal.reviewerNotes && (
                    <p className="text-xs text-slate-500 mt-1">
                      <strong>Reviewer Notes:</strong> {selectedProposal.reviewerNotes}
                    </p>
                  )}
                </div>
              )}
              {!(selectedProposal.status === 'Pending' && isAccountantOrSuperAdmin) && (
                <div className="sm:col-span-2 flex justify-end pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}
            </form>
          )}
        </Modal>
      </div>
    </Layout>
  );
}
