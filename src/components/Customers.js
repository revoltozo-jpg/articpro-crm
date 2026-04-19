import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import './Shared.css';

export default function Customers({ detail, setDetail }) {
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});

  const load = async () => {
    const cs = await getDocs(collection(db, 'customers'));
    setCustomers(cs.docs.map(d => ({ id: d.id, ...d.data() })));
    const os = await getDocs(collection(db, 'orders'));
    setOrders(os.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { load(); }, []);

  const selected = detail ? customers.find(c => c.id === detail) : null;
  const filtered = customers.filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.contact?.toLowerCase().includes(search.toLowerCase()));

  const openForm = (c = {}) => { setForm(c); setModal(true); };

  const save = async () => {
    const data = { ...form };
    if (data.id) {
      await updateDoc(doc(db, 'customers', data.id), data);
    } else {
      await addDoc(collection(db, 'customers'), { ...data, status: data.status || 'Active' });
    }
    setModal(false); load();
  };

  if (selected) return (
    <div className="page">
      <div className="topbar">
        <h1>Customer profile</h1>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => openForm(selected)}>Edit</button>
        </div>
      </div>
      <div className="content">
        <button className="back-btn" onClick={() => setDetail(null)}>← Back to customers</button>
        <div className="card">
          <div className="detail-header">
            <div className="avatar">{selected.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{selected.name}</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>{selected.industry} • {selected.units} AC units</div>
            </div>
            <span className={`badge ${selected.status}`}>{selected.status}</span>
          </div>
          <div className="detail-grid">
            <div className="detail-field"><label>Contact</label><p>{selected.contact}</p></div>
            <div className="detail-field"><label>Email</label><p style={{ color: '#2563eb' }}>{selected.email}</p></div>
            <div className="detail-field"><label>Phone</label><p>{selected.phone}</p></div>
            <div className="detail-field"><label>Address</label><p>{selected.address}</p></div>
          </div>
          {selected.notes && <div className="notes-box">{selected.notes}</div>}
          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
            <div className="section-title">Orders</div>
            <table className="tbl">
              <thead><tr><th>Order</th><th>Product</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {orders.filter(o => o.customerId === selected.id).map(o => (
                  <tr key={o.id}><td>{o.id}</td><td>{o.product}</td><td>${(o.qty * o.unitPrice).toLocaleString()}</td><td><span className={`badge ${o.status}`}>{o.status}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {modal && <Modal form={form} setForm={setForm} save={save} close={() => setModal(false)} title="Edit customer" fields={customerFields} />}
    </div>
  );

  return (
    <div className="page">
      <div className="topbar">
        <h1>Customers</h1>
        <div className="topbar-actions">
          <input className="search" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn btn-primary" onClick={() => openForm()}>+ New customer</button>
        </div>
      </div>
      <div className="content">
        <div className="card">
          <table className="tbl">
            <thead><tr><th>Company</th><th>Contact</th><th>Industry</th><th>Units</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} onClick={() => setDetail(c.id)}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td>{c.contact}</td><td>{c.industry}</td><td>{c.units}</td>
                  <td><span className={`badge ${c.status}`}>{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && <Modal form={form} setForm={setForm} save={save} close={() => setModal(false)} title={form.id ? 'Edit customer' : 'New customer'} fields={customerFields} />}
    </div>
  );
}

const customerFields = [
  { key: 'name', label: 'Company name' },
  { key: 'contact', label: 'Contact person' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
  { key: 'industry', label: 'Industry' },
  { key: 'units', label: 'AC units', type: 'number' },
  { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'] },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

export function Modal({ form, setForm, save, close, title, fields }) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="close-btn" onClick={close}>×</button>
        </div>
        {fields.map(f => (
          <div className="form-group" key={f.key}>
            <label>{f.label}</label>
            {f.type === 'select' ? (
              <select value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })}>
                <option value="">Select...</option>
                {f.options.map(o => <option key={o}>{o}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
            ) : (
              <input type={f.type || 'text'} value={form[f.key] || ''} onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
            )}
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button className="btn" onClick={close}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}