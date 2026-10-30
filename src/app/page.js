'use client';

import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Link from 'next/link';
import {
  Shirt,
  Layers,
  Scissors,
  Store,
  Clock,
  ChevronRight,
  MoreHorizontal,
  Bell,
  Activity,
  ArrowUp,
  ShieldCheck,
  Coins,
} from 'lucide-react';

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/dashboard/stats');
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      } catch (err) {
        console.error('Error fetching dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const kpis = data?.kpis || {
    totalRevenue: 0,
    wholesaleSalesTotal: 0,
    retailPosSalesTotal: 0,
    totalFabricMeters: 0,
    totalRollsCount: 0,
    availableRollsCount: 0,
    totalCompletedPieces: 0,
    totalTargetPieces: 0,
    totalWipPieces: 0,
    overallEfficiency: 0,
    qualityPassRate: 0,
    totalReceivables: 0,
    totalPayables: 0,
  };

  const alerts = data?.alerts || {
    lowStockTrimsCount: 0,
    lowStockTrims: [],
    pendingCuttingOrdersCount: 0,
  };

  const productionTrends = data?.productionTrends || [
    { day: 'Mon', target: 0, actual: 0, efficiency: 0 },
    { day: 'Tue', target: 0, actual: 0, efficiency: 0 },
    { day: 'Wed', target: 0, actual: 0, efficiency: 0 },
    { day: 'Thu', target: 0, actual: 0, efficiency: 0 },
    { day: 'Fri', target: 0, actual: 0, efficiency: 0 },
    { day: 'Sat', target: 0, actual: 0, efficiency: 0 },
  ];

  const hasProductionData = productionTrends.some((pt) => pt.actual > 0 || pt.target > 0);

  return (
    <Layout>
      <div className="space-y-4">
        {/* ══════════════════════════════════════════════════════════════════════
            1. HERO BANNER — Elegant Flowing Waves, Botanical Leaves & Artwork
            ══════════════════════════════════════════════════════════════════════ */}
        <div className="relative overflow-hidden bg-gradient-to-r from-white via-indigo-50/50 to-purple-50/60 dark:from-slate-900 dark:via-indigo-950/50 dark:to-slate-900 rounded-2xl border border-indigo-100/90 dark:border-indigo-900/60 p-6 sm:p-7 min-h-[175px] shadow-sm flex flex-col justify-center">
          {/* Top-Left Botanical Accent Curve */}
          <div className="pointer-events-none absolute left-0 top-0 w-28 h-28 overflow-hidden z-0 opacity-40 dark:opacity-20">
            <svg viewBox="0 0 100 100" fill="none" className="w-full h-full">
              <path d="M0 0 C 35 15, 60 45, 70 90" stroke="#818CF8" strokeWidth="1.5" strokeDasharray="3 3" />
              <path d="M22 15 C 38 10, 48 24, 42 38 C 32 34, 22 25, 22 15 Z" fill="#818CF8" fillOpacity="0.22" />
              <path d="M42 35 C 62 30, 72 44, 65 60 C 52 56, 42 46, 42 35 Z" fill="#C084FC" fillOpacity="0.25" />
            </svg>
          </div>

          {/* Decorative Flowing Wave Shapes (Bottom & Right Corners) */}
          <div className="pointer-events-none absolute right-0 bottom-0 w-full max-w-2xl h-full overflow-hidden z-0 opacity-60 dark:opacity-25">
            <svg viewBox="0 0 500 160" fill="none" className="w-full h-full" preserveAspectRatio="none">
              <path
                d="M20 160 C 130 85, 240 145, 360 90 C 410 70, 455 105, 500 85 L 500 160 Z"
                fill="url(#heroWave1)"
              />
              <path
                d="M90 160 C 190 100, 300 140, 410 105 C 450 95, 480 115, 500 110 L 500 160 Z"
                fill="url(#heroWave2)"
              />
              <path
                d="M180 160 C 280 120, 360 148, 440 125 C 475 115, 490 130, 500 128 L 500 160 Z"
                fill="url(#heroWave3)"
              />
              <defs>
                <linearGradient id="heroWave1" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#818CF8" stopOpacity="0.5" />
                  <stop offset="50%" stopColor="#C084FC" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#F472B6" stopOpacity="0.18" />
                </linearGradient>
                <linearGradient id="heroWave2" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.4" />
                  <stop offset="60%" stopColor="#818CF8" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#C084FC" stopOpacity="0.1" />
                </linearGradient>
                <linearGradient id="heroWave3" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#C084FC" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#F472B6" stopOpacity="0.15" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Elegant Botanical Multi-Leaf Branch Illustration matching Reference Image */}
          <div className="pointer-events-none absolute right-12 sm:right-24 lg:right-80 top-1/2 -translate-y-1/2 flex items-center gap-3.5 z-0 opacity-85 dark:opacity-45">
            <svg className="w-24 h-32 text-indigo-500/70 dark:text-indigo-400/50" viewBox="0 0 90 130" fill="none">
              {/* Main curved botanical stem */}
              <path d="M45 125 C 45 75, 60 45, 78 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              {/* Left Leaf 1 */}
              <path d="M46 100 C 28 88, 16 64, 22 44 C 36 54, 42 78, 46 100 Z" fill="#818CF8" fillOpacity="0.35" stroke="currentColor" strokeWidth="1" />
              {/* Right Leaf 1 */}
              <path d="M50 78 C 70 64, 82 48, 86 30 C 70 34, 58 54, 50 78 Z" fill="#C084FC" fillOpacity="0.4" stroke="currentColor" strokeWidth="1" />
              {/* Left Leaf 2 */}
              <path d="M47 56 C 30 44, 24 26, 34 12 C 44 22, 46 42, 47 56 Z" fill="#38BDF8" fillOpacity="0.35" stroke="currentColor" strokeWidth="1" />
              {/* Top Bud / Leaf */}
              <path d="M72 22 C 80 12, 84 4, 80 0 C 72 4, 68 12, 72 22 Z" fill="#C084FC" fillOpacity="0.5" stroke="currentColor" strokeWidth="0.8" />
              {/* Delicate Floating Petals */}
              <ellipse cx="18" cy="28" rx="3.5" ry="6" transform="rotate(-30 18 28)" fill="#818CF8" fillOpacity="0.35" />
              <ellipse cx="82" cy="55" rx="3" ry="5" transform="rotate(25 82 55)" fill="#F472B6" fillOpacity="0.35" />
            </svg>
            <div className="hidden lg:block font-serif italic text-indigo-600/90 dark:text-indigo-300 text-xs leading-snug tracking-wide select-none">
              <span className="block font-medium">Better Process</span>
              <span className="block font-bold bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-300 dark:to-purple-300 bg-clip-text text-transparent">Bigger Growth</span>
            </div>
          </div>

          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 relative z-10">
            {/* Title & Live Status */}
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE ERP OPERATIONS
                </span>
                <span className="text-xs text-slate-400 font-medium">• Production Console</span>
              </div>

              <h1 className="text-xl sm:text-2xl lg:text-[1.7rem] font-black text-slate-900 dark:text-white tracking-tight leading-snug">
                ERP Dost —{' '}
                <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
                  Apparel & Garment Operations
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">
                Intelligent Production Tracking, Fabric Rolls & Retail Console
              </p>
            </div>

            {/* Quick Action Buttons in ONE clean horizontal row on desktop */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
              <Link
                href="/cutting"
                className="inline-flex items-center justify-center gap-2 px-4.5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-md shadow-indigo-500/25 transition-all duration-200 cursor-pointer hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Cutting Order →</span>
              </Link>

              <Link
                href="/fabric"
                className="inline-flex items-center justify-center gap-2 px-4.5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#0B0F19] hover:bg-slate-800 shadow-md shadow-slate-900/20 transition-all duration-200 cursor-pointer hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Fabric Rolls →</span>
              </Link>

              <Link
                href="/pos"
                className="inline-flex items-center justify-center gap-2 px-4.5 py-2.5 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-slate-900 border border-emerald-300/80 dark:border-emerald-700/80 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40 shadow-xs transition-all duration-200 cursor-pointer hover:-translate-y-0.5 active:scale-95 whitespace-nowrap"
              >
                <Store className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Retail POS →</span>
              </Link>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            2. FOUR KPI CARDS WITH ACTUAL COPIED ACCENT WAVE SHAPES & BOTANICALS
            ══════════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Total Sales Revenue (Mint Wave Shapes + Botanical Flourish) */}
          <div className="relative overflow-hidden bg-white/95 dark:bg-slate-900/95 p-4 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[148px]">
            {/* Top-Right Botanical Leaf Accent */}
            <div className="pointer-events-none absolute right-1 top-1 w-16 h-16 z-0 opacity-40 dark:opacity-20">
              <svg viewBox="0 0 60 60" fill="none" className="w-full h-full">
                <path d="M55 5 C 40 18, 25 35, 18 55" stroke="#10B981" strokeWidth="1" strokeOpacity="0.4" strokeLinecap="round" />
                <path d="M42 18 C 30 14, 25 24, 35 28 C 42 30, 45 24, 42 18 Z" fill="#34D399" fillOpacity="0.3" />
                <path d="M30 32 C 20 28, 16 38, 26 42 C 32 44, 35 38, 30 32 Z" fill="#06B6D4" fillOpacity="0.25" />
              </svg>
            </div>

            {/* Multi-layered Flowing Mint / Cyan Wave SVG */}
            <div className="pointer-events-none absolute right-0 bottom-0 w-40 h-26 z-0 opacity-55 dark:opacity-30">
              <svg viewBox="0 0 160 120" fill="none" className="w-full h-full" preserveAspectRatio="none">
                <path d="M0 120 C 45 75, 85 105, 160 60 L 160 120 Z" fill="url(#mintWave1)" />
                <path d="M30 120 C 70 85, 110 110, 160 85 L 160 120 Z" fill="url(#mintWave2)" />
                <circle cx="140" cy="70" r="14" stroke="#10B981" strokeOpacity="0.3" strokeWidth="1.5" fill="none" />
                <defs>
                  <linearGradient id="mintWave1" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#34D399" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.2" />
                  </linearGradient>
                  <linearGradient id="mintWave2" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#059669" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0.12" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <div>
              <div className="flex items-center justify-between relative z-10">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shadow-2xs">
                  <Coins className="w-4 h-4" />
                </div>
                <button type="button" aria-label="Card options" className="text-slate-300 hover:text-slate-500">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 relative z-10">
                TOTAL SALES REVENUE
              </p>

              <div className="mt-1 flex items-baseline gap-1.5 relative z-10">
                <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  Rs. {kpis.totalRevenue.toLocaleString()}
                </span>
              </div>

              <div className="mt-1 flex items-center gap-1 relative z-10">
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                  <ArrowUp className="w-2.5 h-2.5 text-emerald-600" />
                  {kpis.totalRevenue > 0 ? '12%' : '0%'}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">vs last month</span>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-indigo-50/80 dark:border-slate-800 flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-medium relative z-10">
              <span>Wholesale: Rs. {kpis.wholesaleSalesTotal.toLocaleString()}</span>
              <span>POS: Rs. {kpis.retailPosSalesTotal.toLocaleString()}</span>
            </div>
          </div>

          {/* Card 2: Stitching Output & WIP (Violet Wave Shapes + Botanical Flourish) */}
          <div className="relative overflow-hidden bg-white/95 dark:bg-slate-900/95 p-4 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[148px]">
            {/* Top-Right Botanical Leaf Accent */}
            <div className="pointer-events-none absolute right-1 top-1 w-16 h-16 z-0 opacity-40 dark:opacity-20">
              <svg viewBox="0 0 60 60" fill="none" className="w-full h-full">
                <path d="M55 5 C 40 18, 25 35, 18 55" stroke="#818CF8" strokeWidth="1" strokeOpacity="0.4" strokeLinecap="round" />
                <path d="M42 18 C 30 14, 25 24, 35 28 C 42 30, 45 24, 42 18 Z" fill="#818CF8" fillOpacity="0.3" />
                <path d="M30 32 C 20 28, 16 38, 26 42 C 32 44, 35 38, 30 32 Z" fill="#C084FC" fillOpacity="0.25" />
              </svg>
            </div>

            {/* Multi-layered Flowing Lavender / Violet Wave SVG */}
            <div className="pointer-events-none absolute right-0 bottom-0 w-40 h-26 z-0 opacity-55 dark:opacity-30">
              <svg viewBox="0 0 160 120" fill="none" className="w-full h-full" preserveAspectRatio="none">
                <path d="M0 120 C 45 65, 95 100, 160 55 L 160 120 Z" fill="url(#violetWave1)" />
                <path d="M35 120 C 80 80, 120 108, 160 80 L 160 120 Z" fill="url(#violetWave2)" />
                <defs>
                  <linearGradient id="violetWave1" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#818CF8" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#C084FC" stopOpacity="0.2" />
                  </linearGradient>
                  <linearGradient id="violetWave2" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#6366F1" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#A855F7" stopOpacity="0.12" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <div>
              <div className="flex items-center justify-between relative z-10">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-2xs">
                  <Shirt className="w-4 h-4" />
                </div>
                <button type="button" aria-label="Card options" className="text-slate-300 hover:text-slate-500">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 relative z-10">
                STITCHING OUTPUT & WIP
              </p>

              <div className="mt-1 flex items-baseline gap-1.5 relative z-10">
                <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {kpis.totalCompletedPieces} / {kpis.totalTargetPieces}
                </span>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Pcs</span>
              </div>

              <div className="mt-1 flex items-center gap-1.5 relative z-10">
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                  Active WIP: {kpis.totalWipPieces} pcs
                </span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800">
                  {kpis.overallEfficiency}% Efficiency
                </span>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-indigo-50/80 dark:border-slate-800 flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-medium relative z-10">
              <span>Lines: Active</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                {kpis.overallEfficiency > 0 ? 'Flowing' : 'Idle'}
              </span>
            </div>
          </div>

          {/* Card 3: Fabric Stock (Peach Wave Shapes + Botanical Flourish) */}
          <div className="relative overflow-hidden bg-white/95 dark:bg-slate-900/95 p-4 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[148px]">
            {/* Top-Right Botanical Leaf Accent */}
            <div className="pointer-events-none absolute right-1 top-1 w-16 h-16 z-0 opacity-40 dark:opacity-20">
              <svg viewBox="0 0 60 60" fill="none" className="w-full h-full">
                <path d="M55 5 C 40 18, 25 35, 18 55" stroke="#FB923C" strokeWidth="1" strokeOpacity="0.4" strokeLinecap="round" />
                <path d="M42 18 C 30 14, 25 24, 35 28 C 42 30, 45 24, 42 18 Z" fill="#FB923C" fillOpacity="0.3" />
                <path d="M30 32 C 20 28, 16 38, 26 42 C 32 44, 35 38, 30 32 Z" fill="#FBBF24" fillOpacity="0.25" />
              </svg>
            </div>

            {/* Multi-layered Flowing Peach / Amber Wave SVG */}
            <div className="pointer-events-none absolute right-0 bottom-0 w-40 h-26 z-0 opacity-55 dark:opacity-30">
              <svg viewBox="0 0 160 120" fill="none" className="w-full h-full" preserveAspectRatio="none">
                <path d="M0 120 C 45 80, 95 110, 160 65 L 160 120 Z" fill="url(#peachWave1)" />
                <path d="M35 120 C 75 90, 115 114, 160 90 L 160 120 Z" fill="url(#peachWave2)" />
                <defs>
                  <linearGradient id="peachWave1" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#FB923C" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#FBBF24" stopOpacity="0.2" />
                  </linearGradient>
                  <linearGradient id="peachWave2" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#EA580C" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.12" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <div>
              <div className="flex items-center justify-between relative z-10">
                <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-2xs">
                  <Layers className="w-4 h-4" />
                </div>
                <button type="button" aria-label="Card options" className="text-slate-300 hover:text-slate-500">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 relative z-10">
                FABRIC STOCK
              </p>

              <div className="mt-1 flex items-baseline gap-1.5 relative z-10">
                <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {kpis.totalFabricMeters.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Meters</span>
              </div>

              <div className="mt-1 text-[10px] text-slate-400 font-medium relative z-10">
                <span>Warehouse Catalog</span>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-indigo-50/80 dark:border-slate-800 flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-medium relative z-10">
              <span>{kpis.availableRollsCount} Available Rolls</span>
              <span>{kpis.totalRollsCount} Total Rolls</span>
            </div>
          </div>

          {/* Card 4: Quality Pass Rate (Pink / Rose Wave Shapes + Botanical Flourish) */}
          <div className="relative overflow-hidden bg-white/95 dark:bg-slate-900/95 p-4 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[148px]">
            {/* Top-Right Botanical Petal Accent */}
            <div className="pointer-events-none absolute right-1 top-1 w-16 h-16 z-0 opacity-40 dark:opacity-20">
              <svg viewBox="0 0 60 60" fill="none" className="w-full h-full">
                <path d="M55 5 C 40 18, 25 35, 18 55" stroke="#F472B6" strokeWidth="1" strokeOpacity="0.4" strokeLinecap="round" />
                <path d="M42 18 C 30 14, 25 24, 35 28 C 42 30, 45 24, 42 18 Z" fill="#F472B6" fillOpacity="0.3" />
                <path d="M30 32 C 20 28, 16 38, 26 42 C 32 44, 35 38, 30 32 Z" fill="#FB7185" fillOpacity="0.25" />
              </svg>
            </div>

            {/* Multi-layered Flowing Pink / Rose Wave SVG */}
            <div className="pointer-events-none absolute right-0 bottom-0 w-40 h-26 z-0 opacity-55 dark:opacity-30">
              <svg viewBox="0 0 160 120" fill="none" className="w-full h-full" preserveAspectRatio="none">
                <path d="M0 120 C 50 70, 100 105, 160 60 L 160 120 Z" fill="url(#roseWave1)" />
                <path d="M35 120 C 80 85, 120 110, 160 85 L 160 120 Z" fill="url(#roseWave2)" />
                <defs>
                  <linearGradient id="roseWave1" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#F472B6" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#FB7185" stopOpacity="0.2" />
                  </linearGradient>
                  <linearGradient id="roseWave2" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#DB2777" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#E11D48" stopOpacity="0.12" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <div>
              <div className="flex items-center justify-between relative z-10">
                <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-2xs">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <button type="button" aria-label="Card options" className="text-slate-300 hover:text-slate-500">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>

              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 relative z-10">
                QUALITY PASS RATE
              </p>

              <div className="mt-1 flex items-baseline gap-1.5 relative z-10">
                <span className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {kpis.qualityPassRate > 0 ? `${kpis.qualityPassRate.toFixed(1)}%` : '0.0%'}
                </span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                  {kpis.qualityPassRate > 0 ? 'Grade Passed' : 'Pending QC'}
                </span>
              </div>

              <div className="mt-1 text-[10px] text-slate-400 font-medium relative z-10">
                <span>Inspection Standard</span>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-indigo-50/80 dark:border-slate-800 flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-medium relative z-10">
              <span>Recv: Rs. {kpis.totalReceivables.toLocaleString()}</span>
              <span>Payable: Rs. {kpis.totalPayables.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            3. MAIN VISUAL: Daily Stitching Output & Material Stock Notices
            ══════════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left (2 cols): Daily Stitching Output (With Multi-layered Waves & Botanical Flourish) */}
          <div className="lg:col-span-2 bg-white/95 dark:bg-slate-900/95 p-4 sm:p-5 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 shadow-xs relative overflow-hidden flex flex-col justify-between">
            {/* Top-Right Corner Decorative Wave Accent in Chart Card */}
            <div className="pointer-events-none absolute right-0 top-0 w-52 h-36 overflow-hidden z-0 opacity-40 dark:opacity-20">
              <svg viewBox="0 0 200 140" fill="none" className="w-full h-full">
                <path d="M200 0 C 140 25, 80 80, 0 140 L 200 140 Z" fill="url(#chartCornerWave1)" />
                <path d="M200 20 C 150 45, 100 95, 30 140 L 200 140 Z" fill="url(#chartCornerWave2)" />
                {/* Botanical leaf flourish in chart corner */}
                <path d="M170 15 C 155 30, 135 45, 110 50 C 125 35, 150 20, 170 15 Z" fill="#818CF8" fillOpacity="0.3" />
                <path d="M145 35 C 130 50, 110 60, 90 62 C 105 50, 128 38, 145 35 Z" fill="#C084FC" fillOpacity="0.25" />
                <defs>
                  <linearGradient id="chartCornerWave1" x1="1" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#818CF8" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#C084FC" stopOpacity="0.08" />
                  </linearGradient>
                  <linearGradient id="chartCornerWave2" x1="1" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#818CF8" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Bottom-Left Subtle Curved Flowing Wave */}
            <div className="pointer-events-none absolute left-0 bottom-0 w-44 h-24 overflow-hidden z-0 opacity-30 dark:opacity-15">
              <svg viewBox="0 0 160 100" fill="none" className="w-full h-full" preserveAspectRatio="none">
                <path d="M0 100 C 50 60, 100 85, 160 50 L 160 100 Z" fill="url(#chartBottomWave)" />
                <defs>
                  <linearGradient id="chartBottomWave" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#818CF8" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <div className="relative z-10">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shadow-2xs">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                      Daily Stitching Output (Pieces)
                    </h2>
                    <p className="text-[10px] text-slate-400">Live output logged across stitching lines</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="hidden sm:flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-100/70 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      Target
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-600 text-white">
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      Actual
                    </span>
                  </div>

                  <Link
                    href="/production"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 transition-colors cursor-pointer"
                  >
                    <span>+ Log Output</span>
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              {/* Area Chart matching reference design */}
              <div className="relative h-44 w-full pt-2">
                {/* Y-axis guidelines & labels */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-[9px] text-slate-400 font-medium pb-5">
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-right">400</span>
                    <div className="flex-1 border-b border-indigo-50/90 dark:border-slate-800" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-right">300</span>
                    <div className="flex-1 border-b border-indigo-50/90 dark:border-slate-800" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-right">200</span>
                    <div className="flex-1 border-b border-indigo-50/90 dark:border-slate-800" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-right">100</span>
                    <div className="flex-1 border-b border-indigo-50/90 dark:border-slate-800" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-right">0</span>
                    <div className="flex-1 border-b border-slate-200 dark:border-slate-700" />
                  </div>
                </div>

                {/* SVG Curves */}
                <div className="absolute inset-0 left-8 right-2 bottom-5 top-1">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 700 140" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366F1" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#EEF2FF" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="targetGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#C7D2FE" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {hasProductionData ? (
                      <>
                        <path
                          d="M 10 100 C 80 70, 160 110, 230 90 C 310 80, 390 120, 470 100 C 540 85, 620 110, 690 95 L 690 140 L 10 140 Z"
                          fill="url(#targetGradient)"
                        />
                        <path
                          d="M 10 100 C 80 70, 160 110, 230 90 C 310 80, 390 120, 470 100 C 540 85, 620 110, 690 95"
                          fill="none"
                          stroke="#A5B4FC"
                          strokeWidth="2"
                          strokeDasharray="4 4"
                        />
                        <path
                          d="M 10 120 C 70 70, 120 55, 180 70 C 240 80, 280 120, 350 100 C 420 90, 470 50, 530 55 C 590 60, 640 90, 690 65 L 690 140 L 10 140 Z"
                          fill="url(#actualGradient)"
                        />
                        <path
                          d="M 10 120 C 70 70, 120 55, 180 70 C 240 80, 280 120, 350 100 C 420 90, 470 50, 530 55 C 590 60, 640 90, 690 65"
                          fill="none"
                          stroke="#4F46E5"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                        <circle cx="10" cy="120" r="3.5" fill="#4F46E5" stroke="#FFFFFF" strokeWidth="2" />
                        <circle cx="180" cy="70" r="3.5" fill="#4F46E5" stroke="#FFFFFF" strokeWidth="2" />
                        <circle cx="350" cy="100" r="3.5" fill="#4F46E5" stroke="#FFFFFF" strokeWidth="2" />
                        <circle cx="530" cy="55" r="3.5" fill="#4F46E5" stroke="#FFFFFF" strokeWidth="2" />
                        <circle cx="690" cy="65" r="3.5" fill="#4F46E5" stroke="#FFFFFF" strokeWidth="2" />
                      </>
                    ) : (
                      <>
                        <path
                          d="M 10 138 C 150 138, 350 138, 690 138"
                          fill="none"
                          stroke="#CBD5E1"
                          strokeWidth="1.5"
                          strokeDasharray="3 3"
                        />
                        <circle cx="10" cy="138" r="2.5" fill="#94A3B8" />
                        <circle cx="180" cy="138" r="2.5" fill="#94A3B8" />
                        <circle cx="350" cy="138" r="2.5" fill="#94A3B8" />
                        <circle cx="530" cy="138" r="2.5" fill="#94A3B8" />
                        <circle cx="690" cy="138" r="2.5" fill="#94A3B8" />
                      </>
                    )}
                  </svg>
                </div>

                {/* X-axis Timeline Labels */}
                <div className="absolute bottom-0 left-8 right-2 flex justify-between text-[10px] font-semibold text-slate-400">
                  <span>8 AM</span>
                  <span>10 AM</span>
                  <span>12 PM</span>
                  <span>2 PM</span>
                  <span>4 PM</span>
                  <span>6 PM</span>
                  <span>8 PM</span>
                </div>
              </div>

              {!hasProductionData && (
                <p className="text-[10px] text-center text-slate-400 mt-1 italic">
                  No production output logged for today yet. Use “+ Log Output” to add entries.
                </p>
              )}
            </div>
          </div>

          {/* Right (1 col): Material Stock Notices (3D Parcel Box & Botanical Corner Shapes) */}
          <div className="bg-white/95 dark:bg-slate-900/95 p-4 sm:p-5 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 shadow-xs relative overflow-hidden flex flex-col justify-between">
            {/* Background Corner Wave & Botanical Leaf Watermarks */}
            <div className="pointer-events-none absolute -bottom-5 -left-5 w-28 h-28 opacity-45 dark:opacity-20 z-0">
              <svg viewBox="0 0 100 100" fill="none" className="w-full h-full">
                <path d="M0 60 C 30 50, 50 80, 100 60 L 100 100 L 0 100 Z" fill="#E0E7FF" />
                <path d="M15 70 C 25 55, 40 50, 50 65 C 38 75, 25 80, 15 70 Z" fill="#818CF8" fillOpacity="0.25" />
              </svg>
            </div>
            <div className="pointer-events-none absolute -bottom-5 -right-5 w-28 h-28 opacity-40 dark:opacity-20 z-0">
              <svg viewBox="0 0 120 120" fill="none" className="w-full h-full">
                <path d="M100 30 C 95 60, 60 90, 20 110 C 60 110, 90 90, 110 50 Z" fill="#EDE9FE" />
                {/* Delicate Botanical Leaf Arc */}
                <path d="M85 45 C 95 60, 80 80, 60 85 C 65 70, 80 55, 85 45 Z" fill="#A78BFA" fillOpacity="0.3" />
              </svg>
            </div>

            <div className="relative z-10">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                    <Bell className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">Material Stock Notices</h3>
                </div>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300">
                  {alerts.lowStockTrimsCount} Items
                </span>
              </div>

              {/* Clean Empty State with 3D Isometric Parcel Graphic */}
              {alerts.lowStockTrims.length === 0 ? (
                <div className="py-4 text-center">
                  <div className="w-20 h-20 mx-auto relative flex items-center justify-center">
                    <svg viewBox="0 0 140 140" fill="none" className="w-full h-full">
                      {/* Shadow */}
                      <ellipse cx="70" cy="115" rx="42" ry="10" fill="#E0E7FF" opacity="0.8" />
                      {/* Box faces */}
                      <path d="M70 65 L25 88 L70 112 L115 88 Z" fill="#4F46E5" />
                      <path d="M25 88 L70 112 L70 118 L25 94 Z" fill="#4338CA" />
                      <path d="M70 112 L115 88 L115 94 L70 118 Z" fill="#3730A3" />
                      {/* Open Flaps */}
                      <path d="M70 65 L25 88 L15 65 L60 42 Z" fill="#818CF8" />
                      <path d="M70 65 L115 88 L125 65 L80 42 Z" fill="#6366F1" />
                      <path d="M70 65 L60 42 L70 20 L80 42 Z" fill="#A5B4FC" />
                      {/* Sparkles */}
                      <path d="M30 40 Q 30 48, 22 48 Q 30 48, 30 56 Q 30 48, 38 48 Q 30 48, 30 40 Z" fill="#60A5FA" />
                      <path d="M108 35 Q 108 42, 102 42 Q 108 42, 108 49 Q 108 42, 114 42 Q 108 42, 108 35 Z" fill="#A78BFA" />
                      <circle cx="115" cy="65" r="2" fill="#818CF8" />
                      <circle cx="28" cy="70" r="1.5" fill="#38BDF8" />
                    </svg>
                  </div>

                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                    No stock alerts at the moment!
                  </p>
                  <p className="text-[10px] text-indigo-400 font-medium mt-0.5">
                    Everything is running smoothly!
                  </p>
                </div>
              ) : (
                <div className="space-y-2 py-1">
                  {alerts.lowStockTrims.map((item, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-indigo-50/40 dark:bg-slate-800/60 border border-indigo-100 dark:border-indigo-900/50 text-xs">
                      <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200">
                        <span>{item.name}</span>
                        <span className="text-red-600 font-extrabold">
                          {item.current} {item.unit}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-500 dark:text-slate-400 text-[10px] mt-0.5">
                        <span>Minimum Stock:</span>
                        <span>{item.min} {item.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Link
              href="/procurement"
              className="mt-3 flex items-center justify-center gap-1 w-full py-2 rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-white/80 dark:bg-slate-800 hover:bg-indigo-50/50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition-colors cursor-pointer relative z-10"
            >
              <span>Procurement & Purchase Orders</span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            4. RECENT ACTIVITY & AUDIT TRAIL
            ══════════════════════════════════════════════════════════════════════ */}
        <div className="bg-white/95 dark:bg-slate-900/95 p-4 sm:p-5 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 shadow-xs relative overflow-hidden">
          {/* Subtle Decorative Corner Waves & Botanical Flourish */}
          <div className="pointer-events-none absolute right-0 bottom-0 w-44 h-24 overflow-hidden z-0 opacity-40 dark:opacity-20">
            <svg viewBox="0 0 180 90" fill="none" className="w-full h-full" preserveAspectRatio="none">
              <path d="M0 90 C 50 50, 110 80, 180 40 L 180 90 Z" fill="url(#auditWave1)" />
              <path d="M40 90 C 90 60, 135 80, 180 65 L 180 90 Z" fill="url(#auditWave2)" />
              <defs>
                <linearGradient id="auditWave1" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#818CF8" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#C084FC" stopOpacity="0.08" />
                </linearGradient>
                <linearGradient id="auditWave2" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#818CF8" stopOpacity="0.05" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="pointer-events-none absolute right-2 top-2 w-16 h-16 z-0 opacity-30 dark:opacity-15">
            <svg viewBox="0 0 60 60" fill="none" className="w-full h-full">
              <path d="M55 5 C 40 18, 25 35, 18 55" stroke="#818CF8" strokeWidth="1" strokeOpacity="0.35" strokeLinecap="round" />
              <path d="M42 18 C 30 14, 25 24, 35 28 C 42 30, 45 24, 42 18 Z" fill="#818CF8" fillOpacity="0.25" />
            </svg>
          </div>

          <div className="flex items-center justify-between mb-3 relative z-10">
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">Recent Activity & Audit Trail</h3>
              <p className="text-[10px] text-slate-400">Live audit log of real events and user actions</p>
            </div>
            <Link
              href="/admin"
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
            >
              <span>View Full Trail</span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {(data?.recentAudits || []).length === 0 ? (
            <div className="py-4 text-center text-slate-400 relative z-10">
              <Clock className="w-6 h-6 mx-auto text-indigo-200 dark:text-indigo-400/30 mb-1.5" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">No actions logged yet</p>
              <p className="text-[10px] text-slate-400">Transactions and logs will appear here automatically</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 relative z-10">
              {(data?.recentAudits || []).slice(0, 6).map((audit, idx) => (
                <div key={idx} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 flex items-start gap-2 text-xs">
                  <Clock className="w-3.5 h-3.5 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-slate-800 dark:text-slate-200 font-semibold leading-snug">{audit.description}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
                      By {audit.userName} • {audit.module}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
