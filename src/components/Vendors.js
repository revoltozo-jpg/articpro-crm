import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Modal, DeleteModal } from './Customers';
import './Shared.css';

export default function Vendors({ detail, setDetail, goDetail, isAdmin }) {
  const [vendors, setVendors] = useState([]);
  const [pos, setPOs] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => {
    const vs = await getDocs(collection(db, 'vendors'));
    setVendors(vs.docs.map(d => ({ id: d.id, ...d.data() })));
    const ps = await getDocs(collection(db, 'purchase_orders'));
    setPOs(ps.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { load(); }, []);

  const selected = detail ? vendors.find(v => v.id === detail) : null;
  const filtered = vendors.filter(v => !search ||
    v.name?.toLowerCase().includes(search.toLowerCase()) ||
    v.contact?.toLowerCase().includes(search.toLowerCase())
  );

  const openForm = (v = {}) => { setForm(v); setModal(true); };

  const save = async () => {
    const data = { ...form };
    if (data.id) {
      const { id, ...rest } = data;
      await updateDoc(doc(db, 'vendors', id), rest);
    } else {
      await addDoc(collection(db, 'vendors'), { ...data, status: data.status || 'Active' });
    }
    setModal(false); load();
  };

  const deleteRecord = async (v) => {
    await deleteDoc(doc(db, 'vendors', v.id));
    setDeleteConfirm(null);
    setDetail(null);
    load();
  };

  const vendorFields = [
    { key: 'name', label: 'Vendor name', type: 'text' },
    { key: 'contact', label: 'Contact person', type: 'text' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'territory', label: 'Territory', type: 'text' },
    { key: 'leadTime', label: 'Lead time', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: [
      { value: 'Preferred', label: 'Preferred' },
      { value: 'Active', label: 'Active' },
      { value: 'Inactive', label: 'Inactive' }
    ]},
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];

  if (selected) return (
    <div className="page">
      <div className="topbar">
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>Vendor profile</div>
          <h1>{selected.name}</h1>
        </div>
        <div className="topbar-actions">
          <span className={`badge ${selected.status}`}>{selected.status}</span>
          <button className="btn" onClick={() => openForm(selected)}>Edit vendor</button>
          {isAdmin && <button className="btn" style={{ color: '#ef4444', borderColor: '#fecaca' }} onClick={() => setDeleteConfirm(selected)}>Delete</button>}
        </div>
      </div>
      <div className="content">
        <button className="back-btn" onClick={() => setDetail(null)}>← Back to vendors</button>
        <div className="two-col" style={{ marginBottom: 20 }}>
          <div className="card">
            <div className="section-title">Vendor information</div>
            <div className="detail-grid">
              <div className="detail-field"><label>Contact</label><p>{selected.contact || '—'}</p></div>
              <div className="detail-field"><label>Email</label><p style={{ color: '#2563eb' }}>{selected.email || '—'}</p></div>
              <div className="detail-field"><label>Phone</label><p>{selected.phone || '—'}</p></div>
              <div className="detail-field"><label>Territory</label><p>{selected.territory || '—'}</p></div>
              <div className="detail-field"><label>Lead time</label><p>{selected.leadTime || '—'}</p></div>
              <div className="detail-field"><label>Status</label><p><span className={`badge ${selected.status}`}>{selected.status}</span></p></div>
            </div>
            {selected.notes && <div className="notes-box">{selected.notes}</div>}
          </div>
          <div className="card">
            <div className="section-title">Purchase order summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div className="info-box">
                <div className="info-box-label">Total POs</div>
                <div className="info-box-value">{pos.filter(p => p.vendorId === selected.id).length}</div>
              </div>
              <div className="info-box">
                <div className="info-box-label">Open POs</div>
                <div className="info-box-value">{pos.filter(p => p.vendorId === selected.id && p.status !== 'Received').length}</div>
              </div>
              <div className="info-box">
                <div className="info-box-label">Total spent</div>
                <div className="info-box-value">${pos.filter(p => p.vendorId === selected.id).reduce((a, p) => a + Number(p.total), 0).toLocaleString()}</div>
              </div>
              <div className="info-box">
                <div className="info-box-label">Received</div>
                <div className="info-box-value">{pos.filter(p => p.vendorId === selected.id && p.status === 'Received').length}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="section-title" style={{ margin: 0 }}>Purchase orders</div>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => goDetail('purchase_orders', 'new:vendor:' + selected.id)}>+ New PO</button>
          </div>
          <table className="tbl">
            <thead>
              <tr><th>PO</th><th>Linked order</th><th>Items</th><th>Total</th><th>Expected</th><th>Status</th></tr>
            </thead>
            <tbody>
              {pos.filter(p => p.vendorId === selected.id).length === 0 && (
                <tr><td colSpan="6">
                  <div className="empty-state">
                    <div className="empty-state-icon">📦</div>
                    <div className="empty-state-title">No purchase orders yet</div>
                  </div>
                </td></tr>
              )}
              {pos.filter(p => p.vendorId === selected.id).map(p => (
                <tr key={p.id} onClick={() => goDetail('purchase_orders', p.id)}>
                  <td style={{ fontWeight: 600, color: '#64748b', fontSize: 12 }}>{p.id}</td>
                  <td style={{ fontSize: 12, color: '#2563eb', fontWeight: 500 }}>{p.relatedSO || '—'}</td>
                  <td style={{ color: '#64748b', fontSize: 12 }}>{p.items?.slice(0, 25)}{p.items?.length > 25 ? '...' : ''}</td>
                  <td style={{ fontWeight: 600 }}>${Number(p.total).toLocaleString()}</td>
                  <td style={{ color: '#94a3b8', fontSize: 12 }}>{p.expectedDate || '—'}</td>
                  <td><span className={`badge ${p.status}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && <Modal form={form} setForm={setForm} save={save} close={() => setModal(false)} title="Edit vendor" fields={vendorFields} />}
      {deleteConfirm && <DeleteModal title="Delete vendor" message={`Are you sure you want to delete ${deleteConfirm.name}? This cannot be undone.`} onConfirm={() => deleteRecord(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />}
    </div>
  );

  return (
    <div className="page">
      <div className="topbar">
        <h1>Vendors</h1>
        <div className="topbar-actions">
          <input className="search" placeholder="Search vendors..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn btn-primary" onClick={() => openForm()}>+ New vendor</button>
        </div>
      </div>
      <div className="content">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total vendors', val: vendors.length },
            { label: 'Preferred', val: vendors.filter(v => v.status === 'Preferred').length },
            { label: 'Active', val: vendors.filter(v => v.status === 'Active').length },
            { label: 'Inactive', val: vendors.filter(v => v.status === 'Inactive').length },
          ].map(m => (
            <div key={m.label} className="metric">
              <div className="metric-label">{m.label}</div>
              <div className="metric-val">{m.val}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th>Vendor</th><th>Contact</th><th>Email</th><th>Territory</th><th>Lead time</th><th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan="7">
                  <div className="empty-state">
                    <div className="empty-state-icon">🏭</div>
                    <div className="empty-state-title">No vendors yet</div>
                  </div>
                </td></tr>
              )}
              {filtered.map(v => (
                <tr key={v.id} onClick={() => setDetail(v.id)}>
                  <td style={{ fontWeight: 600 }}>{v.name}</td>
                  <td>{v.contact}</td>
                  <td style={{ color: '#2563eb', fontSize: 12 }}>{v.email}</td>
                  <td style={{ color: '#64748b' }}>{v.territory}</td>
                  <td style={{ color: '#64748b' }}>{v.leadTime}</td>
                  <td><span className={`badge ${v.status}`}>{v.status}</span></td>
                  {isAdmin && (
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn" style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: '#fecaca' }} onClick={() => setDeleteConfirm(v)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && <Modal form={form} setForm={setForm} save={save} close={() => setModal(false)} title="New vendor" fields={vendorFields} />}
      {deleteConfirm && <DeleteModal title="Delete vendor" message={`Are you sure you want to delete ${deleteConfirm.name}? This cannot be undone.`} onConfirm={() => deleteRecord(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />}
    </div>
  );
}