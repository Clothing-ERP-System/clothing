'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Factory,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
  Eye,
  EyeOff,
  Check,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch.js';
import { evaluatePasswordStrength } from '@/lib/password-policy.js';

export default function LoginPage() {
  const router = useRouter();
  const { addToast, setUser } = useAuth();
  const [setupRequired, setSetupRequired] = useState(false);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [databaseError, setDatabaseError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [setupToken, setSetupToken] = useState('');
  const [tokenRequired, setTokenRequired] = useState(false);
  const [setupAvailable, setSetupAvailable] = useState(false);

  const passwordStrength = useMemo(() => evaluatePasswordStrength(password), [password]);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  useEffect(() => {
    let active = true;
    apiFetch('/api/auth/setup')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'MySQL connection unavailable');
        if (active) {
          setSetupRequired(result.data.setupRequired);
          setSetupAvailable(result.data.setupAvailable);
          setTokenRequired(Boolean(result.data.tokenRequired));
        }
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

    if (setupRequired) {
      if (!passwordStrength.isValid) {
        addToast('Password must meet all complexity requirements (12+ chars, uppercase, lowercase, number, symbol)', 'error');
        return;
      }
      if (!passwordsMatch) {
        addToast('Passwords do not match', 'error');
        return;
      }
    }

    setSubmitting(true);
    setDatabaseError('');
    try {
      const response = await fetch(setupRequired ? '/api/auth/setup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupRequired
          ? { name, email, password, setupToken }
          : { email, password }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.errors?.setupRequired) setSetupRequired(true);
        throw new Error(result.message || 'Unable to continue');
      }
      if (!result.data?.user) throw new Error('The server did not return an authenticated user');
      setUser(result.data.user);
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
        <section className="relative hidden min-h-[660px] flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-950 p-8 text-white lg:flex">
          <div className="absolute -right-24 top-28 h-72 w-72 rounded-full border border-white/10" />
          <div className="absolute -right-10 top-44 h-44 w-44 rounded-full border border-white/10" />
          <div className="relative flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <Factory className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide">ERPDOST</p>
              <p className="text-xs text-indigo-200">Garment Manufacturing Operations</p>
            </div>
          </div>

          <div className="relative max-w-md my-3">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-indigo-100">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Private company workspace
            </div>
            <h1 className="text-2xl xl:text-3xl font-semibold leading-tight tracking-tight">
              Every part of your garment operations, in one place.
            </h1>
            <p className="mt-2 text-xs leading-5 text-indigo-100/80">
              Manage fabrics, cutting, production, orders, inventory, and accounting using real-time company data.
            </p>

            {/* Garment Operations Visual Image */}
            <div className="mt-4 relative rounded-2xl overflow-hidden border border-white/15 shadow-xl bg-slate-900/60 aspect-[4/3] max-w-sm">
              <Image
                src="/images/garment-factory.svg"
                alt="Apparel & Garment Manufacturing Operations"
                width={400}
                height={300}
                className="w-full h-full object-cover"
                priority
              />
            </div>
          </div>

          <p className="relative text-xs text-indigo-200/70 border-t border-white/10 pt-3">
            Configured for your company database. No sample or mock records are loaded.
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

          {setupRequired && !setupAvailable && !checking && (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Owner setup is not enabled</p>
              <p className="mt-1 text-xs leading-5">
                The owner must configure INITIAL_SUPERADMIN_SETUP_TOKEN in the server&apos;s .env.local before creating the first administrator.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {setupRequired && (
              <>
                {tokenRequired && (
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">Owner setup token</span>
                    <span className="relative block">
                      <ShieldCheck className="pointer-events-none z-10 absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="password"
                        autoComplete="one-time-code"
                        value={setupToken}
                        onChange={(event) => setSetupToken(event.target.value)}
                        required
                        minLength={32}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                      />
                    </span>
                  </label>
                )}
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Administrator name</span>
                  <span className="relative block">
                    <UserRound className="pointer-events-none z-10 absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      autoComplete="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="e.g. Director Operations"
                      required
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </span>
                </label>
              </>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Work email</span>
              <span className="relative block">
                <Mail className="pointer-events-none z-10 absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@company.com"
                  required
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                {setupRequired ? 'Create password' : 'Password'}
              </span>
              <span className="relative block">
                <LockKeyhole className="pointer-events-none z-10 absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={setupRequired ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 focus:outline-none z-10 cursor-pointer"
                >
                  {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </span>
            </label>

            {/* Password Strength Indicator — ONLY on password creation (setupRequired) */}
            {setupRequired && password.length > 0 && (
              <div className="space-y-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-500">Password strength</span>
                  <span className={`font-bold ${passwordStrength.textClass}`}>{passwordStrength.label}</span>
                </div>
                {/* 4-segment meter */}
                <div className="grid grid-cols-4 gap-1.5 h-1.5">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-full rounded-full transition-all duration-300 ${
                        passwordStrength.score >= level ? passwordStrength.colorClass : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    />
                  ))}
                </div>
                {/* Complexity checklist */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] pt-1">
                  <span className={`flex items-center gap-1 ${passwordStrength.minLength ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                    {passwordStrength.minLength ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0" />} 12+ characters
                  </span>
                  <span className={`flex items-center gap-1 ${passwordStrength.hasUpper ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                    {passwordStrength.hasUpper ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0" />} Uppercase letter
                  </span>
                  <span className={`flex items-center gap-1 ${passwordStrength.hasLower ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                    {passwordStrength.hasLower ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0" />} Lowercase letter
                  </span>
                  <span className={`flex items-center gap-1 ${passwordStrength.hasNumber && passwordStrength.hasSpecial ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                    {passwordStrength.hasNumber && passwordStrength.hasSpecial ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0" />} Number & symbol
                  </span>
                </div>
              </div>
            )}

            {/* Confirm Password — ONLY on password creation (setupRequired) */}
            {setupRequired && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700">Confirm password</span>
                <span className="relative block">
                  <LockKeyhole className="pointer-events-none z-10 absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat password"
                    required
                    className={`h-11 w-full rounded-xl border bg-white pl-10 pr-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                      confirmPassword.length > 0 && !passwordsMatch
                        ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/10'
                        : 'border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/10'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 focus:outline-none z-10 cursor-pointer"
                  >
                    {showConfirmPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </span>
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <span className="mt-1 block text-[11px] text-rose-500">Passwords do not match.</span>
                )}
              </label>
            )}

            <button
              type="submit"
              disabled={
                checking ||
                submitting ||
                Boolean(databaseError) ||
                (setupRequired && (!passwordStrength.isValid || !passwordsMatch || !name.trim() || !email.trim()))
              }
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>{submitting ? 'Please wait…' : setupRequired ? 'Create workspace administrator' : 'Sign in'}</span>
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
