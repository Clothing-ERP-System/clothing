'use client';

import React, { useState } from 'react';
import Modal from '@/components/Modal';

const labelClass = 'text-[10px] font-bold text-slate-400 uppercase tracking-wider';
const valueClass = 'font-semibold text-slate-900';
const arrayItemClass = 'text-xs text-slate-700';

/**
 * RecordViewModal - Strictly read-only record details viewer.
 *
 * Displays a saved record's fields without any form inputs or save actions.
 * Use for View buttons on table rows. Pass the record object and a fields
 * configuration array describing which fields to show and how to format them.
 *
 * Fields config entries:
 *   { name, label, type?: 'text'|'money'|'date'|'boolean'|'array'|'object',
 *     itemFields?: [{ name, label, type? }], format?: (value) => string }
 */
export default function RecordViewModal({
  isOpen,
  onClose,
  record,
  title,
  subtitle,
  fields = [],
  maxWidth = 'max-w-3xl',
}) {
  const [expanded, setExpanded] = useState(new Set());

  const formatValue = (field, value) => {
    if (value == null) return <span className="text-slate-400 italic">—</span>;
    if (field.type === 'boolean') {
      return value ? (
        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs">
          ✓ Yes
        </span>
      ) : (
        <span className="text-slate-400">No</span>
      );
    }
    if (field.type === 'money') {
      const n = Number(value);
      return Number.isFinite(n) ? (
        <span className="font-mono font-bold text-slate-800">
          Rs. {n.toLocaleString()}
        </span>
      ) : (
        <span className="text-slate-400 italic">—</span>
      );
    }
    if (field.type === 'date') {
      const d = value instanceof Date ? value : new Date(String(value));
      return Number.isNaN(d.getTime()) ? (
        <span className="text-slate-400 italic">—</span>
      ) : (
        <span className="font-mono text-slate-700">
          {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      );
    }
    if (field.format) {
      return <span className={valueClass}>{field.format(value)}</span>;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      return <span className="text-slate-500 text-xs">{JSON.stringify(value)}</span>;
    }
    return <span className={valueClass}>{String(value)}</span>;
  };

  const renderArrayField = (field, values) => {
    if (!Array.isArray(values) || values.length === 0) {
      return <span className="text-slate-400 italic">—</span>;
    }
    return (
      <div className="space-y-1.5">
        {values.map((item, index) => {
          const itemFields = field.itemFields || [{ name: '', label: '' }];
          return (
            <div key={index} className="p-2 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
              <p className="text-xs font-bold text-slate-700 mb-1">
                {Array.isArray(values) && values.length > 1 ? `Line ${index + 1}` : ''}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {itemFields.map((itemField) => {
                  const itemValue = item[itemField.name] ?? '';
                  return (
                    <div key={itemField.name} className="flex flex-col">
                      <span className={labelClass}>{itemField.label || itemField.name}</span>
                      {Array.isArray(itemValue) ? (
                        <span className={arrayItemClass}>{itemValue.join(', ')}</span>
                      ) : (
                        <span className={arrayItemClass}>{String(itemValue)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (!isOpen || !record) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      maxWidth={maxWidth}
    >
      <div className="space-y-4 text-xs">
        {fields.map((field) => {
          const value = record[field.name];
          const isArray = field.type === 'array';
          const isCollapsible = isArray && Array.isArray(value) && value.length > 0;
          const isExpanded = expanded.has(field.name);

          return (
            <div key={field.name} className="border border-slate-200 rounded-xl bg-white dark:bg-slate-900 p-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className={labelClass}>{field.label}</span>
                {isCollapsible && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isExpanded) expanded.delete(field.name);
                      else expanded.add(field.name);
                      setExpanded(new Set(expanded));
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-bold transition-colors"
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? 'Collapse' : `Show ${value.length} item(s)`}
                  </button>
                )}
              </div>
              {isCollapsible && !isExpanded ? (
                <span className="text-slate-400 italic text-xs">
                  {value.length} item(s) collapsed — click to expand
                </span>
              ) : (
                <div>
                  {isArray ? (
                    renderArrayField(field, value || [])
                  ) : (
                    formatValue(field, value)
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="flex justify-end pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center whitespace-nowrap px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
