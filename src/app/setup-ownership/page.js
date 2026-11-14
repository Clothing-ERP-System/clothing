'use client';

import React, { useEffect, useState, useMemo, Suspense } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ShieldCheck,
  LockKeyhole,
  Mail,
  UserRound,
  Eye,
  EyeOff,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { evaluatePasswordStrength } from '@/lib/password-policy.js';

function SetupOwnershipContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const { setUser, addToast } = useAuth();

  const [checking, setChecking] = useState(Boolean(token));
  const [tokenValid, setTokenValid] = useState(false);
  const [errorMessage, setErrorMessage] = useState(
    token ? '' : 'Missing handover authorization token. Please use the link provided in your invitation.'
  );
  const [invitationData, setInvitationData] = useState(null);

  const [clientName, setClientName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [claimedSuccess, setClaimedSuccess] = useState(false);

  const passwordStrength = useMemo(() => evaluatePasswordStrength(password), [password]);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  useEffect(() => {
    if (!token) return;

    let active = true;
    fetch(`/api/auth/handover?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.message || 'Handover token is invalid or expired');
        }
        if (active) {
          setTokenValid(true);
          setInvitationData(json.data);
          setClientName(json.data.clientName || '');
        }
      })
      .catch((err) => {
        if (active) {
          setErrorMessage(err.message || 'Unable to validate handover token');
        }
      })
      .finally(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!passwordStrength.isValid) {
      addToast('Password does not meet the 12-character security criteria', 'error');
      return;
    }
    if (!passwordsMatch) {
      addToast('Passwords do not match', 'error');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/auth/handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CLAIM_OWNERSHIP',
          token,
          clientEmail: invitationData?.clientEmail,
          clientName: clientName.trim(),
          password,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Failed to claim ownership');
      }

      setClaimedSuccess(true);
      if (json.data?.user) {
        setUser(json.data.user);
      }
      addToast('SuperAdmin ownership established successfully!', 'success');
      setTimeout(() => {
        router.replace('/');
      }, 1500);
    } catch (err) {
      setErrorMessage(err.message || 'An error occurred during handover claim');
      addToast(err.message || 'Handover failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-xl">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 mb-4 shadow-lg shadow-indigo-500/10">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            ERP DOST
          </h1>
          <p className="text-xs uppercase tracking-widest text-indigo-400 font-semibold mt-1">
            Secure Client SuperAdmin Handover
          </p>
        </div>

        {/* Card Container */}
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Subtle accent glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          {checking ? (
            <div className="py-16 text-center space-y-3">
              <div className="inline-block animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
              <p className="text-sm text-slate-400">Verifying secure handover authorization token...</p>
            </div>
          ) : !tokenValid ? (
            <div className="py-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-white">Invalid or Expired Handover Link</h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                {errorMessage || 'This one-time setup token is invalid, has expired, or has already been used to establish ownership.'}
              </p>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => router.push('/login')}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition"
                >
                  Go to Login Page
                </button>
              </div>
            </div>
          ) : claimedSuccess ? (
            <div className="py-10 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-white">SuperAdmin Ownership Established!</h2>
              <p className="text-sm text-slate-300">
                Welcome, <span className="font-semibold text-white">{clientName}</span>. Your account has been granted full SuperAdmin authority.
              </p>
              <p className="text-xs text-slate-500">
                Redirecting to your blank workspace dashboard...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-xs font-medium border border-indigo-500/20 mb-2">
                  <Sparkles className="w-3.5 h-3.5" /> Permanent Ownership Claim
                </span>
                <h2 className="text-lg font-bold text-white">Create Your SuperAdmin Account</h2>
                <p className="text-xs text-slate-400 mt-1">
                  You are establishing direct client ownership of this ERP DOST instance. Your credentials will have unrestricted administrative control.
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Verified Email Field (Read-only) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Verified Client Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    readOnly
                    value={invitationData?.clientEmail || ''}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800/60 border border-slate-700/80 rounded-xl text-slate-300 text-sm font-medium focus:outline-hidden cursor-not-allowed"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Bound strictly to the verified client email authorized by the handover invitation.
                </p>
              </div>

              {/* Client Name Field */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Full Name / Administrator Name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <UserRound className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. Tariq Mehmood"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-hidden focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  New Secure Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <LockKeyhole className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter at least 12 characters"
                    className="w-full pl-10 pr-11 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-hidden focus:border-indigo-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password Strength Meter */}
                {password.length > 0 && (
                  <div className="mt-2.5 space-y-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Password Strength:</span>
                      <span className={`font-semibold ${passwordStrength.textClass}`}>
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 h-1.5">
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={`h-full rounded-full transition-all duration-300 ${
                            passwordStrength.score >= step
                              ? passwordStrength.colorClass
                              : 'bg-slate-700'
                          }`}
                        />
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                      <div className={`flex items-center gap-1.5 ${passwordStrength.minLength ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {passwordStrength.minLength ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        <span>Min 12 characters</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordStrength.hasUpper ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {passwordStrength.hasUpper ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        <span>Uppercase letter (A-Z)</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordStrength.hasLower ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {passwordStrength.hasLower ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        <span>Lowercase letter (a-z)</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordStrength.hasNumber ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {passwordStrength.hasNumber ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        <span>Number (0-9)</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${passwordStrength.hasSpecial ? 'text-emerald-400' : 'text-slate-500'} col-span-2`}>
                        {passwordStrength.hasSpecial ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        <span>Special symbol (!@#$%^&*...)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password Field */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <LockKeyhole className="w-4 h-4" />
                  </div>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full pl-10 pr-11 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-hidden focus:border-indigo-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200"
                  >
                    {showConfirmPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && (
                  <p className={`text-[11px] mt-1 flex items-center gap-1 ${passwordsMatch ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {passwordsMatch ? (
                      <>
                        <Check className="w-3 h-3" /> Passwords match
                      </>
                    ) : (
                      <>
                        <X className="w-3 h-3" /> Passwords do not match
                      </>
                    )}
                  </p>
                )}
              </div>

              {/* Security Advisory Notice */}
              <div className="p-3.5 bg-slate-950/70 border border-indigo-900/40 rounded-2xl text-[11px] text-slate-400 space-y-1">
                <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" /> One-Time Handover Protection
                </div>
                <p>
                  Upon submission, this authorization link will be permanently invalidated. You will immediately be authenticated as the SuperAdmin of ERP DOST with full workspace access.
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting || !passwordStrength.isValid || !passwordsMatch || !clientName}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Establishing SuperAdmin Ownership...</span>
                  </>
                ) : (
                  <>
                    <span>Claim System Ownership & Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-xs text-slate-600">
          ERP DOST Garment Manufacturing Platform &bull; Handover Security Layer
        </div>
      </div>
    </div>
  );
}

export default function SetupOwnershipPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <SetupOwnershipContent />
    </Suspense>
  );
}
