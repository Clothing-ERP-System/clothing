'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import ReceiptModal from '@/components/ReceiptModal';
import RecordViewModal from '@/components/RecordViewModal';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';
import { apiFetch } from '@/lib/apiFetch.js';
import {
  Store,
  Barcode,
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  Banknote,
  DollarSign,
  Printer,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Eye,
} from 'lucide-react';

export default function RetailPOSPage() {
  const { addToast, currentBranch, user } = useAuth();
  const [session, setSession] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [financialAccounts, setFinancialAccounts] = useState([]);
  const [salesAccountCode, setSalesAccountCode] = useState('');
  const [paymentAccountCode, setPaymentAccountCode] = useState('');
  const [refundAccountCode, setRefundAccountCode] = useState('');
  const [loading, setLoading] = useState(true);

  // Cart State
  const [cart, setCart] = useState([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchCatalog, setSearchCatalog] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [cashTendered, setCashTendered] = useState('');
  const [splitDetails, setSplitDetails] = useState([
    { amount: '', accountCode: '', method: 'Cash' },
    { amount: '', accountCode: '', method: 'CreditCard' },
  ]);

  // Modals
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [lastTransaction, setLastTransaction] = useState(null);
  const [isOpenShiftOpen, setIsOpenShiftOpen] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState('');
  const [isCloseShiftOpen, setIsCloseShiftOpen] = useState(false);
  const [actualCashInput, setActualCashInput] = useState('');
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancelTransaction, setCancelTransaction] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('Cash');
  const checkoutRequestId = useRef(null);
  // View transaction modal
  const [viewTransaction, setViewTransaction] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/pos?branch=${encodeURIComponent(currentBranch)}`);
      const json = await res.json();
      if (json.success) {
        setSession(json.data.activeSession);
        setCatalog(json.data.catalogArticles || []);
        setRecentTransactions(json.data.recentTransactions || []);
        const accounts = json.data.financialAccounts || [];
        setFinancialAccounts(accounts);
        setSalesAccountCode((current) => current || accounts.find((account) => account.type === 'Revenue')?.code || '');
        setPaymentAccountCode((current) => current || accounts.find((account) => account.type === 'Asset')?.code || '');
        setRefundAccountCode((current) => current || accounts.find((account) => account.type === 'Asset')?.code || '');
      }
    } catch (err) {
      console.error('Error loading POS:', err);
    } finally {
      setLoading(false);
    }
  }, [currentBranch]);

  const handleCancelTransaction = async (event) => {
    event.preventDefault();
    if (!cancelTransaction) return;
    try {
      const response = await apiFetch('/api/pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CANCEL_TRANSACTION',
          transactionId: cancelTransaction._id,
          refundAmount: Number(cancelTransaction.grandTotal),
          refundMethod,
          salesReturnsAccountCode: salesAccountCode,
          refundAccountCode,
          cancellationReason: cancelReason,
          cancelledBy: user?.name || '',
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Cancellation failed', 'error');
        return;
      }
      addToast(`Receipt ${result.data.transaction.receiptNumber} cancelled and refunded`, 'success');
      setIsCancelOpen(false);
      setCancelTransaction(null);
      setCancelReason('');
      await fetchData();
    } catch {
      addToast('Error cancelling POS transaction', 'error');
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  const handleOpenShift = async (e) => {
    e.preventDefault();
    try {
      const response = await apiFetch('/api/pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'OPEN_SHIFT',
          cashierName: user?.name || '',
          openingCash: Number(openingCashInput),
          outletBranch: currentBranch,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Unable to open shift', 'error');
        return;
      }
      setIsOpenShiftOpen(false);
      setOpeningCashInput('');
      await fetchData();
    } catch {
      addToast('Error opening POS shift', 'error');
    }
  };

  // Add Item to Cart
  const addToCart = (article) => {
    const availableStock = Number(article.availableStock);
    if (!Number.isSafeInteger(availableStock) || availableStock <= 0) {
      addToast('This product has no available finished stock', 'warning');
      return;
    }
    if (!Number.isFinite(Number(article.price)) || Number(article.price) <= 0) {
      addToast('Set a valid retail price for this design before adding it to the cart', 'warning');
      return;
    }
    const existingIndex = cart.findIndex((item) => item.code === article.code);
    if (existingIndex > -1) {
      const updated = [...cart];
      if (updated[existingIndex].quantity >= availableStock) {
        addToast('Cart quantity cannot exceed available finished stock', 'warning');
        return;
      }
      updated[existingIndex].quantity += 1;
      saveCart(updated);
    } else {
      saveCart([
        ...cart,
        {
          code: article.code,
          title: article.title,
          barcode: article.barcode || '',
          price: Number(article.price),
          availableStock,
          size: '',
          color: '',
          quantity: 1,
          discountPercent: 0,
        },
      ]);
    }
  };

  // Handle Barcode Scan / Enter
  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    if (!barcodeInput) return;

    const matched = catalog.find(
      (a) => a.barcode === barcodeInput || a.code.toLowerCase() === barcodeInput.toLowerCase()
    );

    if (matched) {
      addToCart(matched);
      addToast(`Added: ${matched.title}`, 'success');
      setBarcodeInput('');
    } else {
      addToast(`Barcode ${barcodeInput} not found in catalog`, 'warning');
    }
  };

  // Cart Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalDiscount = cart.reduce(
    (sum, item) => sum + (item.price * (item.discountPercent / 100)) * item.quantity,
    0
  );
  const grandTotal = Math.round(subtotal - totalDiscount);
  const changeDue = Math.max(0, Number(cashTendered) - grandTotal);
  const splitTotal = splitDetails.reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
  const isSplitPaymentValid = splitDetails.length >= 2 &&
    splitDetails.every((split) =>
      Number.isFinite(Number(split.amount)) && Number(split.amount) > 0 && Boolean(split.accountCode)
    ) &&
    Math.abs(splitTotal - grandTotal) <= 0.01;
  const saveCart = (nextCart) => {
    checkoutRequestId.current = null;
    setCart(nextCart);
  };

  // Complete Checkout
  const handleCheckout = async () => {
    if (cart.length === 0) {
      addToast('Cart is empty', 'warning');
      return;
    }

    try {
      if (!checkoutRequestId.current) {
        checkoutRequestId.current = globalThis.crypto.randomUUID();
      }
      const res = await apiFetch('/api/pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'COMPLETE_CHECKOUT',
          checkoutRequestId: checkoutRequestId.current,
          sessionId: session?.sessionCode,
          cashierName: user?.name || '',
          customerName,
          customerPhone,
          items: cart.map((i) => ({
            articleCode: i.code,
            title: i.title,
            barcode: i.barcode,
            size: i.size,
            color: i.color,
            price: i.price,
            quantity: i.quantity,
            discountPercent: i.discountPercent,
          })),
          paymentMethod,
          splitDetails: paymentMethod === 'Split' ? splitDetails : [],
          revenueAccountCode: salesAccountCode,
          paymentAccountCode,
          cashTendered: Number(cashTendered) || 0,
          outletBranch: currentBranch,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Checkout failed', 'error');
        return;
      }

      setLastTransaction(json.data.transaction);
      setIsReceiptOpen(true);
      saveCart([]);
      setCashTendered('');
      addToast('Sale finalized! Generating receipt...', 'success');
      fetchData();
    } catch {
      addToast('Checkout processing error', 'error');
    }
  };

  // Close Register Shift
  const handleCloseShift = async (e) => {
    e.preventDefault();
    if (!session) return;

    try {
      const res = await apiFetch('/api/pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CLOSE_SHIFT',
          sessionId: session._id,
          closingCashActual: Number(actualCashInput),
          closingNotes: '',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to close shift', 'error');
        return;
      }
      addToast('Shift closed and drawer reconciled!', 'success');
      setIsCloseShiftOpen(false);
      fetchData();
    } catch {
      addToast('Error closing shift', 'error');
    }
  };

  const filteredCatalog = catalog.filter((c) =>
    c.title.toLowerCase().includes(searchCatalog.toLowerCase()) ||
    c.code.toLowerCase().includes(searchCatalog.toLowerCase())
  );

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header with Shift Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-[#0D9488] border border-teal-100 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#0D9488] animate-pulse" />
                POS REGISTER ONLINE
              </span>
              <span className="text-xs text-slate-500">• {currentBranch}</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Retail Point of Sale & Cashier Terminal
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {session ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  Drawer: <strong className="text-slate-800">Rs. {session.expectedCash?.toLocaleString()}</strong>
                </span>
                <button
                  onClick={() => {
                    setActualCashInput(session.expectedCash || 0);
                    setIsCloseShiftOpen(true);
                  }}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Close Shift
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsOpenShiftOpen(true)}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA]"
              >
                Open Shift
              </button>
            )}
          </div>
        </div>

        {/* POS Workstation Grid: Left Catalog/Search + Right Cart & Checkout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Barcode Reader + Fast Catalog */}
          <div className="lg:col-span-7 space-y-4">
            {/* Barcode Search Bar */}
            <form onSubmit={(event) => preventDuplicateSubmit(event, handleBarcodeSubmit)} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Scan Garment Barcode or Article SKU (Press Enter)
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Scan or enter barcode"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5] text-slate-900 font-bold"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#4F46E5] text-white text-xs font-bold rounded-lg hover:bg-[#4338CA] transition-colors shadow-sm"
                >
                  Scan Add
                </button>
              </div>
            </form>

            {/* Catalog Grid */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Quick Catalog ({filteredCatalog.length})
                </span>
                <input
                  type="text"
                  placeholder="Filter articles..."
                  value={searchCatalog}
                  onChange={(e) => setSearchCatalog(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filteredCatalog.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    disabled={Number(item.availableStock) <= 0}
                    className="p-3 text-left rounded-xl border border-slate-200 hover:border-[#4F46E5] hover:bg-indigo-50/30 transition-all group flex flex-col justify-between disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div>
                      <span className="text-[10px] font-mono font-bold text-[#4F46E5]">{item.code}</span>
                      <h4 className="text-xs font-bold text-slate-900 group-hover:text-[#4F46E5] line-clamp-1 mt-0.5">
                        {item.title}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">{item.category}</p>
                      <p className="text-[10px] text-slate-500 mt-1">Stock: {item.availableStock} pcs</p>
                    </div>
                    <div className="mt-3 flex justify-between items-center text-xs">
                      <span className="font-extrabold text-slate-900">Rs. {item.price?.toLocaleString()}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                        {item.barcode}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Active Cart & Fast Checkout */}
          <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-[#4F46E5]" />
                <h3 className="text-sm font-bold text-slate-900">Current Cart ({cart.length} Items)</h3>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={() => saveCart([])}
                  className="text-red-500 hover:text-red-700 text-xs font-semibold flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Cart Items List */}
            <div className="space-y-2 max-h-60 overflow-y-auto divide-y divide-slate-100">
              {cart.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Scan barcode or select articles from catalog to ring up sale.
                </div>
              ) : (
                cart.map((item, idx) => (
                  <div key={idx} className="pt-2 flex items-center justify-between gap-2 text-xs">
                    <div className="flex-1">
                      <p className="font-bold text-slate-900">{item.title}</p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {item.size} • Rs. {item.price.toLocaleString()} each
                      </p>
                    </div>

                    {/* Quantity Controls */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          const updated = [...cart];
                          if (updated[idx].quantity > 1) {
                            updated[idx].quantity -= 1;
                            saveCart(updated);
                          } else {
                            saveCart(cart.filter((_, i) => i !== idx));
                          }
                        }}
                        className="p-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center font-bold text-slate-800">{item.quantity}</span>
                      <button
                        onClick={() => {
                          const updated = [...cart];
                          if (updated[idx].quantity < updated[idx].availableStock) {
                            updated[idx].quantity += 1;
                            saveCart(updated);
                          } else {
                            addToast('Cart quantity cannot exceed available finished stock', 'warning');
                          }
                        }}
                        className="p-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="text-right font-bold text-slate-900 w-20">
                      Rs. {(item.price * item.quantity).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Customer Details */}
            <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
              <input
                type="text"
                placeholder="Customer Name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
              <input
                type="text"
                placeholder="Phone (Optional)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <span className="text-xs font-bold text-slate-700 block">Payment Method</span>
              <div className="grid grid-cols-4 gap-2">
                {['Cash', 'CreditCard', 'BankTransfer', 'Split'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      if (m === 'Split' && splitDetails.length < 2) {
                        setSplitDetails([
                          { amount: '', accountCode: '', method: 'Cash' },
                          { amount: '', accountCode: '', method: 'CreditCard' },
                        ]);
                      }
                      setPaymentMethod(m);
                    }}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      paymentMethod === m
                        ? 'bg-[#172554] text-white border-[#172554]'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {m === 'CreditCard' ? 'Card' : m}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1.5">
                <select
                  required
                  value={salesAccountCode}
                  onChange={(event) => setSalesAccountCode(event.target.value)}
                  className="px-2 py-1.5 text-[11px] border border-slate-200 rounded-lg"
                  aria-label="Sales revenue account"
                >
                  <option value="">Sales revenue account</option>
                  {financialAccounts.filter((account) => account.type === 'Revenue').map((account) => (
                    <option key={account.code} value={account.code}>{account.code} · {account.name}</option>
                  ))}
                </select>
                {paymentMethod !== 'Split' && (
                  <select
                    required
                    value={paymentAccountCode}
                    onChange={(event) => setPaymentAccountCode(event.target.value)}
                    className="px-2 py-1.5 text-[11px] border border-slate-200 rounded-lg"
                    aria-label="Payment asset account"
                  >
                    <option value="">Payment asset account</option>
                    {financialAccounts.filter((account) => account.type === 'Asset').map((account) => (
                      <option key={account.code} value={account.code}>{account.code} · {account.name}</option>
                    ))}
                  </select>
                )}
              </div>
              {paymentMethod === 'Split' && (
                <div className="space-y-2 pt-2">
                  {splitDetails.map((split, index) => (
                    <div key={index} className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        value={split.amount}
                        onChange={(event) => setSplitDetails((current) => current.map((line, lineIndex) =>
                          lineIndex === index ? { ...line, amount: event.target.value } : line
                        ))}
                        placeholder="Amount"
                        className="px-2 py-1.5 text-[11px] border border-slate-200 rounded-lg"
                        aria-label={`Split payment ${index + 1} amount`}
                      />
                      <select
                        required
                        value={split.accountCode}
                        onChange={(event) => setSplitDetails((current) => current.map((line, lineIndex) =>
                          lineIndex === index ? { ...line, accountCode: event.target.value } : line
                        ))}
                        className="px-2 py-1.5 text-[11px] border border-slate-200 rounded-lg"
                        aria-label={`Split payment ${index + 1} account`}
                      >
                        <option value="">Select asset account</option>
                        {financialAccounts.filter((account) => account.type === 'Asset').map((account) => (
                          <option key={account.code} value={account.code}>{account.code} · {account.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={splitDetails.length <= 2}
                        onClick={() => setSplitDetails((current) => current.filter((_, lineIndex) => lineIndex !== index))}
                        className="px-2 text-xs text-red-600 disabled:opacity-40"
                        aria-label={`Remove split payment ${index + 1}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-[11px]">
                    <button
                      type="button"
                      onClick={() => setSplitDetails((current) => [
                        ...current,
                        { amount: '', accountCode: '', method: 'Cash' },
                      ])}
                      className="font-bold text-indigo-600"
                    >
                      Add payment line
                    </button>
                    <span className={Math.abs(splitTotal - grandTotal) <= 0.01 ? 'text-emerald-700' : 'text-red-600'}>
                      Allocated Rs. {splitTotal.toLocaleString()} / Rs. {grandTotal.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Bill Summary */}
            <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 text-xs border border-slate-100">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal:</span>
                <span>Rs. {subtotal.toLocaleString()}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Discount:</span>
                  <span>- Rs. {totalDiscount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-sm text-slate-900 pt-1 border-t border-slate-200">
                <span>GRAND TOTAL:</span>
                <span>Rs. {grandTotal.toLocaleString()}</span>
              </div>

              {paymentMethod === 'Cash' && (
                <div className="pt-2 border-t border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-semibold">Cash Tendered:</span>
                    <input
                      type="number"
                      placeholder="Cash received"
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      className="w-28 px-2 py-1 text-right text-xs font-bold border border-slate-200 rounded focus:outline-none focus:border-[#4F46E5] bg-white"
                    />
                  </div>
                  <div className="flex justify-between text-slate-600 font-semibold">
                    <span>Change Due:</span>
                    <span className="text-emerald-700 font-bold">Rs. {changeDue.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Final Checkout Button */}
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || paymentMethod === 'Split' && !isSplitPaymentValid}
              className="w-full py-3 bg-[#4F46E5] hover:bg-[#4338CA] disabled:bg-slate-300 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 transition-all"
            >
              <span>Complete Sale & Print Receipt</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Recent POS Transactions</h3>
            <p className="text-xs text-slate-500">Completed receipts can be cancelled once; the original shift must still be open.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                  <th className="py-3 px-4">Receipt</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentTransactions.map((transaction) => (
                  <tr key={transaction._id}>
                    <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{transaction.receiptNumber}</td>
                    <td className="py-3 px-4">{transaction.customerName || 'Walk-in'}</td>
                    <td className="py-3 px-4 font-semibold">Rs. {Number(transaction.grandTotal || 0).toLocaleString()}</td>
                    <td className="py-3 px-4">{transaction.paymentMethod}</td>
                    <td className="py-3 px-4">{transaction.status}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setViewTransaction(transaction)}
                        className="mr-2 px-2.5 py-1 text-[11px] font-bold rounded bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        View
                      </button>
                      {session?.status === 'Open' && transaction.status === 'Completed' && (
                        <button
                          type="button"
                          onClick={() => {
                            setCancelTransaction(transaction);
                            setRefundMethod(
                              ['Cash', 'BankTransfer', 'CreditCard'].includes(transaction.paymentMethod)
                                ? transaction.paymentMethod
                                : 'Cash'
                            );
                            setIsCancelOpen(true);
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                        >
                          Cancel & Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <Modal
          isOpen={isCancelOpen}
          onClose={() => setIsCancelOpen(false)}
          title="Cancel POS Receipt & Refund"
          subtitle={`Receipt ${cancelTransaction?.receiptNumber || ''}`}
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleCancelTransaction)} className="space-y-4">
            <p className="text-xs text-slate-600">
              This cancels the complete receipt and restores its stock to {cancelTransaction?.outletBranch || 'the original outlet'}.
              Refund amount: <strong>Rs. {Number(cancelTransaction?.grandTotal || 0).toLocaleString()}</strong>.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Refund Method</label>
              <select
                required
                value={refundMethod}
                onChange={(event) => setRefundMethod(event.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              >
                {['Cash', 'BankTransfer', 'CreditCard'].map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Revenue Returns Account</label>
              <select
                required
                value={salesAccountCode}
                onChange={(event) => setSalesAccountCode(event.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              >
                <option value="">Select a revenue account</option>
                {financialAccounts.filter((account) => account.type === 'Revenue').map((account) => (
                  <option key={account.code} value={account.code}>{account.code} · {account.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Refund Payment Account</label>
              <select
                required
                value={refundAccountCode}
                onChange={(event) => setRefundAccountCode(event.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              >
                <option value="">Select an asset account</option>
                {financialAccounts.filter((account) => account.type === 'Asset').map((account) => (
                  <option key={account.code} value={account.code}>{account.code} · {account.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Reason</label>
              <textarea
                required
                rows={2}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setIsCancelOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600">Keep Sale</button>
              <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-lg">Confirm Refund</button>
            </div>
          </form>
        </Modal>

        {/* Modal: Open Shift */}
        <Modal
          isOpen={isOpenShiftOpen}
          onClose={() => setIsOpenShiftOpen(false)}
          title="Open POS Shift"
          subtitle="Enter the verified opening cash amount"
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleOpenShift)} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Opening Cash (Rs)</label>
              <input
                type="number"
                min="0"
                required
                value={openingCashInput}
                onChange={(e) => setOpeningCashInput(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setIsOpenShiftOpen(false)} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="submit" className="rounded-lg bg-[#4F46E5] px-4 py-2 text-xs font-bold text-white hover:bg-[#4338CA]">Open Register</button>
            </div>
          </form>
        </Modal>

        {/* Modal: Close Shift */}
        <Modal
          isOpen={isCloseShiftOpen}
          onClose={() => setIsCloseShiftOpen(false)}
          title="Reconcile & Close Cash Drawer"
          subtitle={`Session #${session?.sessionCode}`}
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleCloseShift)} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Physical Cash Counted in Drawer (PKR)
              </label>
              <input
                type="number"
                required
                value={actualCashInput}
                onChange={(e) => setActualCashInput(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                System expected drawer balance: Rs. {session?.expectedCash?.toLocaleString()}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCloseShiftOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-black rounded-lg shadow-sm"
              >
                Reconcile & Close Drawer
              </button>
            </div>
          </form>
        </Modal>

        {/* Thermal Printable Receipt Modal */}
        <ReceiptModal
          isOpen={isReceiptOpen}
          onClose={() => setIsReceiptOpen(false)}
          transaction={lastTransaction}
        />

        {/* View POS Transaction Modal */}
        <RecordViewModal
          isOpen={Boolean(viewTransaction)}
          onClose={() => setViewTransaction(null)}
          record={viewTransaction}
          title={`POS Receipt: ${viewTransaction?.receiptNumber || ''}`}
          subtitle={`Cashier: ${viewTransaction?.cashierName || ''} • Method: ${viewTransaction?.paymentMethod || ''}`}
          fields={[
            { name: 'receiptNumber', label: 'Receipt Number', type: 'text' },
            { name: 'sessionId', label: 'Session ID', type: 'text' },
            { name: 'checkoutRequestId', label: 'Checkout Request ID', type: 'text' },
            { name: 'outletBranch', label: 'Outlet Branch', type: 'text' },
            { name: 'cashierName', label: 'Cashier', type: 'text' },
            { name: 'customerName', label: 'Customer Name', type: 'text' },
            { name: 'customerPhone', label: 'Customer Phone', type: 'text' },
            { name: 'paymentMethod', label: 'Payment Method', type: 'text' },
            { name: 'status', label: 'Status', type: 'text' },
            { name: 'subtotal', label: 'Subtotal', type: 'money' },
            { name: 'discountTotal', label: 'Discount Total', type: 'money' },
            { name: 'grandTotal', label: 'Grand Total', type: 'money' },
            { name: 'cashTendered', label: 'Cash Tendered', type: 'money' },
            { name: 'changeGiven', label: 'Change Given', type: 'money' },
            { name: 'totalItemsCount', label: 'Total Items', type: 'text' },
            {
              name: 'items',
              label: 'Cart Items',
              type: 'array',
              itemFields: [
                { name: 'articleCode', label: 'Article Code' },
                { name: 'title', label: 'Title' },
                { name: 'barcode', label: 'Barcode' },
                { name: 'size', label: 'Size' },
                { name: 'color', label: 'Color' },
                { name: 'price', label: 'Price', type: 'money' },
                { name: 'quantity', label: 'Quantity', type: 'text' },
                { name: 'discountPercent', label: 'Discount %', type: 'text' },
                { name: 'discountAmount', label: 'Discount Amount', type: 'money' },
                { name: 'subtotal', label: 'Subtotal', type: 'money' },
              ],
            },
            { name: 'splitDetails', label: 'Split Payment Details', type: 'object' },
          ]}
        />
      </div>
    </Layout>
  );
}
