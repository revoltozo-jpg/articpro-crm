// OperationsDashboard — the daily-driver view.
// Replaces "the Matrix" Excel sheet. Designed to give Operations a single
// screen they can scan in 30 seconds: what's blocked, what's late, what's
// shipping this week, what needs their attention right now.
//
// Sections (top to bottom):
//   1. KPI strip (10 cells)
//   2. Needs-attention feed (action-required items)
//   3. Two-column: Upcoming deliveries (14d) | Vendor PO health
//   4. Recent activity (audit trail)

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import {
  LIFECYCLE, normalizeStatus, getStageInfo, getDeliveryHealth, daysBetween,
  isOrderOnTime, vendorPOIsLate, vendorPOAckOverdue, ROUTE_LABELS, STATUS_COLORS,
} from '../lib/orderLifecycle';
import './Shared.css';

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

function KPI({ label, value, color, sub, onClick }) {
  return (
    <div className="metric"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="metric-label">{label}</div>
      <div className="metric-val" style={{ color: color || '#0f172a' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

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

function AttentionRow({ icon, label, sub, severity, onClick }) {
  const colors = {
    high:   { bg: '#fef2f2', border: '#fecaca', icon: '#ef4444' },
    medium: { bg: '#fffbeb', border: '#fcd34d', icon: '#f59e0b' },
    low:    { bg: '#f0f9ff', border: '#bae6fd', icon: '#0ea5e9' },
  };
  const c = colors[severity] || colors.low;
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8,
      cursor: onClick ? 'pointer' : 'default', marginBottom: 6,
    }}>
      <div style={{ fontSize: 16, color: c.icon, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 14, color: '#94a3b8', flexShrink: 0 }}>›</div>
    </div>
  );
}

export default function OperationsDashboard({ goDetail, perms }) {
  const [orders, setOrders] = useState([]);
  const [pos, setPOs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [os, ps, vs, evs] = await Promise.all([
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'purchase_orders')),
      getDocs(collection(db, 'vendors')),
      getDocs(query(collection(db, 'order_events'), orderBy('timestamp', 'desc'), limit(15))).catch(() => ({ docs: [] })),
    ]);
    setOrders(os.docs.map(d => ({ id: d.id, ...d.data() })));
    setPOs(ps.docs.map(d => ({ id: d.id, ...d.data() })));
    setVendors(vs.docs.map(d => ({ id: d.id, ...d.data() })));
    setEvents(evs.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ---- derived buckets ----
  const kpis = useMemo(() => {
    const now = today();
    const in14 = addDays(now, 14);
    const monthStart = now.slice(0, 7) + '-01';

    const awaitingPO = orders.filter(o => normalizeStatus(o.status) === LIFECYCLE.AWAITING_PO || (!o.customerPOReceived && normalizeStatus(o.status) === LIFECYCLE.QUOTE)).length;
    const awaitingSubs = orders.filter(o => normalizeStatus(o.status) === LIFECYCLE.AWAITING_SUBMITTALS || (o.customerPOReceived && !o.submittalsApproved && normalizeStatus(o.status) !== LIFECYCLE.DELIVERED && normalizeStatus(o.status) !== LIFECYCLE.CLOSED)).length;
    const awaitingVal = orders.filter(o => o.customerPOReceived && o.submittalsApproved && !o.validationComplete && !o.route).length;
    const inProc = orders.filter(o => normalizeStatus(o.status) === LIFECYCLE.IN_PROCUREMENT || normalizeStatus(o.status) === LIFECYCLE.SCHEDULED).length;
    const inTransit = orders.filter(o => normalizeStatus(o.status) === LIFECYCLE.IN_TRANSIT).length;
    const shippingThisWeek = orders.filter(o => {
      const d = o.plannedShipDate || o.eta;
      if (!d) return false;
      const days = daysBetween(now, d);
      return days !== null && days >= 0 && days <= 7;
    }).length;
    const deliveredThisMonth = orders.filter(o => o.actualDeliveryDate && o.actualDeliveryDate >= monthStart).length;
    const onTimeChecked = orders.filter(o => isOrderOnTime(o) !== null);
    const onTimeCount = onTimeChecked.filter(o => isOrderOnTime(o) === true).length;
    const onTimePct = onTimeChecked.length > 0 ? Math.round((onTimeCount / onTimeChecked.length) * 100) : null;
    const lateVendors = pos.filter(vendorPOIsLate).length;
    const openIssues = orders.reduce((s, o) => s + (o.issues || []).filter(i => !i.resolved).length, 0);
    const backorders = orders.reduce((s, o) => s + (o.shipmentPlan || []).filter(l => l.status === 'Backorder').length, 0);

    return { awaitingPO, awaitingSubs, awaitingVal, inProc, inTransit, shippingThisWeek, deliveredThisMonth, onTimePct, lateVendors, openIssues, backorders, in14 };
  }, [orders, pos]);

  // ---- needs attention feed ----
  const attention = useMemo(() => {
    const out = [];
    const now = today();

    // Late vendor POs
    pos.filter(vendorPOIsLate).forEach(p => {
      const o = orders.find(x => x.id === p.relatedSO);
      const target = p.vendorCommitDate || p.expectedDate;
      const daysLate = daysBetween(target, now);
      out.push({
        severity: 'high', icon: '⚠',
        label: `Vendor late: ${p.vendorName} on ${p.id.slice(0, 8)}`,
        sub: `Commit was ${target} · ${daysLate}d overdue${o ? ` · ${o.customerName}` : ''}`,
        onClick: () => goDetail('purchase_orders_v2', p.id),
        sortKey: -1000 - (daysLate || 0),
      });
    });

    // Vendor POs awaiting acknowledgment too long
    pos.filter(p => vendorPOAckOverdue(p, 5)).forEach(p => {
      const o = orders.find(x => x.id === p.relatedSO);
      out.push({
        severity: 'medium', icon: '⏱',
        label: `No vendor ack: ${p.vendorName} on ${p.id.slice(0, 8)}`,
        sub: `Ordered ${p.orderDate}${o ? ` · ${o.customerName}` : ''}`,
        onClick: () => goDetail('purchase_orders_v2', p.id),
        sortKey: -500,
      });
    });

    // Vendor PO discrepancies
    pos.filter(p => p.vendorAckStatus === 'Discrepancy').forEach(p => {
      out.push({
        severity: 'high', icon: '!',
        label: `Vendor discrepancy: ${p.vendorName}`,
        sub: `${p.id.slice(0, 8)} — ${p.ackNotes || 'See PO'}`,
        onClick: () => goDetail('purchase_orders_v2', p.id),
        sortKey: -800,
      });
    });

    // Orders blocked
    orders.forEach(o => {
      const linked = pos.filter(p => p.relatedSO === o.id);
      const { blockedAt } = getStageInfo(o, linked);
      if (!blockedAt) return;
      const labels = { po: 'Awaiting customer PO', submittals: 'Awaiting submittals', hold: 'On hold', issue: 'Has open issue' };
      out.push({
        severity: blockedAt === 'issue' ? 'high' : 'medium',
        icon: blockedAt === 'hold' ? '⏸' : '⛔',
        label: `${labels[blockedAt]}: ${o.customerName}`,
        sub: `${o.id.slice(0, 8)} · ${(o.product || '').slice(0, 40)}`,
        onClick: () => goDetail('orders_v2', o.id),
        sortKey: blockedAt === 'issue' ? -700 : -200,
      });
    });

    // Backorders
    orders.forEach(o => {
      const back = (o.shipmentPlan || []).filter(l => l.status === 'Backorder');
      if (back.length === 0) return;
      out.push({
        severity: 'medium', icon: '📦',
        label: `Backorder${back.length > 1 ? 's' : ''}: ${o.customerName}`,
        sub: `${back.length} line${back.length > 1 ? 's' : ''} on ${o.id.slice(0, 8)}`,
        onClick: () => goDetail('orders_v2', o.id),
        sortKey: -100,
      });
    });

    return out.sort((a, b) => a.sortKey - b.sortKey).slice(0, 12);
  }, [orders, pos, goDetail]);

  // ---- upcoming deliveries (next 14 days) ----
  const upcoming = useMemo(() => {
    const now = today();
    const end = addDays(now, 14);
    return orders
      .filter(o => {
        const target = o.eta || o.plannedShipDate;
        if (!target) return false;
        if (o.actualDeliveryDate) return false;
        return target >= now && target <= end;
      })
      .sort((a, b) => (a.eta || a.plannedShipDate).localeCompare(b.eta || b.plannedShipDate))
      .slice(0, 10);
  }, [orders]);

  // ---- vendor PO health ----
  const vendorHealth = useMemo(() => {
    const byVendor = {};
    pos.forEach(p => {
      const key = p.vendorId || 'unknown';
      if (!byVendor[key]) byVendor[key] = { name: p.vendorName, total: 0, late: 0, awaitingAck: 0, discrepancy: 0 };
      byVendor[key].total++;
      if (vendorPOIsLate(p)) byVendor[key].late++;
      if (vendorPOAckOverdue(p, 5)) byVendor[key].awaitingAck++;
      if (p.vendorAckStatus === 'Discrepancy') byVendor[key].discrepancy++;
    });
    return Object.values(byVendor)
      .filter(v => v.late > 0 || v.awaitingAck > 0 || v.discrepancy > 0)
      .sort((a, b) => (b.late + b.awaitingAck + b.discrepancy) - (a.late + a.awaitingAck + a.discrepancy))
      .slice(0, 8);
  }, [pos]);

  if (loading) {
    return (
      <div className="page">
        <div className="topbar"><h1>Operations Dashboard</h1></div>
        <div className="content">
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
          <h1>Operations Dashboard</h1>
        </div>
        <div className="topbar-actions">
          <button className="btn" onClick={load}>↻ Refresh</button>
        </div>
      </div>

      <div className="content">
        {/* KPI strip — 5 + 5 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 12 }}>
          <KPI label="Awaiting customer PO" value={kpis.awaitingPO} color={kpis.awaitingPO ? '#92400e' : '#0f172a'} />
          <KPI label="Awaiting submittals" value={kpis.awaitingSubs} color={kpis.awaitingSubs ? '#92400e' : '#0f172a'} />
          <KPI label="Awaiting validation" value={kpis.awaitingVal} color={kpis.awaitingVal ? '#92400e' : '#0f172a'} />
          <KPI label="In procurement" value={kpis.inProc} />
          <KPI label="In transit" value={kpis.inTransit} color={kpis.inTransit ? '#0e7490' : '#0f172a'} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
          <KPI label="Shipping this week" value={kpis.shippingThisWeek} sub="Next 7 days" />
          <KPI label="Delivered this month" value={kpis.deliveredThisMonth} color="#15803d" />
          <KPI label="On-time delivery" value={kpis.onTimePct === null ? '—' : `${kpis.onTimePct}%`} color={kpis.onTimePct === null ? '#94a3b8' : kpis.onTimePct >= 90 ? '#15803d' : kpis.onTimePct >= 75 ? '#92400e' : '#ef4444'} sub="All-time" />
          <KPI label="Late vendor POs" value={kpis.lateVendors} color={kpis.lateVendors ? '#ef4444' : '#0f172a'} />
          <KPI label="Open issues" value={kpis.openIssues + kpis.backorders} color={kpis.openIssues + kpis.backorders ? '#ef4444' : '#0f172a'} sub={`${kpis.openIssues} issues · ${kpis.backorders} backorders`} />
        </div>

        {/* Needs attention */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="section-title" style={{ margin: 0 }}>Needs attention</div>
            <span style={{ fontSize: 11, color: '#64748b' }}>{attention.length} item{attention.length !== 1 ? 's' : ''}</span>
          </div>
          {attention.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#15803d' }}>All clear</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Nothing requires attention right now.</div>
            </div>
          ) : (
            attention.map((a, i) => <AttentionRow key={i} {...a} />)
          )}
        </div>

        {/* Two-column: upcoming deliveries + vendor health */}
        <div className="two-col" style={{ marginBottom: 16 }}>
          <div className="card">
            <div className="section-title">Upcoming deliveries — next 14 days</div>
            {upcoming.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 20 }}>No deliveries scheduled.</div>
            ) : (
              <table className="tbl">
                <thead><tr><th>Date</th><th>Customer</th><th>Order</th><th>Route</th><th>Status</th></tr></thead>
                <tbody>
                  {upcoming.map(o => {
                    const target = o.eta || o.plannedShipDate;
                    const daysOut = daysBetween(today(), target);
                    const dayColor = daysOut === 0 ? '#ef4444' : daysOut <= 2 ? '#f59e0b' : '#0f172a';
                    return (
                      <tr key={o.id} onClick={() => goDetail('orders_v2', o.id)}>
                        <td style={{ fontWeight: 600, color: dayColor, fontSize: 12 }}>
                          {target}
                          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>{daysOut === 0 ? 'today' : daysOut === 1 ? 'tomorrow' : `in ${daysOut}d`}</div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{o.customerName}</td>
                        <td style={{ fontSize: 11, color: '#64748b' }}>{o.id.slice(0, 8)}</td>
                        <td style={{ fontSize: 11 }}>{o.route ? ROUTE_LABELS[o.route] : '—'}</td>
                        <td><MiniBadge status={o.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="section-title">Vendor PO health</div>
            {vendorHealth.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>✓</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>All vendors performing</div>
              </div>
            ) : (
              <table className="tbl">
                <thead><tr><th>Vendor</th><th>POs</th><th>Late</th><th>Awaiting ack</th><th>Disc.</th></tr></thead>
                <tbody>
                  {vendorHealth.map((v, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{v.name}</td>
                      <td>{v.total}</td>
                      <td style={{ color: v.late ? '#ef4444' : '#94a3b8', fontWeight: v.late ? 600 : 400 }}>{v.late || '—'}</td>
                      <td style={{ color: v.awaitingAck ? '#92400e' : '#94a3b8', fontWeight: v.awaitingAck ? 600 : 400 }}>{v.awaitingAck || '—'}</td>
                      <td style={{ color: v.discrepancy ? '#991b1b' : '#94a3b8', fontWeight: v.discrepancy ? 600 : 400 }}>{v.discrepancy || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Recent activity */}
        <div className="card">
          <div className="section-title">Recent activity</div>
          {events.length === 0 ? (
            <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 20 }}>No recent activity.</div>
          ) : (
            <div>
              {events.map(ev => {
                const o = orders.find(x => x.id === ev.orderId);
                return (
                  <div key={ev.id}
                    onClick={() => o && goDetail('orders_v2', o.id)}
                    style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f1f5f9', cursor: o ? 'pointer' : 'default' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', width: 130, flexShrink: 0 }}>
                      {ev.timestamp?.toDate ? ev.timestamp.toDate().toLocaleString() : '—'}
                    </div>
                    <div style={{ flex: 1, fontSize: 12, color: '#0f172a' }}>
                      {ev.message}
                      {o && <span style={{ fontSize: 11, color: '#64748b' }}> · {o.customerName}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{ev.userEmail}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
