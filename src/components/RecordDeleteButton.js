'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function RecordDeleteButton({
  endpoint,
  action,
  idField,
  recordId,
  recordLabel,
  onDeleted,
  extraBody = {},
  className = '',
}) {
  const { addToast } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleting || !window.confirm(`Delete ${recordLabel}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, [idField]: recordId, ...extraBody }),
      });
      const result = await response.json();
      if (!response.ok) {
        addToast(result.message || `Unable to delete ${recordLabel}`, 'error');
        return;
      }
      addToast(result.message || `${recordLabel} deleted`, 'success');
      await onDeleted();
    } catch {
      addToast(`Error deleting ${recordLabel}`, 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className={`disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {deleting ? 'Deleting…' : 'Delete'}
    </button>
  );
}
