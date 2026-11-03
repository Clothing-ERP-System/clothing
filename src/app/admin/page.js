'use client';

import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import RecordEditModal from '@/components/RecordEditModal';
import RecordDeleteButton from '@/components/RecordDeleteButton';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';
import { BUILT_IN_ROLES, ERP_MODULES, ROLE_ACTIONS } from '@/lib/role-definitions.js';
import ApprovalMatrix from '@/components/ApprovalMatrix';
import {
  ShieldAlert,
  Building2,
  Users,
  Layers,
  FileText,
  UserPlus,
  CheckCircle,
  Clock,
  Sparkles,
  MapPin,
  Tag,
  Scale,
} from 'lucide-react';

export default function AdministrationPage() {
  const { addToast } = useAuth();
  const [activeTab, setActiveTab] = useState('company'); // 'company', 'users', 'master', 'audit'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingCompany, setEditingCompany] = useState(null);
  const [roleDraft, setRoleDraft] = useState(null);
  const [resetPasswordUser, setResetPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  // New user form state
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'GeneralManager',
    branch: '',
    department: '',
    phone: '',
  });

  const fetchData = async () => {
    try {
      const res = await fetch('/api/administration');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/administration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_USER', ...newUser }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create user', 'error');
        return;
      }
      addToast('User created successfully!', 'success');
      setIsAddUserOpen(false);
      setNewUser({
        name: '',
        email: '',
        password: '',
        role: 'GeneralManager',
        branch: '',
        department: '',
        phone: '',
      });
      fetchData();
    } catch {
      addToast('Error saving user', 'error');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetPasswordUser || !newPassword) return;
    try {
      const res = await fetch('/api/administration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RESET_USER_PASSWORD',
          userId: resetPasswordUser._id,
          newPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to reset password', 'error');
        return;
      }
      addToast(`Password reset successfully for ${resetPasswordUser.email}`, 'success');
      setResetPasswordUser(null);
      setNewPassword('');
    } catch {
      addToast('Error resetting password', 'error');
    }
  };

  const handleUpdateUser = async (userId, updates) => {
    try {
      const response = await fetch('/api/administration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_USER', userId, ...updates }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'User update failed', 'error');
        return false;
      }
      addToast('User details updated successfully', 'success');
      setEditingUser(null);
      await fetchData();
      return true;
    } catch {
      addToast('Error updating user', 'error');
      return false;
    }
  };

  const handleUpdateCompany = async (_companyId, updates) => {
    try {
      const response = await fetch('/api/administration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_COMPANY',
          ...updates,
          branches: company.branches || [],
          locations: company.locations || [],
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Company settings update failed', 'error');
        return false;
      }
      addToast('Company settings updated', 'success');
      setEditingCompany(null);
      await fetchData();
      return true;
    } catch {
      addToast('Error updating company settings', 'error');
      return false;
    }
  };

  const handleSaveRole = async (event) => {
    event.preventDefault();
    const action = roleDraft._id ? 'UPDATE_ROLE' : 'CREATE_ROLE';
    const payload = {
      action,
      name: roleDraft.name,
      description: roleDraft.description,
      permissions: roleDraft.permissions,
    };
    if (roleDraft._id) payload.roleId = roleDraft._id;
    try {
      const response = await fetch('/api/administration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Role could not be saved', 'error');
        return;
      }
      addToast(action === 'CREATE_ROLE' ? 'Custom role created' : 'Role permissions updated', 'success');
      setRoleDraft(null);
      await fetchData();
    } catch {
      addToast('Error saving role', 'error');
    }
  };

  const handleDeleteRole = async (role) => {
    if (!window.confirm(`Delete the "${role.name}" role? Assigned users must be moved first.`)) return;
    try {
      const response = await fetch('/api/administration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE_ROLE', roleId: role._id }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Role could not be deleted', 'error');
        return;
      }
      addToast('Role deleted', 'success');
      await fetchData();
    } catch {
      addToast('Error deleting role', 'error');
    }
  };

  const company = data?.company || {};
  const users = data?.users || [];
  const roles = data?.roles || [];
  const masterData = data?.masterData || {};
  const auditLogs = data?.auditLogs || [];
  const userRoleOptions = [...new Set([...BUILT_IN_ROLES, ...roles.map((role) => role.name)])];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-[#4F46E5] border border-indigo-100">
                SYSTEM GOVERNANCE
              </span>
              <span className="text-xs text-slate-500">• Administration & Security</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Enterprise Configuration & Access Control
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Multi-branch setup, role-based authorization, units of measurement, and compliance audit trail
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddUserOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add System User</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('company')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'company'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Company & Branches</span>
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'users'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Users & RBAC ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('master')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'master'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>Master Attributes</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Audit Trail ({auditLogs.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('approvals')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'approvals'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            <span>Approval Matrix</span>
          </button>
        </div>

        {/* Tab 1: Company Profile & Branches */}
        {activeTab === 'company' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Company Info Card */}
            <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-[#172554] text-white flex items-center justify-center font-bold">
                  BG
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">{company.companyName}</h2>
                  <p className="text-[11px] text-slate-500">{company.legalName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingCompany(company)}
                className="w-full rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Edit Company Profile
              </button>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">NTN Number:</span>
                  <span className="font-bold text-slate-800">{company.ntnNumber}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">STRN Number:</span>
                  <span className="font-bold text-slate-800">{company.strnNumber}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">Base Currency:</span>
                  <span className="font-bold text-indigo-600">{company.currency} ({company.currencySymbol})</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">Official Email:</span>
                  <span className="font-medium text-slate-800">{company.email}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-500">Factory Phone:</span>
                  <span className="font-medium text-slate-800">{company.phone}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-600">
                <span className="font-bold block mb-1 text-slate-700">Factory Location:</span>
                {company.address}
              </div>

              <div className="pt-2 text-center border-t border-slate-100">
                <div className="inline-flex items-center gap-1.5 text-xs text-indigo-600 font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{company.developerAttribution}</span>
                </div>
              </div>
            </div>

            {/* Branches & Warehouse Locations */}
            <div className="lg:col-span-2 space-y-6">
              {/* Branches */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-3">Operating Branches & Units</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(company.branches || []).map((branch, idx) => (
                    <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-900">{branch.name}</span>
                          <p className="text-[11px] text-slate-500 mt-0.5">{branch.code} • {branch.type}</p>
                        </div>
                        {branch.isMain && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                            Main Unit
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-2 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{branch.address}, {branch.city}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Warehouse Locations */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-3">Warehouse Bins & Storage Locations</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                        <th className="py-2.5 px-3">Warehouse Depot</th>
                        <th className="py-2.5 px-3">Zone</th>
                        <th className="py-2.5 px-3">Rack & Bin</th>
                        <th className="py-2.5 px-3">Capacity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(company.locations || []).map((loc, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{loc.warehouseName}</td>
                          <td className="py-2.5 px-3 text-slate-600">{loc.zone}</td>
                          <td className="py-2.5 px-3 font-mono text-indigo-600 font-bold">{loc.rack} / {loc.bin}</td>
                          <td className="py-2.5 px-3 text-slate-700 font-medium">{loc.capacityMetersOrUnits?.toLocaleString()} Units/Mtrs</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Users & RBAC */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">System Users & Role-Based Permissions</h3>
                <p className="text-xs text-slate-500">Authorized personnel across stitching, cutting, accounts, and retail</p>
              </div>
              <button
                onClick={() => setIsAddUserOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>New User</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                    <th className="py-3 px-4">User Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Assigned Role</th>
                    <th className="py-3 px-4">Branch</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-900">{u.name}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono">{u.email}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{u.branch}</td>
                      <td className="py-3 px-4 text-slate-600">{u.department}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {u.isActive && <CheckCircle className="w-3 h-3" />}
                          <span>{u.isActive ? 'Active' : 'Inactive'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingUser(u)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetPasswordUser(u);
                            setNewPassword('');
                          }}
                          className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100 cursor-pointer"
                        >
                          Password
                        </button>
                        <RecordDeleteButton
                          endpoint="/api/administration"
                          action="DELETE_USER"
                          idField="userId"
                          recordId={u._id}
                          recordLabel={u.name}
                          onDeleted={fetchAdminData}
                          className="rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 cursor-pointer"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Master Attributes (Units, Sizes, Colors, Taxes) */}
        {activeTab === 'master' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Units & Conversions */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-indigo-600" />
                <span>Standardized Units of Measurement</span>
              </h3>
              <div className="divide-y divide-slate-100 text-xs">
                {(masterData.units || []).map((u, idx) => (
                  <div key={idx} className="py-2.5 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-slate-800">{u.name}</span>
                      <span className="text-slate-400 font-mono ml-2">({u.symbol})</span>
                    </div>
                    <span className="text-slate-500 font-medium">Factor: {u.conversionFactor}x {u.baseUnit}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sizes & Grading */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-teal-600" />
                <span>Standard Apparel Sizes</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {(masterData.sizes || []).map((s, idx) => (
                  <div key={idx} className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800">
                    {s.name} ({s.code}) - {s.category}
                  </div>
                ))}
              </div>

              <h4 className="text-xs font-bold text-slate-700 mt-6 mb-2">Approved Master Shades & Colors</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {(masterData.colors || []).map((c, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50">
                    <span className="w-4 h-4 rounded-full border border-slate-300" style={{ backgroundColor: c.hexCode }} />
                    <div>
                      <div className="font-bold text-slate-800">{c.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{c.pantone}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Audit Trail Log */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Transactional Compliance Audit Log</h3>
              <p className="text-xs text-slate-500">Every stock mutation, user creation, approval, and journal posting is timestamped</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Operator</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Module</th>
                    <th className="py-3 px-4">Record Ref</th>
                    <th className="py-3 px-4">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">{log.userName}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-indigo-600 font-semibold">{log.module}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-700">{log.recordId || '-'}</td>
                      <td className="py-3 px-4 text-slate-700">{log.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'approvals' && (
          <ApprovalMatrix roles={roles} users={users} />
        )}

        {/* Modal: Add User */}
        <Modal
          isOpen={isAddUserOpen}
          onClose={() => setIsAddUserOpen(false)}
          title="Create New System User"
          subtitle="Assign role-based access for factory or outlet staff"
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleCreateUser)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  placeholder="Full name"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="name@bilalgarments.pk"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Initial Password</label>
                <input
                  type="password"
                  required
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="SuperAdmin">SuperAdmin</option>
                  <option value="GeneralManager">GeneralManager</option>
                  <option value="ProductionManager">ProductionManager</option>
                  <option value="CuttingMaster">CuttingMaster</option>
                  <option value="QualityInspector">QualityInspector</option>
                  <option value="InventoryStorekeeper">InventoryStorekeeper</option>
                  <option value="Accountant">Accountant</option>
                  <option value="POSCashier">POSCashier</option>
                  <option value="SalesOfficer">SalesOfficer</option>
                  <option value="HROfficer">HROfficer</option>
                  {roles.map((role) => (
                    <option key={role._id} value={role.name}>{role.name}</option>
                  ))}
                </select>
              </div>

              <section className="border-t border-slate-200 p-4 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Custom Roles & Module Permissions</h3>
                    <p className="text-xs text-slate-500">Grant each action explicitly. Administration and system-management privileges remain SuperAdmin-only.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRoleDraft({ name: '', description: '', permissions: [] })}
                    className="rounded-lg bg-[#4F46E5] px-3 py-2 text-xs font-bold text-white hover:bg-[#4338CA]"
                  >
                    Create Custom Role
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {roles.map((role) => (
                    <div key={role._id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-4">
                      <div>
                        <p className="text-xs font-bold text-slate-900">{role.name}</p>
                        <p className="mt-1 text-[11px] text-slate-500">{role.description || 'No description'}</p>
                        <p className="mt-2 text-[10px] text-slate-500">{role.permissions?.length || 0} assigned permissions</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => setRoleDraft({ ...role, permissions: [...(role.permissions || [])] })}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRole(role)}
                          className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  {roles.length === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500">
                      No custom roles have been configured.
                    </p>
                  )}
                </div>

                {roleDraft && (
                  <form onSubmit={(event) => preventDuplicateSubmit(event, handleSaveRole)} className="mt-5 space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="text-xs font-bold text-slate-700">
                        Role name
                        <input
                          required
                          minLength={2}
                          maxLength={40}
                          pattern="[A-Za-z][A-Za-z0-9 _-]{1,39}"
                          disabled={Boolean(roleDraft._id)}
                          value={roleDraft.name}
                          onChange={(event) => setRoleDraft({ ...roleDraft, name: event.target.value })}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal"
                        />
                      </label>
                      <label className="text-xs font-bold text-slate-700">
                        Description
                        <input
                          maxLength={200}
                          value={roleDraft.description || ''}
                          onChange={(event) => setRoleDraft({ ...roleDraft, description: event.target.value })}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-normal"
                        />
                      </label>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                      <table className="w-full min-w-[760px] text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="p-2">Module</th>
                            {ROLE_ACTIONS.map((permission) => (
                              <th key={permission} className="p-2 text-center capitalize">{permission}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ERP_MODULES.filter((module) => module !== 'administration').map((module) => (
                            <tr key={module} className="border-b border-slate-100 last:border-0">
                              <th className="p-2 font-semibold capitalize text-slate-700">{module}</th>
                              {ROLE_ACTIONS.map((permission) => {
                                const key = `${module}:${permission}`;
                                const restricted = module === 'system' && permission !== 'view';
                                const checked = roleDraft.permissions.includes(key);
                                return (
                                  <td key={key} className="p-2 text-center">
                                    <input
                                      type="checkbox"
                                      aria-label={`${permission} ${module}`}
                                      disabled={restricted}
                                      checked={checked}
                                      onChange={(event) => setRoleDraft({
                                        ...roleDraft,
                                        permissions: event.target.checked
                                          ? [...roleDraft.permissions, key]
                                          : roleDraft.permissions.filter((item) => item !== key),
                                      })}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setRoleDraft(null)} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white">
                        Cancel
                      </button>
                      <button type="submit" className="rounded-lg bg-[#4F46E5] px-3 py-2 text-xs font-bold text-white hover:bg-[#4338CA]">
                        Save Role
                      </button>
                    </div>
                  </form>
                )}
              </section>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Branch</label>
                <select
                  value={newUser.branch}
                  onChange={(e) => setNewUser({ ...newUser, branch: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="">Select a branch</option>
                  {(company.branches || []).map((branch) => (
                    <option key={branch.code || branch.name} value={branch.name}>{branch.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department</label>
                <input
                  type="text"
                  value={newUser.department}
                  onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                  placeholder="Department"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsAddUserOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg transition-colors shadow-sm"
              >
                Save User
              </button>
            </div>
          </form>
        </Modal>
        {/* Modal: Reset Password */}
        <Modal
          isOpen={Boolean(resetPasswordUser)}
          onClose={() => setResetPasswordUser(null)}
          title={`Reset Password: ${resetPasswordUser?.email || ''}`}
          subtitle={`Set a new secure password for ${resetPasswordUser?.name || 'this user'}`}
        >
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">New Password (min 12 characters) *</label>
              <input
                type="password"
                required
                minLength={12}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new strong password"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setResetPasswordUser(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors shadow-sm"
              >
                Update Password
              </button>
            </div>
          </form>
        </Modal>

        <RecordEditModal
          isOpen={Boolean(editingUser)}
          onClose={() => setEditingUser(null)}
          record={editingUser}
          title={`Edit User: ${editingUser?.email || ''}`}
          fields={USER_EDIT_FIELDS.map((field) => field.name === 'role'
            ? { ...field, options: userRoleOptions }
            : field)}
          onSave={handleUpdateUser}
        />

        <RecordEditModal
          isOpen={Boolean(editingCompany)}
          onClose={() => setEditingCompany(null)}
          record={editingCompany}
          title="Edit Company Profile"
          fields={COMPANY_EDIT_FIELDS}
          onSave={handleUpdateCompany}
        />
      </div>
    </Layout>
  );
}

const USER_EDIT_FIELDS = [
  { name: 'name', label: 'Full Name', required: true },
  { name: 'role', label: 'Assigned Role', type: 'select', required: true, options: BUILT_IN_ROLES },
  { name: 'branch', label: 'Branch' },
  { name: 'department', label: 'Department' },
  { name: 'phone', label: 'Phone' },
  { name: 'isActive', label: 'Active Account', type: 'checkbox' },
];

const COMPANY_EDIT_FIELDS = [
  { name: 'companyName', label: 'Company Name', required: true },
  { name: 'legalName', label: 'Legal Name' },
  { name: 'ntnNumber', label: 'NTN Number' },
  { name: 'strnNumber', label: 'STRN Number' },
  { name: 'address', label: 'Factory Address', type: 'textarea' },
  { name: 'phone', label: 'Factory Phone' },
  { name: 'email', label: 'Official Email', type: 'email' },
  { name: 'currency', label: 'Currency' },
  { name: 'currencySymbol', label: 'Currency Symbol' },
  { name: 'developerAttribution', label: 'Attribution' },
];
