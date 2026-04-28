// OrdersV2 — replaces the legacy Orders list with a lifecycle-aware view.
// Tabs separate Quotes / Active / Blocked / Closed using the buckets defined
// in lib/orderLifecycle. Detail view is delegated to OrderDetail.

import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Modal } from './Customers';
import OrderDetail from './OrderDetail';
import {
  LIFECYCLE, LIFECYCLE_LIST, STATUS_GROUPS, STATUS_COLORS, HEALTH_COLORS,
  getDeliveryHealth, getStageInfo, normalizeStatus, logOrderEvent, ROUTE_LABELS,
  computeEstimatedDelivery,
} from '../lib/orderLifecycle';
import './Shared.css';

const TABS = [
  { key: 'quotes',  label: 'Quotes' },
  { key: 'active',  label: 'Active' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'closed',  label: 'Closed' },
  { key: 'all',     label: 'All' },
];

function MiniBadge({ status }) {
  const s = normalizeStatus(status);
  const c = STATUS_COLORS[s] || { bg: '#f1f5f9', fg: '#475569' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4,
      background: c.bg, color: c.fg, letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{s}</span>
  );
}

function MiniHealth({ order }) {
  const h = getDeliveryHealth(order);
  if (h === 'unknown') return null;
  const c = HEALTH_COLORS[h];
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
      background: c.bg, color: c.fg, marginLeft: 6,
    }}>{c.label}</span>
  );
}

