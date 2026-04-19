import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Modal } from './Customers';
import './Shared.css';

export default function PurchaseOrders({ detail, setDetail, goDetail }) {
  const [pos, setPOs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});

  const load = async () => {
    const ps = await getDocs(collection(db, 'purchase_orders'));
    setPOs(ps.docs.map(d => ({ id: d.id, ...d.data() })));
    const vs = await getDocs(collection(db, 'vendors'));
    setVendors(vs.docs.map(d => ({ id: d.id, ...d.data() })));
    const os = await getDocs(collection(db, 'orders'));
    setOrders(os.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    if (detail?.startsWith('new:')) {
      const soId = detail.split(':')[1];
      const so = orders.find(o => o.id === soId);
      setForm({ relatedSO: soId, items: so ? so.product + ' x' + so.qty : '' });
      setModal(true);
      setDetail(null);
    }
  }, [detail, orders]);

  useEffect(() => { load(); }, []);

  const selected = detail && !detail.startsWith('new:') ? pos.find(p => p.id === detail) : null;
  const filtered = pos.filter(p => !search ||
    p.id?.toLowerCase().includes(search.toLowerCase()) ||
    p.vendorName?.toLowerCase().includes(search.toLowerCase()) ||
    p.items?.toLowerCase().includes(search.toLowerCase())
  );

  const openForm = (p = {}) => { setForm(p); setModal(true); };

  const save = async () => {
    const data = { ...form };
    const vendor = vendors.find(v => v.id === data.vendorId);
    data.vendorName = vendor ? vendor.name : '';
    data.total = Number(data.total) || 0;
    if (data.id) {
      await updateDoc(doc(db, 'purchase_orders', data.id), data);
    } else {
      await addDoc(collection(db, 'purchase_orders'), { ...data, status: data.status || 'Draft' });
    }
    setModal(false); load();
  };

  const poFields = [
    { key: 'vendorId', label: 'Vendor', type: 'select', options: vendors.map(v => ({ value: v.id, label: v.name })) },
    { key: 'relatedSO', label: 'Linked customer order', type: 'select', options: [{ value: '', label: '— None —' }, ...orders.map(o => ({ value: o.id, label: o.id + ' – ' + o.product?.slice(0, 30) }))] },
    { key: 'items', label: 'Items description' },
    { key: 'total', label: 'Total cost ($)', type: 'number' },
    { key: 'orderDate', label: 'Order date', type: 'date' },
    { key: 'expectedDate', label: 'Expected delivery', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Ordered', 'Shipped', 'Received'].map(o => ({ value: o, label: o })) },
  ];

  if (selected) {
    const vendor = vendors.find(v => v.id === selected.vendorId);
    const so = orders.find(o => o.id === selected.relatedSO);
    const margin = so ? (so.qty * so.unitPrice) - selected.total : null;
    const marginPct = so ? Math.round(margin / (so.qty * so.unitPrice) * 100) : null;

    return (
      <div className="page">
        <div className="topbar">
          <h1>Purchase order</h1>
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={() => openForm(selected)}>Edit</button>
          </div>
        </div>
        <div className="content">
          <button className="back-btn" onClick={() => setDetail(null)}>← Back to purchase orders</button>
          <div className="card">
            <div className="detail-header">
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{selected.id}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{selected.orderDate ? 'Ordered ' + selected.orderDate : 'Draft'}</div>
              </div>
              <div style={{ flex: 1 }} />
              <span className={`badge ${selected.status}`}>{selected.status}</span>
            </div>
            <div className="two-col">
              <div>
                <div className="section-title">Order details</div>
                <div className="detail-grid">
                  <div className="detail-field"><label>Vendor</label>
                    <p style={{ color: '#2563eb', cursor: 'pointer' }} onClick={() => vendor && goDetail('vendors', vendor.id)}>{selected.vendorName}</p>
                  </div>
                  <div className="detail-field"><label>Contact</label><p>{vendor?.contact}</p></div>
                  <div className="detail-field"><label>Items</label><p>{selected.items}</p></div>
                  <div className="detail-field"><label>Total cost</label><p style={{ fontWeight: 600 }}>${Number(selected.total).toLocaleString()}</p></div>
                  <div className="detail-field"><label>Order date</label><p>{selected.orderDate || '—'}</p></div>
                  <div className="detail-field"><label>Expected</label><p>{selected.expectedDate || '—'}</p></div>
                </div>
              </div>
              <div>
                <div className="section-title">Linked customer order</div>
                {so ? (
                  <div style={{ background: '#f9fafb', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Customer order</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#2563eb', cursor: 'pointer' }} onClick={() => goDetail('orders', so.id)}>{so.id}</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>{so.product}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{so.customerName}</div>
                    <div style={{ marginTop: 8 }}><span className={`badge ${so.status}`}>{so.status}</span></div>
                  </div>
                ) : (
                  <div style={{ background: '#f9fafb', borderRadius: 8, padding: 14, color: '#6b7280', fontSize: 13, marginBottom: 16 }}>No linked customer order</div>
                )}
                {so && margin !== null && (
                  <>
                    <div className="section-title">Margin preview</div>
                    <div className="margin-box">
                      <div className="margin-row"><span style={{ color: '#6b7280' }}>Customer order value</span><span>${(so.qty * so.unitPrice).toLocaleString()}</span></div>
                      <div className="margin-row"><span style={{ color: '#6b7280' }}>PO cost</span><span>${Number(selected.total).toLocaleString()}</span></div>
                      <div className="margin-row"><span>Gross margin</span><span style={{ color: '#166534' }}>${margin.toLocaleString()} ({marginPct}%)</span></div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        {modal && <Modal form={form} setForm={setForm} save={save} close={() => setModal(false)} title="Edit PO" fields={poFields} />}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1>Purchase orders</h1>
        <div className="topbar-actions">
          <input className="search" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn btn-primary" onClick={() => openForm()}>+ New PO</button>
        </div>
      </div>
      <div className="content">
        <div className="card">
          <table className="tbl">
            <thead><tr><th>PO</th><th>Vendor</th><th>Items</th><th>Total</th><th>Expected</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} onClick={() => setDetail(p.id)}>
                  <td style={{ color: '#6b7280' }}>{p.id}</td>
                  <td style={{ fontWeight: 500 }}>{p.vendorName}</td>
                  <td>{p.items}</td>
                  <td>${Number(p.total).toLocaleString()}</td>
                  <td>{p.expectedDate || '—'}</td>
                  <td><span className={`badge ${p.status}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {modal && <Modal form={form} setForm={setForm} save={save} close={() => setModal(false)} title="New PO" fields={poFields} />}
    </div>
  );
}