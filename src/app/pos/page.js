'use client';

import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import ReceiptModal from '@/components/ReceiptModal';
import { useAuth } from '@/context/AuthContext';
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
} from 'lucide-react';

export default function RetailPOSPage() {
  const { addToast, currentBranch, user } = useAuth();
  const [session, setSession] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cart State
  const [cart, setCart] = useState([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchCatalog, setSearchCatalog] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [cashTendered, setCashTendered] = useState('');

  // Modals
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [lastTransaction, setLastTransaction] = useState(null);
  const [isOpenShiftOpen, setIsOpenShiftOpen] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState('');
  const [isCloseShiftOpen, setIsCloseShiftOpen] = useState(false);
  const [actualCashInput, setActualCashInput] = useState('');

  const fetchData = async () => {
    try {
      const res = await fetch('/api/pos');
      const json = await res.json();
      if (json.success) {
        setSession(json.data.activeSession);
        setCatalog(json.data.catalogArticles || []);
        setRecentTransactions(json.data.recentTransactions || []);
      }
    } catch (err) {
      console.error('Error loading POS:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, []);

  const handleOpenShift = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/pos', {
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
    if (!Number.isFinite(Number(article.price)) || Number(article.price) <= 0) {
      addToast('Set a valid retail price for this design before adding it to the cart', 'warning');
      return;
    }
    const existingIndex = cart.findIndex((item) => item.code === article.code);
    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].quantity += 1;
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          code: article.code,
          title: article.title,
          barcode: article.barcode || '',
          price: Number(article.price),
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

  // Complete Checkout
  const handleCheckout = async () => {
    if (cart.length === 0) {
      addToast('Cart is empty', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'COMPLETE_CHECKOUT',
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
      setCart([]);
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
      const res = await fetch('/api/pos', {
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
            <form onSubmit={handleBarcodeSubmit} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
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
                    className="p-3 text-left rounded-xl border border-slate-200 hover:border-[#4F46E5] hover:bg-indigo-50/30 transition-all group flex flex-col justify-between"
                  >
                    <div>
                      <span className="text-[10px] font-mono font-bold text-[#4F46E5]">{item.code}</span>
                      <h4 className="text-xs font-bold text-slate-900 group-hover:text-[#4F46E5] line-clamp-1 mt-0.5">
                        {item.title}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5">{item.category}</p>
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
                  onClick={() => setCart([])}
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
                            setCart(updated);
                          } else {
                            setCart(cart.filter((_, i) => i !== idx));
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
                          updated[idx].quantity += 1;
                          setCart(updated);
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
              <div className="grid grid-cols-3 gap-2">
                {['Cash', 'CreditCard', 'BankTransfer'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
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
              disabled={cart.length === 0}
              className="w-full py-3 bg-[#4F46E5] hover:bg-[#4338CA] disabled:bg-slate-300 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md shadow-indigo-500/20 transition-all"
            >
              <span>Complete Sale & Print Receipt</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal: Open Shift */}
        <Modal
          isOpen={isOpenShiftOpen}
          onClose={() => setIsOpenShiftOpen(false)}
          title="Open POS Shift"
          subtitle="Enter the verified opening cash amount"
        >
          <form onSubmit={handleOpenShift} className="space-y-4">
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
          <form onSubmit={handleCloseShift} className="space-y-4">
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
      </div>
    </Layout>
  );
}
