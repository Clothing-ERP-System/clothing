'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  ChevronDown,
  LogOut,
  Moon,
  PanelLeft,
  Search,
  Settings,
  Store,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const navigation = [
  { name: 'Dashboard', href: '/' },
  { name: 'Administration', href: '/admin' },
  { name: 'Assets', href: '/assets' },
  { name: 'Customers & CRM', href: '/crm' },
  { name: 'Cutting', href: '/cutting' },
  { name: 'Design & BOM', href: '/design' },
  { name: 'Dyeing', href: '/dyeing' },
  { name: 'Fabric', href: '/fabric' },
  { name: 'Finance', href: '/finance' },
  { name: 'People', href: '/hr' },
  { name: 'Point of sale', href: '/pos' },
  { name: 'Procurement', href: '/procurement' },
  { name: 'Production', href: '/production' },
  { name: 'Quality', href: '/quality' },
  { name: 'Reports', href: '/reports' },
  { name: 'Sales', href: '/sales' },
  { name: 'Settings', href: '/settings' },
  { name: 'Trims', href: '/trims' },
  { name: 'Warehouse', href: '/warehouse' },
];

export default function Header({ isSidebarExpanded, setIsSidebarExpanded, setIsMobileOpen }) {
  const { user, logout, currentBranch, setCurrentBranch } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [branches, setBranches] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false);
  const [theme, setTheme] = useState('light');

  const searchRef = useRef(null);
  const mobileSearchRef = useRef(null);
  const profileRef = useRef(null);
  const unitRef = useRef(null);

  // Initialize theme from localStorage or document
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('erpdost-theme') || 'light';
      setTheme(savedTheme);
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('erpdost-theme', nextTheme);
      if (nextTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const searchResults = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    return navigation.filter((item) => item.name.toLowerCase().includes(normalizedQuery)).slice(0, 6);
  }, [query]);

  useEffect(() => {
    let active = true;
    fetch('/api/administration')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) return [];
        return result.data?.company?.branches || [];
      })
      .then((companyBranches) => {
        if (!active) return;
        setBranches(companyBranches.filter((branch) => branch?.name));
      })
      .catch(() => {});

    fetch('/api/dashboard/stats')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) return null;
        return result.data;
      })
      .then((dashboard) => {
        if (!active || !dashboard) return;
        const lowStockAlerts = (dashboard.alerts?.lowStockTrims || []).map((item) => ({
          id: `stock-${item.name}`,
          title: `${item.name} is at or below minimum stock`,
          detail: `${item.current} ${item.unit || ''} available; minimum ${item.min}`,
          href: '/trims',
        }));
        const cuttingAlerts = dashboard.alerts?.pendingCuttingOrdersCount
          ? [{
              id: 'pending-cutting',
              title: `${dashboard.alerts.pendingCuttingOrdersCount} cutting order(s) awaiting handover`,
              detail: 'Pending cutting batches need factory allocation',
              href: '/cutting',
            }]
          : [];
        setAlerts([...lowStockAlerts, ...cuttingAlerts]);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  // Keyboard shortcut ⌘K or Ctrl+K for search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const inputEl = searchRef.current?.querySelector('input');
        if (inputEl) {
          inputEl.focus();
          setSearchOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
      if (mobileSearchRef.current && !mobileSearchRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
      if (unitRef.current && !unitRef.current.contains(event.target)) {
        setUnitDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navigateToSearchResult = (href) => {
    router.push(href);
    setSearchOpen(false);
    setQuery('');
  };

  const handleToggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsMobileOpen((prev) => !prev);
    } else {
      setIsSidebarExpanded((prev) => !prev);
    }
  };

  return (
    <header
      className={`fixed top-0 right-0 z-30 transition-all duration-300 ease-in-out border-b border-indigo-100/70 bg-white/90 dark:bg-[#0B0F19]/90 dark:border-indigo-900/40 px-3 sm:px-5 backdrop-blur-xl shadow-xs ${
        isSidebarExpanded ? 'left-0 lg:left-64' : 'left-0 lg:left-16'
      }`}
    >
      <div className="flex h-14 items-center justify-between gap-3">
        {/* Left: Single Sidebar Toggle Icon (No duplicate, no extra breadcrumb text) */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={handleToggleSidebar}
            aria-label="Toggle sidebar"
            title={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className="rounded-xl p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/80 dark:text-slate-400 dark:hover:text-indigo-400 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <PanelLeft className="h-5 w-5" />
          </button>
        </div>

        {/* Center: Search Bar with Pill Shape and ⌘K badge */}
        <div className="relative hidden md:flex items-center flex-1 max-w-sm lg:max-w-md mx-4" ref={searchRef}>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && searchResults[0]) navigateToSearchResult(searchResults[0].href);
              if (event.key === 'Escape') setSearchOpen(false);
            }}
            placeholder="Search Rolls, Orders, Batches..."
            aria-label="Search app pages"
            className="h-9 w-full rounded-full border border-indigo-100 dark:border-indigo-900/50 bg-white/90 dark:bg-slate-900/90 pl-9 pr-12 text-xs text-slate-800 dark:text-slate-100 outline-none transition-all focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500/10 shadow-xs placeholder-slate-400 font-medium"
          />
          <span className="pointer-events-none absolute right-3 px-1.5 py-0.5 text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 dark:border-slate-700 rounded border border-slate-200">
            ⌘ K
          </span>

          {searchOpen && query.trim() && (
            <div className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-2xl border border-indigo-100 dark:border-indigo-900/60 bg-white dark:bg-slate-900 p-2 shadow-xl">
              {searchResults.length ? (
                searchResults.map((item) => (
                  <button
                    type="button"
                    key={item.href}
                    onClick={() => navigateToSearchResult(item.href)}
                    className="block w-full rounded-xl px-3 py-1.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                  >
                    {item.name}
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-xs text-slate-500">No matching records found</p>
              )}
            </div>
          )}
        </div>

        {/* Right: Unit Dropdown (Slightly wider w-32 sm:w-36) + Notifications + Theme Toggle + Profile */}
        <div className="flex items-center justify-end gap-2 sm:gap-3">
          {/* Mobile Search Button */}
          <div className="relative md:hidden" ref={mobileSearchRef}>
            <button
              type="button"
              onClick={() => setSearchOpen((open) => !open)}
              aria-label="Search pages"
              className="rounded-xl p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition"
            >
              <Search className="h-4 w-4" />
            </button>
            {searchOpen && (
              <div className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 shadow-xl">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && searchResults[0]) navigateToSearchResult(searchResults[0].href);
                      if (event.key === 'Escape') setSearchOpen(false);
                    }}
                    placeholder="Search..."
                    className="h-8 w-full rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-slate-50 dark:bg-slate-800 pl-9 pr-3 text-xs outline-none focus:border-indigo-300 dark:text-white"
                  />
                </div>
                {query.trim() && (
                  <div className="mt-1 max-h-60 overflow-y-auto">
                    {searchResults.length ? (
                      searchResults.map((item) => (
                        <button
                          type="button"
                          key={item.href}
                          onClick={() => navigateToSearchResult(item.href)}
                          className="block w-full rounded-lg px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
                        >
                          {item.name}
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-2 text-xs text-slate-500">No matching records</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Unit Selector: Slightly increased width w-32 sm:w-36, height h-9, matching dropdown width */}
          <div className="relative" ref={unitRef}>
            <button
              type="button"
              onClick={() => setUnitDropdownOpen((prev) => !prev)}
              aria-expanded={unitDropdownOpen}
              className="h-9 flex items-center justify-between gap-1.5 rounded-xl border border-indigo-100/90 dark:border-indigo-900/50 bg-white/95 dark:bg-slate-900/95 px-3 py-1.5 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors cursor-pointer w-36 sm:w-44 text-left"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Store className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                  {currentBranch || 'Unit 1'}
                </span>
              </div>
              <ChevronDown
                className={`h-3 w-3 shrink-0 text-slate-400 transition-transform duration-200 ${
                  unitDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {unitDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-full rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-white dark:bg-slate-900 p-1 shadow-lg z-50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentBranch('');
                    if (typeof window !== 'undefined') window.localStorage.removeItem('erpdost-unit');
                    setUnitDropdownOpen(false);
                  }}
                  className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition-colors ${
                    !currentBranch
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Unit 1
                </button>
                {branches.map((b) => (
                  <button
                    type="button"
                    key={b.code || b.name}
                    onClick={() => {
                      setCurrentBranch(b.name);
                      if (typeof window !== 'undefined') window.localStorage.setItem('erpdost-unit', b.name);
                      setUnitDropdownOpen(false);
                    }}
                    className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition-colors ${
                      currentBranch === b.name
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotificationOpen((open) => !open)}
              aria-label={`Notifications${alerts.length ? `, ${alerts.length} items` : ''}`}
              aria-expanded={notificationOpen}
              className="h-9 w-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-indigo-50/80 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-indigo-400 transition-colors cursor-pointer relative"
            >
              <Bell className="h-4 w-4" />
              {alerts.length > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
              )}
            </button>
            {notificationOpen && (
              <div className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-indigo-100 dark:border-indigo-900/60 bg-white dark:bg-slate-900 shadow-xl">
                <div className="flex items-center justify-between border-b border-indigo-50 dark:border-slate-800 px-4 py-2.5 bg-gradient-to-r from-indigo-50/50 to-white dark:from-slate-800/50 dark:to-slate-900">
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Notifications</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Live operational alerts</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotificationOpen(false)}
                    aria-label="Close notifications"
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {alerts.length ? (
                  <div className="max-h-80 divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto">
                    {alerts.map((alert) => (
                      <Link
                        href={alert.href}
                        key={alert.id}
                        onClick={() => setNotificationOpen(false)}
                        className="block px-4 py-2.5 transition hover:bg-indigo-50/40 dark:hover:bg-slate-800/50"
                      >
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{alert.title}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{alert.detail}</p>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                    No critical stock alerts. All running smoothly!
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Dark / Light Mode Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="h-9 w-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-indigo-50/80 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-amber-300 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-slate-600" />
            )}
          </button>

          {/* User Profile Pill ("Mr. Bilal Ahmad / SuperAdmin") */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
              className="h-9 flex items-center gap-2 rounded-full border border-indigo-100 dark:border-indigo-900/50 bg-white/90 dark:bg-slate-900/90 p-1 sm:pr-2.5 text-left transition hover:border-indigo-200 dark:hover:border-indigo-700 hover:bg-indigo-50/40 dark:hover:bg-slate-800/40 shadow-xs cursor-pointer"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 text-xs font-black text-white shadow-xs">
                {(user?.name || 'M').slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden sm:block">
                <span className="block truncate text-xs font-bold text-slate-900 dark:text-white leading-tight">
                  {user?.name || 'Mr. Bilal Ahmad'}
                </span>
                <span className="block truncate text-[9px] text-slate-400 font-medium">
                  {user?.role || 'SuperAdmin'}
                </span>
              </span>
              <ChevronDown className="hidden h-3 w-3 text-slate-400 sm:block" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-2xl border border-indigo-100 dark:border-indigo-900/60 bg-white dark:bg-slate-900 shadow-xl">
                <div className="border-b border-indigo-50 dark:border-slate-800 bg-gradient-to-r from-indigo-50/50 to-white dark:from-slate-800/50 dark:to-slate-900 px-4 py-2.5">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{user?.name || 'Mr. Bilal Ahmad'}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{user?.email || 'admin@erpdost.com'}</p>
                  <span className="mt-1 inline-flex rounded-full bg-indigo-100 dark:bg-indigo-950/70 px-2 py-0.5 text-[9px] font-bold text-indigo-700 dark:text-indigo-300">
                    {user?.role || 'SuperAdmin'}
                  </span>
                </div>
                <div className="p-1.5">
                  <Link
                    href="/admin"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-slate-800 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                  >
                    <UserRound className="h-3.5 w-3.5" /> Profile & administration
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-slate-800 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                  >
                    <Settings className="h-3.5 w-3.5" /> Settings
                  </Link>
                  {user && (
                    <button
                      type="button"
                      onClick={logout}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
