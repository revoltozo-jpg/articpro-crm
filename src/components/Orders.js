import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Modal } from './Customers';
import './Shared.css';

export default function Orders({ detail, setDetail, goDetail }) {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [pos, setPOs] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});

  const load = async () => {
    const os = await getDocs(collection(db, 'orders'));
    setOrders(os.docs.map(d => ({ id: d.id, ...d.data() })));
    const cs = await getDocs(collection(db, 'customers'));
    setCustomers(cs.docs.map(d => ({ id: d.id, ...d.data() })));
    const ps = await getDocs(collection(db, 'purchase_orders'));
    setPOs(ps.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { load(); }, []);

  const selected = detail ? orders.find(o => o.id === detail) : null;
  const filtered = orders.filter(o => !search ||
    o.id?.toLowerCase().includes(search.toLowerCase()) ||
    o.product?.toLowerCase().includes(search.toLowerCase()) ||
    o.customerName?.toLowerCase().includes(search.toLowerCase())
  );

  const openForm = (o = {}) => { setForm(o); setModal(true); };

  const save = async () => {
    const data = { ...form };
    const customer = customers.find(c => c.id === data.customerId);
    data.customerName = customer ? customer.name : '';
    data.qty = Number(data.qty) || 1;
    data.unitPrice = Number(data.unitPrice) || 0;
    if (data.id) {
      await updateDoc(doc(db, 'orders', data.id), data);
    } else {
      await addDoc(collection(db, 'orders'), { ...data, status: data.status || 'Quoted' });
    }
    setModal(false); load();
  };

  const orderFields = [
    { key: 'customerId', label: 'Customer', type: 'select', options: customers.map(c => ({ value: c.id, label: c.name })) },
    { key: 'product', label: 'Product' },
    { key: 'qty', label: 'Quantity', type: 'number' },
    { key: 'unitPrice', label: 'Unit price ($)', type: 'number' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: ['Quoted','Pending','In Progress','Active','Delivered','On Hold'].map(o => ({ value: o, label: o })) },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];

  if (selected) {
    const po = pos.find(p => p.relatedSO === selected.id);
    return (
      <div className="page">
        <div className="topbar">
          <h1>Order detail</h1>
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={() => openForm(selected)}>Edit</button>
          </div>
        </div>
        <div className="content">
          <button className="back-btn" onClick={() => setDetail(null)}>← Back to orders</button>
          <div className="card">
            <div className="detail-header">
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{selected.id}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{selected.date}</div>
              </div>
              <div style={{ flex: 1 }} />
              <span className={`badge ${selected.status}`}>{selected.status}</span>
            </div>
            <div className="two-col">
              <div>
                <div className="section-title">Order details</div>
                <div className="detail-grid">
                  <div className="detail-field"><label>Customer</label><p style={{ color: '#2563eb', cursor: 'pointer' }} onClick={() => goDetail('customers', selected.customerId)}>{selected.customerName}</p></div>
                  <div className="detail-field"><label>Product</label><p>{selected.product}</p></div>
                  <div className="detail-field"><label>Quantity</label><p>{selected.qty} units</p></div>
                  <div className="detail-field"><label>Unit price</label><p>${Number(selected.unitPrice).toLocaleString()}</p></div>
                  <div className="detail-field"><label>Total</label><p style={{ fontWeight: 600, fontSize: 15 }}>${(selected.qty * selected.unitPrice).toLocaleString()}</p></div>
                </div>
                {selected.notes && <div className="notes-box">{selected.notes}</div>}
              </div>
              <div>
                <div className="section-title">Fulfillment</div>
                {po ? (
                  <div style={{ background: '#f9fafb', borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Linked purchase order</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#2563eb', cursor: 'pointer' }} onClick={() => goDetail('purchase_orders', po.id)}>{po.id}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{po.vendorName}</div>
                    <div style={{ marginTop: 8 }}><span className={`badge ${po.status}`}>{po.status}</span></div>
                    {po.expectedDate && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>Expected: {po.expectedDate}</div>}
                  </div>
                ) : (
                  <div style={{ background: '#f9fafb', borderRadius: 8, padding: 14, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                    No purchase order yet<br />
                    <button className="btn" style={{ marginTop: 10 }} onClick={() => goDetail('purchase_orders', 'new:' + selected.id)}>+ Create PO</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {modal && <Modal form={form} setForm={setForm} save={save} close={() => setModal(false)} title="Edit order" fields={orderFields} />}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1>Customer orders</h1>
        <div className="topbar-actions">
          <input className="search" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn btn-primary" onClick={() => openForm()}>+ New order</button>
        </div>
      </div>
      <div className="content">
        <div className="card">
          <table className="tbl">
            <thead><tr><th>Order ID</th><th>Customer</th><th>Product</th><th>Qty</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} onClick={() => setDetail(o.id)}>
                  <td style={{ color: '#6b7280' }}>{o.id}</td>
                  <td style={{ fontWeight: 500 }}>{o.customerName}</td>
                  <td>{o.product}</td>
                  <td>{o.qty}</td>
                  <td>${(o.qty * o.unitPrice).toLocaleString()}</td>
                  <td><span className={`badge ${o.status}`}>{o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && <Modal form={form} setForm={setForm} save={save} close={() => setModal(false)} title="New order" fields={orderFields} />}
    </div>
  );
}