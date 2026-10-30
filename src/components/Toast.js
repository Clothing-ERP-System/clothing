'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export default function ToastContainer() {
  const { toasts, removeToast } = useAuth();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 sm:right-6 z-[70] flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] sm:w-full pointer-events-none">
      {toasts.map((toast) => {
        let bg = 'bg-white border-l-4 border-[#059669] text-[#1E293B] shadow-xl';
        let Icon = CheckCircle2;
        let iconColor = 'text-[#059669]';

        if (toast.type === 'error') {
          bg = 'bg-white border-l-4 border-[#DC2626] text-[#1E293B] shadow-xl';
          Icon = AlertCircle;
          iconColor = 'text-[#DC2626]';
        } else if (toast.type === 'warning') {
          bg = 'bg-white border-l-4 border-[#D97706] text-[#1E293B] shadow-xl';
          Icon = AlertTriangle;
          iconColor = 'text-[#D97706]';
        } else if (toast.type === 'info') {
          bg = 'bg-white border-l-4 border-[#0284C7] text-[#1E293B] shadow-xl';
          Icon = Info;
          iconColor = 'text-[#0284C7]';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-r-lg border border-slate-200 ${bg} transition-all duration-300 animate-slide-in`}
          >
            <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}`} />
            <div className="flex-1 text-sm font-medium">{toast.message}</div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
