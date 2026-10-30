'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Factory, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { addToast } = useAuth();
  const [setupRequired, setSetupRequired] = useState(false);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [databaseError, setDatabaseError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/auth/setup')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'MySQL connection unavailable');
        if (active) setSetupRequired(result.data.setupRequired);
      })
      .catch((error) => {
        if (active) setDatabaseError(error.message);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => { active = false; };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setDatabaseError('');
    try {
      const response = await fetch(setupRequired ? '/api/auth/setup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupRequired ? { name, email, password } : { email, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.errors?.setupRequired) setSetupRequired(true);
        throw new Error(result.message || 'Unable to continue');
      }
      router.replace('/');
    } catch (error) {
      addToast(error.message || 'Unable to connect. Check your MySQL settings.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-slate-950 px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -right-36 h-[34rem] w-[34rem] rounded-full bg-violet-600/15 blur-3xl" />

      <div className="relative m-auto grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl shadow-black/30 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-950 p-10 text-white lg:flex">
          <div className="absolute -right-24 top-28 h-72 w-72 rounded-full border border-white/10" />
          <div className="absolute -right-10 top-44 h-44 w-44 rounded-full border border-white/10" />
          <div className="relative flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <Factory className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide">ERPDOST</p>
              <p className="text-xs text-indigo-200">Operations workspace</p>
            </div>
          </div>
          <div className="relative max-w-md">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-indigo-100">
              <ShieldCheck className="h-4 w-4" />
              Private company workspace
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              Every part of your operation, in one place.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-indigo-100/80">
              Manage materials, production, orders, people and accounts using your own business data.
            </p>
          </div>
          <p className="relative text-xs text-indigo-200/70">
            Your workspace starts empty. Add only the records your business needs.
          </p>
        </section>

        <section className="flex min-h-[580px] flex-col justify-center p-7 sm:p-10 lg:p-12">
          <div className="mb-9 lg:hidden">
            <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-indigo-600 text-white">
              <Factory className="h-5 w-5" />
            </div>
            <p className="text-sm font-bold tracking-wide text-slate-900">ERPDOST</p>
          </div>
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">
              {setupRequired ? 'First-time setup' : 'Secure access'}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              {checking ? 'Checking workspace…' : setupRequired ? 'Create your administrator' : 'Welcome back'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {checking
                ? 'Connecting to your company database.'
                : setupRequired
                  ? 'Set up the first administrator. No sample account or records are created.'
                  : 'Sign in with your company account to continue.'}
            </p>
          </div>

          {databaseError && (
            <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <p className="font-semibold">MySQL connection unavailable</p>
              <p className="mt-1 text-xs leading-5">{databaseError}</p>
              <p className="mt-2 text-xs leading-5">
                Configure MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD and MYSQL_DATABASE in .env.local, then restart the app.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {setupRequired && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">Administrator name</span>
                <span className="relative block">
                  <UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                  />
                </span>
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Work email</span>
              <span className="relative block">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                {setupRequired ? 'Create a password' : 'Password'}
              </span>
              <span className="relative block">
                <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  autoComplete={setupRequired ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={setupRequired ? 12 : undefined}
                  required
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
              </span>
              {setupRequired && (
                <span className="mt-1.5 block text-[11px] text-slate-500">Use at least 12 characters.</span>
              )}
            </label>
            <button
              type="submit"
              disabled={checking || submitting || Boolean(databaseError)}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>{submitting ? 'Please wait…' : setupRequired ? 'Create workspace' : 'Sign in'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-8 border-t border-slate-100 pt-5 text-center text-[11px] text-slate-400">
            Company data stays in your configured MySQL database.
          </div>
        </section>
      </div>
    </main>
  );
}
