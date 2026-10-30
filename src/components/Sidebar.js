'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShieldAlert,
  ShoppingBag,
  Layers,
  Package,
  Droplets,
  Palette,
  Scissors,
  Shirt,
  CheckCircle2,
  Warehouse,
  Users2,
  Store,
  DollarSign,
  UserCheck,
  Megaphone,
  Wrench,
  BarChart3,
  Settings,
  ChevronRight,
  Cloud,
} from 'lucide-react';

const NAV_GROUPS = [
  {
    title: 'CORE & EXECUTIVE',
    accentColor: 'text-[#38BDF8]', // Soft electric blue
    dotColor: 'bg-[#38BDF8] shadow-[0_0_8px_rgba(56,189,248,0.8)]',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      { name: 'Administration', href: '/admin', icon: ShieldAlert },
      { name: 'Reports & Analytics', href: '/reports', icon: BarChart3 },
    ],
  },
  {
    title: 'SUPPLY & MATERIALS',
    accentColor: 'text-[#2DD4BF]', // Mint / Cyan
    dotColor: 'bg-[#2DD4BF] shadow-[0_0_8px_rgba(45,212,191,0.8)]',
    items: [
      { name: 'Procurement', href: '/procurement', icon: ShoppingBag },
      { name: 'Fabric / Kora Kapra', href: '/fabric', icon: Layers },
      { name: 'Trims & Accessories', href: '/trims', icon: Package },
      { name: 'Dyeing & Processing', href: '/dyeing', icon: Droplets },
    ],
  },
  {
    title: 'MANUFACTURING & QC',
    accentColor: 'text-[#C084FC]', // Lavender / Violet
    dotColor: 'bg-[#C084FC] shadow-[0_0_8px_rgba(192,132,252,0.8)]',
    items: [
      { name: 'Design & BOM', href: '/design', icon: Palette },
      { name: 'Cutting Department', href: '/cutting', icon: Scissors },
      { name: 'Stitching & Production', href: '/production', icon: Shirt },
      { name: 'Quality & Finishing', href: '/quality', icon: CheckCircle2 },
      { name: 'Warehouse & Logistics', href: '/warehouse', icon: Warehouse },
    ],
  },
  {
    title: 'COMMERCE & RETAIL',
    accentColor: 'text-[#FB923C]', // Peach / Amber
    dotColor: 'bg-[#FB923C] shadow-[0_0_8px_rgba(251,146,60,0.8)]',
    items: [
      { name: 'Sales & Customer Tiers', href: '/sales', icon: Users2 },
      { name: 'Retail POS', href: '/pos', icon: Store },
      { name: 'Finance & Accounts', href: '/finance', icon: DollarSign },
      { name: 'Marketing & CRM', href: '/crm', icon: Megaphone },
    ],
  },
  {
    title: 'WORKFORCE & ASSETS',
    accentColor: 'text-[#F472B6]', // Soft Pink / Rose
    dotColor: 'bg-[#F472B6] shadow-[0_0_8px_rgba(244,114,182,0.8)]',
    items: [
      { name: 'HR & Biometrics', href: '/hr', icon: UserCheck },
      { name: 'Assets & Fleet', href: '/assets', icon: Wrench },
      { name: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

export default function Sidebar({ isExpanded, isMobileOpen, setIsMobileOpen }) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-xs lg:hidden cursor-pointer"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 h-screen bg-[#0B0F19] text-slate-300 flex flex-col transition-all duration-300 ease-in-out border-r border-slate-800/80 shadow-2xl overflow-hidden ${
          /* Mobile behavior */
          isMobileOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'
        } ${
          /* Desktop expanded / collapsed width */
          isExpanded ? 'lg:w-64' : 'lg:w-16'
        }`}
      >
        {/* ══════════════════════════════════════════════════════════════════════
            DECORATIVE SIDEBAR SHAPES: Upper, Middle & Lower Abstract Wave Layers
            ══════════════════════════════════════════════════════════════════════ */}

        {/* 1. Upper Sidebar Decorative Wave (Electric Blue & Violet Glow) */}
        <div className="pointer-events-none absolute top-10 right-0 w-52 h-56 overflow-hidden z-0 opacity-40">
          <svg className="w-full h-full" viewBox="0 0 180 180" fill="none">
            <path
              d="M180 0 C 130 35, 70 25, 60 75 C 50 130, 115 145, 180 180 Z"
              fill="url(#sidebarUpperWave)"
            />
            <path
              d="M180 15 C 145 45, 95 40, 85 85 C 75 130, 130 145, 180 170 Z"
              fill="url(#sidebarUpperWave2)"
            />
            <defs>
              <linearGradient id="sidebarUpperWave" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.5" />
                <stop offset="50%" stopColor="#6366F1" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="sidebarUpperWave2" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818CF8" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#C084FC" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* 2. Middle Sidebar Decorative Wave Crest (Cyan & Violet Flow) */}
        <div className="pointer-events-none absolute top-1/2 -translate-y-1/2 -left-8 w-52 h-60 overflow-hidden z-0 opacity-35">
          <svg className="w-full h-full" viewBox="0 0 200 220" fill="none">
            <path
              d="M0 35 C 65 15, 130 65, 120 125 C 110 180, 55 190, 0 220 Z"
              fill="url(#sidebarMiddleWave)"
            />
            <path
              d="M0 60 C 50 45, 105 85, 95 135 C 85 180, 40 190, 0 210 Z"
              fill="url(#sidebarMiddleWave2)"
            />
            <defs>
              <linearGradient id="sidebarMiddleWave" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.45" />
                <stop offset="60%" stopColor="#8B5CF6" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="sidebarMiddleWave2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#6366F1" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* 3. Lower Sidebar Flowing Abstract Waves (Navy, Violet & Electric Blue) */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-72 overflow-hidden z-0 opacity-70">
          <svg className="w-full h-full" viewBox="0 0 256 256" fill="none" preserveAspectRatio="none">
            <path
              d="M-30 256 C 20 170, 70 225, 130 160 C 180 110, 220 165, 290 130 L 290 256 Z"
              fill="url(#sidebarLowerWave1)"
            />
            <path
              d="M-20 256 C 40 180, 100 235, 160 175 C 210 130, 240 180, 280 150 L 280 256 Z"
              fill="url(#sidebarLowerWave2)"
            />
            <path
              d="M-10 256 C 60 200, 120 240, 180 190 C 230 150, 260 195, 280 175 L 280 256 Z"
              fill="url(#sidebarLowerWave3)"
            />
            <defs>
              <linearGradient id="sidebarLowerWave1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1E1B4B" stopOpacity="0.9" />
                <stop offset="50%" stopColor="#4338CA" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#6366F1" stopOpacity="0.2" />
              </linearGradient>
              <linearGradient id="sidebarLowerWave2" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.45" />
                <stop offset="50%" stopColor="#7C3AED" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.1" />
              </linearGradient>
              <linearGradient id="sidebarLowerWave3" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.1" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Brand Header */}
        <div className="h-14 border-b border-slate-800/80 bg-gradient-to-r from-[#0F172A] to-[#12192E] flex items-center px-3.5 relative z-10 shrink-0">
          <Link
            href="/"
            className={`flex items-center gap-3 group cursor-pointer w-full ${
              !isExpanded ? 'lg:justify-center' : ''
            }`}
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/25 group-hover:scale-105 transition-transform duration-200 shrink-0">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            {isExpanded && (
              <div className="truncate">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-xs font-black text-white tracking-wider">
                    ERP DOST
                  </h1>
                  <span className="px-1.5 py-0.2 rounded-full text-[8px] font-extrabold bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 uppercase tracking-wider">
                    PRO
                  </span>
                </div>
                <p className="text-[9px] text-slate-400 font-medium tracking-wide truncate">
                  Garment & Apparel Cloud
                </p>
              </div>
            )}
          </Link>
        </div>

        {/* Scrollable Nav List with Coordinated Section Heading Colors */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 relative z-10 custom-scrollbar">
          {NAV_GROUPS.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1">
              {isExpanded ? (
                <div className="px-2.5 pb-1 flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${group.dotColor}`} />
                  <span className={`text-[9.5px] font-black tracking-wider uppercase truncate ${group.accentColor}`}>
                    {group.title}
                  </span>
                </div>
              ) : (
                <div className="my-2 border-t border-slate-800/60 mx-1" />
              )}

              {group.items.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.name}
                    onClick={() => {
                      if (typeof window !== 'undefined' && window.innerWidth < 1024) setIsMobileOpen(false);
                    }}
                    className={`flex items-center ${
                      isExpanded ? 'justify-between px-2.5 py-2' : 'justify-center p-2'
                    } rounded-xl text-xs font-semibold transition-all duration-200 group cursor-pointer ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/30 font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive ? 'text-white' : 'text-slate-400 group-hover:text-indigo-400'
                        }`}
                      />
                      {isExpanded && <span className="truncate">{item.name}</span>}
                    </div>

                    {isExpanded && isActive && (
                      <ChevronRight className="w-3.5 h-3.5 text-white/90 shrink-0 ml-1" />
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Sidebar Footer Card */}
        <div className="p-2 relative z-10 shrink-0">
          <div className={`bg-gradient-to-br from-[#121829]/95 via-[#0E1422]/95 to-[#0A0D18]/95 border border-indigo-900/40 rounded-xl shadow-md flex items-center backdrop-blur-xs ${
            isExpanded ? 'p-2.5 justify-between' : 'p-2 justify-center'
          }`}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                <Cloud className="w-3.5 h-3.5" />
              </div>
              {isExpanded && (
                <div className="truncate">
                  <p className="text-[11px] font-bold text-white leading-tight truncate">ERP Dost Systems</p>
                  <p className="text-[9px] text-slate-400 font-medium truncate">Enterprise Cloud v3.0</p>
                </div>
              )}
            </div>

            {/* Pulsating green dot */}
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
