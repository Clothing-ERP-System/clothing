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

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (deleting) return;
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
      addToast(result.message || `${recordLabel} deleted successfully`, 'success');
      try {
        await onDeleted();
      } catch (refreshErr) {
        console.error(`Post-delete refresh failed for ${recordLabel}:`, refreshErr);
        addToast(`${recordLabel} was deleted, but the table view could not refresh automatically.`, 'warning');
      }
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
