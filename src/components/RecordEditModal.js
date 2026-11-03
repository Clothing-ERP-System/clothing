'use client';

import React, { useState } from 'react';
import Modal from '@/components/Modal';
import { preventDuplicateSubmit } from '@/lib/prevent-duplicate-submit.js';

const inputClassName = 'w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#4F46E5]';

function getInitialValue(record, field) {
  const value = record?.[field.name];
  if (value === undefined || value === null) return '';
  if (field.type === 'array') return Array.isArray(value) ? value : [];
  if (field.type === 'checkbox') return Boolean(value);
  if (field.type === 'date') return String(value).slice(0, 10);
  return String(value);
}

function RecordEditForm({ record, fields, onSave, onClose }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((field) => [field.name, getInitialValue(record, field)]))
  );
  const handleSubmit = async (event) => {
    event.preventDefault();

    const updates = {};
    for (const field of fields) {
      const value = values[field.name] ?? '';
      if (field.type === 'array') {
        updates[field.name] = value.map((item) => Object.fromEntries(
          field.itemFields.map((itemField) => {
            const itemValue = item[itemField.name] ?? '';
            return [
              itemField.name,
              itemField.type === 'number' ? Number(itemValue) : itemValue,
            ];
          })
        ));
      } else if (field.type === 'number') {
        if (value === '' && !field.required) continue;
        updates[field.name] = Number(value);
      } else if (field.type === 'checkbox') {
        updates[field.name] = Boolean(value);
      } else if (field.type === 'select' && !field.required && value === '') {
        continue;
      } else if (field.type === 'date' && value === '') {
        updates[field.name] = null;
      } else {
        updates[field.name] = value;
      }
    }

    if (await onSave(record._id, updates)) onClose();
  };

  return (
      <form onSubmit={(event) => preventDuplicateSubmit(event, handleSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map((field) => (
            <div key={field.name} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
              <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor={`record-edit-${field.name}`}>
                {field.label}
              </label>
              {field.type === 'select' ? (
                <select
                  id={`record-edit-${field.name}`}
                  required={field.required}
                  value={values[field.name] ?? ''}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  className={inputClassName}
                >
                  {!field.required && <option value="">Select {field.label}</option>}
                  {field.options.map((option) => (
                    <option key={option.value ?? option} value={option.value ?? option}>
                      {option.label ?? option}
                    </option>
                  ))}
                </select>
              ) : field.type === 'array' ? (
                <div className="space-y-2">
                  {(values[field.name] || []).map((item, index) => (
                    <div key={`${field.name}-${index}`} className="rounded-lg border border-slate-200 p-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {field.itemFields.map((itemField) => {
                          const options = typeof itemField.options === 'function'
                            ? itemField.options(item, values)
                            : itemField.options || [];
                          const itemInputId = `record-edit-${field.name}-${index}-${itemField.name}`;
                          return (
                            <div key={itemField.name}>
                              <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor={itemInputId}>
                                {itemField.label}
                              </label>
                              {itemField.type === 'select' ? (
                                <select
                                  id={itemInputId}
                                  required={itemField.required}
                                  value={item[itemField.name] ?? ''}
                                  onChange={(event) => setValues((current) => ({
                                    ...current,
                                    [field.name]: current[field.name].map((row, rowIndex) =>
                                      rowIndex === index
                                        ? {
                                          ...row,
                                          [itemField.name]: event.target.value,
                                          ...Object.fromEntries((itemField.resetFields || []).map((name) => [name, ''])),
                                        }
                                        : row
                                    ),
                                  }))}
                                  className={inputClassName}
                                >
                                  <option value="">Select {itemField.label}</option>
                                  {options.map((option) => (
                                    <option key={option.value ?? option} value={option.value ?? option}>
                                      {option.label ?? option}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  id={itemInputId}
                                  type={itemField.type || 'text'}
                                  required={itemField.required}
                                  min={itemField.min}
                                  step={itemField.step}
                                  value={item[itemField.name] ?? ''}
                                  onChange={(event) => setValues((current) => ({
                                    ...current,
                                    [field.name]: current[field.name].map((row, rowIndex) =>
                                      rowIndex === index ? { ...row, [itemField.name]: event.target.value } : row
                                    ),
                                  }))}
                                  className={inputClassName}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => setValues((current) => ({
                          ...current,
                          [field.name]: current[field.name].filter((_, rowIndex) => rowIndex !== index),
                        }))}
                        className="mt-2 text-xs font-bold text-red-600 hover:text-red-700"
                      >
                        Remove {field.itemLabel || 'item'}
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setValues((current) => ({
                      ...current,
                      [field.name]: [
                        ...(current[field.name] || []),
                        Object.fromEntries(field.itemFields.map((itemField) => [itemField.name, itemField.defaultValue ?? ''])),
                      ],
                    }))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Add {field.itemLabel || 'item'}
                  </button>
                </div>
              ) : field.type === 'checkbox' ? (
                <input
                  id={`record-edit-${field.name}`}
                  type="checkbox"
                  checked={Boolean(values[field.name])}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-[#4F46E5] focus:ring-[#4F46E5]"
                />
              ) : field.type === 'textarea' ? (
                <textarea
                  id={`record-edit-${field.name}`}
                  required={field.required}
                  rows={field.rows || 3}
                  value={values[field.name] ?? ''}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  className={inputClassName}
                />
              ) : (
                <input
                  id={`record-edit-${field.name}`}
                  type={field.type || 'text'}
                  required={field.required}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={values[field.name] ?? ''}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  className={inputClassName}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 text-xs font-bold text-white bg-[#4F46E5] hover:bg-[#4338CA] rounded-lg shadow-sm"
          >
            Save Changes
          </button>
        </div>
      </form>
  );
}

export default function RecordEditModal({ isOpen, onClose, record, title, fields, onSave }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} subtitle="Update the selected record">
      {isOpen && record && (
        <RecordEditForm
          key={record._id}
          record={record}
          fields={fields}
          onSave={onSave}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}
