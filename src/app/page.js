'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/apiFetch.js';
import Layout from '@/components/Layout';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Bell,
  Building2,
  ChevronRight,
  Clock,
  Coins,
  Layers,
  MoreHorizontal,
  Package,
  Shirt,
  ShieldCheck,
  Store,
  TrendingUp,
  Plus,
  Edit,
  Trash2,
  CheckCircle2,
  X,
  Calendar,
  Check,
  Wallet,
  CreditCard,
  Truck,
} from 'lucide-react';
import { formatCurrency, DEFAULT_CURRENCY_SYMBOL } from '@/lib/currency.js';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const dayMs = 24 * 60 * 60 * 1000;

function statusBadge(status) {
  const statusMap = {
    PaidInFull: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    PartiallyPaid: 'bg-amber-50 text-amber-700 border-amber-200/80',
    Unpaid: 'bg-rose-50 text-rose-700 border-rose-200/80',
    Confirmed: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
    Cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
    Delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  };
  return statusMap[status] || 'bg-slate-100 text-slate-500 border-slate-200';
}

function rangeLabel(range) {
  const labels = {
    today: 'Today',
    week: 'This Week',
    month: 'This Month',
    'financial-year': 'This Financial Year',
  };
  return labels[range] || 'This Month';
}

function svgLineChart({ points, width = 100, height = 120, color = '#4F46E5', gradientId = 'chartGradient' }) {
  if (!points || points.length === 0) return null;

  const maxVal = Math.max(...points.map((p) => p.value), 1);
  const stepX = width / Math.max(points.length - 1, 1);

  const linePoints = points.map((p, i) => {
    const x = i * stepX;
    const y = height - (p.value / maxVal) * (height - 16);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  const dots = points.map((p, i) => {
    const x = i * stepX;
    const y = height - (p.value / maxVal) * (height - 16);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="${color}" />`;
  }).join('');

  return `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="display:block;">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.2" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0.0" />
        </linearGradient>
      </defs>
      <path d="${linePoints} L ${(points.length - 1) * stepX.toFixed(1)} ${height.toFixed(1)} L 0 ${height.toFixed(1)} Z" fill="url(#${gradientId})" />
      <path d="${linePoints}" fill="none" stroke="${color}" strokeWidth="2" />
      ${dots}
    </svg>
  `;
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState('month');
  const [activeTab, setActiveTab] = useState('sales');
  const [saleStatView, setSaleStatView] = useState('monthly');
  const [profitStatView, setProfitStatView] = useState('daily');

  // Todo state
  const [todos, setTodos] = useState([]);
  const [todoFilter, setTodoFilter] = useState('all');
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoDesc, setNewTodoDesc] = useState('');
  const [newTodoDueDate, setNewTodoDueDate] = useState('');
  const [todoLoading, setTodoLoading] = useState(true);
  const [editingTodoId, setEditingTodoId] = useState(null);
  const [editTodoTitle, setEditTodoTitle] = useState('');

  // Calendar state
  const [events, setEvents] = useState([]);
  const [calendarView, setCalendarView] = useState('month');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventStartDate, setNewEventStartDate] = useState('');
  const [newEventEndDate, setNewEventEndDate] = useState('');
  const [editingEvent, setEditingEvent] = useState(null);

  const fetchDashboardData = useCallback(async () => {
    const res = await apiFetch(`/api/dashboard?range=${range}&section=all`, { cache: 'no-store' });

    let result;
    try {
      const text = await res.text();
      if (!text || text.trim().length === 0) {
        throw new Error(`Server returned empty response (HTTP ${res.status})`);
      }
      result = JSON.parse(text);
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        throw new Error(`Server returned invalid response (HTTP ${res.status})`);
      }
      throw parseError;
    }

    if (!res.ok || !result.success) {
      throw new Error(result?.message || `Unable to load dashboard data (HTTP ${res.status})`);
    }
    return result.data;
  }, [range]);

  useEffect(() => {
    let active = true;
    fetchDashboardData()
      .then((stats) => {
        if (active) setData(stats);
      })
      .catch((fetchError) => {
        console.error('Error fetching dashboard data:', fetchError);
        if (active) {
          setData(null);
          setError(fetchError.message || 'Unable to load dashboard data');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [fetchDashboardData]);

  // ── Todos ─────────────────────────────────────────────────────────
  const fetchTodosData = useCallback(async () => {
    const res = await apiFetch(`/api/todos?status=${todoFilter}`, { cache: 'no-store' });

    let result;
    try {
      const text = await res.text();
      if (!text || text.trim().length === 0) {
        throw new Error(`Server returned empty response (HTTP ${res.status})`);
      }
      result = JSON.parse(text);
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        throw new Error(`Server returned invalid response (HTTP ${res.status})`);
      }
      throw parseError;
    }

    if (!res.ok || !result.success) {
      throw new Error(result?.message || `Unable to fetch todos (HTTP ${res.status})`);
    }
    return result.data.todos || [];
  }, [todoFilter]);

  useEffect(() => {
    let active = true;
    fetchTodosData()
      .then((todoList) => {
        if (active) setTodos(todoList);
      })
      .catch(() => {
        if (active) setTodos([]);
      })
      .finally(() => {
        if (active) setTodoLoading(false);
      });
    return () => { active = false; };
  }, [fetchTodosData]);

  const handleAddTodo = async (e) => {
    e.preventDefault();
    if (!newTodoTitle.trim()) return;
    setTodoLoading(true);
    try {
      const res = await apiFetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTodoTitle.trim(), description: newTodoDesc.trim(), dueDate: newTodoDueDate }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setNewTodoTitle('');
        setNewTodoDesc('');
        setNewTodoDueDate('');
        fetchTodosData();
      }
    } catch (err) {
      console.error('Error creating todo:', err);
    } finally {
      setTodoLoading(false);
    }
  };

  const handleToggleTodo = async (todo) => {
    const newStatus = todo.status === 'completed' ? 'pending' : 'completed';
    try {
      const res = await apiFetch('/api/todos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: todo.id, status: newStatus }),
      });
      if (res.ok) fetchTodosData();
    } catch (err) {
      console.error('Error updating todo:', err);
    }
  };

  const handleDeleteTodo = async (id) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      const res = await apiFetch(`/api/todos?id=${id}`, { method: 'DELETE' });
      if (res.ok) fetchTodosData();
    } catch (err) {
      console.error('Error deleting todo:', err);
    }
  };

  const handleEditTodoStart = (todo) => {
    setEditingTodoId(todo.id);
    setEditTodoTitle(todo.title);
  };

  const handleEditTodoSave = async (e) => {
    e.preventDefault();
    if (!editTodoTitle.trim()) return;
    try {
      const res = await apiFetch('/api/todos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingTodoId, title: editTodoTitle.trim() }),
      });
      if (res.ok) {
        setEditingTodoId(null);
        setEditTodoTitle('');
        fetchTodosData();
      }
    } catch (err) {
      console.error('Error editing todo:', err);
    }
  };

  const handleEditTodoCancel = () => {
    setEditingTodoId(null);
    setEditTodoTitle('');
  };

  // ── Calendar ──────────────────────────────────────────────────────
  const fetchCalendarData = useCallback(async () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const start = new Date(year, month, 1).toISOString().slice(0, 10);
    const end = new Date(year, month + 1, 0).toISOString().slice(0, 10);
    const res = await apiFetch(`/api/calendar?start=${start}&end=${end}`, { cache: 'no-store' });

    let result;
    try {
      const text = await res.text();
      if (!text || text.trim().length === 0) {
        throw new Error(`Server returned empty response (HTTP ${res.status})`);
      }
      result = JSON.parse(text);
    } catch (parseError) {
      if (parseError instanceof SyntaxError) {
        throw new Error(`Server returned invalid response (HTTP ${res.status})`);
      }
      throw parseError;
    }

    if (!res.ok || !result.success) {
      throw new Error(result?.message || `Unable to fetch calendar events (HTTP ${res.status})`);
    }
    return result.data.events || [];
  }, [calendarDate]);

  useEffect(() => {
    let active = true;
    fetchCalendarData()
      .then((eventList) => {
        if (active) setEvents(eventList);
      })
      .catch(() => {
        if (active) setEvents([]);
      })
      .finally(() => {
        if (active) setCalendarLoading(false);
      });
    return () => { active = false; };
  }, [fetchCalendarData]);

  const handleAddEvent = async (e) => {
    e.preventDefault();
    if (!newEventTitle.trim() || !newEventStartDate) return;
    setCalendarLoading(true);
    try {
      const res = await apiFetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEventTitle.trim(),
          startDate: newEventStartDate,
          endDate: newEventEndDate || newEventStartDate,
          eventType: 'appointment',
        }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setNewEventTitle('');
        setNewEventStartDate('');
        setNewEventEndDate('');
        fetchCalendarData();
      }
    } catch (err) {
      console.error('Error creating event:', err);
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleDeleteEvent = async (id) => {
    if (!window.confirm('Delete this event?')) return;
    try {
      const res = await apiFetch(`/api/calendar?id=${id}`, { method: 'DELETE' });
      if (res.ok) fetchCalendarData();
    } catch (err) {
      console.error('Error deleting event:', err);
    }
  };

  const handleEditEventStart = (ev) => {
    setEditingEvent({
      id: ev.id,
      title: ev.title || '',
      description: ev.description || '',
      startDate: ev.startDate ? ev.startDate.slice(0, 10) : '',
      endDate: ev.endDate ? ev.endDate.slice(0, 10) : (ev.startDate ? ev.startDate.slice(0, 10) : ''),
      startTime: ev.startTime || '',
      endTime: ev.endTime || '',
      eventType: ev.eventType || 'appointment',
    });
  };

  const handleEditEventSave = async (e) => {
    e.preventDefault();
    if (!editingEvent || !editingEvent.title.trim() || !editingEvent.startDate) return;
    try {
      const res = await apiFetch('/api/calendar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingEvent),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setEditingEvent(null);
        fetchCalendarData();
      }
    } catch (err) {
      console.error('Error editing event:', err);
    }
  };

  // ── Derived data ─────────────────────────────────────────────────
  const summary = useMemo(() => data?.summary || null, [data]);
  const salesStats = useMemo(() => data?.sales || null, [data]);
  const profitStats = useMemo(() => data?.profit || null, [data]);
  const activity = useMemo(() => data?.activity || null, [data]);
  const branchStock = useMemo(() => data?.branchStock || [], [data]);
  const paymentDue = useMemo(() => data?.paymentDue || [], [data]);
  const stockAlerts = useMemo(() => data?.stockAlerts || [], [data]);

  const pendingTodos = todos.filter((t) => t.status !== 'completed');
  const completedTodos = todos.filter((t) => t.status === 'completed');

  // Calendar events grouped by date
  const eventsByDate = useMemo(() => {
    const map = new Map();
    for (const ev of events) {
      const key = ev.startDate;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    return map;
  }, [events]);

  // ── Empty states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <Layout>
        <div className="rounded-xl border border-indigo-100 bg-white p-8 text-center text-sm text-slate-500" role="status">
          Loading dashboard…
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    const needsOnboarding = error?.includes('onboarding') || error?.includes('No company is configured');
    if (needsOnboarding) {
      return (
        <Layout>
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 dark:bg-slate-900 dark:border-indigo-900/60 p-8 sm:p-12 text-center max-w-2xl mx-auto my-12 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto mb-4 shadow-md shadow-indigo-600/20">
              <Building2 className="w-7 h-7" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Welcome to ERP DOST</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
              Your workspace is fresh and ready for configuration. Set up your company profile, financial year, currency, chart of accounts, and warehouse locations to begin.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link
                href="/onboarding"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/25 hover:bg-indigo-700 transition cursor-pointer"
              >
                <span>Start Client Onboarding</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </Layout>
      );
    }

    return (
      <Layout>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800" role="alert">
          <p className="font-semibold">Dashboard data is unavailable.</p>
          <p className="mt-1">{error || 'No dashboard response was received.'}</p>
          <button
            type="button"
            onClick={fetchDashboardData}
            className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </Layout>
    );
  }

  // ── Summary Cards Data ───────────────────────────────────────────
  const currencySymbol = summary?.currencySymbol || DEFAULT_CURRENCY_SYMBOL;

  const cards = [
    {
      title: 'Total Purchase',
      value: formatCurrency(summary?.totalPurchase ?? 0, currencySymbol),
      icon: <Truck className="w-4 h-4" />,
      color: 'bg-rose-50 text-rose-700 border-rose-200/80',
    },
    {
      title: 'Total Sale',
      value: formatCurrency(summary?.totalSale ?? 0, currencySymbol),
      icon: <Store className="w-4 h-4" />,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    },
    {
      title: 'Expenses',
      value: formatCurrency(summary?.totalExpenses ?? 0, currencySymbol),
      icon: <Wallet className="w-4 h-4" />,
      color: 'bg-amber-50 text-amber-700 border-amber-200/80',
    },
    {
      title: 'Purchase Due',
      value: formatCurrency(summary?.purchaseDue ?? 0, currencySymbol),
      icon: <CreditCard className="w-4 h-4" />,
      color: 'bg-amber-50 text-amber-700 border-amber-200/80',
    },
    {
      title: 'Invoice Due',
      value: formatCurrency(summary?.invoiceDue ?? 0, currencySymbol),
      icon: <CreditCard className="w-4 h-4" />,
      color: 'bg-rose-50 text-rose-700 border-rose-200/80',
    },
    {
      title: 'Total in Bank',
      value: formatCurrency(summary?.totalInBank ?? 0, currencySymbol),
      icon: <CreditCard className="w-4 h-4" />,
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
    },
    {
      title: 'Total in Cash',
      value: formatCurrency(summary?.totalInCash ?? 0, currencySymbol),
      icon: <Coins className="w-4 h-4" />,
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
    },
    {
      title: 'Net Profit',
      value: formatCurrency(summary?.netProfit ?? 0, currencySymbol),
      icon: <TrendingUp className="w-4 h-4" />,
      color: (summary?.netProfit ?? 0) >= 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80' : 'bg-rose-50 text-rose-700 border-rose-200/80',
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        {/* ═══════════════════════════════════════════════════════════════════════════
            1. HEADER — Title, Date Range Filters, Refresh
            ═════════════════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative z-10">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {data?.company?.companyName || 'Dawley institute of technology'} — <span className="text-indigo-600 dark:text-indigo-400">Dashboard</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Real-time business overview · {rangeLabel(range)} · Base Currency: {currencySymbol} ({data?.company?.currency || 'PKR'})
            </p>
          </div>

          <div className="flex items-center gap-2">
            {[ 'today', 'week', 'month', 'financial-year' ].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                  range === r
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/30'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-slate-700/60'
                }`}
              >
                {rangeLabel(r)}
              </button>
            ))}
            <button
              type="button"
              onClick={fetchDashboardData}
              className="ml-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
            >
              <Activity className="w-3 h-3" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Error banner (non-fatal) */}
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 relative z-10">
            {error}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════════════
            2. SUMMARY CARDS (8 cards)
            ════════════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
          {cards.map((card, idx) => (
            <div key={idx} className="relative overflow-hidden bg-white dark:bg-slate-900 p-4 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 shadow-sm flex flex-col h-[110px]">
              <div className="flex items-center justify-between mb-2.5 relative z-10">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold shadow-sm ${card.color}`}>
                  {card.icon}
                </div>
              </div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 relative z-10 mb-1">
                {card.title}
              </p>
              <div className="flex items-baseline gap-0.5 relative z-10">
                <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  {card.value}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════════════
            3. SALE & PROFIT STATISTICS (side by side)
            ════════════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 relative z-10">
          {/* Sale Statistics */}
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">Sale Statistics</h3>
                  <p className="text-[9px] text-slate-400">Monthly & yearly trend</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setSaleStatView('monthly')}
                  className={`px-2.5 py-1 rounded text-[9px] font-semibold border transition-colors ${
                    saleStatView === 'monthly'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60 hover:bg-indigo-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setSaleStatView('yearly')}
                  className={`px-2.5 py-1 rounded text-[9px] font-semibold border transition-colors ${
                    saleStatView === 'yearly'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60 hover:bg-indigo-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  Yearly
                </button>
              </div>
            </div>

            <div className="flex-1 relative max-h-[120px] overflow-hidden">
              {salesStats && salesStats[saleStatView] && salesStats[saleStatView].length > 0 ? (
                <div dangerouslySetInnerHTML={{ __html: svgLineChart({
                  points: salesStats[saleStatView].map((m) => ({ value: m.total || m.revenue || 0, label: m.month || m.year || m.week || '' })),
                  color: '#10B981',
                  gradientId: 'saleChartGradient',
                }) }} />
              ) : (
                <div className="h-44 flex flex-col items-center justify-center text-center">
                  <Package className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-[10px] text-slate-400 font-medium">No sales data available</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">Record sales to see trends</p>
                </div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60">
                <div className="text-slate-500 dark:text-slate-400">Total ({saleStatView.charAt(0).toUpperCase() + saleStatView.slice(1)})</div>
                <div className="font-bold text-slate-900 dark:text-white">
                  {formatCurrency(salesStats?.[saleStatView]?.reduce((sum, m) => sum + (m.total || m.revenue || 0), 0) ?? 0, currencySymbol)}
                </div>
              </div>
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60">
                <div className="text-slate-500 dark:text-slate-400">Total ({saleStatView === 'monthly' ? 'Yearly' : 'Monthly'})</div>
                <div className="font-bold text-slate-900 dark:text-white">
                  {formatCurrency(salesStats?.[saleStatView === 'monthly' ? 'yearly' : 'monthly']?.reduce((sum, m) => sum + (m.total || m.revenue || 0), 0) ?? 0, currencySymbol)}
                </div>
              </div>
            </div>
          </div>

          {/* Profit Statistics */}
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">Profit Statistics</h3>
                  <p className="text-[9px] text-slate-400">Accounting-based profit trend</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setProfitStatView('daily')}
                  className={`px-2.5 py-1 rounded text-[9px] font-semibold border transition-colors ${
                    profitStatView === 'daily'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60 hover:bg-indigo-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  Daily
                </button>
                <button
                  type="button"
                  onClick={() => setProfitStatView('weekly')}
                  className={`px-2.5 py-1 rounded text-[9px] font-semibold border transition-colors ${
                    profitStatView === 'weekly'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60 hover:bg-indigo-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  onClick={() => setProfitStatView('monthly')}
                  className={`px-2.5 py-1 rounded text-[9px] font-semibold border transition-colors ${
                    profitStatView === 'monthly'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60 hover:bg-indigo-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setProfitStatView('yearly')}
                  className={`px-2.5 py-1 rounded text-[9px] font-semibold border transition-colors ${
                    profitStatView === 'yearly'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60 hover:bg-indigo-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  Yearly
                </button>
              </div>
            </div>

            <div className="flex-1 relative max-h-[120px] overflow-hidden">
              {profitStats && profitStats[profitStatView] && profitStats[profitStatView].length > 0 ? (
                <div dangerouslySetInnerHTML={{ __html: svgLineChart({
                  points: profitStats[profitStatView].map((d) => ({ value: Math.max(0, d.profit), label: d.date || d.week || d.month || d.year || '' })),
                  color: '#4F46E5',
                  gradientId: 'profitChartGradient',
                }) }} />
              ) : (
                <div className="h-44 flex flex-col items-center justify-center text-center">
                  <Activity className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-[10px] text-slate-400 font-medium">No profit data available</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">Post transactions to see profit trends</p>
                </div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60">
                <div className="text-slate-500 dark:text-slate-400">Total Revenue ({profitStatView})</div>
                <div className="font-bold text-slate-900 dark:text-white">
                  {formatCurrency(profitStats?.[profitStatView]?.reduce((sum, d) => sum + d.revenue, 0) ?? 0, currencySymbol)}
                </div>
              </div>
              <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60">
                <div className="text-slate-500 dark:text-slate-400">Net Profit</div>
                <div className={`font-bold text-slate-900 dark:text-white ${
                  (summary?.netProfit ?? 0) < 0 ? 'text-rose-600' : 'text-emerald-600'
                }`}>
                  {formatCurrency(summary?.netProfit ?? 0, currencySymbol)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════════
            4. RECENT ACTIVITY & BRANCH STOCK (row)
            ════════════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 relative z-10">
          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">Recent Activity</h3>
                  <p className="text-[9px] text-slate-400">Latest sales & purchase transactions</p>
                </div>
              </div>
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('sales')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
                    activeTab === 'sales'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-indigo-50'
                  }`}
                >
                  Sales
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('purchase')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
                    activeTab === 'purchase'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-indigo-50'
                  }`}
                >
                  Purchases
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700/60">
                    {['Invoice', 'Date', 'Branch', 'Amount', 'Customer / Supplier', 'Status'].map((h) => (
                      <th key={h} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-700/50">
                  {activity && activity[activeTab === 'sales' ? 'sales' : 'purchases'] && activity[activeTab === 'sales' ? 'sales' : 'purchases'].length > 0 ? (
                    activity[activeTab === 'sales' ? 'sales' : 'purchases'].map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-3 py-2.5 text-[10px] font-medium text-slate-700 dark:text-slate-300">
                          {item.invoiceNumber}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] text-slate-500 dark:text-slate-400">
                          {formatDate(item.date)}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] text-slate-500 dark:text-slate-400">
                          {item.branch || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] font-medium text-slate-900 dark:text-white">
                          {formatCurrency(item.amount, currencySymbol)}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[150px]">
                          {item.customer || '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold border ${statusBadge(item.status)}`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-[10px] text-slate-400">
                        No {activeTab === 'sales' ? 'sales' : 'purchase'} activity found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex justify-end">
              <Link
                href={activeTab === 'sales' ? '/sales' : '/procurement'}
                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
              >
                View All {activeTab === 'sales' ? 'Orders' : 'Purchases'}
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Branch Wise Product Quantity */}
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">Branch Wise Stock</h3>
                  <p className="text-[9px] text-slate-400">Product quantities by warehouse</p>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-[200px]">
              {branchStock.length > 0 ? (
                <div className="flex flex-col h-full">
                  <div className="flex-1 relative">
                    <svg
                      className="w-full h-full"
                      viewBox={`0 0 ${Math.max(400, branchStock.length * 100 + 40)} 220`}
                      preserveAspectRatio="none"
                    >
                      {branchStock.map((branch, i) => {
                        const total = branch.finishedGoods + branch.fabricMeters + branch.trimUnits;
                        const allTotal = branchStock.reduce((sum, b) => sum + b.finishedGoods + b.fabricMeters + b.trimUnits, 0);
                        const pct = allTotal > 0 ? (total / allTotal) * 100 : 0;
                        const barHeight = Math.max(pct * 1.8, 10);
                        const x = i * 100 + 20;
                        const colors = ['#4F46E5', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'];
                        return (
                          <g key={i}>
                            <rect x={x} y={220 - barHeight - 30} width={60} height={barHeight} fill={colors[i % colors.length]} />
                            <text x={x + 30} y={215} textAnchor="middle" fontSize="9" fill="#64748B">{branch.branch}</text>
                            <text x={x + 30} y={220 - barHeight - 35} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#1E293B">
                              {total.toLocaleString()}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                  <div className="mt-3 space-y-1">
                    {branchStock.map((branch, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px]">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#4F46E5', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'][i % 5] }} />
                        <span className="text-slate-600 dark:text-slate-400 truncate w-16">{branch.branch}</span>
                        <span className="ml-auto text-slate-900 dark:text-white font-medium">
                          FG: {branch.finishedGoods.toLocaleString()} · Fabric: {branch.fabricMeters.toLocaleString()}m · Trim: {branch.trimUnits.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-44 flex flex-col items-center justify-center text-center">
                  <Layers className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="text-[10px] text-slate-400 font-medium">No stock data available</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">Add inventory to see branch distribution</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════════
            5. PAYMENT DUE LIST & STOCK ALERTS (row)
            ════════════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 relative z-10">
          {/* Payment Due List */}
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">Payment Due List</h3>
                  <p className="text-[9px] text-slate-400">Outstanding customer invoices</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700/60">
                    {['Invoice', 'Date', 'Branch', 'Amount', 'Due', 'Customer'].map((h) => (
                      <th key={h} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 dark:divide-slate-700/50">
                  {paymentDue.length > 0 ? (
                    paymentDue.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-3 py-2.5 text-[10px] font-medium text-slate-700 dark:text-slate-300">
                          {item.invoiceNumber}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] text-slate-500 dark:text-slate-400">
                          {formatDate(item.date)}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] text-slate-500 dark:text-slate-400">
                          {item.branch || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] text-slate-500 dark:text-slate-400">
                          {formatCurrency(item.amount, currencySymbol)}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
                          {formatCurrency(item.dueAmount, currencySymbol)}
                        </td>
                        <td className="px-3 py-2.5 text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[120px]">
                          {item.customer || '—'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-[10px] text-slate-400">
                        No outstanding payments.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stock Alert List */}
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">Stock Alert List</h3>
                  <p className="text-[9px] text-slate-400">Low-stock items needing reorder</p>
                </div>
              </div>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                stockAlerts.length > 0 ? 'bg-rose-100 text-rose-700 border-rose-200/80' : 'bg-emerald-100 text-emerald-700 border-emerald-200/80'
              }`}>
                {stockAlerts.length} item{stockAlerts.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[280px]">
              {stockAlerts.length > 0 ? (
                <div className="space-y-2">
                  {stockAlerts.map((item, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-amber-50/60 dark:bg-slate-800/60 border border-amber-100 dark:border-amber-900/50 flex items-start gap-2 text-xs">
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-slate-800 dark:text-slate-200 font-semibold leading-snug">
                          <span className="truncate">{item.name}</span>
                          <span className="text-rose-600 font-extrabold">{item.current} {item.unit}</span>
                        </div>
                        <div className="flex justify-between text-slate-500 dark:text-slate-400 text-[9px] mt-0.5">
                          <span>SKU: {item.sku || '—'}</span>
                          <span>Min: {item.min} {item.unit}</span>
                          <span className="text-xs">{item.warehouse || '—'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-slate-400">
                  <Bell className="w-6 h-6 mx-auto text-indigo-200 dark:text-indigo-400/30 mb-1.5" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">No stock alerts</p>
                  <p className="text-[10px] text-slate-400">All items are above reorder levels</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════════
            6. DASHBOARD CALENDAR & TO DO LIST (row)
            ════════════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 relative z-10">
          {/* Dashboard Calendar */}
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">Dashboard Calendar</h3>
                  <p className="text-[9px] text-slate-400">Month · Week · Day view</p>
                </div>
              </div>
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(calendarDate);
                    d.setMonth(d.getMonth() - 1);
                    setCalendarDate(d);
                  }}
                  className="px-2 py-1.5 rounded-lg text-[10px] font-bold border bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-indigo-50 flex items-center gap-1"
                >
                  ←
                </button>
                <span className="px-2 py-1.5 rounded-lg text-[10px] font-bold bg-indigo-600 text-white border-indigo-600">
                  {calendarDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(calendarDate);
                    d.setMonth(d.getMonth() + 1);
                    setCalendarDate(d);
                  }}
                  className="px-2 py-1.5 rounded-lg text-[10px] font-bold border bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-indigo-50 flex items-center gap-1"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarDate(new Date())}
                  className="px-2 py-1.5 rounded-lg text-[10px] font-bold border bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-indigo-50 flex items-center gap-1"
                >
                  Today
                </button>
              </div>
            </div>

            <div className="flex gap-1 mb-3">
              {['month', 'week', 'day'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setCalendarView(v)}
                  className={`px-2.5 py-1 rounded text-[9px] font-semibold border transition-colors ${
                    calendarView === v
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60 hover:bg-indigo-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-[280px] relative">
              {/* Month view grid */}
              {calendarView === 'month' && (
                <div className="flex flex-col h-full">
                  {/* Weekday headers in one proper horizontal row */}
                  <div className="grid grid-cols-7 gap-1 text-center font-semibold text-[10px] text-slate-500 dark:text-slate-400 py-1.5 border-b border-slate-100 dark:border-slate-800">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                      <div key={day} className="py-0.5">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* 7-column Month grid */}
                  <div className="grid grid-cols-7 gap-1 mt-1.5 flex-1">
                    {(() => {
                      const year = calendarDate.getFullYear();
                      const month = calendarDate.getMonth();
                      const firstDay = new Date(year, month, 1).getDay();
                      const daysInMonth = new Date(year, month + 1, 0).getDate();
                      const today = new Date();
                      const isToday = (d) =>
                        d.getDate() === today.getDate() &&
                        d.getMonth() === today.getMonth() &&
                        d.getFullYear() === today.getFullYear();
                      const isSelected = (d) =>
                        selectedDate &&
                        d.getDate() === selectedDate.getDate() &&
                        d.getMonth() === selectedDate.getMonth() &&
                        d.getFullYear() === selectedDate.getFullYear();

                      const cells = [];
                      for (let i = 0; i < firstDay; i++) {
                        cells.push(
                          <div
                            key={`empty-${i}`}
                            className="h-11 p-1 rounded-lg border border-transparent bg-slate-50/20 dark:bg-slate-900/20"
                          />
                        );
                      }

                      for (let day = 1; day <= daysInMonth; day++) {
                        const currentCellDate = new Date(year, month, day);
                        const dateStr = currentCellDate.toISOString().slice(0, 10);
                        const dayEvents = eventsByDate.get(dateStr) || [];
                        const isTodayDay = isToday(currentCellDate);
                        const isSelectedDay = isSelected(currentCellDate);

                        cells.push(
                          <div
                            key={day}
                            onClick={() => {
                              setSelectedDate(currentCellDate);
                              setNewEventStartDate(dateStr);
                              setNewEventEndDate(dateStr);
                            }}
                            className={`p-1 text-[10px] rounded-lg border transition-all cursor-pointer flex flex-col justify-between h-11 relative ${
                              isSelectedDay
                                ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 shadow-xs'
                                : isTodayDay
                                ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/20 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                                : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:border-indigo-200 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-[10px] ${
                                  isTodayDay
                                    ? 'w-4 h-4 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-[9px]'
                                    : isSelectedDay
                                    ? 'font-bold text-indigo-600 dark:text-indigo-400'
                                    : 'font-medium text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                {day}
                              </span>
                              {dayEvents.length > 0 && (
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                              )}
                            </div>

                            {dayEvents.length > 0 ? (
                              <div
                                className="px-1 py-0.5 rounded bg-indigo-600/90 text-white text-[8px] leading-tight truncate font-medium cursor-pointer"
                                title={dayEvents.map((e) => e.title).join(', ')}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditEventStart(dayEvents[0]);
                                }}
                              >
                                {dayEvents[0].title}
                                {dayEvents.length > 1 ? ` (+${dayEvents.length - 1})` : ''}
                              </div>
                            ) : (
                              <div className="h-2" />
                            )}
                          </div>
                        );
                      }
                      return cells;
                    })()}
                  </div>
                </div>
              )}

              {/* Week view */}
              {calendarView === 'week' && (
                <div className="flex flex-col h-full">
                  {(() => {
                    const start = startOfWeek(calendarDate);
                    const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * dayMs));
                    const today = new Date();
                    const isSameDay = (d1, d2) =>
                      d1.getDate() === d2.getDate() &&
                      d1.getMonth() === d2.getMonth() &&
                      d1.getFullYear() === d2.getFullYear();

                    return (
                      <>
                        <div className="grid grid-cols-7 gap-1 text-center font-semibold text-[10px] text-slate-500 dark:text-slate-400 py-1.5 border-b border-slate-100 dark:border-slate-800">
                          {days.map((d) => (
                            <div key={d.toISOString()} className="py-0.5">
                              <div>{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                              <div className={`text-[10px] ${isSameDay(d, today) ? 'text-indigo-600 font-bold' : 'text-slate-400'}`}>
                                {d.getDate()}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1 mt-1.5 flex-1 min-h-[140px]">
                          {days.map((d) => {
                            const dateStr = d.toISOString().slice(0, 10);
                            const dayEvents = eventsByDate.get(dateStr) || [];
                            const isTodayDay = isSameDay(d, today);
                            const isSelectedDay = isSameDay(d, selectedDate);

                            return (
                              <div
                                key={dateStr}
                                onClick={() => {
                                  setSelectedDate(d);
                                  setNewEventStartDate(dateStr);
                                  setNewEventEndDate(dateStr);
                                }}
                                className={`p-1.5 rounded-lg border text-[10px] flex flex-col gap-1 transition-all cursor-pointer ${
                                  isSelectedDay
                                    ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30'
                                    : isTodayDay
                                    ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/10'
                                    : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:bg-slate-50'
                                }`}
                              >
                                {dayEvents.length > 0 ? (
                                  dayEvents.map((ev) => (
                                    <div
                                      key={ev.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditEventStart(ev);
                                      }}
                                      className="p-1 rounded bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 text-[9px] text-indigo-700 dark:text-indigo-300 truncate"
                                      title={ev.title}
                                    >
                                      {ev.title}
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-[9px] text-slate-300 dark:text-slate-600 text-center mt-2">—</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Day view */}
              {calendarView === 'day' && (
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {(selectedDate || calendarDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {(eventsByDate.get((selectedDate || calendarDate).toISOString().slice(0, 10)) || []).length} event(s)
                    </span>
                  </div>

                  <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[220px]">
                    {(() => {
                      const dateStr = (selectedDate || calendarDate).toISOString().slice(0, 10);
                      const dayEvents = eventsByDate.get(dateStr) || [];
                      if (dayEvents.length === 0) {
                        return (
                          <div className="py-8 flex flex-col items-center justify-center text-center">
                            <Clock className="w-6 h-6 text-slate-300 mb-1" />
                            <p className="text-[11px] text-slate-500 font-medium">No events scheduled for this day</p>
                            <p className="text-[9px] text-slate-400 mt-0.5">Add an appointment or task using the form below</p>
                          </div>
                        );
                      }
                      return dayEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="p-2 rounded-lg border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800/80 flex items-start justify-between gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">{ev.title}</div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {ev.startTime ? `${ev.startTime}${ev.endTime ? ` – ${ev.endTime}` : ''}` : 'All day'}
                            </div>
                            {ev.description && (
                              <div className="text-[10px] text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">{ev.description}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEditEventStart(ev)}
                              className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-700 cursor-pointer"
                              title="Edit event"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(ev.id)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-700 cursor-pointer"
                              title="Delete event"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Event Edit Modal / Form */}
            {editingEvent && (
              <form onSubmit={handleEditEventSave} className="p-3 mt-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/30 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span>Edit Event</span>
                  <button type="button" onClick={() => setEditingEvent(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={editingEvent.title}
                  onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
                  placeholder="Event Title"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={editingEvent.startDate}
                    onChange={(e) => setEditingEvent({ ...editingEvent, startDate: e.target.value })}
                    className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                  <input
                    type="date"
                    value={editingEvent.endDate}
                    onChange={(e) => setEditingEvent({ ...editingEvent, endDate: e.target.value })}
                    className="px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingEvent(null)}
                    className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            )}

            {/* Event Creation Form */}
            <form onSubmit={handleAddEvent} className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 relative z-10">
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Event title…"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="flex-1 w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="date"
                  value={newEventStartDate || (selectedDate ? selectedDate.toISOString().slice(0, 10) : '')}
                  onChange={(e) => {
                    setNewEventStartDate(e.target.value);
                    if (!newEventEndDate) setNewEventEndDate(e.target.value);
                  }}
                  className="w-32 px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={calendarLoading || !newEventTitle.trim()}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
              </div>
            </form>
          </div>

          {/* To Do List */}
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-indigo-100/80 dark:border-indigo-900/40 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">To Do List</h3>
                  <p className="text-[9px] text-slate-400">Tasks assigned to you</p>
                </div>
              </div>
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => setTodoFilter('all')}
                  className={`px-2.5 py-1 rounded text-[9px] font-semibold border transition-colors ${
                    todoFilter === 'all'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60 hover:bg-indigo-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setTodoFilter('pending')}
                  className={`px-2.5 py-1 rounded text-[9px] font-semibold border transition-colors ${
                    todoFilter === 'pending'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60 hover:bg-indigo-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  Incomplete
                </button>
                <button
                  type="button"
                  onClick={() => setTodoFilter('completed')}
                  className={`px-2.5 py-1 rounded text-[9px] font-semibold border transition-colors ${
                    todoFilter === 'completed'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60 hover:bg-indigo-50 dark:hover:bg-slate-700/40'
                  }`}
                >
                  Completed
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-[200px] overflow-y-auto">
              {editingTodoId ? (
                <form onSubmit={handleEditTodoSave} className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 mb-3">
                  <input
                    type="text"
                    value={editTodoTitle}
                    onChange={(e) => setEditTodoTitle(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-400"
                  />
                  <div className="flex gap-1 mt-2">
                    <button
                      type="submit"
                      className="flex-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={handleEditTodoCancel}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-bold hover:bg-indigo-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleAddTodo} className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 mb-3">
                  <div className="flex gap-1">
                    <input
                      type="text"
                      placeholder="New task…"
                      value={newTodoTitle}
                      onChange={(e) => setNewTodoTitle(e.target.value)}
                      className="flex-1 w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-400"
                    />
                    <input
                      type="date"
                      value={newTodoDueDate}
                      onChange={(e) => setNewTodoDueDate(e.target.value)}
                      className="w-24 px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-400"
                    />
                    <button
                      type="submit"
                      disabled={todoLoading}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={newTodoDesc}
                    onChange={(e) => setNewTodoDesc(e.target.value)}
                    className="w-full mt-1 px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-400"
                  />
                </form>
              )}

              <div className="space-y-1">
                {todos.length === 0 ? (
                  <div className="py-4 text-center text-slate-400">
                    <Check className="w-6 h-6 mx-auto text-indigo-200 dark:text-indigo-400/30 mb-1.5" />
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">No tasks</p>
                    <p className="text-[10px] text-slate-400">Add a task to get started</p>
                  </div>
                ) : (
                  todos.map((todo) => (
                    <div
                      key={todo.id}
                      className="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-800/70 flex items-start gap-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleTodo(todo)}
                        className="mt-0.5 shrink-0"
                      >
                        <CheckCircle2
                          className={`w-4 h-4 ${
                            todo.status === 'completed'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-300 hover:text-indigo-400'
                          }`}
                        />
                      </button>
                      <div className="flex-1 min-w-0">
                        {editingTodoId === todo.id ? (
                          <input
                            type="text"
                            value={editTodoTitle}
                            onChange={(e) => setEditTodoTitle(e.target.value)}
                            onBlur={handleEditTodoSave}
                            className="w-full px-2 py-1 text-xs border border-indigo-400 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            autoFocus
                          />
                        ) : (
                          <div className="flex justify-between items-start">
                            <span className={`text-xs leading-snug ${todo.status === 'completed' ? 'line-through text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}>
                              {todo.title}
                            </span>
                            <div className="flex gap-1 ml-2">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleEditTodoStart(todo); }}
                                className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDeleteTodo(todo.id); }}
                                className="text-slate-400 hover:text-rose-600"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}
                        {todo.dueDate && (
                          <div className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                            {formatDate(todo.dueDate)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}