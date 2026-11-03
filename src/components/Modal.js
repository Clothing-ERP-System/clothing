'use client';

import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, subtitle, children, maxWidth = 'max-w-2xl' }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const subtitleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    document.body.style.overflow = 'hidden';

    const focusableElements = () => [...(dialog?.querySelectorAll(focusableSelector) || [])]
      .filter((element) => element.getAttribute('aria-hidden') !== 'true');

    const requestClose = () => {
      if (dialog?.dataset.dirty === 'true' &&
        !window.confirm('Discard unsaved changes and close this dialog?')) return;
      onCloseRef.current();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const elements = focusableElements();
      if (!elements.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog?.removeAttribute('data-dirty');
    window.addEventListener('keydown', handleKeyDown);
    const initialFocus = focusableElements()[0] || dialog;
    initialFocus?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          if (dialogRef.current?.dataset.dirty === 'true' &&
            !window.confirm('Discard unsaved changes and close this dialog?')) return;
          onCloseRef.current();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto overscroll-contain"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        onInputCapture={(event) => {
          if (event.target.matches('input, select, textarea')) {
            event.currentTarget.dataset.dirty = 'true';
          }
        }}
        onChangeCapture={(event) => {
          if (event.target.matches('input, select, textarea')) {
            event.currentTarget.dataset.dirty = 'true';
          }
        }}
        className={`bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full ${maxWidth} max-h-[calc(100dvh-2.5rem)] sm:max-h-[calc(100dvh-3.5rem)] my-auto flex flex-col overflow-hidden transform transition-all`}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-800/50 shrink-0 select-none">
          <div>
            <h3 id={titleId} className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-slate-100">{title}</h3>
            {subtitle && <p id={subtitleId} className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={() => {
              if (dialogRef.current?.dataset.dirty === 'true' &&
                !window.confirm('Discard unsaved changes and close this dialog?')) return;
              onCloseRef.current();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto overflow-x-hidden flex-1 overscroll-contain touch-pan-y text-slate-800 dark:text-slate-100">{children}</div>
      </div>
    </div>
  );
}
