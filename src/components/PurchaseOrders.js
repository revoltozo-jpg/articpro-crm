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
  const [filterStatus, setFilterStatus] = useState('');

  const load = async () => {
    const [ps, vs, os] = await Promise.all([
      getDocs(collection(db, 'purchase_orders')),
      getDocs(collection(db, 'vendors')),
      getDocs(collection(db, 'orders')),
    ]);
    setPOs(ps.docs.map(d => ({ id: d.id, ...d.data() })));
    setVendors(vs.docs.map(d => ({ id: d.id, ...d.data() })));
    setOrders(os.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (detail?.startsWith('new:')) {
      const soId = detail.split(':')[1];
      const so = orders.find(o => o.id === soId);
      setForm({ relatedSO: soId, items: so ? so.product + ' x' + so.qty : '', status: 'Draft' });
      setModal(true);
      setDetail(null);
    }
  }, [detail, orders]);

  const selected = detail && !detail?.startsWith('new:') ? pos.find(p => p.id === detail) : null;

  const filtered = pos.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.id?.toLowerCase().includes(q) || p.vendorName?.toLowerCase().includes(q) || p.items?.toLowerCase().includes(q);
    const matchStatus = !filterStatus || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const save = async () => {
    const data = { ...form };
    const vendor = vendors.find(v => v.id === data.vendorId);
    data.vendorName = vendor ? vendor.name : '';
    data.total = Number(data.total) || 0;
    if (data.id) {
      const { id, ...rest } = data;
      await updateDoc(doc(db, 'purchase_orders', id), rest);
    } else {
      const docRef = await addDoc(collection(db, 'purchase_orders'), { ...data, status: data.status || 'Draft' });
      if (data.relatedSO) {
        const soRef = orders.find(o => o.id === data.relatedSO);
        if (soRef) {
          await updateDoc(doc(db, 'orders', data.relatedSO), { vendorPO: docRef.id });
        }
      }
    }
    setModal(false); load();
  };

  const fmt = n => '$' + Number(n).toLocaleString();
  const statuses = ['Draft', 'Ordered', 'Shipped', 'Received'];

  const poFields = [
    { key: 'vendorId', label: 'Vendor', type: 'select', options: vendors.map(v => ({ value: v.id, label: v.name })) },
    { key: 'relatedSO', label: 'Linked customer order', type: 'select', options: [
      { value: '', label: '— None —' },
      ...orders.map(o => ({ value: o.id, label: o.id + ' — ' + (o.customerName || '') + ' — ' + (o.product?.slice(0, 25) || '') }))
    ]},
    { key: 'items', label: 'Items / description', type: 'text' },
    { key: 'total', label: 'Total cost to us ($)', type: 'number' },
    { key: 'orderDate', label: 'Order date', type: 'date' },
    { key: 'expectedDate', label: 'Expected delivery', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: statuses.map(s => ({ value: s, label: s })) },
  ];

  if (selected) {
    const vendor = vendors.find(v => v.id === selected.vendorId);
    const so = orders.find(o => o.id === selected.relatedSO);
    const soValue = so ? Number(so.qty) * Number(so.unitPrice) : 0;
    const margin = soValue - Number(selected.total);
    const marginPct = soValue > 0 ? Math.round(margin / soValue * 100) : 0;

    return (
      <div className="page">
        <div className="topbar">
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>Purchase order</div>
            <h1>{selected.id}</h1>
          </div>
          <div className="topbar-actions">
            <span className={`badge ${selected.status}`}>{selected.status}</span>
            <button className="btn" onClick={() => { setForm(selected); setModal(true); }}>Edit PO</button>
          </div>
        </div>
        <div className="content">
          <button className="back-btn" onClick={() => setDetail(null)}>← Back to purchase orders</button>
          <div className="two-col" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="section-title">PO details</div>
              <div className="detail-grid">
                <div className="detail-field">
                  <label>Vendor</label>
                  <p className="link" onClick={() => vendor && goDetail('vendors', vendor.id)}>{selected.vendorName || '—'}</p>
                </div>
                <div className="detail-field"><label>Vendor contact</label><p>{vendor?.contact || '—'}</p></div>
                <div className="detail-field"><label>Items</label><p>{selected.items || '—'}</p></div>
                <div className="detail-field">
                  <label>Total cost</label>
                  <p style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{fmt(selected.total)}</p>
                </div>
                <div className="detail-field"><label>Order date</label><p>{selected.orderDate || '—'}</p></div>
                <div className="detail-field"><label>Expected delivery</label><p>{selected.expectedDate || '—'}</p></div>
              </div>

              <div className="section-title" style={{ marginTop: 8 }}>Delivery timeline</div>
              <div style={{ display: 'flex', gap: 0 }}>
                {[
                  { label: 'Draft', done: true },
                  { label: 'Ordered', done: ['Ordered','Shipped','Received'].includes(selected.status) },
                  { label: 'Shipped', done: ['Shipped','Received'].includes(selected.status) },
                  { label: 'Received', done: selected.status === 'Received' },
                ].map((step, i, arr) => (
                  <div key={step.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                      {i > 0 && <div style={{ flex: 1, height: 2, background: step.done ? '#22c55e' : '#e2e8f0' }}></div>}
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: step.done ? '#22c55e' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: step.done ? '#fff' : '#94a3b8', fontWeight: 700, flexShrink: 0 }}>
                        {step.done ? '✓' : i + 1}
                      </div>
                      {i < arr.length - 1 && <div style={{ flex: 1, height: 2, background: arr[i + 1].done ? '#22c55e' : '#e2e8f0' }}></div>}
                    </div>
                    <div style={{ fontSize: 11, color: step.done ? '#15803d' : '#94a3b8', marginTop: 6, fontWeight: step.done ? 600 : 400 }}>{step.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-title">Linked customer order</div>
                {so ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <div className="info-box-label">Customer order</div>
                        <div className="link" style={{ fontSize: 15, fontWeight: 700 }} onClick={() => goDetail('orders', so.id)}>{so.id}</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#334155', marginTop: 3 }}>{so.customerName}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{so.product}</div>
                      </div>
                      <span className={`badge ${so.status}`}>{so.status}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className="info-box">
                        <div className="info-box-label">Order value</div>
                        <div className="info-box-value">{fmt(soValue)}</div>
                      </div>
                      <div className="info-box">
                        <div className="info-box-label">Qty</div>
                        <div className="info-box-value">{so.qty} unit{so.qty > 1 ? 's' : ''}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-state" style={{ padding: '20px 0' }}>
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>No linked customer order</div>
                  </div>
                )}
              </div>

              {so && (
                <div className="card">
                  <div className="section-title">Margin preview</div>
                  <div className="margin-box">
                    <div className="margin-row"><span>Customer order value</span><span style={{ fontWeight: 600, color: '#0f172a' }}>{fmt(soValue)}</span></div>
                    <div className="margin-row"><span>Our cost to vendor</span><span style={{ fontWeight: 600, color: '#0f172a' }}>{fmt(selected.total)}</span></div>
                    <div className="margin-row">
                      <span>Gross margin</span>
                      <span className="margin-positive">{fmt(margin)} ({marginPct}%)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {modal && <Modal form={form} setForm={setForm} save={save} close={() => { setModal(false); setForm({}); }} title="Edit purchase order" fields={poFields} />}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1>Purchase orders</h1>
        <div className="topbar-actions">
          <input className="search" placeholder="Search POs..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="search" style={{ width: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            {statuses.map(s => <option key={s}>{s}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => { setForm({ status: 'Draft' }); setModal(true); }}>+ New PO</button>
        </div>
      </div>
      <div className="content">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total POs', val: pos.length },
            { label: 'Draft', val: pos.filter(p => p.status === 'Draft').length },
            { label: 'In transit', val: pos.filter(p => ['Ordered','Shipped'].includes(p.status)).length },
            { label: 'Received', val: pos.filter(p => p.status === 'Received').length },
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
                <th>PO</th>
                <th>Vendor</th>
                <th>Linked order</th>
                <th>Items</th>
                <th>Total cost</th>
                <th>Expected</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan="7">
                  <div className="empty-state">
                    <div className="empty-state-icon">🚚</div>
                    <div className="empty-state-title">No purchase orders found</div>
                  </div>
                </td></tr>
              )}
              {filtered.map(p => {
                const so = orders.find(o => o.id === p.relatedSO);
                return (
                  <tr key={p.id} onClick={() => setDetail(p.id)}>
                    <td style={{ fontWeight: 600, color: '#64748b', fontSize: 12 }}>{p.id}</td>
                    <td style={{ fontWeight: 600 }}>{p.vendorName || '—'}</td>
                    <td>
                      {so
                        ? <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 500 }}>{so.id} — {so.customerName}</span>
                        : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                      }
                    </td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{p.items?.slice(0, 25)}{p.items?.length > 25 ? '...' : ''}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(p.total)}</td>
                    <td style={{ color: '#94a3b8', fontSize: 12 }}>{p.expectedDate || '—'}</td>
                    <td><span className={`badge ${p.status}`}>{p.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {modal && <Modal form={form} setForm={setForm} save={save} close={() => { setModal(false); setForm({}); }} title="New purchase order" fields={poFields} />}
    </div>
  );
}