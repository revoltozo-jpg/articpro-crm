// OrderAttachments — document references for an order.
//
// Stores LINKS to documents (Google Drive, Dropbox, OneDrive, SharePoint, email attachments,
// shared network drives, etc.) rather than uploading the file itself. This avoids requiring
// Firebase Storage (which is paid) while still giving Operations a single place to find every
// document related to an order.
//
// Each attachment: { id, name, url, type, category, notes, addedAt, addedBy }
// Categories: 'customer_po' | 'submittal' | 'other'

import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Modal } from './Customers';
import { logOrderEvent } from '../lib/orderLifecycle';

const CATEGORY_LABELS = {
  customer_po: 'Customer PO',
  submittal:   'Submittal',
  other:       'Document',
};

const CATEGORY_COLORS = {
  customer_po: { bg: '#dbeafe', fg: '#1d4ed8' },
  submittal:   { bg: '#dcfce7', fg: '#15803d' },
  other:       { bg: '#f1f5f9', fg: '#475569' },
};

const newId = () => Math.random().toString(36).slice(2, 10);

// Best-effort detection of where the link points so we can show a helpful icon/label.
function detectSource(url) {
  if (!url) return { icon: '🔗', label: 'Link' };
  const u = url.toLowerCase();
  if (u.includes('drive.google.com') || u.includes('docs.google.com')) return { icon: '📂', label: 'Google Drive' };
  if (u.includes('dropbox.com')) return { icon: '📦', label: 'Dropbox' };
  if (u.includes('onedrive.live.com') || u.includes('1drv.ms')) return { icon: '☁️', label: 'OneDrive' };
  if (u.includes('sharepoint.com')) return { icon: '📊', label: 'SharePoint' };
  if (u.includes('box.com')) return { icon: '📦', label: 'Box' };
  if (u.includes('mail.google.com') || u.includes('outlook.')) return { icon: '✉️', label: 'Email' };
  if (u.endsWith('.pdf')) return { icon: '📕', label: 'PDF' };
  if (u.match(/\.(jpg|jpeg|png|gif|webp)$/)) return { icon: '🖼', label: 'Image' };
  if (u.match(/\.(doc|docx)$/)) return { icon: '📘', label: 'Word' };
  if (u.match(/\.(xls|xlsx|csv)$/)) return { icon: '📗', label: 'Spreadsheet' };
  return { icon: '🔗', label: 'Link' };
}

