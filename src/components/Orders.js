import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Modal, DeleteModal } from './Customers';
import './Shared.css';

export default function Orders({ detail, setDetail, goDetail, isAdmin }) {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [pos, setPOs] = useState([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({});
  const [filterStatus, setFilterStatus] = useState('');

  const load = async () => {
    const [os, cs, ps] = await Promise.all([
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'customers')),
      getDocs(collection(db, 'purchase_orders')),
    ]);
    setOrders(os.docs.map(d => ({ id: d.id, ...d.data() })));
    setCustomers(cs.docs.map(d => ({ id: d.id, ...d.data() })));
    setPOs(ps.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (detail === null) load(); }, [detail]);

  const selected = detail ? orders.find(o => o.id === detail) : null;

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q || o.id?.toLowerCase().includes(q) || o.product?.toLowerCase().includes(q) || o.customerName?.toLowerCase().includes(q);
    const matchStatus = !filterStatus || o.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const openForm = (o = {}) => { setForm(o); setModal(true); };

  const save = async () => {
    const data = { ...form };
    const customer = customers.find(c => c.id === data.customerId);
    data.customerName = customer ? customer.name : '';
    data.qty = Number(data.qty) || 1;
    data.unitPrice = Number(data.unitPrice) || 0;
    if (data.id) {
      const { id, ...rest } = data;
      await updateDoc(doc(db, 'orders', id), rest);
    } else {
      await addDoc(collection(db, 'orders'), { ...data, status: data.status || 'Quoted', vendorPO: '' });
    }
    setModal(false); load();
  };

  const deleteRecord = async (o) => {
    await deleteDoc(doc(db, 'orders', o.id));
    setDeleteConfirm(null);
    setDetail(null);
    load();
  };

  const fmt = n => '$' + Number(n).toLocaleString();

  const orderFields = [
    { key: 'customerId', label: 'Customer', type: 'select', options: customers.map(c => ({ value: c.id, label: c.name })) },
    { key: 'product', label: 'Product / unit model', type: 'text' },
    { key: 'qty', label: 'Quantity', type: 'number' },
    { key: 'unitPrice', label: 'Unit price ($)', type: 'number' },
    { key: 'date', label: 'Order date', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: [
      { value: 'Quoted', label: 'Quoted' },
      { value: 'Pending', label: 'Pending' },
      { value: 'In Progress', label: 'In Progress' },
      { value: 'Active', label: 'Active' },
      { value: 'Delivered', label: 'Delivered' },
      { value: 'On Hold', label: 'On Hold' },
    ]},
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];

  const statuses = ['Quoted', 'Pending', 'In Progress', 'Active', 'Delivered', 'On Hold'];

  if (selected) {
    const po = pos.find(p => p.relatedSO === selected.id);
    const totalValue = Number(selected.qty) * Number(selected.unitPrice);

    return (
      <div className="page">
        <div className="topbar">
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>Customer order</div>
            <h1>{selected.id || 'Order detail'}</h1>
          </div>
          <div className="topbar-actions">
            <span className={`badge ${selected.status}`}>{selected.status}</span>
            <button className="btn" onClick={() => openForm(selected)}>Edit order</button>
            {!po && <button className="btn btn-primary" onClick={() => goDetail('purchase_orders', 'new:' + selected.id)}>+ Create vendor PO</button>}
            {isAdmin && <button className="btn" style={{ color: '#ef4444', borderColor: '#fecaca' }} onClick={() => setDeleteConfirm(selected)}>Delete</button>}
          </div>
        </div>
        <div className="content">
          <button className="back-btn" onClick={() => setDetail(null)}>← Back to orders</button>
          <div className="two-col" style={{ marginBottom: 20 }}>
            <div className="card">
              <div className="section-title">Order information</div>
              <div className="detail-grid">
                <div className="detail-field">
                  <label>Customer</label>
                  <p className="link" onClick={() => goDetail('customers', selected.customerId)}>{selected.customerName || '—'}</p>
                </div>
                <div className="detail-field"><label>Order date</label><p>{selected.date || '—'}</p></div>
                <div className="detail-field"><label>Product / model</label><p>{selected.product || '—'}</p></div>
                <div className="detail-field"><label>Quantity</label><p>{selected.qty} unit{selected.qty > 1 ? 's' : ''}</p></div>
                <div className="detail-field"><label>Unit price</label><p>{fmt(selected.unitPrice)}</p></div>
                <div className="detail-field">
                  <label>Total value</label>
                  <p style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{fmt(totalValue)}</p>
                </div>
              </div>
              {selected.notes && <div className="notes-box">{selected.notes}</div>}
            </div>
            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-title">Fulfillment status</div>
                {po ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <div className="info-box-label">Purchase order</div>
                        <div className="link" style={{ fontSize: 15, fontWeight: 700 }} onClick={() => goDetail('purchase_orders', po.id)}>{po.id}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{po.vendorName}</div>
                      </div>
                      <span className={`badge ${po.status}`}>{po.status}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className="info-box">
                        <div className="info-box-label">PO cost</div>
                        <div className="info-box-value">{fmt(po.total)}</div>
                      </div>
                      <div className="info-box">
                        <div className="info-box-label">Expected delivery</div>
                        <div className="info-box-value">{po.expectedDate || '—'}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>📦</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>No vendor PO yet</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>Create a purchase order to start fulfilling this order</div>
                    <button className="btn btn-primary" onClick={() => goDetail('purchase_orders', 'new:' + selected.id)}>+ Create vendor PO</button>
                  </div>
                )}
              </div>
              {po && (
                <div className="card">
                  <div className="section-title">Margin preview</div>
                  <div className="margin-box">
                    <div className="margin-row"><span>Customer order value</span><span style={{ fontWeight: 600, color: '#0f172a' }}>{fmt(totalValue)}</span></div>
                    <div className="margin-row"><span>Vendor PO cost</span><span style={{ fontWeight: 600, color: '#0f172a' }}>{fmt(po.total)}</span></div>
                    <div className="margin-row">
                      <span>Gross margin</span>
                      <span className="margin-positive">{fmt(totalValue - po.total)} ({Math.round((totalValue - po.total) / totalValue * 100)}%)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="section-title">Order timeline</div>
            <div style={{ display: 'flex', gap: 0 }}>
              {[
                { label: 'Quoted', done: true },
                { label: 'Confirmed', done: ['Pending','In Progress','Active','Delivered'].includes(selected.status) },
                { label: 'PO issued', done: !!po },
                { label: 'Shipped', done: po && ['Shipped','Received'].includes(po.status) },
                { label: 'Delivered', done: selected.status === 'Delivered' },
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
        </div>
        {modal && <Modal form={form} setForm={setForm} save={save} close={() => setModal(false)} title="Edit order" fields={orderFields} />}
        {deleteConfirm && <DeleteModal title="Delete order" message={`Are you sure you want to delete order ${deleteConfirm.id}? This cannot be undone.`} onConfirm={() => deleteRecord(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1>Customer orders</h1>
        <div className="topbar-actions">
          <input className="search" placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="search" style={{ width: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            {statuses.map(s => <option key={s}>{s}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => openForm()}>+ New order</button>
        </div>
      </div>
      <div className="content">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total orders', val: orders.length },
            { label: 'Quoted', val: orders.filter(o => o.status === 'Quoted').length },
            { label: 'In progress', val: orders.filter(o => o.status === 'In Progress').length },
            { label: 'No vendor PO', val: orders.filter(o => ['Pending','In Progress'].includes(o.status) && !o.vendorPO).length },
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
                <th>Customer</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Value</th>
                <th>Date</th>
                <th>Vendor PO</th>
                <th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan="8">
                  <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <div className="empty-state-title">No orders found</div>
                  </div>
                </td></tr>
              )}
              {filtered.map(o => {
                const po = pos.find(p => p.relatedSO === o.id);
                return (
                  <tr key={o.id} onClick={() => setDetail(o.id)}>
                    <td style={{ fontWeight: 600 }}>{o.customerName || '—'}</td>
                    <td style={{ color: '#64748b' }}>{o.product?.slice(0, 28)}{o.product?.length > 28 ? '...' : ''}</td>
                    <td>{o.qty}</td>
                    <td style={{ fontWeight: 600 }}>${(Number(o.qty) * Number(o.unitPrice)).toLocaleString()}</td>
                    <td style={{ color: '#94a3b8', fontSize: 12 }}>{o.date || '—'}</td>
                    <td>
                      {po
                        ? <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 500 }}>{po.id}</span>
                        : <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 500 }}>⚠ None</span>
                      }
                    </td>
                    <td><span className={`badge ${o.status}`}>{o.status}</span></td>
                    {isAdmin && (
                      <td onClick={e => e.stopPropagation()}>
                        <button className="btn" style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: '#fecaca' }} onClick={() => setDeleteConfirm(o)}>Delete</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {modal && <Modal form={form} setForm={setForm} save={save} close={() => setModal(false)} title="New customer order" fields={orderFields} />}
      {deleteConfirm && <DeleteModal title="Delete order" message={`Are you sure you want to delete order ${deleteConfirm.id}? This cannot be undone.`} onConfirm={() => deleteRecord(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />}
    </div>
  );
}