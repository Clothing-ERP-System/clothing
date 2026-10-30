'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Activity, Check, Database, RefreshCw, Server, ShieldCheck } from 'lucide-react';

export default function SettingsPage() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkConnection = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/system/health', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'MySQL connection failed');
      setHealth(result.data);
    } catch (error) {
      setHealth({ status: 'disconnected', message: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(checkConnection);
  }, [checkConnection]);

  return (
    <Layout>
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-7 text-white shadow-xl shadow-slate-900/10 sm:p-9">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-medium text-indigo-100">
                <ShieldCheck className="h-3.5 w-3.5" />
                Workspace settings
              </span>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">System status</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                Review the active application services. Database credentials are managed in the server environment.
              </p>
            </div>
            <div className="hidden h-14 w-14 place-items-center rounded-2xl bg-white/10 sm:grid">
              <Activity className="h-6 w-6 text-indigo-200" />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className={`grid h-12 w-12 place-items-center rounded-2xl ${
                health?.status === 'connected' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
              }`}>
                <Database className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">MySQL database</p>
                <p className="mt-1 text-xs text-slate-500">
                  {loading ? 'Checking connection…' : health?.status === 'connected'
                    ? `${health.databaseName} · Connected`
                    : health?.message || 'Connection unavailable'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={checkConnection}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Test connection
            </button>
          </div>
          <div className="mt-5 grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
              <Server className="mt-0.5 h-4 w-4 text-slate-500" />
              <div>
                <p className="text-xs font-semibold text-slate-800">Connection settings</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  Configure MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD and MYSQL_DATABASE in .env.local.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
              <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
              <div>
                <p className="text-xs font-semibold text-slate-800">Workspace data</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  Records are stored in MySQL. The workspace does not load sample or demo records.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
