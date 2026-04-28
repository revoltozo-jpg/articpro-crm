// PurchaseOrdersV2 — extends the legacy PO module with vendor acknowledgment
// tracking (per the swimlane: Issue Vendor PO -> Vendor Acknowledgment ->
// Update Lead Time / Ship Date), tracking number capture for shipped POs,
// and discrepancy flagging.

import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Modal, DeleteModal } from './Customers';
import { logOrderEvent } from '../lib/orderLifecycle';
import './Shared.css';

const ACK_STATES = ['Pending', 'Acknowledged', 'Discrepancy'];
const PO_STATUSES = ['Draft', 'Ordered', 'Shipped', 'Received'];

function AckBadge({ status }) {
  const colors = {
    Pending:      { bg: '#fef3c7', fg: '#92400e' },
    Acknowledged: { bg: '#dcfce7', fg: '#15803d' },
    Discrepancy:  { bg: '#fee2e2', fg: '#991b1b' },
  };
  const c = colors[status] || { bg: '#f1f5f9', fg: '#64748b' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4,
      background: c.bg, color: c.fg, letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{status || 'No ack'}</span>
  );
}

export default function PurchaseOrdersV2({ detail, setDetail, goDetail, perms }) {
  const [pos, setPOs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [ackModal, setAckModal] = useState(null);
  const [ackForm, setAckForm] = useState({});

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
      const parts = detail.split(':');
      if (parts[1] === 'vendor') {
        setForm({ vendorId: parts[2], status: 'Draft', vendorAckStatus: 'Pending' });
      } else {
        const soId = parts[1];
        const so = orders.find(o => o.id === soId);
        setForm({ relatedSO: soId, items: so ? so.product + ' x' + so.qty : '', status: 'Draft', vendorAckStatus: 'Pending' });
      }
      setModal(true);
      setDetail(null);
    }
  }, [detail, orders]); // eslint-disable-line

  const selected = detail && !detail?.startsWith('new:') ? pos.find(p => p.id === detail) : null;
  const canSeeMoney = perms?.canViewFinancials;

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
      // Track ESD changes for audit history
      const original = pos.find(p => p.id === id);
      const dateChanged = original && (
        (original.vendorCommitDate || '') !== (rest.vendorCommitDate || '') ||
        (original.expectedDate || '') !== (rest.expectedDate || '')
      );
      if (dateChanged) {
        const history = Array.isArray(original.esdHistory) ? [...original.esdHistory] : [];
        history.push({
          changedAt: new Date().toISOString(),
          previousCommit: original.vendorCommitDate || '',
          newCommit: rest.vendorCommitDate || '',
          previousExpected: original.expectedDate || '',
          newExpected: rest.expectedDate || '',
          source: 'manual',
        });
        rest.esdHistory = history;
      }
      await updateDoc(doc(db, 'purchase_orders', id), rest);
      if (data.relatedSO) {
        await logOrderEvent(data.relatedSO, 'po_edited', `PO ${data.id.slice(0,8)} updated${dateChanged ? ' (ESD changed)' : ''}`);
      }
    } else {
      const docRef = await addDoc(collection(db, 'purchase_orders'), {
        ...data,
        status: data.status || 'Draft',
        vendorAckStatus: data.vendorAckStatus || 'Pending',
        esdHistory: [],
      });
      if (data.relatedSO) {
        const soRef = orders.find(o => o.id === data.relatedSO);
        if (soRef) {
          await updateDoc(doc(db, 'orders', data.relatedSO), {
            vendorPO: docRef.id,
            status: 'In Procurement',
          });
          await logOrderEvent(data.relatedSO, 'po_issued', `Vendor PO issued to ${data.vendorName}`);
        }
      }
    }
    setModal(false); load();
  };

  const deleteRecord = async (p) => {
    await deleteDoc(doc(db, 'purchase_orders', p.id));
    if (p.relatedSO) {
      await updateDoc(doc(db, 'orders', p.relatedSO), { vendorPO: '' });
      await logOrderEvent(p.relatedSO, 'po_deleted', `PO ${p.id} deleted`);
    }
    setDeleteConfirm(null);
    setDetail(null);
    load();
  };

  const recordAck = async () => {
    const p = ackModal;
    const newCommit = ackForm.commitDate || p.vendorCommitDate || '';
    const commitChanged = (p.vendorCommitDate || '') !== newCommit;
    const patch = {
      vendorAckStatus: ackForm.status || 'Acknowledged',
      vendorAckDate: ackForm.date || new Date().toISOString().slice(0, 10),
      vendorCommitDate: newCommit,
      ackNotes: ackForm.notes || '',
    };
    if (commitChanged) {
      const history = Array.isArray(p.esdHistory) ? [...p.esdHistory] : [];
      history.push({
        changedAt: new Date().toISOString(),
        previousCommit: p.vendorCommitDate || '',
        newCommit,
        source: 'vendor_ack',
        notes: ackForm.notes || '',
      });
      patch.esdHistory = history;
    }
    if (ackForm.status === 'Acknowledged' && p.status === 'Draft') {
      patch.status = 'Ordered';
    }
    await updateDoc(doc(db, 'purchase_orders', p.id), patch);
    if (p.relatedSO) {
      const msg = ackForm.status === 'Discrepancy'
        ? `Vendor flagged discrepancy on ${p.id.slice(0,8)}: ${ackForm.notes || 'see PO'}`
        : `Vendor ${ackForm.status?.toLowerCase()} ${p.id.slice(0,8)}, commit ${patch.vendorCommitDate || 'n/a'}${commitChanged ? ' (changed)' : ''}`;
      await logOrderEvent(p.relatedSO, 'vendor_ack', msg);
    }
    setAckModal(null);
    setAckForm({});
    load();
  };

  const fmt = n => '$' + Number(n || 0).toLocaleString();

  const poFields = [
    { key: 'vendorId', label: 'Vendor', type: 'select', options: vendors.map(v => ({ value: v.id, label: v.name })) },
    { key: 'relatedSO', label: 'Linked sales order', type: 'select', options: [
      { value: '', label: '— None —' },
      ...orders.map(o => ({ value: o.id, label: `${o.id.slice(0, 8)} — ${o.customerName || ''} — ${(o.product || '').slice(0, 25)}` })),
    ]},
    { key: 'items', label: 'Items / description', type: 'text' },
    ...(canSeeMoney ? [{ key: 'total', label: 'Total cost ($)', type: 'number' }] : []),
    { key: 'orderDate', label: 'Order date', type: 'date' },
    { key: 'expectedDate', label: 'Expected delivery', type: 'date' },
    { key: 'status', label: 'PO status', type: 'select', options: PO_STATUSES.map(s => ({ value: s, label: s })) },
  ];

  if (selected) {
    const vendor = vendors.find(v => v.id === selected.vendorId);
    const so = orders.find(o => o.id === selected.relatedSO);
    const soValue = so ? Number(so.qty) * Number(so.unitPrice) : 0;
    const margin = soValue - Number(selected.total || 0);
    const marginPct = soValue > 0 ? Math.round(margin / soValue * 100) : 0;

    return (
      <div className="page">
        <div className="topbar">
          <div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>Vendor purchase order</div>
            <h1 style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {selected.id}
              <AckBadge status={selected.vendorAckStatus} />
            </h1>
          </div>
          <div className="topbar-actions">
            <span className="badge">{selected.status}</span>
            {perms.canEdit && !perms.salesOnly && <button className="btn" onClick={() => { setForm(selected); setModal(true); }}>Edit</button>}
            {perms.canEdit && !perms.salesOnly && (
              <button className="btn btn-primary" onClick={() => { setAckForm({ status: selected.vendorAckStatus || 'Pending', date: new Date().toISOString().slice(0,10), commitDate: selected.vendorCommitDate || '' }); setAckModal(selected); }}>
                Record vendor ack
              </button>
            )}
            {perms.canDelete && <button className="btn" style={{ color: '#ef4444', borderColor: '#fecaca' }} onClick={() => setDeleteConfirm(selected)}>Delete</button>}
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
                <div className="detail-field"><label>Vendor lead time</label><p>{vendor?.leadTimeDays ? `${vendor.leadTimeDays} days` : '—'}</p></div>
                <div className="detail-field"><label>Items</label><p>{selected.items || '—'}</p></div>
                {canSeeMoney && (
                  <div className="detail-field">
                    <label>Total cost</label>
                    <p style={{ fontSize: 17, fontWeight: 700 }}>{fmt(selected.total)}</p>
                  </div>
                )}
                <div className="detail-field"><label>Order date</label><p>{selected.orderDate || '—'}</p></div>
                <div className="detail-field"><label>Expected delivery</label><p>{selected.expectedDate || '—'}</p></div>
                <div className="detail-field"><label>Vendor commit date</label><p>{selected.vendorCommitDate || '—'}</p></div>
              </div>
              {selected.ackNotes && (
                <div className="notes-box">
                  <strong>Ack notes:</strong> {selected.ackNotes}
                </div>
              )}

              {/* ESD change history */}
              {Array.isArray(selected.esdHistory) && selected.esdHistory.length > 0 && (
                <>
                  <div className="section-title" style={{ marginTop: 16 }}>Lead time / ESD changes</div>
                  <table className="tbl">
                    <thead><tr><th>When</th><th>Previous commit</th><th>New commit</th><th>Slip</th><th>Source</th></tr></thead>
                    <tbody>
                      {selected.esdHistory.map((h, i) => {
                        const slip = (h.previousCommit && h.newCommit) ? (new Date(h.newCommit) - new Date(h.previousCommit)) / (1000 * 60 * 60 * 24) : null;
                        return (
                          <tr key={i}>
                            <td style={{ fontSize: 11, color: '#64748b' }}>{h.changedAt ? new Date(h.changedAt).toLocaleString() : '—'}</td>
                            <td style={{ fontSize: 12 }}>{h.previousCommit || '—'}</td>
                            <td style={{ fontSize: 12, fontWeight: 600 }}>{h.newCommit || '—'}</td>
                            <td style={{ fontSize: 12, color: slip > 0 ? '#ef4444' : slip < 0 ? '#15803d' : '#64748b', fontWeight: 600 }}>
                              {slip === null ? '—' : `${slip > 0 ? '+' : ''}${slip}d`}
                            </td>
                            <td style={{ fontSize: 11, color: '#64748b' }}>{h.source === 'vendor_ack' ? 'Vendor ack' : 'Manual edit'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}

              {/* Tracking info */}
              <div className="section-title" style={{ marginTop: 16 }}>Shipment</div>
              {selected.trackingNumber ? (
                <div className="detail-grid">
                  <div className="detail-field"><label>Carrier</label><p>{selected.carrier || '—'}</p></div>
                  <div className="detail-field"><label>Tracking #</label><p style={{ color: '#1d4ed8', fontWeight: 600 }}>{selected.trackingNumber}</p></div>
                  <div className="detail-field"><label>Ship date</label><p>{selected.shipDate || '—'}</p></div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: '#94a3b8', padding: 8 }}>No shipment recorded yet.</div>
              )}
            </div>

            <div>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-title">Linked sales order</div>
                {so ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <div className="info-box-label">Sales order</div>
                        <div className="link" style={{ fontSize: 15, fontWeight: 700 }} onClick={() => goDetail('orders_v2', so.id)}>{so.id.slice(0, 8)}</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#334155', marginTop: 3 }}>{so.customerName}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{so.product}</div>
                      </div>
                      <span className="badge">{so.status}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {canSeeMoney && <div className="info-box"><div className="info-box-label">Order value</div><div className="info-box-value">{fmt(soValue)}</div></div>}
                      <div className="info-box"><div className="info-box-label">Promise</div><div className="info-box-value">{so.promiseDate || '—'}</div></div>
                    </div>
                  </>
                ) : (
                  <div className="empty-state" style={{ padding: '20px 0' }}><div style={{ fontSize: 13, color: '#94a3b8' }}>No linked sales order</div></div>
                )}
              </div>
              {so && canSeeMoney && (
                <div className="card">
                  <div className="section-title">Margin preview</div>
                  <div className="margin-box">
                    <div className="margin-row"><span>Order value</span><span style={{ fontWeight: 600 }}>{fmt(soValue)}</span></div>
                    <div className="margin-row"><span>Our cost</span><span style={{ fontWeight: 600 }}>{fmt(selected.total)}</span></div>
                    <div className="margin-row"><span>Gross margin</span><span className="margin-positive">{fmt(margin)} ({marginPct}%)</span></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {modal && <Modal form={form} setForm={setForm} save={save} close={() => { setModal(false); setForm({}); }} title="Edit purchase order" fields={poFields} />}
        {deleteConfirm && <DeleteModal title="Delete PO" message={`Delete ${deleteConfirm.id}? Linked sales order will be unlinked.`} onConfirm={() => deleteRecord(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />}
        {ackModal && (
          <Modal
            form={ackForm} setForm={setAckForm} save={recordAck}
            close={() => { setAckModal(null); setAckForm({}); }}
            title="Record vendor acknowledgment"
            fields={[
              { key: 'status', label: 'Ack status', type: 'select', options: ACK_STATES.map(s => ({ value: s, label: s })) },
              { key: 'date', label: 'Ack date', type: 'date' },
              { key: 'commitDate', label: 'Vendor commit date', type: 'date' },
              { key: 'notes', label: 'Notes / discrepancies', type: 'textarea' },
            ]}
          />
        )}
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
            {PO_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          {perms.canCreate && !perms.salesOnly && <button className="btn btn-primary" onClick={() => { setForm({ status: 'Draft', vendorAckStatus: 'Pending' }); setModal(true); }}>+ New PO</button>}
        </div>
      </div>
      <div className="content">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total POs', val: pos.length },
            { label: 'Awaiting ack', val: pos.filter(p => (p.vendorAckStatus || 'Pending') === 'Pending').length },
            { label: 'In transit', val: pos.filter(p => ['Ordered','Shipped'].includes(p.status)).length },
            { label: 'Discrepancies', val: pos.filter(p => p.vendorAckStatus === 'Discrepancy').length },
          ].map(m => (
            <div key={m.label} className="metric"><div className="metric-label">{m.label}</div><div className="metric-val" style={{ color: m.label === 'Discrepancies' && m.val ? '#ef4444' : '#0f172a' }}>{m.val}</div></div>
          ))}
        </div>
        <div className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th>PO</th>
                <th>Vendor</th>
                <th>Linked SO</th>
                <th>Items</th>
                {canSeeMoney && <th>Total</th>}
                <th>Vendor ack</th>
                <th>Commit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={canSeeMoney ? 8 : 7}>
                  <div className="empty-state"><div className="empty-state-icon">🚚</div><div className="empty-state-title">No purchase orders found</div></div>
                </td></tr>
              )}
              {filtered.map(p => {
                const so = orders.find(o => o.id === p.relatedSO);
                return (
                  <tr key={p.id} onClick={() => setDetail(p.id)}>
                    <td style={{ fontWeight: 600, color: '#64748b', fontSize: 12 }}>{p.id.slice(0, 8)}</td>
                    <td style={{ fontWeight: 600 }}>{p.vendorName || '—'}</td>
                    <td>{so ? <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 500 }}>{so.id.slice(0, 8)} — {so.customerName}</span> : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}</td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{(p.items || '').slice(0, 25)}{(p.items || '').length > 25 ? '...' : ''}</td>
                    {canSeeMoney && <td style={{ fontWeight: 600 }}>{fmt(p.total)}</td>}
                    <td><AckBadge status={p.vendorAckStatus || 'Pending'} /></td>
                    <td style={{ color: '#94a3b8', fontSize: 12 }}>{p.vendorCommitDate || p.expectedDate || '—'}</td>
                    <td><span className="badge">{p.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {modal && <Modal form={form} setForm={setForm} save={save} close={() => { setModal(false); setForm({}); }} title="New purchase order" fields={poFields} />}
      {deleteConfirm && <DeleteModal title="Delete PO" message={`Delete ${deleteConfirm.id}?`} onConfirm={() => deleteRecord(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} />}
    </div>
  );
}
