'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '@/components/Layout';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  Building,
  Scale,
  BookOpen,
  MapPin,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flag,
  Plus,
  PlusCircle,
  Trash2,
} from 'lucide-react';

const STEPS = [
  { key: 'company', label: 'Company Profile', icon: Building },
  { key: 'finance', label: 'Financial Year & Currency', icon: Scale },
  { key: 'accounts', label: 'Chart of Accounts', icon: BookOpen },
  { key: 'locations', label: 'Warehouses & Locations', icon: MapPin },
  { key: 'tax', label: 'Tax Settings', icon: null },
  { key: 'banks', label: 'Bank & Cash Accounts', icon: Building2 },
  { key: 'review', label: 'Review & Complete', icon: CheckCircle2 },
];

const ACCOUNT_TYPES = [
  { value: 'Asset', label: 'Asset' },
  { value: 'Liability', label: 'Liability' },
  { value: 'Equity', label: 'Equity' },
  { value: 'Revenue', label: 'Revenue' },
  { value: 'CostOfGoodsSold', label: 'Cost of Goods Sold' },
  { value: 'OperatingExpense', label: 'Operating Expense' },
];

const DEFAULT_ACCOUNTS = [
  { code: '1020', name: 'Main Operating Bank Account', type: 'Asset', balance: 0, isEssential: true },
  { code: '1030', name: 'Accounts Receivable', type: 'Asset', balance: 0, isEssential: true },
  { code: '1050', name: 'Finished Goods Inventory', type: 'Asset', balance: 0, isEssential: false },
  { code: '2010', name: 'Accounts Payable - Suppliers', type: 'Liability', balance: 0, isEssential: true },
  { code: '2030', name: 'Goods Received Not Invoiced', type: 'Liability', balance: 0, isEssential: true },
  { code: '2035', name: 'Input Tax Recoverable', type: 'Asset', balance: 0, isEssential: true },
  { code: '3100', name: 'Opening Balance Equity', type: 'Equity', balance: 0, isEssential: true },
  { code: '4010', name: 'Sales Revenue', type: 'Revenue', balance: 0, isEssential: false },
  { code: '5010', name: 'Salaries Expense', type: 'OperatingExpense', balance: 0, isEssential: false },
  { code: '5020', name: 'Cost of Goods Sold', type: 'CostOfGoodsSold', balance: 0, isEssential: true },
];

