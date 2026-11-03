'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Modal from '@/components/Modal';
import { useAuth } from '@/context/AuthContext';
import { canAccessModule } from '@/lib/role-access.js';

const formatBytes = (size) => `${(size / 1024).toFixed(0)} KB`;

export default function RecordAttachments({ module, record, onClose }) {
  const { user, addToast } = useAuth();
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);

  const loadAttachments = useCallback(async () => {
    try {
      const query = new URLSearchParams({ module, recordId: String(record?._id || '') });
      const response = await fetch(`/api/attachments?${query}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Could not load attachments');
      setAttachments(result.data.attachments || []);
    } catch (error) {
      addToast(error.message || 'Could not load attachments', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, module, record]);

  useEffect(() => {
    if (record?._id) void Promise.resolve().then(loadAttachments);
  }, [loadAttachments, record?._id]);

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set('recordId', String(record._id));
      formData.set('file', file);
      const response = await fetch(`/api/attachments?module=${encodeURIComponent(module)}`, { method: 'POST', body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Upload failed');
      addToast('Attachment uploaded successfully', 'success');
      await loadAttachments();
    } catch (error) {
      addToast(error.message || 'Attachment upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const download = async (attachment) => {
    try {
      const response = await fetch(`/api/attachments?id=${encodeURIComponent(attachment.id)}`);
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || 'Download failed');
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = attachment.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      addToast(error.message || 'Attachment download failed', 'error');
    }
  };

  const openPreview = async (attachment) => {
    try {
      const response = await fetch(`/api/attachments?id=${encodeURIComponent(attachment.id)}`);
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || 'Preview failed');
      }
      const url = URL.createObjectURL(await response.blob());
      setPreview({ url, mimeType: attachment.mimeType, fileName: attachment.fileName });
    } catch (error) {
      addToast(error.message || 'Attachment preview failed', 'error');
    }
  };

  const remove = async (attachment) => {
    if (!window.confirm(`Permanently remove "${attachment.fileName}"?`)) return;
    try {
      const response = await fetch('/api/attachments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachmentId: attachment.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Delete failed');
      addToast('Attachment deleted', 'success');
      await loadAttachments();
    } catch (error) {
      addToast(error.message || 'Attachment deletion failed', 'error');
    }
  };

  const canEdit = canAccessModule(user, module, 'edit');
  const canDelete = canAccessModule(user, module, 'delete');
  const label = record?.designCode || record?.supplierCode || record?.inspectionNumber || record?.title || record?.name || 'record';
  const close = () => {
    setPreview(null);
    onClose();
  };

  return (
    <Modal
      isOpen={Boolean(record)}
      onClose={close}
      title={`Attachments: ${label}`}
      subtitle="Private PDF and image files associated with this business record"
    >
      <div className="space-y-4">
        {canEdit && (
          <label className="inline-flex cursor-pointer items-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700">
            {uploading ? 'Uploading…' : 'Upload PDF or image'}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              disabled={uploading}
              onChange={upload}
              className="sr-only"
            />
          </label>
        )}
        <p className="text-[11px] text-slate-500">PDF, JPEG, PNG, or WebP; maximum 10 MB per file.</p>
        {loading ? (
          <p className="text-xs text-slate-500">Loading attachments…</p>
        ) : attachments.length === 0 ? (
          <p className="text-xs text-slate-500">No attachments are stored for this record.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="break-all text-xs font-semibold text-slate-800">{attachment.fileName}</p>
                  <p className="text-[11px] text-slate-500">
                    {formatBytes(attachment.sizeBytes)} · {attachment.uploadedAt ? new Date(attachment.uploadedAt).toLocaleString() : 'Date unavailable'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => openPreview(attachment)} className="rounded border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
                    View
                  </button>
                  <button type="button" onClick={() => download(attachment)} className="rounded border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50">
                    Download
                  </button>
                  {canDelete && (
                    <button type="button" onClick={() => remove(attachment)} className="rounded border border-red-200 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-50">
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {preview && (
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="break-all text-xs font-bold text-slate-700">{preview.fileName}</p>
              <button type="button" onClick={() => setPreview(null)} className="text-xs font-bold text-slate-500 hover:text-slate-900">Close preview</button>
            </div>
            {preview.mimeType.startsWith('image/') ? (
              <Image src={preview.url} alt={preview.fileName} width={800} height={600} unoptimized className="max-h-96 max-w-full rounded-lg border border-slate-200 object-contain" />
            ) : (
              <a href={preview.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-indigo-700 underline">
                Open PDF in a new tab
              </a>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
