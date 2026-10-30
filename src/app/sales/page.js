'use client';

import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
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
  const { addToast } = useAuth();
  const [data, setData] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'customers'

  // Modals
  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
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
      if (salesResult.success) setData(salesResult.data);
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
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CREATE_SALES_ORDER', ...newOrder }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Failed to create sales order', 'error');
        return;
      }
      addToast(`Sales Order ${json.data.salesOrder?.orderNumber} created!`, 'success');
      setIsNewOrderOpen(false);
      fetchData();
    } catch {
      addToast('Error saving sales order', 'error');
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

  const openPaymentModal = (order) => {
    setSelectedOrder(order);
    setPaymentAmount(Math.max(0, (order.grandTotal || 0) - (order.amountPaid || 0)));
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
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        addToast(json.message || 'Payment recording failed', 'error');
        return;
      }
      addToast(`Payment of Rs. ${paymentAmount.toLocaleString()} recorded!`, 'success');
      setIsPaymentOpen(false);
      fetchData();
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
              onClick={() => setIsNewOrderOpen(true)}
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
                          {order.paymentStatus !== 'PaidInFull' && (
                            <button
                              onClick={() => openPaymentModal(order)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>Receive Cash</span>
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
          <form onSubmit={handleCreateCustomer} className="space-y-4">
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
          onClose={() => setIsNewOrderOpen(false)}
          title="Create Wholesale Sales Order"
          subtitle="Tier discount is automatically applied to bill totals"
        >
          <form onSubmit={handleCreateOrder} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Customer</label>
                <select
                  value={newOrder.customerName}
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

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewOrderOpen(false)}
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
          <form onSubmit={handleRecordPayment} className="space-y-4">
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
      </div>
    </Layout>
  );
}