export default function OrderAttachments({ order, onUpdated, perms }) {
  const canEdit = perms?.canEdit;
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const attachments = Array.isArray(order.attachments) ? order.attachments : [];

  const openAdd = (category) => {
    setForm({ category, name: '', url: '', notes: '' });
    setModal(true);
  };

  const save = async () => {
    if (!form.url) {
      alert('Please paste a URL/link to the document.');
      return;
    }
    // Light URL sanity — accept https://, http://, or anything obvious that starts with a known prefix.
    const url = form.url.trim();
    if (!/^https?:\/\//i.test(url)) {
      if (!window.confirm("That doesn't look like a URL (it should start with http:// or https://). Save anyway?")) return;
    }
    const newAttachment = {
      id: form.id || newId(),
      name: (form.name || '').trim() || 'Untitled document',
      url,
      category: form.category || 'other',
      notes: (form.notes || '').trim(),
      addedAt: new Date().toISOString(),
      addedBy: auth.currentUser?.email || 'unknown',
    };
    const next = form.id
      ? attachments.map(a => a.id === form.id ? newAttachment : a)
      : [...attachments, newAttachment];

    const patch = { attachments: next };
    // Convenience: if it's a Customer PO link and PO not yet flagged received, flip the gate.
    if (!form.id && newAttachment.category === 'customer_po' && !order.customerPOReceived) {
      patch.customerPOReceived = true;
    }
    try {
      await updateDoc(doc(db, 'orders', order.id), patch);
      await logOrderEvent(order.id, form.id ? 'attachment_edited' : 'attachment_added',
        `${form.id ? 'Updated' : 'Added'} ${CATEGORY_LABELS[newAttachment.category]}: ${newAttachment.name}`);
      if (onUpdated) onUpdated(patch);
      setModal(false);
      setForm({});
    } catch (err) {
      console.error('save failed', err);
      alert('Save failed: ' + (err.message || 'unknown error'));
    }
  };

  const removeAttachment = async (att) => {
    if (!window.confirm(`Remove "${att.name}"? This only removes the link \u2014 the file at the URL is unaffected.`)) return;
    const next = attachments.filter(a => a.id !== att.id);
    try {
      await updateDoc(doc(db, 'orders', order.id), { attachments: next });
      await logOrderEvent(order.id, 'attachment_removed', `Removed link: ${att.name}`);
      if (onUpdated) onUpdated({ attachments: next });
    } catch (err) {
      console.error('remove failed', err);
      alert('Remove failed: ' + (err.message || 'unknown error'));
    }
  };

  const editAttachment = (att) => {
    setForm({ ...att });
    setModal(true);
  };

  const grouped = {
    customer_po: attachments.filter(a => a.category === 'customer_po'),
    submittal:   attachments.filter(a => a.category === 'submittal'),
    other:       attachments.filter(a => a.category === 'other' || !a.category),
  };

  const formFields = [
    { key: 'category', label: 'Category', type: 'select', options: [
      { value: 'customer_po', label: 'Customer PO' },
      { value: 'submittal', label: 'Submittal' },
      { value: 'other', label: 'Other document' },
    ]},
    { key: 'name', label: 'Document name (e.g. "PO 12345 from TEST COMPANY")', type: 'text' },
    { key: 'url', label: 'Link / URL (Google Drive, Dropbox, SharePoint, etc.)', type: 'text' },
    { key: 'notes', label: 'Notes (optional)', type: 'textarea' },
  ];

  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="section-title" style={{ margin: 0 }}>Documents</div>
          {canEdit && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn" style={{ fontSize: 11 }} onClick={() => openAdd('customer_po')}>+ Customer PO link</button>
              <button className="btn" style={{ fontSize: 11 }} onClick={() => openAdd('submittal')}>+ Submittal link</button>
              <button className="btn" style={{ fontSize: 11 }} onClick={() => openAdd('other')}>+ Document link</button>
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10, fontStyle: 'italic' }}>
          Paste links to documents stored in Google Drive, Dropbox, SharePoint, email, etc. Documents stay where your team already keeps them.
        </div>

        {attachments.length === 0 ? (
          <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 12 }}>
            No document links yet.
          </div>
        ) : (
          ['customer_po', 'submittal', 'other'].map(cat => {
            const items = grouped[cat];
            if (items.length === 0) return null;
            const label = CATEGORY_LABELS[cat];
            return (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  {label}{items.length > 1 ? 's' : ''} ({items.length})
                </div>
                {items.map(a => {
                  const c = CATEGORY_COLORS[a.category] || CATEGORY_COLORS.other;
                  const src = detectSource(a.url);
                  return (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 6, background: '#f8fafc',
                      border: '1px solid #e2e8f0', marginBottom: 6,
                    }}>
                      <div style={{ fontSize: 18, flexShrink: 0 }} title={src.label}>{src.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a href={a.url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', textDecoration: 'none', wordBreak: 'break-all' }}
                          onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                          onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>
                          {a.name}
                        </a>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                          {src.label} · {a.addedBy} · {a.addedAt ? new Date(a.addedAt).toLocaleString() : ''}
                          {a.notes && <span> · {a.notes}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4, background: c.bg, color: c.fg, textTransform: 'uppercase', flexShrink: 0 }}>
                        {label}
                      </span>
                      {canEdit && (
                        <>
                          <button className="btn" style={{ fontSize: 10, padding: '3px 8px' }}
                            onClick={() => editAttachment(a)}>Edit</button>
                          <button className="btn" style={{ fontSize: 10, padding: '3px 8px', color: '#ef4444', borderColor: '#fecaca' }}
                            onClick={() => removeAttachment(a)}>×</button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {modal && (
        <Modal
          form={form}
          setForm={setForm}
          save={save}
          close={() => { setModal(false); setForm({}); }}
          title={form.id ? 'Edit document link' : 'Add document link'}
          fields={formFields}
        />
      )}
    </>
  );
}
