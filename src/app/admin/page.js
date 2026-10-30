'use client';

import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
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

  const company = data?.company || {};
  const users = data?.users || [];
  const masterData = data?.masterData || {};
  const auditLogs = data?.auditLogs || [];

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
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          <CheckCircle className="w-3 h-3" />
                          <span>Active</span>
                        </span>
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

        {/* Modal: Add User */}
        <Modal
          isOpen={isAddUserOpen}
          onClose={() => setIsAddUserOpen(false)}
          title="Create New System User"
          subtitle="Assign role-based access for factory or outlet staff"
        >
          <form onSubmit={handleCreateUser} className="space-y-4">
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
                </select>
              </div>
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
      </div>
    </Layout>
  );
}
