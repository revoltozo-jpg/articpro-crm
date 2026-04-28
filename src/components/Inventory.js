// Inventory — SKU-level stock tracking.
// On-hand is manually maintained (or imported). Reserved qty is computed from
// warehouse-routed orders that are not yet delivered. Incoming qty is computed
// from open vendor POs that reference the SKU. Available = OnHand - Reserved.
//
// Stock adjustments are recorded as separate documents in `inventory_adjustments`
// for an audit trail. We never silently rewrite on-hand counts without logging.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Modal, DeleteModal } from './Customers';
import './Shared.css';

const ADJUSTMENT_REASONS = [
  'Cycle count',
  'Received from vendor',
  'Shipped to customer',
  'Damage / write-off',
  'Manual correction',
  'Other',
];

function StatusPill({ low, out }) {
  if (out) return <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', textTransform: 'uppercase' }}>Out of stock</span>;
  if (low) return <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4, background: '#fef3c7', color: '#92400e', textTransform: 'uppercase' }}>Low stock</span>;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4, background: '#dcfce7', color: '#15803d', textTransform: 'uppercase' }}>OK</span>;
}

export default function Inventory({ detail, setDetail, perms }) {
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [pos, setPOs] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [adjModal, setAdjModal] = useState(null);
  const [adjForm, setAdjForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = async () => {
    const [is, os, ps, as] = await Promise.all([
      getDocs(collection(db, 'inventory')),
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'purchase_orders')),
      getDocs(collection(db, 'inventory_adjustments')).catch(() => ({ docs: [] })),
    ]);
    setItems(is.docs.map(d => ({ id: d.id, ...d.data() })));
    setOrders(os.docs.map(d => ({ id: d.id, ...d.data() })));
    setPOs(ps.docs.map(d => ({ id: d.id, ...d.data() })));
    setAdjustments(as.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { load(); }, []);

  // Compute reserved/incoming per SKU. Match by SKU code OR by product name string.
  const computed = useMemo(() => {
    return items.map(item => {
      const matchKey = (text) => {
        if (!text) return false;
        const t = String(text).toLowerCase();
        return (item.sku && t.includes(String(item.sku).toLowerCase()))
          || (item.name && t.includes(String(item.name).toLowerCase()));
      };
      const reserved = orders
        .filter(o => o.route === 'warehouse')
        .filter(o => o.status !== 'Delivered' && o.status !== 'Closed')
        .filter(o => matchKey(o.product))
        .reduce((s, o) => s + Number(o.qty || 0), 0);
      const incoming = pos
        .filter(p => p.status !== 'Received')
        .filter(p => matchKey(p.items))
        .reduce((s, p) => s + Number(p.qty || 1), 0);
      const onHand = Number(item.onHand || 0);
      const available = Math.max(0, onHand - reserved);
      const min = Number(item.minStock || 0);
      const out = available <= 0;
      const low = !out && min > 0 && available < min;
      return { ...item, reserved, incoming, available, low, out };
    });
  }, [items, orders, pos]);

  const filtered = computed.filter(i => {
    const q = search.toLowerCase();
    const matchSearch = !q || i.sku?.toLowerCase().includes(q) || i.name?.toLowerCase().includes(q) || i.location?.toLowerCase().includes(q);
    const matchFilter = !filter
      || (filter === 'low' && i.low)
      || (filter === 'out' && i.out)
      || (filter === 'ok' && !i.low && !i.out);
    return matchSearch && matchFilter;
  });

  const counts = {
    total: computed.length,
    low: computed.filter(i => i.low).length,
    out: computed.filter(i => i.out).length,
    reserved: computed.reduce((s, i) => s + i.reserved, 0),
    incoming: computed.reduce((s, i) => s + i.incoming, 0),
  };

  const selected = detail ? computed.find(i => i.id === detail) : null;
  const itemAdjustments = selected ? adjustments.filter(a => a.itemId === selected.id).sort((a, b) => (b.date || '').localeCompare(a.date || '')) : [];

  const itemFields = [
    { key: 'sku', label: 'SKU / part number', type: 'text' },
    { key: 'name', label: 'Description', type: 'text' },
    { key: 'category', label: 'Category', type: 'text' },
    { key: 'location', label: 'Warehouse location', type: 'text' },
    { key: 'onHand', label: 'On-hand quantity', type: 'number' },
    { key: 'minStock', label: 'Minimum stock threshold', type: 'number' },
    { key: 'unitCost', label: perms?.canViewFinancials ? 'Unit cost ($)' : '', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ].filter(f => f.label);

  const save = async () => {
    const data = { ...form };
    data.onHand = Number(data.onHand) || 0;
    data.minStock = Number(data.minStock) || 0;
    data.unitCost = Number(data.unitCost) || 0;
    if (data.id) {
      const { id, ...rest } = data;
      await updateDoc(doc(db, 'inventory', id), rest);
    } else {
      await addDoc(collection(db, 'inventory'), data);
    }
    setModal(false); setForm({}); load();
  };

  const recordAdjustment = async () => {
    if (!adjModal) return;
    const delta = Number(adjForm.delta) || 0;
    if (delta === 0) { setAdjModal(null); return; }
    const before = Number(adjModal.onHand || 0);
    const after = before + delta;
    await addDoc(collection(db, 'inventory_adjustments'), {
      itemId: adjModal.id,
      sku: adjModal.sku,
      delta,
      before,
      after,
      reason: adjForm.reason || 'Manual correction',
      notes: adjForm.notes || '',
      date: new Date().toISOString().slice(0, 10),
      userEmail: auth.currentUser?.email || 'system',
      timestamp: serverTimestamp(),
    });
    await updateDoc(doc(db, 'inventory', adjModal.id), { onHand: after });
    setAdjModal(null); setAdjForm({}); load();
  };

  const deleteItem = async (i) => {
    await deleteDoc(doc(db, 'inventory', i.id));
    setDeleteConfirm(null); setDetail(null); load();
  };

  // ---------- DETAIL VIEW ----------
  if (selected) {
    return (
      <div className="page">
        <div className="topbar">
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>Inventory item</div>
            <h1 style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {selected.sku || selected.name}
              <StatusPill low={selected.low} out={selected.out} />
            </h1>
          </div>
          <div className="topbar-actions">
            {perms.canEdit && <button className="btn" onClick={() => { setForm(selected); setModal(true); }}>Edit</button>}
            {perms.canEdit && <button className="btn btn-primary" onClick={() => { setAdjForm({ delta: 0, reason: 'Cycle count' }); setAdjModal(selected); }}>Adjust stock</button>}
            {perms.canDelete && <button className="btn" style={{ color: '#ef4444', borderColor: '#fecaca' }} onClick={() => setDeleteConfirm(selected)}>Delete</button>}
          </div>
        </div>

        <div className="content">
          <button className="back-btn" onClick={() => setDetail(null)}>← Back to inventory</button>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <div className="metric"><div className="metric-label">On hand</div><div className="metric-val">{selected.onHand || 0}</div></div>
            <div className="metric"><div className="metric-label">Reserved</div><div className="metric-val" style={{ color: selected.reserved ? '#92400e' : '#0f172a' }}>{selected.reserved}</div></div>
            <div className="metric"><div className="metric-label">Available</div><div className="metric-val" style={{ color: selected.out ? '#ef4444' : selected.low ? '#92400e' : '#15803d' }}>{selected.available}</div></div>
            <div className="metric"><div className="metric-label">Incoming</div><div className="metric-val" style={{ color: selected.incoming ? '#0e7490' : '#0f172a' }}>{selected.incoming}</div></div>
          </div>

          <div className="two-col" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="section-title">Item details</div>
              <div className="detail-grid">
                <div className="detail-field"><label>SKU</label><p>{selected.sku || '—'}</p></div>
                <div className="detail-field"><label>Description</label><p>{selected.name || '—'}</p></div>
                <div className="detail-field"><label>Category</label><p>{selected.category || '—'}</p></div>
                <div className="detail-field"><label>Location</label><p>{selected.location || '—'}</p></div>
                <div className="detail-field"><label>Min stock</label><p>{selected.minStock || '—'}</p></div>
                {perms?.canViewFinancials && <div className="detail-field"><label>Unit cost</label><p>${Number(selected.unitCost || 0).toLocaleString()}</p></div>}
              </div>
              {selected.notes && <div className="notes-box">{selected.notes}</div>}
            </div>
            <div className="card">
              <div className="section-title">Stock formula</div>
              <div style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 2, color: '#475569' }}>
                <div>On hand: <strong style={{ color: '#0f172a' }}>{selected.onHand}</strong></div>
                <div>− Reserved (orders): <strong style={{ color: '#92400e' }}>{selected.reserved}</strong></div>
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 6, marginTop: 6 }}>
                  = Available: <strong style={{ color: selected.out ? '#ef4444' : selected.low ? '#92400e' : '#15803d', fontSize: 16 }}>{selected.available}</strong>
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: '#64748b' }}>
                  Incoming from open POs: <strong style={{ color: '#0e7490' }}>{selected.incoming}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="section-title">Adjustment history</div>
            {itemAdjustments.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 12 }}>No adjustments recorded.</div>
            ) : (
              <table className="tbl">
                <thead><tr><th>Date</th><th>Reason</th><th>Δ</th><th>Before</th><th>After</th><th>Notes</th><th>User</th></tr></thead>
                <tbody>
                  {itemAdjustments.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontSize: 12 }}>{a.date}</td>
                      <td style={{ fontWeight: 600 }}>{a.reason}</td>
                      <td style={{ fontWeight: 700, color: a.delta > 0 ? '#15803d' : '#ef4444' }}>{a.delta > 0 ? '+' : ''}{a.delta}</td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>{a.before}</td>
                      <td style={{ fontSize: 12, fontWeight: 600 }}>{a.after}</td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>{a.notes || '—'}</td>
                      <td style={{ fontSize: 11, color: '#64748b' }}>{a.userEmail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {modal && <Modal form={form} setForm={setForm} save={save} close={() => setModal(false)} title="Edit item" fields={itemFields} />}
        {deleteConfirm && <DeleteModal title="Delete item" message={`Delete ${deleteConfirm.sku || deleteConfirm.name}?`} onConfirm={() => deleteItem(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />}
        {adjModal && (
          <Modal form={adjForm} setForm={setAdjForm} save={recordAdjustment}
            close={() => { setAdjModal(null); setAdjForm({}); }}
            title={`Adjust stock — ${adjModal.sku || adjModal.name}`}
            fields={[
              { key: 'delta', label: 'Quantity change (+ or −)', type: 'number' },
              { key: 'reason', label: 'Reason', type: 'select', options: ADJUSTMENT_REASONS.map(r => ({ value: r, label: r })) },
              { key: 'notes', label: 'Notes', type: 'textarea' },
            ]} />
        )}
      </div>
    );
  }

  // ---------- LIST VIEW ----------
  return (
    <div className="page">
      <div className="topbar">
        <h1>Inventory</h1>
        <div className="topbar-actions">
          <input className="search" placeholder="Search SKU, description, location..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="search" style={{ width: 130 }} value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">All</option>
            <option value="ok">OK</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
          {perms.canCreate && <button className="btn btn-primary" onClick={() => { setForm({}); setModal(true); }}>+ New item</button>}
        </div>
      </div>

      <div className="content">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 20 }}>
          <div className="metric"><div className="metric-label">SKUs</div><div className="metric-val">{counts.total}</div></div>
          <div className="metric"><div className="metric-label">Low stock</div><div className="metric-val" style={{ color: counts.low ? '#92400e' : '#0f172a' }}>{counts.low}</div></div>
          <div className="metric"><div className="metric-label">Out of stock</div><div className="metric-val" style={{ color: counts.out ? '#ef4444' : '#0f172a' }}>{counts.out}</div></div>
          <div className="metric"><div className="metric-label">Total reserved</div><div className="metric-val">{counts.reserved}</div></div>
          <div className="metric"><div className="metric-label">Total incoming</div><div className="metric-val" style={{ color: '#0e7490' }}>{counts.incoming}</div></div>
        </div>

        <div className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Description</th>
                <th>Location</th>
                <th>On hand</th>
                <th>Reserved</th>
                <th>Available</th>
                <th>Incoming</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan="8"><div className="empty-state">
                  <div className="empty-state-icon">📦</div>
                  <div className="empty-state-title">No items</div>
                </div></td></tr>
              )}
              {filtered.map(i => (
                <tr key={i.id} onClick={() => setDetail(i.id)}>
                  <td style={{ fontWeight: 700, fontSize: 12 }}>{i.sku || '—'}</td>
                  <td style={{ fontWeight: 500 }}>{(i.name || '').slice(0, 50)}</td>
                  <td style={{ fontSize: 12, color: '#64748b' }}>{i.location || '—'}</td>
                  <td style={{ fontWeight: 600 }}>{i.onHand || 0}</td>
                  <td style={{ color: i.reserved ? '#92400e' : '#94a3b8', fontWeight: i.reserved ? 600 : 400 }}>{i.reserved}</td>
                  <td style={{ color: i.out ? '#ef4444' : i.low ? '#92400e' : '#15803d', fontWeight: 700 }}>{i.available}</td>
                  <td style={{ color: i.incoming ? '#0e7490' : '#94a3b8', fontWeight: i.incoming ? 600 : 400 }}>{i.incoming}</td>
                  <td><StatusPill low={i.low} out={i.out} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <Modal form={form} setForm={setForm} save={save} close={() => { setModal(false); setForm({}); }} title={form.id ? 'Edit item' : 'New inventory item'} fields={itemFields} />}
      {deleteConfirm && <DeleteModal title="Delete item" message={`Delete ${deleteConfirm.sku || deleteConfirm.name}?`} onConfirm={() => deleteItem(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />}
    </div>
  );
}