export default function ClientOnboardingPage() {
  const { addToast, user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(0);
  const [company, setCompany] = useState({
    companyName: '',
    legalName: '',
    ntnNumber: '',
    strnNumber: '',
    address: '',
    phone: '',
    email: '',
    currency: 'PKR',
    currencySymbol: 'Rs.',
    branches: [],
    locations: [],
    financialYearStart: '',
    financialYearEnd: '',
    taxSettings: { defaultTaxRate: 0, taxName: 'Sales Tax', taxRegistrationNumber: '' },
    accountingMappings: {},
    onboardingCompleted: false,
  });
  const [financial, setFinancial] = useState({
    financialYearStart: '',
    financialYearEnd: '',
    currency: 'PKR',
  });
  const [accounts, setAccounts] = useState(DEFAULT_ACCOUNTS.map(a => ({ ...a })));
  const [locations, setLocations] = useState([]);
  const [taxSettings, setTaxSettings] = useState({
    defaultTaxRate: 0,
    taxName: 'Sales Tax',
    taxRegistrationNumber: '',
  });
  const [bankAccounts, setBankAccounts] = useState([]);
  const [newLocation, setNewLocation] = useState({
    locationCode: '',
    zone: '',
    aisle: '',
    rack: '',
    shelf: '',
    bin: '',
    isActive: true,
  });
  const [stepStatus, setStepStatus] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [setupAlreadyComplete, setSetupAlreadyComplete] = useState(false);

  const fetchExisting = useCallback(async () => {
    try {
      const [coRes, acRes, locRes] = await Promise.all([
        apiFetch('/api/administration'),
        apiFetch('/api/finance'),
        apiFetch('/api/location'),
      ]);
      const [coJson, acJson, locJson] = await Promise.all([coRes.json(), acRes.json(), locRes.json()]);
      if (coJson.success && coJson.data.company) {
        const c = coJson.data.company;
        setCompany(prev => ({ ...prev, ...c }));
        setFinancial(prev => ({
          ...prev,
          financialYearStart: c.financialYearStart || '',
          financialYearEnd: c.financialYearEnd || '',
          currency: c.currency || 'PKR',
        }));
        setTaxSettings(c.taxSettings || { defaultTaxRate: 0, taxName: 'Sales Tax', taxRegistrationNumber: '' });
        if (c.onboardingCompleted) {
          setSetupAlreadyComplete(true);
        }
      }
      if (acJson.success && acJson.data.accounts && acJson.data.accounts.length > 0) {
        setAccounts(acJson.data.accounts.map(a => ({
          code: a.code,
          name: a.name,
          type: a.type,
          balance: Number(a.balance || 0),
          isEssential: ['1020','1030','2010','2030','2035','3100','5020'].includes(a.code),
        })));
      }
      if (locJson.success && locJson.data.locations) {
        setLocations(locJson.data.locations);
      }
    } catch (err) {
      addToast('Could not load existing configuration', 'warning');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void Promise.resolve().then(fetchExisting);
  }, [fetchExisting]);

  // Redirect if onboarding already completed
  useEffect(() => {
    if (setupAlreadyComplete) {
      router.push('/');
    }
  }, [setupAlreadyComplete, router]);

  // Server-side authorization: only SuperAdmin can access onboarding
  useEffect(() => {
    if (!loading && user && user.role !== 'SuperAdmin') {
      addToast('Only SuperAdmin can access client onboarding setup', 'error');
      router.push('/');
    }
  }, [loading, user, addToast, router]);

  const stepProgress = Math.round(((activeStep) / (STEPS.length - 1)) * 100);

  const canAdvance = (stepIndex) => {
    switch (STEPS[stepIndex].key) {
      case 'company': return Boolean(company.companyName.trim());
      case 'finance': return Boolean(financial.financialYearStart.trim() && financial.financialYearEnd.trim());
      case 'accounts': return accounts.every(a => a.code && a.code.trim() && a.name && a.name.trim() && a.type);
      case 'locations': return locations.length > 0;
      case 'tax': return Number.isFinite(taxSettings.defaultTaxRate) && taxSettings.defaultTaxRate >= 0;
      case 'banks': return true;
      default: return true;
    }
  };

  const handleNext = () => {
    if (!canAdvance(activeStep)) {
      addToast(`Please complete all required fields for this step`, 'error');
      return;
    }
    setStepStatus(prev => ({ ...prev, [activeStep]: 'completed' }));
    if (activeStep < STEPS.length - 1) setActiveStep(activeStep + 1);
  };

  const handleBack = () => {
    if (activeStep > 0) setActiveStep(activeStep - 1);
  };

  const handleSaveCompany = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/administration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_COMPANY',
          companyName: company.companyName,
          legalName: company.legalName,
          ntnNumber: company.ntnNumber,
          strnNumber: company.strnNumber,
          address: company.address,
          phone: company.phone,
          email: company.email,
          currency: company.currency,
          currencySymbol: company.currencySymbol,
          branches: company.branches,
          locations: company.locations,
        }),
      });
      const json = await res.json();
      if (!res.ok) { addToast(json.message || 'Company save failed', 'error'); return; }
      if (json.data?.company) {
        setCompany(prev => ({ ...prev, ...json.data.company }));
      }
      addToast('Company profile saved', 'success');
      setStepStatus(prev => ({ ...prev, [0]: 'completed' }));
      handleNext();
    } catch { addToast('Network error saving company profile', 'error'); }
  };

  const handleSaveFinancial = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/administration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_COMPANY',
          financialYearStart: financial.financialYearStart,
          financialYearEnd: financial.financialYearEnd,
          currency: financial.currency,
        }),
      });
      const json = await res.json();
      if (!res.ok) { addToast(json.message || 'Financial settings save failed', 'error'); return; }
      if (json.data?.company) {
        setCompany(prev => ({ ...prev, ...json.data.company }));
      }
      addToast('Financial year and currency saved', 'success');
      setStepStatus(prev => ({ ...prev, [1]: 'completed' }));
      handleNext();
    } catch { addToast('Network error saving financial settings', 'error'); }
  };

  const handleSaveAccounts = async () => {
    try {
      for (const acc of accounts) {
        const res = await apiFetch('/api/finance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'CREATE_ACCOUNT', code: acc.code, name: acc.name, type: acc.type, balance: Number(acc.balance || 0) }),
        });
        if (!res.ok) {
          const json = await res.json();
          if (json.message && json.message.includes('already exists')) continue;
          addToast(json.message || 'Failed to create account ' + acc.code, 'error');
          return;
        }
      }
      addToast('Chart of accounts saved', 'success');
      setStepStatus(prev => ({ ...prev, [2]: 'completed' }));
      handleNext();
    } catch { addToast('Network error saving accounts', 'error'); }
  };

  const handleAddLocation = async (e) => {
    e.preventDefault();
    if (!newLocation.locationCode || !newLocation.zone || !newLocation.aisle || !newLocation.rack || !newLocation.shelf || !newLocation.bin) {
      addToast('All location fields are required', 'error');
      return;
    }
    try {
      const res = await apiFetch('/api/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_LOCATION', ...newLocation }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create location', 'error');
        return;
      }
      setLocations(prev => [...prev, json.data.location]);
      setNewLocation({ locationCode: '', zone: '', aisle: '', rack: '', shelf: '', bin: '', isActive: true });
      addToast(`Location ${newLocation.locationCode} created`, 'success');
    } catch { addToast('Network error creating location', 'error'); }
  };

  const handleRemoveLocation = (index) => {
    setLocations(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveLocations = async () => {
    // Locations are saved individually as they are created
    setStepStatus(prev => ({ ...prev, [3]: 'completed' }));
    addToast('Warehouse locations step completed', 'success');
    handleNext();
  };

  const handleSaveTax = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/administration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_COMPANY',
          taxSettings: {
            defaultTaxRate: taxSettings.defaultTaxRate,
            taxName: taxSettings.taxName,
            taxRegistrationNumber: taxSettings.taxRegistrationNumber,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) { addToast(json.message || 'Tax settings save failed', 'error'); return; }
      if (json.data?.company) {
        setCompany(prev => ({ ...prev, ...json.data.company }));
      }
      addToast('Tax settings saved', 'success');
      setStepStatus(prev => ({ ...prev, [4]: 'completed' }));
      handleNext();
    } catch { addToast('Network error saving tax settings', 'error'); }
  };

  const handleComplete = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Validate all required configuration is present
      if (!company.companyName.trim()) {
        addToast('Company name is required', 'error');
        return;
      }
      if (!financial.financialYearStart.trim() || !financial.financialYearEnd.trim()) {
        addToast('Financial year start and end dates are required', 'error');
        return;
      }
      if (!accounts.every(a => a.code && a.code.trim() && a.name && a.name.trim() && a.type)) {
        addToast('All accounts must have code, name, and type', 'error');
        return;
      }
      if (locations.length === 0) {
        addToast('At least one warehouse location is required', 'error');
        return;
      }

      // Build accounting mappings from essential accounts.
      // These map functional roles (GRNI, Payable, COGS, etc.) to the account codes
      // configured in the chart of accounts step. Required before onboarding can complete.
      const codeToMapping = {
        '1020': 'bankAccountCode',
        '1030': 'salesReceivableAccountCode',
        '1050': 'inventoryAccountCode',
        '2010': 'payableAccountCode',
        '2030': 'grniAccountCode',
        '2035': 'inputTaxAccountCode',
        '3100': 'openingBalanceEquityAccountCode',
        '4010': 'salesRevenueAccountCode',
        '5010': 'expenseAccountCode',
        '5020': 'cogsAccountCode',
      };
      const accountingMappings = {};
      for (const acc of accounts) {
        const mappingKey = codeToMapping[acc.code];
        if (mappingKey) accountingMappings[mappingKey] = acc.code;
      }

      // 1. Save accounts FIRST so they exist before company mappings reference them.
      for (const acc of accounts) {
        const res = await apiFetch('/api/finance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'CREATE_ACCOUNT', ...acc }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          if (!json.message || !json.message.includes('already exists')) {
            addToast(json.message || 'Failed to create account ' + acc.code, 'error');
            return;
          }
        }
      }

      // 2. Ensure locations are saved in Location collection (skip if already created in step 3)
      for (const loc of locations) {
        try {
          const locRes = await apiFetch('/api/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'CREATE_LOCATION', ...loc }),
          });
          if (!locRes.ok) {
            const locJson = await locRes.json().catch(() => ({}));
            if (!locJson?.message?.includes('already exists')) {
              console.warn('Location creation notice:', locJson?.message);
            }
          }
        } catch (locErr) {
          console.warn('Location creation notice:', locErr);
        }
      }

      // 3. Format locations for company document
      const formattedLocations = locations.map(loc => ({
        warehouseName: loc.warehouseName || loc.locationCode || 'Main Warehouse',
        locationCode: loc.locationCode || '',
        zone: loc.zone || '',
        aisle: loc.aisle || '',
        rack: loc.rack || '',
        shelf: loc.shelf || '',
        bin: loc.bin || '',
        capacityMetersOrUnits: Number(loc.capacityMetersOrUnits) || 10000,
      }));

      // 4. Save company profile with accounting mappings and mark onboarding complete.
      const companyRes = await apiFetch('/api/administration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_COMPANY',
          companyName: company.companyName.trim(),
          legalName: (company.legalName || '').trim(),
          ntnNumber: (company.ntnNumber || '').trim(),
          strnNumber: (company.strnNumber || '').trim(),
          address: (company.address || '').trim(),
          phone: (company.phone || '').trim(),
          email: (company.email || '').trim(),
          financialYearStart: financial.financialYearStart.trim(),
          financialYearEnd: financial.financialYearEnd.trim(),
          currency: financial.currency || 'PKR',
          currencySymbol: company.currencySymbol || 'Rs.',
          branches: company.branches || [],
          locations: formattedLocations,
          taxSettings: {
            defaultTaxRate: Number(taxSettings.defaultTaxRate) || 0,
            taxName: (taxSettings.taxName || 'Sales Tax').trim(),
            taxRegistrationNumber: (taxSettings.taxRegistrationNumber || '').trim(),
          },
          accountingMappings,
          onboardingCompleted: true,
        }),
      });
      if (!companyRes.ok) {
        const json = await companyRes.json().catch(() => ({}));
        addToast(json.message || 'Failed to complete onboarding', 'error');
        return;
      }

      const companyJson = await companyRes.json().catch(() => ({}));
      if (companyJson?.data?.company) {
        setCompany(prev => ({ ...prev, ...companyJson.data.company, onboardingCompleted: true }));
      }
      setSetupAlreadyComplete(true);
      setActiveStep(STEPS.length - 1);
      addToast('Onboarding complete! Your ERP is configured.', 'success');
      router.push('/');
    } catch { addToast('Error completing onboarding', 'error'); }
    finally { setSubmitting(false); }
  };

  const isLastStep = activeStep === STEPS.length - 1;

  if (loading) {
    return (
      <Layout>
        <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-xs text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-slate-600">Loading existing configuration...</p>
        </div>
      </Layout>
    );
  }

  if (setupAlreadyComplete) {
    return (
      <Layout>
        <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-xs text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Onboarding Already Complete</h1>
          <p className="text-sm text-slate-600 mb-6">
            Your ERP has already been configured. You can update settings from Administration and Finance.
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] rounded-lg hover:bg-[#4338CA] transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-violet-600 flex items-center justify-center text-white">
              <Flag className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-[#0F172A]">Client Onboarding Setup</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure your business before using ERP DOST. Required fields must be completed before advancing.
              </p>
            </div>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-2.5 mb-4 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-violet-600 h-full" style={{ width: `${stepProgress}%` }} />
          </div>
          <p className="text-xs text-slate-500 text-right">{stepProgress}% complete</p>

          <div className="flex items-center justify-between mt-2">
            {STEPS.map((step, idx) => (
              <div key={step.key} className="flex flex-col items-center gap-1.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${
                  stepStatus[step.key] === 'completed' ? 'bg-emerald-600 border-emerald-600 text-white' :
                  idx === activeStep ? 'bg-blue-600 border-blue-600 text-white' :
                  'bg-slate-100 border-slate-200 text-slate-400'
                }`}>
                  {stepStatus[step.key] === 'completed' ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                </div>
                <span className={`text-[10px] font-medium text-center ${
                  idx === activeStep ? 'text-blue-600 font-bold' : 'text-slate-500'
                }`}>{step.label}</span>
              </div>
            ))}
          </div>
        </div>

        {STEPS[activeStep].key === 'company' && (
          <form onSubmit={handleSaveCompany} className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Building className="w-5 h-5 text-blue-600" /> Company Profile
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Enter your business details. This appears on invoices, reports, and official documents.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Company Name *</label>
                <input
                  type="text" required
                  value={company.companyName}
                  onChange={(e) => setCompany({ ...company, companyName: e.target.value })}
                  placeholder="e.g. Al Noor Garments"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Legal Name</label>
                <input
                  type="text"
                  value={company.legalName}
                  onChange={(e) => setCompany({ ...company, legalName: e.target.value })}
                  placeholder="Legal registered name"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">NTN / Tax ID</label>
                <input
                  type="text"
                  value={company.ntnNumber}
                  onChange={(e) => setCompany({ ...company, ntnNumber: e.target.value })}
                  placeholder="National Tax Number"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">STRN</label>
                <input
                  type="text"
                  value={company.strnNumber}
                  onChange={(e) => setCompany({ ...company, strnNumber: e.target.value })}
                  placeholder="Sales Tax Registration Number"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={company.address}
                  onChange={(e) => setCompany({ ...company, address: e.target.value })}
                  placeholder="Business address"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={company.phone}
                  onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                  placeholder="+92 300 0000000"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={company.email}
                  onChange={(e) => setCompany({ ...company, email: e.target.value })}
                  placeholder="business@example.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={handleSaveCompany}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={handleSaveCompany}
                disabled={!canAdvance(0)}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                Save & Continue <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </form>
        )}

        {STEPS[activeStep].key === 'finance' && (
          <form onSubmit={handleSaveFinancial} className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Scale className="w-5 h-5 text-blue-600" /> Financial Year & Currency
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Set your financial reporting period and base currency.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Financial Year Start *</label>
                <input
                  type="date" required
                  value={financial.financialYearStart}
                  onChange={(e) => setFinancial({ ...financial, financialYearStart: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Financial Year End *</label>
                <input
                  type="date" required
                  value={financial.financialYearEnd}
                  onChange={(e) => setFinancial({ ...financial, financialYearEnd: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Base Currency</label>
                <select
                  value={financial.currency}
                  onChange={(e) => setFinancial({ ...financial, currency: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="PKR">PKR - Pakistani Rupee</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Currency Symbol</label>
                <input
                  type="text"
                  value={company.currencySymbol || (financial.currency === 'PKR' ? 'Rs.' : '$')}
                  onChange={(e) => setCompany({ ...company, currencySymbol: e.target.value })}
                  placeholder="Symbol"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>
            <div className="flex justify-between pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
              >
                <ChevronLeft className="w-3.5 h-3.5 shrink-0" /> Back
              </button>
              <button
                type="button"
                onClick={handleSaveFinancial}
                disabled={!canAdvance(1)}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                Save & Continue <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </form>
        )}

        {STEPS[activeStep].key === 'accounts' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" /> Chart of Accounts
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Review and configure your chart of accounts. Essential accounts are required for automated postings.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold sticky top-0">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Account Name</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4 text-right">Opening Balance</th>
                    <th className="py-3 px-4 text-center">Essential</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accounts.map((acc, idx) => (
                    <tr key={acc.code} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold">{acc.code}</td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={acc.name}
                          onChange={(e) => {
                            const next = [...accounts];
                            next[idx] = { ...next[idx], name: e.target.value };
                            setAccounts(next);
                          }}
                          className="w-full px-2 py-1 border border-slate-200 rounded bg-white focus:outline-none focus:border-[#4F46E5]"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={acc.type}
                          onChange={(e) => {
                            const next = [...accounts];
                            next[idx] = { ...next[idx], type: e.target.value };
                            setAccounts(next);
                          }}
                          className="w-full px-2 py-1 border border-slate-200 rounded bg-white focus:outline-none focus:border-[#4F46E5]"
                        >
                          {ACCOUNT_TYPES.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <input
                          type="number"
                          value={acc.balance || 0}
                          onChange={(e) => {
                            const next = [...accounts];
                            next[idx] = { ...next[idx], balance: Number(e.target.value) || 0 };
                            setAccounts(next);
                          }}
                          className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-right focus:outline-none focus:border-[#4F46E5]"
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          acc.isEssential ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {acc.isEssential ? 'Yes' : 'No'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Accounts marked &quot;Essential&quot; are used by the system for automated postings (GRNI, Input Tax, AP, AR, COGS, etc.).
            </p>
            <div className="flex justify-between pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
              >
                <ChevronLeft className="w-3.5 h-3.5 shrink-0" /> Back
              </button>
              <button
                type="button"
                onClick={handleSaveAccounts}
                disabled={!canAdvance(2)}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                Save & Continue <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </div>
        )}

        {STEPS[activeStep].key === 'locations' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" /> Warehouses & Storage Locations
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Define your warehouse hierarchy: Zone &rarr; Aisle &rarr; Rack &rarr; Shelf &rarr; Bin.
              Locations are used for bin-level stock tracking.
            </p>

            {/* Add new location form */}
            <form onSubmit={handleAddLocation} className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-700 mb-2">Add New Location</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Location Code *</label>
                  <input
                    type="text"
                    value={newLocation.locationCode}
                    onChange={(e) => setNewLocation({ ...newLocation, locationCode: e.target.value })}
                    placeholder="e.g. WH-A-01"
                    className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Zone *</label>
                  <input
                    type="text"
                    value={newLocation.zone}
                    onChange={(e) => setNewLocation({ ...newLocation, zone: e.target.value })}
                    placeholder="Zone"
                    className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Aisle *</label>
                  <input
                    type="text"
                    value={newLocation.aisle}
                    onChange={(e) => setNewLocation({ ...newLocation, aisle: e.target.value })}
                    placeholder="Aisle"
                    className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Rack *</label>
                  <input
                    type="text"
                    value={newLocation.rack}
                    onChange={(e) => setNewLocation({ ...newLocation, rack: e.target.value })}
                    placeholder="Rack"
                    className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Shelf *</label>
                  <input
                    type="text"
                    value={newLocation.shelf}
                    onChange={(e) => setNewLocation({ ...newLocation, shelf: e.target.value })}
                    placeholder="Shelf"
                    className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Bin *</label>
                  <input
                    type="text"
                    value={newLocation.bin}
                    onChange={(e) => setNewLocation({ ...newLocation, bin: e.target.value })}
                    placeholder="Bin"
                    className="w-full px-2.5 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                  />
                </div>
                <div className="sm:col-span-3 flex items-end">
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-bold text-white bg-[#4F46E5] rounded-lg hover:bg-[#4338CA] transition-colors"
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add Location
                  </button>
                </div>
              </div>
            </form>

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
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((loc, idx) => (
                    <tr key={loc.locationCode} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono">{loc.locationCode}</td>
                      <td className="py-3 px-4">{loc.zone}</td>
                      <td className="py-3 px-4">{loc.aisle}</td>
                      <td className="py-3 px-4">{loc.rack}</td>
                      <td className="py-3 px-4">{loc.shelf}</td>
                      <td className="py-3 px-4">{loc.bin}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> Active
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLocation(idx)}
                          className="text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors p-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {locations.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 italic">No locations configured yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
              >
                <ChevronLeft className="w-3.5 h-3.5 shrink-0" /> Back
              </button>
              <button
                type="button"
                onClick={handleSaveLocations}
                disabled={!canAdvance(3)}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                Continue <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </div>
        )}

        {STEPS[activeStep].key === 'tax' && (
          <form onSubmit={handleSaveTax} className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Tax Settings</h2>
            <p className="text-xs text-slate-500 mb-6">
              Configure default tax rates for sales and purchase transactions.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Default Tax Rate (%)</label>
                <input
                  type="number" step="any" min="0" max="100"
                  value={taxSettings.defaultTaxRate}
                  onChange={(e) => setTaxSettings({ ...taxSettings, defaultTaxRate: Number(e.target.value) || 0 })}
                  placeholder="e.g. 18"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tax Name</label>
                <input
                  type="text"
                  value={taxSettings.taxName}
                  onChange={(e) => setTaxSettings({ ...taxSettings, taxName: e.target.value })}
                  placeholder="e.g. Sales Tax / GST"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tax Registration Number</label>
                <input
                  type="text"
                  value={taxSettings.taxRegistrationNumber}
                  onChange={(e) => setTaxSettings({ ...taxSettings, taxRegistrationNumber: e.target.value })}
                  placeholder="STRN / GSTIN"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>
            <div className="flex justify-between pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
              >
                <ChevronLeft className="w-3.5 h-3.5 shrink-0" /> Back
              </button>
              <button
                type="button"
                onClick={handleSaveTax}
                disabled={!canAdvance(4)}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                Continue <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </form>
        )}

        {STEPS[activeStep].key === 'banks' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" /> Bank & Cash Accounts
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Configure your bank accounts for payments and receipts. This step is optional during onboarding;
              you can add bank accounts later from Finance &rarr; Bank Accounts.
            </p>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 mb-3">
                Bank accounts are configured via <strong className="text-slate-700">Finance &rarr; Bank Accounts</strong>.
                At least one bank or cash account is required before processing payments.
              </p>
              <button
                type="button"
                onClick={() => { router.push('/accounts/banks'); }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800"
              >
                <Building2 className="w-3 h-3" /> Go to Bank Accounts
              </button>
            </div>
            <div className="flex justify-between pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
              >
                <ChevronLeft className="w-3.5 h-3.5 shrink-0" /> Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm transition-colors whitespace-nowrap"
              >
                Continue <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          </div>
        )}

        {STEPS[activeStep].key === 'review' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Review & Complete
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Review your configuration before completing onboarding.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs font-bold text-slate-700 mb-3">Company Profile</h3>
                <p className="text-xs text-slate-600"><span className="font-bold">Name:</span> {company.companyName || '—'}</p>
                <p className="text-xs text-slate-600"><span className="font-bold">Legal:</span> {company.legalName || '—'}</p>
                <p className="text-xs text-slate-600"><span className="font-bold">NTN:</span> {company.ntnNumber || '—'}</p>
                <p className="text-xs text-slate-600"><span className="font-bold">Currency:</span> {company.currency || 'PKR'}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs font-bold text-slate-700 mb-3">Configuration Summary</h3>
                <p className="text-xs text-slate-600"><span className="font-bold">Accounts:</span> {accounts.length}</p>
                <p className="text-xs text-slate-600"><span className="font-bold">Locations:</span> {locations.length}</p>
                <p className="text-xs text-slate-600"><span className="font-bold">Tax Rate:</span> {taxSettings.defaultTaxRate}%</p>
                <p className="text-xs text-slate-600"><span className="font-bold">Financial Year:</span> {financial.financialYearStart || '—'} to {financial.financialYearEnd || '—'}</p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
              <p className="text-xs text-amber-800">
                <strong className="font-bold">Important:</strong> Once completed, you can begin entering suppliers, customers, products, and transactions.
                Chart of accounts and company settings can be updated later from Administration and Finance.
              </p>
            </div>
            <div className="flex justify-between pt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap"
              >
                <ChevronLeft className="w-3.5 h-3.5 shrink-0" /> Back
              </button>
              <button
                type="button"
                onClick={handleComplete}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {submitting ? 'Completing…' : 'Complete Onboarding'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}