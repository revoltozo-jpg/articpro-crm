// ReportsV2 — operational analytics that replace gut-feel decisions.
// Four reports in tabs: Vendor performance, Customer on-time, Pipeline,
// Inventory snapshot. Each is a real computation across collections, not
// a placeholder.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import {
  isOrderOnTime, daysBetween, normalizeStatus, LIFECYCLE, vendorPOIsLate,
} from '../lib/orderLifecycle';
import './Shared.css';

const today = () => new Date().toISOString().slice(0, 10);

function PercentBar({ value, color }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div style={{ position: 'relative', background: '#f1f5f9', borderRadius: 4, height: 8, width: 100 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color || '#1d4ed8', borderRadius: 4 }} />
    </div>
  );
}

const TABS = [
  { key: 'vendors',   label: 'Vendor performance' },
  { key: 'customers', label: 'Customer on-time' },
  { key: 'pipeline',  label: 'Pipeline' },
  { key: 'inventory', label: 'Inventory snapshot' },
];

export default function ReportsV2({ perms }) {
  const [tab, setTab] = useState('vendors');
  const [orders, setOrders] = useState([]);
  const [pos, setPOs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [inventory, setInventory] = useState([]);
  const canSeeMoney = perms?.canViewFinancials;

  const load = async () => {
    const [os, ps, vs, cs, is] = await Promise.all([
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'purchase_orders')),
      getDocs(collection(db, 'vendors')),
      getDocs(collection(db, 'customers')),
      getDocs(collection(db, 'inventory')).catch(() => ({ docs: [] })),
    ]);
    setOrders(os.docs.map(d => ({ id: d.id, ...d.data() })));
    setPOs(ps.docs.map(d => ({ id: d.id, ...d.data() })));
    setVendors(vs.docs.map(d => ({ id: d.id, ...d.data() })));
    setCustomers(cs.docs.map(d => ({ id: d.id, ...d.data() })));
    setInventory(is.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { load(); }, []);

  // ----------- Vendor performance -----------
  const vendorPerf = useMemo(() => {
    return vendors.map(v => {
      const myPOs = pos.filter(p => p.vendorId === v.id);
      const completed = myPOs.filter(p => p.status === 'Received' || p.status === 'Shipped');
      const slips = completed.map(p => {
        const target = p.vendorCommitDate || p.expectedDate;
        const actual = p.shipDate || p.actualReceivedDate;
        if (!target || !actual) return null;
        return daysBetween(target, actual);
      }).filter(x => x !== null);
      const avgSlip = slips.length ? slips.reduce((a, b) => a + b, 0) / slips.length : null;
      const onTime = completed.filter(p => {
        const target = p.vendorCommitDate || p.expectedDate;
        const actual = p.shipDate;
        if (!target || !actual) return false;
        return new Date(actual) <= new Date(target);
      }).length;
      const onTimePct = completed.length ? Math.round((onTime / completed.length) * 100) : null;
      const late = myPOs.filter(vendorPOIsLate).length;
      const ackOverdue = myPOs.filter(p => p.vendorAckStatus !== 'Acknowledged' && p.status === 'Ordered').length;
      const discrepancies = myPOs.filter(p => p.vendorAckStatus === 'Discrepancy').length;
      return {
        id: v.id,
        name: v.name,
        leadTimeDays: v.leadTimeDays,
        totalPOs: myPOs.length,
        completedPOs: completed.length,
        onTimePct,
        avgSlip,
        late,
        ackOverdue,
        discrepancies,
      };
    }).sort((a, b) => (b.totalPOs || 0) - (a.totalPOs || 0));
  }, [vendors, pos]);

  // ----------- Customer on-time -----------
  const customerPerf = useMemo(() => {
    return customers.map(c => {
      const myOrders = orders.filter(o => o.customerId === c.id);
      const delivered = myOrders.filter(o => o.actualDeliveryDate && o.promiseDate);
      const onTime = delivered.filter(o => isOrderOnTime(o) === true).length;
      const onTimePct = delivered.length ? Math.round((onTime / delivered.length) * 100) : null;
      const open = myOrders.filter(o => {
        const s = normalizeStatus(o.status);
        return s !== LIFECYCLE.DELIVERED && s !== LIFECYCLE.CLOSED;
      }).length;
      const totalValue = canSeeMoney
        ? myOrders.reduce((sum, o) => sum + Number(o.qty || 0) * Number(o.unitPrice || 0), 0)
        : null;
      return {
        id: c.id,
        name: c.name,
        totalOrders: myOrders.length,
        deliveredOrders: delivered.length,
        onTimePct,
        openOrders: open,
        totalValue,
      };
    }).filter(c => c.totalOrders > 0)
      .sort((a, b) => b.totalOrders - a.totalOrders);
  }, [customers, orders, canSeeMoney]);

  // ----------- Pipeline (open commitments by week) -----------
  const pipeline = useMemo(() => {
    const buckets = {};
    orders.forEach(o => {
      const target = o.eta || o.plannedShipDate || o.promiseDate;
      if (!target) return;
      if (o.actualDeliveryDate) return;
      const s = normalizeStatus(o.status);
      if (s === LIFECYCLE.CLOSED || s === LIFECYCLE.DELIVERED) return;
      const week = getWeekKey(target);
      if (!buckets[week]) buckets[week] = { week, count: 0, value: 0, orders: [] };
      buckets[week].count++;
      const v = Number(o.qty || 0) * Number(o.unitPrice || 0);
      buckets[week].value += v;
      buckets[week].orders.push(o);
    });
    return Object.values(buckets).sort((a, b) => a.week.localeCompare(b.week));
  }, [orders]);

  // ----------- Inventory snapshot -----------
  const invSnap = useMemo(() => {
    const totalValue = canSeeMoney
      ? inventory.reduce((sum, i) => sum + Number(i.onHand || 0) * Number(i.unitCost || 0), 0)
      : null;
    const reservedQtyByItem = {};
    orders
      .filter(o => o.route === 'warehouse' && o.status !== 'Delivered' && o.status !== 'Closed')
      .forEach(o => {
        const productKey = (o.product || '').toLowerCase();
        if (!productKey) return;
        reservedQtyByItem[productKey] = (reservedQtyByItem[productKey] || 0) + Number(o.qty || 0);
      });
    const items = inventory.map(i => {
      const reserved = Object.entries(reservedQtyByItem).reduce((sum, [k, q]) => {
        const matches = (i.sku && k.includes(String(i.sku).toLowerCase())) || (i.name && k.includes(String(i.name).toLowerCase()));
        return matches ? sum + q : sum;
      }, 0);
      const onHand = Number(i.onHand || 0);
      const available = Math.max(0, onHand - reserved);
      const min = Number(i.minStock || 0);
      const out = available <= 0;
      const low = !out && min > 0 && available < min;
      return { ...i, reserved, available, low, out };
    });
    return {
      totalSKUs: items.length,
      lowStock: items.filter(i => i.low).length,
      outOfStock: items.filter(i => i.out).length,
      totalValue,
      items: items.sort((a, b) => (b.out - a.out) || (b.low - a.low) || (a.name || '').localeCompare(b.name || '')),
    };
  }, [inventory, orders, canSeeMoney]);

  return (
    <div className="page">
      <div className="topbar">
        <h1>Reports</h1>
        <div className="topbar-actions">
          <button className="btn" onClick={load}>↻ Refresh</button>
        </div>
      </div>

      <div className="content">
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #e2e8f0' }}>
          {TABS.map(t => (
            <div key={t.key} onClick={() => setTab(t.key)}
              style={{
                padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                color: tab === t.key ? '#1d4ed8' : '#64748b',
                borderBottom: tab === t.key ? '2px solid #1d4ed8' : '2px solid transparent',
                marginBottom: -1,
              }}>{t.label}</div>
          ))}
        </div>

        {tab === 'vendors' && (
          <div className="card">
            <div className="section-title">Vendor performance</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
              On-time % is computed from completed POs (Shipped or Received) where vendor commit/expected date and ship date are both set.
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>POs</th>
                  <th>Completed</th>
                  <th>On-time %</th>
                  <th>Avg slip</th>
                  <th>Late now</th>
                  <th>Awaiting ack</th>
                  <th>Discrepancies</th>
                  <th>Lead (d)</th>
                </tr>
              </thead>
              <tbody>
                {vendorPerf.length === 0 && <tr><td colSpan="9"><div className="empty-state"><div className="empty-state-title">No vendor data yet</div></div></td></tr>}
                {vendorPerf.map(v => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.name}</td>
                    <td>{v.totalPOs}</td>
                    <td>{v.completedPOs}</td>
                    <td>
                      {v.onTimePct === null ? <span style={{ color: '#94a3b8' }}>—</span> : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, color: v.onTimePct >= 90 ? '#15803d' : v.onTimePct >= 75 ? '#92400e' : '#ef4444', minWidth: 36 }}>{v.onTimePct}%</span>
                          <PercentBar value={v.onTimePct} color={v.onTimePct >= 90 ? '#22c55e' : v.onTimePct >= 75 ? '#f59e0b' : '#ef4444'} />
                        </div>
                      )}
                    </td>
                    <td style={{ color: v.avgSlip > 0 ? '#ef4444' : v.avgSlip < 0 ? '#15803d' : '#64748b', fontWeight: 600 }}>
                      {v.avgSlip === null ? '—' : `${v.avgSlip > 0 ? '+' : ''}${v.avgSlip.toFixed(1)}d`}
                    </td>
                    <td style={{ color: v.late ? '#ef4444' : '#94a3b8', fontWeight: v.late ? 600 : 400 }}>{v.late || '—'}</td>
                    <td style={{ color: v.ackOverdue ? '#92400e' : '#94a3b8', fontWeight: v.ackOverdue ? 600 : 400 }}>{v.ackOverdue || '—'}</td>
                    <td style={{ color: v.discrepancies ? '#991b1b' : '#94a3b8', fontWeight: v.discrepancies ? 600 : 400 }}>{v.discrepancies || '—'}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{v.leadTimeDays || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'customers' && (
          <div className="card">
            <div className="section-title">Customer on-time delivery</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
              On-time % is computed across delivered orders that have both a promise date and an actual delivery date.
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Orders</th>
                  <th>Delivered</th>
                  <th>On-time %</th>
                  <th>Open</th>
                  {canSeeMoney && <th>Lifetime value</th>}
                </tr>
              </thead>
              <tbody>
                {customerPerf.length === 0 && <tr><td colSpan={canSeeMoney ? 6 : 5}><div className="empty-state"><div className="empty-state-title">No customer data yet</div></div></td></tr>}
                {customerPerf.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>{c.totalOrders}</td>
                    <td>{c.deliveredOrders}</td>
                    <td>
                      {c.onTimePct === null ? <span style={{ color: '#94a3b8' }}>—</span> : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, color: c.onTimePct >= 90 ? '#15803d' : c.onTimePct >= 75 ? '#92400e' : '#ef4444', minWidth: 36 }}>{c.onTimePct}%</span>
                          <PercentBar value={c.onTimePct} color={c.onTimePct >= 90 ? '#22c55e' : c.onTimePct >= 75 ? '#f59e0b' : '#ef4444'} />
                        </div>
                      )}
                    </td>
                    <td style={{ color: c.openOrders ? '#0e7490' : '#94a3b8', fontWeight: c.openOrders ? 600 : 400 }}>{c.openOrders || '—'}</td>
                    {canSeeMoney && <td style={{ fontWeight: 600 }}>${(c.totalValue || 0).toLocaleString()}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'pipeline' && (
          <div className="card">
            <div className="section-title">Open commitments by week</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>
              Open orders bucketed by their target ship/delivery week. Helps spot crunch weeks before they happen.
            </div>
            {pipeline.length === 0 ? (
              <div className="empty-state"><div className="empty-state-title">No open commitments</div></div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Week of</th>
                    <th>Orders</th>
                    {canSeeMoney && <th>Value</th>}
                    <th>Workload</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeline.map(b => {
                    const max = Math.max(...pipeline.map(x => x.count));
                    const pct = max > 0 ? (b.count / max) * 100 : 0;
                    return (
                      <tr key={b.week}>
                        <td style={{ fontWeight: 600 }}>{b.week}</td>
                        <td>{b.count}</td>
                        {canSeeMoney && <td style={{ fontWeight: 600 }}>${b.value.toLocaleString()}</td>}
                        <td>
                          <div style={{ position: 'relative', background: '#f1f5f9', borderRadius: 4, height: 14, width: 220 }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: '#1d4ed8', borderRadius: 4 }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'inventory' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
              <div className="metric"><div className="metric-label">Total SKUs</div><div className="metric-val">{invSnap.totalSKUs}</div></div>
              <div className="metric"><div className="metric-label">Low stock</div><div className="metric-val" style={{ color: invSnap.lowStock ? '#92400e' : '#0f172a' }}>{invSnap.lowStock}</div></div>
              <div className="metric"><div className="metric-label">Out of stock</div><div className="metric-val" style={{ color: invSnap.outOfStock ? '#ef4444' : '#0f172a' }}>{invSnap.outOfStock}</div></div>
              {canSeeMoney && <div className="metric"><div className="metric-label">Inventory value</div><div className="metric-val">${(invSnap.totalValue || 0).toLocaleString()}</div></div>}
            </div>
            <div className="card">
              <div className="section-title">Inventory snapshot</div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Description</th>
                    <th>On hand</th>
                    <th>Reserved</th>
                    <th>Available</th>
                    <th>Min</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invSnap.items.length === 0 && <tr><td colSpan="7"><div className="empty-state"><div className="empty-state-title">No inventory items</div></div></td></tr>}
                  {invSnap.items.map(i => (
                    <tr key={i.id}>
                      <td style={{ fontWeight: 700, fontSize: 12 }}>{i.sku || '—'}</td>
                      <td>{(i.name || '').slice(0, 50)}</td>
                      <td>{i.onHand || 0}</td>
                      <td style={{ color: i.reserved ? '#92400e' : '#94a3b8' }}>{i.reserved}</td>
                      <td style={{ color: i.out ? '#ef4444' : i.low ? '#92400e' : '#15803d', fontWeight: 700 }}>{i.available}</td>
                      <td style={{ fontSize: 12, color: '#64748b' }}>{i.minStock || '—'}</td>
                      <td>
                        {i.out ? <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4, background: '#fee2e2', color: '#991b1b' }}>OUT</span>
                          : i.low ? <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4, background: '#fef3c7', color: '#92400e' }}>LOW</span>
                          : <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4, background: '#dcfce7', color: '#15803d' }}>OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function getWeekKey(dateStr) {
  // Returns the Monday-of-week as YYYY-MM-DD for grouping.
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}
