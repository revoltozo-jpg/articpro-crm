import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Modal } from './Customers';
import './Shared.css';

export default function Vendors({ detail, setDetail }) {
  const [vendors, setVendors] = useState([]);
  const [pos, setPOs] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
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
      await updateDoc(doc(db, 'vendors', data.id), data);
    } else {
      await addDoc(collection(db, 'vendors'), { ...data, status: data.status || 'Active' });
    }
    setModal(false); load();
  };

  const vendorFields = [
    { key: 'name', label: 'Vendor name' },
    { key: 'contact', label: 'Contact person' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone' },
    { key: 'territory', label: 'Territory' },
    { key: 'leadTime', label: 'Lead time' },
    { key: 'status', label: 'Status', type: 'select', options: ['Preferred', 'Active', 'Inactive'].map(o => ({ value: o, label: o })) },
  ];

  if (selected) return (
    <div className="page">
      <div className="topbar">
        <h1>Vendor profile</h1>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => openForm(selected)}>Edit</button>
        </div>
      </div>
      <div className="content">
        <button className="back-btn" onClick={() => setDetail(null)}>← Back to vendors</button>
        <div className="card">
          <div className="detail-header">
            <div className="avatar" style={{ background: '#dcfce7', color: '#166534' }}>
              {selected.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{selected.name}</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>{selected.territory} • Lead time: {selected.leadTime}</div>
            </div>
            <span className={`badge ${selected.status}`}>{selected.status}</span>
          </div>
          <div className="detail-grid">
            <div className="detail-field"><label>Contact</label><p>{selected.contact}</p></div>
            <div className="detail-field"><label>Email</label><p style={{ color: '#2563eb' }}>{selected.email}</p></div>
            <div className="detail-field"><label>Phone</label><p>{selected.phone}</p></div>
            <div className="detail-field"><label>Lead time</label><p>{selected.leadTime}</p></div>
          </div>
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
            <div className="section-title">Purchase orders</div>
            <table className="tbl">
              <thead><tr><th>PO</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {pos.filter(p => p.vendorId === selected.id).map(p => (
                  <tr key={p.id}>
                    <td>{p.id}</td><td>{p.items}</td>
                    <td>${Number(p.total).toLocaleString()}</td>
                    <td><span className={`badge ${p.status}`}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {modal && <Modal form={form} setForm={setForm} save={save} close={() => setModal(false)} title="Edit vendor" fields={vendorFields} />}
    </div>
  );

  return (
    <div className="page">
      <div className="topbar">
        <h1>Vendors</h1>
        <div className="topbar-actions">
          <input className="search" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn btn-primary" onClick={() => openForm()}>+ New vendor</button>
        </div>
      </div>
      <div className="content">
        <div className="card">
          <table className="tbl">
            <thead><tr><th>Vendor</th><th>Contact</th><th>Territory</th><th>Lead time</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} onClick={() => setDetail(v.id)}>
                  <td style={{ fontWeight: 500 }}>{v.name}</td>
                  <td>{v.contact}</td>
                  <td>{v.territory}</td>
                  <td>{v.leadTime}</td>
                  <td><span className={`badge ${v.status}`}>{v.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && <Modal form={form} setForm={setForm} save={save} close={() => setModal(false)} title="New vendor" fields={vendorFields} />}
    </div>
  );
}