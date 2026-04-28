// Forwarders — freight forwarder records for international shipments.
// Simple CRUD module with linked-orders summary on the detail view.

import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Modal, DeleteModal } from './Customers';
import './Shared.css';

export default function Forwarders({ detail, setDetail, goDetail, perms }) {
  const [forwarders, setForwarders] = useState([]);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = async () => {
    const [fs, os] = await Promise.all([
      getDocs(collection(db, 'forwarders')),
      getDocs(collection(db, 'orders')),
    ]);
    setForwarders(fs.docs.map(d => ({ id: d.id, ...d.data() })));
    setOrders(os.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { load(); }, []);

  const selected = detail ? forwarders.find(f => f.id === detail) : null;
  const filtered = forwarders.filter(f =>
    !search ||
    f.name?.toLowerCase().includes(search.toLowerCase()) ||
    f.contact?.toLowerCase().includes(search.toLowerCase()) ||
    f.country?.toLowerCase().includes(search.toLowerCase())
  );

  const fields = [
    { key: 'name', label: 'Forwarder name', type: 'text' },
    { key: 'contact', label: 'Contact person', type: 'text' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'country', label: 'Country / region', type: 'text' },
    { key: 'address', label: 'Address', type: 'text' },
    { key: 'defaultIncoterm', label: 'Default Incoterm', type: 'select', options: [
      { value: '', label: '—' },
      { value: 'FCA', label: 'FCA' },
      { value: 'CIF', label: 'CIF' },
      { value: 'EXW', label: 'EXW' },
    ]},
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];

  const save = async () => {
    if (form.id) {
      const { id, ...rest } = form;
      await updateDoc(doc(db, 'forwarders', id), rest);
    } else {
      await addDoc(collection(db, 'forwarders'), form);
    }
    setModal(false); setForm({}); load();
  };

  const deleteRecord = async (f) => {
    await deleteDoc(doc(db, 'forwarders', f.id));
    setDeleteConfirm(null); setDetail(null); load();
  };

  if (selected) {
    const linkedOrders = orders.filter(o => o.forwarderId === selected.id);
    return (
      <div className="page">
        <div className="topbar">
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>Freight forwarder</div>
            <h1>{selected.name}</h1>
          </div>
          <div className="topbar-actions">
            {perms.canEdit && <button className="btn" onClick={() => { setForm(selected); setModal(true); }}>Edit</button>}
            {perms.canDelete && <button className="btn" style={{ color: '#ef4444', borderColor: '#fecaca' }} onClick={() => setDeleteConfirm(selected)}>Delete</button>}
          </div>
        </div>
        <div className="content">
          <button className="back-btn" onClick={() => setDetail(null)}>← Back to forwarders</button>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">Forwarder details</div>
            <div className="detail-grid">
              <div className="detail-field"><label>Contact</label><p>{selected.contact || '—'}</p></div>
              <div className="detail-field"><label>Email</label><p style={{ color: '#1d4ed8' }}>{selected.email || '—'}</p></div>
              <div className="detail-field"><label>Phone</label><p>{selected.phone || '—'}</p></div>
              <div className="detail-field"><label>Country</label><p>{selected.country || '—'}</p></div>
              <div className="detail-field"><label>Address</label><p>{selected.address || '—'}</p></div>
              <div className="detail-field"><label>Default Incoterm</label><p>{selected.defaultIncoterm || '—'}</p></div>
            </div>
            {selected.notes && <div className="notes-box">{selected.notes}</div>}
          </div>
          <div className="card">
            <div className="section-title">Linked international orders ({linkedOrders.length})</div>
            {linkedOrders.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 12 }}>No orders assigned to this forwarder.</div>
            ) : (
              <table className="tbl">
                <thead><tr><th>Order</th><th>Customer</th><th>Incoterm</th><th>Status</th><th>Promise date</th></tr></thead>
                <tbody>
                  {linkedOrders.map(o => (
                    <tr key={o.id} onClick={() => goDetail('orders_v2', o.id)}>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{o.id.slice(0, 8)}</td>
                      <td style={{ fontWeight: 600 }}>{o.customerName}</td>
                      <td>{o.incoterm || '—'}</td>
                      <td><span className="badge">{o.status}</span></td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>{o.promiseDate || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        {modal && <Modal form={form} setForm={setForm} save={save} close={() => setModal(false)} title="Edit forwarder" fields={fields} />}
        {deleteConfirm && <DeleteModal title="Delete forwarder" message={`Delete ${deleteConfirm.name}?`} onConfirm={() => deleteRecord(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1>Freight forwarders</h1>
        <div className="topbar-actions">
          <input className="search" placeholder="Search forwarders..." value={search} onChange={e => setSearch(e.target.value)} />
          {perms.canCreate && <button className="btn btn-primary" onClick={() => { setForm({}); setModal(true); }}>+ New forwarder</button>}
        </div>
      </div>
      <div className="content">
        <div className="card">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Contact</th><th>Country</th><th>Default Incoterm</th><th>Phone</th></tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan="5"><div className="empty-state">
                  <div className="empty-state-icon">🚢</div>
                  <div className="empty-state-title">No forwarders yet</div>
                </div></td></tr>
              )}
              {filtered.map(f => (
                <tr key={f.id} onClick={() => setDetail(f.id)}>
                  <td style={{ fontWeight: 600 }}>{f.name}</td>
                  <td>{f.contact || '—'}</td>
                  <td>{f.country || '—'}</td>
                  <td>{f.defaultIncoterm || '—'}</td>
                  <td style={{ fontSize: 12, color: '#64748b' }}>{f.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && <Modal form={form} setForm={setForm} save={save} close={() => { setModal(false); setForm({}); }} title="New forwarder" fields={fields} />}
      {deleteConfirm && <DeleteModal title="Delete forwarder" message={`Delete ${deleteConfirm.name}?`} onConfirm={() => deleteRecord(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />}
    </div>
  );
}