export default function OrdersV2({ detail, setDetail, goDetail, perms }) {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [pos, setPOs] = useState([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('active');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});

  const load = async () => {
    const [os, cs, vs, ps] = await Promise.all([
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'customers')),
      getDocs(collection(db, 'vendors')),
      getDocs(collection(db, 'purchase_orders')),
    ]);
    setOrders(os.docs.map(d => ({ id: d.id, ...d.data() })));
    setCustomers(cs.docs.map(d => ({ id: d.id, ...d.data() })));
    setVendors(vs.docs.map(d => ({ id: d.id, ...d.data() })));
    setPOs(ps.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (detail === null) load(); }, [detail]);

  const selected = detail ? orders.find(o => o.id === detail) : null;
  const canSeeMoney = perms?.canViewFinancials;

  const inTab = (o) => {
    if (tab === 'all') return true;
    const bucket = STATUS_GROUPS[tab];
    if (!bucket) return false;
    return bucket.includes(normalizeStatus(o.status));
  };

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || o.id?.toLowerCase().includes(q)
      || o.product?.toLowerCase().includes(q)
      || o.customerName?.toLowerCase().includes(q)
      || o.customerPO?.toLowerCase().includes(q);
    return matchSearch && inTab(o);
  });

  const counts = {
    quotes:  orders.filter(o => STATUS_GROUPS.quotes.includes(normalizeStatus(o.status))).length,
    active:  orders.filter(o => STATUS_GROUPS.active.includes(normalizeStatus(o.status))).length,
    blocked: orders.filter(o => STATUS_GROUPS.blocked.includes(normalizeStatus(o.status))).length,
    closed:  orders.filter(o => STATUS_GROUPS.closed.includes(normalizeStatus(o.status))).length,
    all:     orders.length,
  };

  const openForm = (o = {}) => {
    setForm({
      status: LIFECYCLE.QUOTE,
      date: new Date().toISOString().slice(0, 10),
      qty: 1,
      ...o,
    });
    setModal(true);
  };

  const save = async () => {
    const data = { ...form };
    const customer = customers.find(c => c.id === data.customerId);
    data.customerName = customer ? customer.name : '';
    data.qty = Number(data.qty) || 1;
    data.unitPrice = Number(data.unitPrice) || 0;
    // Compute estimated delivery if a vendor is selected on the quote.
    if (data.eddVendorId) {
      const vendor = vendors.find(v => v.id === data.eddVendorId);
      data.estimatedDelivery = computeEstimatedDelivery(data.date, vendor?.leadTimeDays);
      data.eddVendorName = vendor ? vendor.name : '';
      data.eddVendorLeadDays = vendor?.leadTimeDays || 14;
    }
    if (data.id) {
      const { id, ...rest } = data;
      await updateDoc(doc(db, 'orders', id), rest);
      await logOrderEvent(id, 'edited', 'Order details updated');
    } else {
      const ref = await addDoc(collection(db, 'orders'), {
        ...data,
        status: data.status || LIFECYCLE.QUOTE,
        customerPOReceived: false,
        submittalsApproved: false,
        validationComplete: false,
        validation: {},
        route: '',
        isInternational: false,
        incoterm: '',
        issues: [],
        shipmentPlan: [],
        attachments: [],
      });
      await logOrderEvent(ref.id, 'created', `Quote created for ${data.customerName}${data.estimatedDelivery ? ` (EDD ${data.estimatedDelivery})` : ''}`);
    }
    setModal(false); load();
  };

  const newOrderFields = [
    { key: 'customerId', label: 'Customer', type: 'select', options: customers.map(c => ({ value: c.id, label: c.name })) },
    { key: 'product', label: 'Product / model', type: 'text' },
    { key: 'qty', label: 'Quantity', type: 'number' },
    ...(canSeeMoney ? [{ key: 'unitPrice', label: 'Unit price ($)', type: 'number' }] : []),
    { key: 'date', label: 'Quote date', type: 'date' },
    { key: 'eddVendorId', label: 'Vendor (for est. delivery)', type: 'select', options: [
      { value: '', label: '— No vendor selected —' },
      ...vendors.map(v => ({ value: v.id, label: `${v.name}${v.leadTimeDays ? ` (${v.leadTimeDays}d lead)` : ' (no lead time set)'}` })),
    ]},
    { key: 'promiseDate', label: 'Promise date to customer (optional)', type: 'date' },
    { key: 'quoteRef', label: 'Quote reference', type: 'text' },
    { key: 'projectContacts', label: 'Project contacts', type: 'textarea' },
    { key: 'specialNotes', label: 'Special notes', type: 'textarea' },
    { key: 'status', label: 'Initial status', type: 'select', options: LIFECYCLE_LIST.map(s => ({ value: s, label: s })) },
  ];

  if (selected) {
    return (
      <OrderDetail
        order={selected}
        customers={customers}
        vendors={vendors}
        perms={perms}
        onBack={() => setDetail(null)}
        goDetail={goDetail}
        refreshList={load}
      />
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1>Sales orders</h1>
        <div className="topbar-actions">
          <input className="search" placeholder="Search orders, customer, PO..." value={search} onChange={e => setSearch(e.target.value)} />
          {perms.canCreate && <button className="btn btn-primary" onClick={() => openForm()}>+ New quote</button>}
        </div>
      </div>

      <div className="content">
        {/* tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
          {TABS.map(t => (
            <div key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                color: tab === t.key ? '#1d4ed8' : '#64748b',
                borderBottom: tab === t.key ? '2px solid #1d4ed8' : '2px solid transparent',
                marginBottom: -1,
              }}>
              {t.label}
              <span style={{
                marginLeft: 8, fontSize: 11, padding: '1px 7px', borderRadius: 10,
                background: tab === t.key ? '#dbeafe' : '#f1f5f9',
                color: tab === t.key ? '#1d4ed8' : '#64748b', fontWeight: 700,
              }}>{counts[t.key]}</span>
            </div>
          ))}
        </div>

        {/* metric strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          <div className="metric"><div className="metric-label">Awaiting PO</div><div className="metric-val">{orders.filter(o => normalizeStatus(o.status) === LIFECYCLE.AWAITING_PO || (!o.customerPOReceived && normalizeStatus(o.status) === LIFECYCLE.QUOTE)).length}</div></div>
          <div className="metric"><div className="metric-label">Awaiting submittals</div><div className="metric-val">{orders.filter(o => normalizeStatus(o.status) === LIFECYCLE.AWAITING_SUBMITTALS).length}</div></div>
          <div className="metric"><div className="metric-label">In transit</div><div className="metric-val">{orders.filter(o => normalizeStatus(o.status) === LIFECYCLE.IN_TRANSIT).length}</div></div>
          <div className="metric"><div className="metric-label">Open issues</div><div className="metric-val" style={{ color: orders.some(o => (o.issues || []).some(i => !i.resolved)) ? '#ef4444' : '#0f172a' }}>{orders.filter(o => (o.issues || []).some(i => !i.resolved)).length}</div></div>
        </div>

        <div className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Qty</th>
                {canSeeMoney && <th>Value</th>}
                <th>Promise</th>
                <th>ETA</th>
                <th>Route</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={canSeeMoney ? 9 : 8}>
                  <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <div className="empty-state-title">No orders in this view</div>
                  </div>
                </td></tr>
              )}
              {filtered.map(o => {
                const linked = pos.filter(p => p.relatedSO === o.id);
                const { blockedAt } = getStageInfo(o, linked);
                return (
                  <tr key={o.id} onClick={() => setDetail(o.id)}>
                    <td style={{ fontWeight: 600, fontSize: 12, color: '#475569' }}>
                      {o.id?.slice(0, 8)}
                      {blockedAt && <span title="Blocked" style={{ marginLeft: 6, color: '#ef4444' }}>⚠</span>}
                    </td>
                    <td style={{ fontWeight: 600 }}>{o.customerName || '—'}</td>
                    <td style={{ color: '#64748b' }}>{(o.product || '').slice(0, 32)}{(o.product || '').length > 32 ? '...' : ''}</td>
                    <td>{o.qty}</td>
                    {canSeeMoney && <td style={{ fontWeight: 600 }}>${(Number(o.qty) * Number(o.unitPrice)).toLocaleString()}</td>}
                    <td style={{ color: '#94a3b8', fontSize: 12 }}>{o.promiseDate || '—'}</td>
                    <td style={{ color: '#94a3b8', fontSize: 12 }}>{o.eta || o.plannedShipDate || (normalizeStatus(o.status) === LIFECYCLE.QUOTE && o.estimatedDelivery ? <span style={{ color: '#1d4ed8' }}>EDD {o.estimatedDelivery}</span> : '—')}</td>
                    <td style={{ fontSize: 11, color: '#64748b' }}>{o.route ? ROUTE_LABELS[o.route] : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td><MiniBadge status={o.status} /><MiniHealth order={o} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal
          form={form} setForm={setForm} save={save}
          close={() => setModal(false)}
          title={form.id ? 'Edit order' : 'New quote'}
          fields={newOrderFields}
        />
      )}
    </div>
  );
}
