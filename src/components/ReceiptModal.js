'use client';

import React from 'react';
import Modal from './Modal';
import { Printer, CheckCircle } from 'lucide-react';

export default function ReceiptModal({ isOpen, onClose, transaction }) {
  if (!transaction) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="POS Sales Receipt" subtitle={`Receipt #${transaction.receiptNumber}`} maxWidth="max-w-md">
      <div className="flex flex-col items-center">
        {/* Printable Receipt Paper */}
        <div id="printable-pos-receipt" className="w-full bg-white p-5 border border-dashed border-slate-300 rounded-lg text-slate-800 font-mono text-xs">
          <div className="text-center mb-3">
            <h2 className="text-sm font-bold text-slate-900 tracking-wider">ERPDOST</h2>
            <p className="text-[11px] text-slate-600">STITCHING & PRODUCTION UNIT</p>
            <div className="border-b border-dashed border-slate-300 my-2"></div>
            <div className="flex justify-between text-[11px]">
              <span>Receipt: {transaction.receiptNumber}</span>
              <span>
                {transaction.createdAt
                  ? new Date(transaction.createdAt).toLocaleDateString()
                  : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Cashier: {transaction.cashierName}</span>
              <span>Cust: {transaction.customerName}</span>
            </div>
            <div className="border-b border-dashed border-slate-300 my-2"></div>
          </div>

          {/* Items Table */}
          <div className="space-y-2 mb-3">
            {(transaction.items || []).map((item, idx) => (
              <div key={idx} className="flex justify-between items-start">
                <div className="pr-2">
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-[10px] text-slate-500">
                    {item.size} / {item.color} | {item.quantity} x Rs. {item.price.toLocaleString()}
                  </p>
                </div>
                <div className="font-semibold text-right">
                  Rs. {item.subtotal.toLocaleString()}
                </div>
              </div>
            ))}
          </div>

          <div className="border-b border-dashed border-slate-300 my-2"></div>

          {/* Totals */}
          <div className="space-y-1 text-right">
            <div className="flex justify-between">
              <span>Items Total:</span>
              <span>Rs. {(transaction.subtotal || transaction.grandTotal).toLocaleString()}</span>
            </div>
            {(transaction.discountTotal || 0) > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount:</span>
                <span>- Rs. {transaction.discountTotal.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm text-slate-900 border-t border-slate-300 pt-1">
              <span>GRAND TOTAL:</span>
              <span>Rs. {transaction.grandTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[11px] text-slate-600 pt-1">
              <span>Payment Mode:</span>
              <span className="font-semibold">{transaction.paymentMethod}</span>
            </div>
            {transaction.paymentMethod === 'Cash' && (
              <>
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>Cash Tendered:</span>
                  <span>Rs. {(transaction.cashTendered || transaction.grandTotal).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>Change Due:</span>
                  <span>Rs. {(transaction.changeGiven || 0).toLocaleString()}</span>
                </div>
              </>
            )}
          </div>

          <div className="border-b border-dashed border-slate-300 my-3"></div>

          {/* Barcode visual simulation */}
          <div className="text-center">
            <div className="inline-block bg-slate-900 text-white font-mono tracking-widest px-3 py-1 text-[10px] rounded">
              ||||| | |||| |||| || | |||||
            </div>
            <p className="text-[10px] text-slate-500 mt-1">{transaction.receiptNumber}</p>
            <p className="text-[10px] text-slate-500 italic mt-2">Thank you for your purchase.</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 w-full mt-5">
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#4F46E5] text-white font-semibold text-sm hover:bg-[#4338CA] transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" />
            Print Receipt
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
