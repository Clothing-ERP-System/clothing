'use client';

import React, { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const subscribeEmpty = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-2xl',
}) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const isMounted = useSyncExternalStore(subscribeEmpty, getClientSnapshot, getServerSnapshot);
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

    const focusableElements = () =>
      [...(dialog?.querySelectorAll(focusableSelector) || [])].filter(
        (element) => element.getAttribute('aria-hidden') !== 'true'
      );

    const requestClose = () => {
      if (
        dialog?.dataset.dirty === 'true' &&
        !window.confirm('Discard unsaved changes and close this dialog?')
      ) {
        return;
      }
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
      if (
        event.shiftKey &&
        (document.activeElement === first || !dialog?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialog?.contains(document.activeElement))
      ) {
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
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen || !isMounted) return null;

  // Normalize width to ensure clean, aesthetic dimensions that never stretch awkwardly
  let widthClass = maxWidth;
  if (!widthClass || widthClass === 'max-w-4xl' || widthClass === 'max-w-5xl') {
    widthClass = 'max-w-3xl';
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto overscroll-contain bg-slate-950/70 backdrop-blur-xs flex justify-center items-start sm:items-center p-3 sm:p-5 md:p-6 animate-fade-in"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          if (
            dialogRef.current?.dataset.dirty === 'true' &&
            !window.confirm('Discard unsaved changes and close this dialog?')
          ) {
            return;
          }
          onCloseRef.current();
        }
      }}
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
        className={`relative w-full ${widthClass} my-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[calc(100dvh-2.5rem)] sm:max-h-[calc(100dvh-3.5rem)] overflow-hidden transition-all duration-200`}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Modal Header - Fixed at top of modal */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-800/60 shrink-0 select-none">
          <div className="pr-4">
            <h3 id={titleId} className="text-base sm:text-lg font-bold text-[#0F172A] dark:text-slate-100 tracking-tight">
              {title}
            </h3>
            {subtitle && (
              <p id={subtitleId} className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5 font-medium">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={() => {
              if (
                dialogRef.current?.dataset.dirty === 'true' &&
                !window.confirm('Discard unsaved changes and close this dialog?')
              ) {
                return;
              }
              onCloseRef.current();
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body - Smooth full-form scroll when contents are long */}
        <div className="p-4 sm:p-6 md:p-7 overflow-y-auto overflow-x-hidden flex-1 overscroll-contain touch-pan-y text-slate-800 dark:text-slate-100">
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
