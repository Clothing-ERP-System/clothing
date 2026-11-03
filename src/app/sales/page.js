'use client';

import React, { useState, useEffect, useRef } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import RecordEditModal from '@/components/RecordEditModal';
import RecordDeleteButton from '@/components/RecordDeleteButton';
import { useAuth } from '@/context/AuthContext';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';
import {
  Users2,
  Plus,
  DollarSign,
  FileText,
  CreditCard,
  CheckCircle2,
  Clock,
  Sparkles,
  Percent,
  Search,
} from 'lucide-react';

export default function SalesCustomersPage() {
  const { addToast, currentBranch, user } = useAuth();
  const [data, setData] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'customers'

  // Modals
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [collectionMethod, setCollectionMethod] = useState('Cash');
  const [collectionAccountCode, setCollectionAccountCode] = useState('');
  const [collectionReference, setCollectionReference] = useState('');
  const paymentRequestId = useRef(null);
  const salesOrderRequestId = useRef(null);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [returnOrder, setReturnOrder] = useState(null);
  const [returnLines, setReturnLines] = useState([]);
  const [financialAccounts, setFinancialAccounts] = useState([]);
  const [salesReturnsAccountCode, setSalesReturnsAccountCode] = useState('');
  const [receivableAccountCode, setReceivableAccountCode] = useState('');
  const [refundAccountCode, setRefundAccountCode] = useState('');
  const [revenueAccountCode, setRevenueAccountCode] = useState('');
  const [advancePaymentAccountCode, setAdvancePaymentAccountCode] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const returnRequestId = useRef(null);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    businessName: '',
    phone: '',
    email: '',
    city: '',
    tier: '',
    defaultTierDiscountPercent: '',
    creditLimitPKR: '',
  });

  // New Sales Order Form
  const [newOrder, setNewOrder] = useState({
    customerId: '',
    customerName: '',
    customerTier: '',
    salesRep: '',
    shippingFee: '',
    amountPaid: '',
    paymentMethod: 'Cash',
    items: [{ articleCode: '', title: '', size: '', unitRetailPrice: '', quantity: '', discountPercentApplied: 0 }],
  });

  const fetchData = async () => {
    try {
      const [salesResponse, designResponse] = await Promise.all([
        fetch('/api/sales'),
        fetch('/api/design'),
      ]);
      const [salesResult, designResult] = await Promise.all([
        salesResponse.json(),
        designResponse.json(),
      ]);
      if (salesResult.success) {
        setData(salesResult.data);
        const accounts = salesResult.data.financialAccounts || [];
        setFinancialAccounts(accounts);
        setRevenueAccountCode((current) => current || accounts.find((account) => account.type === 'Revenue')?.code || '');
        setAdvancePaymentAccountCode((current) => current || accounts.find((account) => account.type === 'Asset')?.code || '');
        setSalesReturnsAccountCode((current) => current || accounts.find((account) => account.type === 'Revenue')?.code || '');
        setReceivableAccountCode((current) => current || accounts.find((account) => account.type === 'Asset')?.code || '');
        setRefundAccountCode((current) => current || accounts.find((account) => account.type === 'Asset')?.code || '');
      }
      if (designResult.success) setDesigns(designResult.data.designs || []);
    } catch (err) {
      console.error('Error fetching sales data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, []);

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    try {
      if (!salesOrderRequestId.current) {
        salesOrderRequestId.current = globalThis.crypto.randomUUID();
      }
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_SALES_ORDER',
          creationRequestId: salesOrderRequestId.current,
          warehouseLocation: currentBranch,
          revenueAccountCode,
          receivableAccountCode,
          paymentAccountCode: advancePaymentAccountCode,
          ...newOrder,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create sales order', 'error');
        return;
      }
      addToast(`Sales Order ${json.data.salesOrder?.orderNumber} created!`, 'success');
      setIsNewOrderOpen(false);
      salesOrderRequestId.current = null;
      await fetchData();
    } catch {
      addToast('Error saving sales order', 'error');
    }
  };

  const openReturnModal = (order) => {
    const sold = new Map();
    const returned = new Map();
    for (const item of order.items || []) {
      sold.set(item.articleCode, (sold.get(item.articleCode) || 0) + Number(item.quantity));
    }
    for (const record of order.returns || []) {
      for (const item of record.items || []) {
        returned.set(item.articleCode, (returned.get(item.articleCode) || 0) + Number(item.quantity));
      }
    }
    setReturnLines([...sold.entries()].map(([articleCode, quantity]) => ({
      articleCode,
      soldQuantity: quantity,
      quantity: '',
      availableQuantity: quantity - (returned.get(articleCode) || 0),
    })));
    setReturnOrder(order);
    setReturnReason('');
    returnRequestId.current = globalThis.crypto.randomUUID();
    setIsReturnOpen(true);
  };

  const handleProcessReturn = async (event) => {
    event.preventDefault();
    if (!returnOrder) return;
    try {
      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'PROCESS_SALES_RETURN',
          orderId: returnOrder._id,
          returnRequestId: returnRequestId.current,
          items: returnLines.filter((line) => Number(line.quantity) > 0),
          salesReturnsAccountCode,
          receivableAccountCode,
          refundAccountCode,
          refundMethod: 'Cash',
          receivedBy: user?.name || '',
          reason: returnReason,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Return processing failed', 'error');
        return;
      }
      addToast(`Sales return processed for ${result.data.salesOrder.orderNumber}`, 'success');
      setIsReturnOpen(false);
      setReturnOrder(null);
      returnRequestId.current = null;
      await fetchData();
    } catch {
      addToast('Error processing sales return', 'error');
    }
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_CUSTOMER', ...newCustomer }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Failed to create customer', 'error');
        return;
      }
      addToast('Customer created successfully', 'success');
      setIsNewCustomerOpen(false);
      setNewCustomer({
        name: '',
        businessName: '',
        phone: '',
        email: '',
        city: '',
        tier: '',
        defaultTierDiscountPercent: '',
        creditLimitPKR: '',
      });
      await fetchData();
    } catch {
      addToast('Error saving customer', 'error');
    }
  };

  const handleUpdateCustomer = async (customerId, updates) => {
    try {
      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_CUSTOMER', customerId, ...updates }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Customer update failed', 'error');
        return false;
      }
      addToast('Customer updated successfully', 'success');
      setEditingCustomer(null);
      await fetchData();
      return true;
    } catch {
      addToast('Error updating customer', 'error');
      return false;
    }
  };

  const handleUpdateOrder = async (orderId, updates) => {
    try {
      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPDATE_SALES_ORDER', orderId, ...updates }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || 'Sales order update failed', 'error');
        return false;
      }
      addToast('Sales order details updated', 'success');
      setEditingOrder(null);
      await fetchData();
      return true;
    } catch {
      addToast('Error updating sales order', 'error');
      return false;
    }
  };

  const openPaymentModal = (order) => {
    setSelectedOrder(order);
    setPaymentAmount(Math.max(0, (order.grandTotal || 0) - (order.amountPaid || 0)));
    setCollectionMethod('Cash');
    setCollectionAccountCode(financialAccounts.find((account) => account.type === 'Asset')?.code || '');
    setCollectionReference('');
    paymentRequestId.current = globalThis.crypto.randomUUID();
    setIsPaymentOpen(true);
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;

    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'RECORD_PAYMENT',
          orderId: selectedOrder._id,
          amount: Number(paymentAmount),
          paymentRequestId: paymentRequestId.current,
          method: collectionMethod,
          paymentAccountCode: collectionAccountCode,
          receivableAccountCode,
          referenceNumber: collectionReference,
          receivedBy: user?.name || '',
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Payment recording failed', 'error');
        return;
      }
      addToast(`Payment of Rs. ${paymentAmount.toLocaleString()} recorded!`, 'success');
      setIsPaymentOpen(false);
      paymentRequestId.current = null;
      await fetchData();
    } catch {
      addToast('Error saving payment', 'error');
    }
  };

  const customers = data?.customers || [];
  const salesOrders = data?.salesOrders || [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-[#4F46E5] border border-indigo-100">
                COMMERCIAL & ACCOUNTS RECEIVABLE
              </span>
              <span className="text-xs text-slate-500">• Customer accounts and order management</span>
            </div>
            <h1 className="text-xl font-black text-[#0F172A] mt-1.5">
              Sales Orders, Customer Tiers & Pricing
            </h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Manage customer pricing terms, orders and receivables
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setIsNewCustomerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Customer</span>
            </button>
            <button
              onClick={() => {
                setNewOrder({
                  customerId: '',
                  customerName: '',
                  customerTier: '',
                  salesRep: user?.name || '',
                  shippingFee: '',
                  amountPaid: 0,
                  paymentMethod: 'Cash',
                  items: [{ articleCode: '', title: '', size: '', unitRetailPrice: '', quantity: '', discountPercentApplied: 0 }],
                });
                salesOrderRequestId.current = globalThis.crypto.randomUUID();
                setIsNewOrderOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Sales Order</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'orders'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Sales Orders ({salesOrders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('customers')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'customers'
                ? 'border-[#4F46E5] text-[#4F46E5]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users2 className="w-4 h-4" />
            <span>Client Directory & Tiers ({customers.length})</span>
          </button>
        </div>

        {/* Tab 1: Sales Orders */}
        {activeTab === 'orders' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Wholesale Orders & Invoicing</h3>
                <p className="text-xs text-slate-500">Track invoices, applied tier discounts, and collection status</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">Customer & Tier</th>
                    <th className="py-3 px-4">Order Date</th>
                    <th className="py-3 px-4">Subtotal</th>
                    <th className="py-3 px-4">Discount</th>
                    <th className="py-3 px-4">Grand Total</th>
                    <th className="py-3 px-4">Payment</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesOrders.map((order) => {
                    let payBadge = 'bg-amber-100 text-amber-800';
                    if (order.paymentStatus === 'PaidInFull') payBadge = 'bg-emerald-100 text-emerald-800';
                    if (order.paymentStatus === 'Unpaid') payBadge = 'bg-red-100 text-red-800';

                    return (
                      <tr key={order._id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold text-[#4F46E5]">{order.orderNumber}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{order.customerName}</div>
                          <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700">
                            {order.customerTier}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {new Date(order.orderDate).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-slate-700">Rs. {order.subtotal?.toLocaleString()}</td>
                        <td className="py-3 px-4 text-emerald-600 font-semibold">
                          - Rs. {order.totalDiscount?.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          Rs. {order.grandTotal?.toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${payBadge}`}>
                            {order.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setEditingOrder(order)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 mr-2 text-[11px] font-bold rounded bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors"
                          >
                            Edit Details
                          </button>
                          {order.paymentStatus !== 'PaidInFull' && (
                            <button
                              onClick={() => openPaymentModal(order)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>Receive Payment</span>
                            </button>
                          )}
                          {order.status === 'Delivered' && (
                            <button
                              onClick={() => openReturnModal(order)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 ml-2 text-[11px] font-bold rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                            >
                              <span>Return Items</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Customers Directory & Tiers */}
        {activeTab === 'customers' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customers.map((c) => (
              <div key={c._id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-[#4F46E5]">{c.customerCode}</span>
                    <h3 className="text-sm font-bold text-slate-900 leading-snug">{c.name}</h3>
                    <p className="text-[11px] text-slate-500">{c.businessName}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                    {c.tier} ({c.defaultTierDiscountPercent}% Disc)
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Phone:</span>
                    <span className="font-mono text-slate-800">{c.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">City:</span>
                    <span className="text-slate-800">{c.city}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Credit Limit:</span>
                    <span className="font-semibold text-slate-800">Rs. {c.creditLimitPKR?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Current Receivable:</span>
                    <span className="font-bold text-[#DC2626]">Rs. {c.currentReceivableBalance?.toLocaleString()}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingCustomer(c)}
                    className="w-full rounded-lg border border-indigo-200 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                  >
                    Edit Customer
                  </button>
                  {!salesOrders.some((order) => String(order.customerId || '') === String(c._id)) && (
                    <RecordDeleteButton
                      endpoint="/api/sales"
                      action="DELETE_CUSTOMER"
                      idField="customerId"
                      recordId={c._id}
                      recordLabel={`customer ${c.customerCode}`}
                      onDeleted={fetchData}
                      className="w-full rounded-lg border border-red-200 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal: Create Sales Order */}
        <Modal
          isOpen={isNewCustomerOpen}
          onClose={() => setIsNewCustomerOpen(false)}
          title="Add Customer"
          subtitle="Enter customer details and commercial terms"
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleCreateCustomer)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={newCustomer.name}
                onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                placeholder="Customer name"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={newCustomer.businessName}
                onChange={(e) => setNewCustomer({ ...newCustomer, businessName: e.target.value })}
                placeholder="Business name"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="tel"
                required
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                placeholder="Phone"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="email"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                placeholder="Email"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={newCustomer.city}
                onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })}
                placeholder="City"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={newCustomer.tier}
                onChange={(e) => setNewCustomer({ ...newCustomer, tier: e.target.value })}
                placeholder="Customer tier"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="number"
                min="0"
                max="100"
                value={newCustomer.defaultTierDiscountPercent}
                onChange={(e) => setNewCustomer({ ...newCustomer, defaultTierDiscountPercent: e.target.value })}
                placeholder="Discount (%)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="number"
                min="0"
                value={newCustomer.creditLimitPKR}
                onChange={(e) => setNewCustomer({ ...newCustomer, creditLimitPKR: e.target.value })}
                placeholder="Credit limit"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setIsNewCustomerOpen(false)} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="submit" className="rounded-lg bg-[#4F46E5] px-4 py-2 text-xs font-bold text-white hover:bg-[#4338CA]">Save Customer</button>
            </div>
          </form>
        </Modal>

        {/* Modal: Create Sales Order */}
        <Modal
          isOpen={isNewOrderOpen}
          onClose={() => {
            setIsNewOrderOpen(false);
            salesOrderRequestId.current = null;
          }}
          title="Create Wholesale Sales Order"
          subtitle="Tier discount is automatically applied to bill totals"
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleCreateOrder)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Customer</label>
                <select
                  required
                  value={newOrder.customerId}
                  onChange={(e) => {
                    const sel = customers.find((c) => c._id === e.target.value);
                    const tier = sel?.tier || '';
                    const disc = Number(sel?.defaultTierDiscountPercent) || 0;
                    setNewOrder({
                      ...newOrder,
                      customerId: e.target.value,
                      customerName: sel?.name || '',
                      customerTier: tier,
                      items: [{ ...newOrder.items[0], discountPercentApplied: disc }],
                    });
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="">Select a customer</option>
                  {customers.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} ({c.tier})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tier Discount</label>
                <input
                  type="text"
                  readOnly
                  value={`${newOrder.items[0]?.discountPercentApplied || 0}% (${newOrder.customerTier})`}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Article</label>
                <select
                  required
                  value={newOrder.items[0]?.articleCode || ''}
                  onChange={(e) => {
                    const design = designs.find((item) => item.designCode === e.target.value);
                    setNewOrder({
                      ...newOrder,
                      items: [{
                        ...newOrder.items[0],
                        articleCode: design?.designCode || '',
                        title: design?.title || '',
                        unitRetailPrice: design?.suggestedRetailPrice || '',
                      }],
                    });
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                >
                  <option value="">Select an article</option>
                  {designs.filter((design) => design.sampleStatus === 'ProductionReady').map((design) => (
                    <option key={design._id} value={design.designCode}>{design.title} ({design.designCode})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Order Quantity (Pcs)</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={newOrder.items[0]?.quantity || ''}
                  onChange={(e) =>
                    setNewOrder({
                      ...newOrder,
                      items: [{ ...newOrder.items[0], quantity: e.target.value }],
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Unit Retail Price (Rs)</label>
                <input
                  type="number"
                  readOnly
                  value={newOrder.items[0]?.unitRetailPrice || ''}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Advance Received (Rs)</label>
                <input
                  type="number"
                  required
                  value={newOrder.amountPaid}
                  onChange={(e) => setNewOrder({ ...newOrder, amountPaid: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-slate-700">
                Sales revenue account
                <select required value={revenueAccountCode} onChange={(event) => setRevenueAccountCode(event.target.value)} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg">
                  <option value="">Select revenue account</option>
                  {financialAccounts.filter((account) => account.type === 'Revenue').map((account) => (
                    <option key={account.code} value={account.code}>{account.code} · {account.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                Customer receivables account
                <select required value={receivableAccountCode} onChange={(event) => setReceivableAccountCode(event.target.value)} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg">
                  <option value="">Select asset account</option>
                  {financialAccounts.filter((account) => account.type === 'Asset').map((account) => (
                    <option key={account.code} value={account.code}>{account.code} · {account.name}</option>
                  ))}
                </select>
              </label>
              {Number(newOrder.amountPaid) > 0 && (
                <>
                  <label className="text-xs font-bold text-slate-700">
                    Advance payment method
                    <select required value={newOrder.paymentMethod} onChange={(event) => setNewOrder({ ...newOrder, paymentMethod: event.target.value })} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg">
                      <option value="Cash">Cash</option>
                      <option value="BankTransfer">Bank transfer</option>
                      <option value="CreditCard">Credit card</option>
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-700">
                    Advance payment account
                    <select required value={advancePaymentAccountCode} onChange={(event) => setAdvancePaymentAccountCode(event.target.value)} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg">
                      <option value="">Select asset account</option>
                      {financialAccounts.filter((account) => account.type === 'Asset').map((account) => (
                        <option key={account.code} value={account.code}>{account.code} · {account.name}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsNewOrderOpen(false);
                  salesOrderRequestId.current = null;
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm"
              >
                Confirm Sales Order
              </button>
            </div>
          </form>
        </Modal>

        {/* Modal: Record Payment */}
        <Modal
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          title="Record Customer Payment"
          subtitle={`Order ${selectedOrder?.orderNumber} (${selectedOrder?.customerName})`}
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleRecordPayment)} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Payment Amount (PKR)</label>
              <input
                type="number"
                required
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-slate-700">
                Payment method
                <select required value={collectionMethod} onChange={(event) => setCollectionMethod(event.target.value)} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg">
                  <option value="Cash">Cash</option>
                  <option value="BankTransfer">Bank transfer</option>
                  <option value="CreditCard">Credit card</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                Cash or bank account
                <select required value={collectionAccountCode} onChange={(event) => setCollectionAccountCode(event.target.value)} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg">
                  <option value="">Select asset account</option>
                  {financialAccounts.filter((account) => account.type === 'Asset').map((account) => (
                    <option key={account.code} value={account.code}>{account.code} · {account.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Reference number
              <input type="text" value={collectionReference} onChange={(event) => setCollectionReference(event.target.value)} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
            </label>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsPaymentOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
              >
                Post Collection Entry
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={isReturnOpen}
          onClose={() => setIsReturnOpen(false)}
          title="Process Sales Return"
          subtitle={`Order ${returnOrder?.orderNumber || ''}`}
        >
          <form onSubmit={(event) => preventDuplicateSubmit(event, handleProcessReturn)} className="space-y-4">
            <div className="space-y-2">
              {returnLines.map((line) => (
                <div key={line.articleCode} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-xs">
                  <span className="font-mono font-semibold text-slate-800">{line.articleCode}</span>
                  <span className="text-slate-500">Available: {line.availableQuantity}</span>
                  <input
                    type="number"
                    min="0"
                    max={line.availableQuantity}
                    step="1"
                    value={line.quantity}
                    onChange={(event) => setReturnLines((current) => current.map((item) =>
                      item.articleCode === line.articleCode ? { ...item, quantity: event.target.value } : item
                    ))}
                    className="w-24 px-2 py-1.5 border border-slate-200 rounded"
                    aria-label={`Return quantity for ${line.articleCode}`}
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-bold text-slate-700">
                Sales returns account
                <select required value={salesReturnsAccountCode} onChange={(event) => setSalesReturnsAccountCode(event.target.value)} className="mt-1 w-full px-2 py-2 font-normal border border-slate-200 rounded-lg">
                  <option value="">Select revenue account</option>
                  {financialAccounts.filter((account) => account.type === 'Revenue').map((account) => (
                    <option key={account.code} value={account.code}>{account.code} · {account.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-700">
                Receivables account
                <select required value={receivableAccountCode} onChange={(event) => setReceivableAccountCode(event.target.value)} className="mt-1 w-full px-2 py-2 font-normal border border-slate-200 rounded-lg">
                  <option value="">Select asset account</option>
                  {financialAccounts.filter((account) => account.type === 'Asset').map((account) => (
                    <option key={account.code} value={account.code}>{account.code} · {account.name}</option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 text-xs font-bold text-slate-700">
                Refund account (when paid)
                <select value={refundAccountCode} onChange={(event) => setRefundAccountCode(event.target.value)} className="mt-1 w-full px-2 py-2 font-normal border border-slate-200 rounded-lg">
                  <option value="">Select asset account</option>
                  {financialAccounts.filter((account) => account.type === 'Asset').map((account) => (
                    <option key={account.code} value={account.code}>{account.code} · {account.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs font-bold text-slate-700">
              Return reason
              <textarea required rows={2} value={returnReason} onChange={(event) => setReturnReason(event.target.value)} className="mt-1 w-full px-3 py-2 font-normal border border-slate-200 rounded-lg" />
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setIsReturnOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-2 text-xs font-bold text-white bg-amber-600 rounded-lg">Confirm Return & Refund</button>
            </div>
          </form>
        </Modal>
        <RecordEditModal
          isOpen={Boolean(editingCustomer)}
          onClose={() => setEditingCustomer(null)}
          record={editingCustomer}
          title={`Edit Customer: ${editingCustomer?.customerCode || ''}`}
          fields={CUSTOMER_EDIT_FIELDS}
          onSave={handleUpdateCustomer}
        />
        <RecordEditModal
          isOpen={Boolean(editingOrder)}
          onClose={() => setEditingOrder(null)}
          record={editingOrder}
          title={`Edit Sales Order: ${editingOrder?.orderNumber || ''}`}
          fields={SALES_ORDER_EDIT_FIELDS}
          onSave={handleUpdateOrder}
        />
      </div>
    </Layout>
  );
}

const CUSTOMER_EDIT_FIELDS = [
  { name: 'name', label: 'Customer Name', required: true },
  { name: 'businessName', label: 'Business Name' },
  { name: 'phone', label: 'Phone', required: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'city', label: 'City' },
  { name: 'tier', label: 'Customer Tier' },
  { name: 'defaultTierDiscountPercent', label: 'Default Discount (%)', type: 'number', min: 0, max: 100, step: 'any' },
  { name: 'creditLimitPKR', label: 'Credit Limit (PKR)', type: 'number', min: 0, step: 'any' },
];

const SALES_ORDER_EDIT_FIELDS = [
  { name: 'salesRep', label: 'Sales Representative' },
  { name: 'deliveryDueDate', label: 'Delivery Due Date', type: 'date' },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];
