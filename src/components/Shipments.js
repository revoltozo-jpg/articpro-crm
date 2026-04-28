// Shipments — master list of all in-flight and recently delivered shipments
// across all orders. Pulls from each order's shipmentPlan as well as PO-level
// tracking data, and lets ops filter by status, carrier, lateness, route.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { daysBetween, ROUTE_LABELS } from '../lib/orderLifecycle';
import './Shared.css';

const today = () => new Date().toISOString().slice(0, 10);

function StatusPill({ s }) {
  const c = {
    Planned:      { bg: '#eef2ff', fg: '#4338ca' },
    'In Transit': { bg: '#cffafe', fg: '#0e7490' },
    Delivered:    { bg: '#dcfce7', fg: '#15803d' },
    Backorder:    { bg: '#fee2e2', fg: '#991b1b' },
  }[s] || { bg: '#f1f5f9', fg: '#475569' };
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4, background: c.bg, color: c.fg, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{s}</span>;
}

export default function Shipments({ goDetail, perms }) {
  const [orders, setOrders] = useState([]);
  const [pos, setPOs] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [carrierFilter, setCarrierFilter] = useState('');
  const [routeFilter, setRouteFilter] = useState('');

  const load = async () => {
    const [os, ps] = await Promise.all([
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'purchase_orders')),
    ]);
    setOrders(os.docs.map(d => ({ id: d.id, ...d.data() })));
    setPOs(ps.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { load(); }, []);

  // Flatten all shipment lines from all orders into a single list
  const shipments = useMemo(() => {
    const list = [];
    orders.forEach(o => {
      const lines = o.shipmentPlan || [];
      lines.forEach(l => {
        list.push({
          ...l,
          key: `${o.id}-${l.id}`,
          orderId: o.id,
          customerName: o.customerName,
          customerId: o.customerId,
          route: o.route,
          isInternational: o.isInternational,
          incoterm: o.incoterm,
          promiseDate: o.promiseDate,
        });
      });
      // Also pull in POs that have tracking but no shipmentPlan line referencing them
      const linkedPOs = pos.filter(p => p.relatedSO === o.id && p.trackingNumber);
      linkedPOs.forEach(p => {
        const alreadyTracked = lines.some(l => l.poId === p.id || l.trackingNumber === p.trackingNumber);
        if (alreadyTracked) return;
        list.push({
          key: `${o.id}-po-${p.id}`,
          orderId: o.id,
          customerName: o.customerName,
          customerId: o.customerId,
          route: o.route,
          isInternational: o.isInternational,
          incoterm: o.incoterm,
          promiseDate: o.promiseDate,
          label: `PO ${p.id.slice(0, 8)} (${p.vendorName})`,
          qty: p.qty || 1,
          plannedDate: p.expectedDate || p.vendorCommitDate,
          actualDate: p.shipDate,
          carrier: p.carrier,
          trackingNumber: p.trackingNumber,
          status: p.status === 'Received' ? 'Delivered' : p.status === 'Shipped' ? 'In Transit' : 'Planned',
          poId: p.id,
        });
      });
    });
    return list;
  }, [orders, pos]);

  const filtered = shipments.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || s.label?.toLowerCase().includes(q)
      || s.customerName?.toLowerCase().includes(q)
      || s.trackingNumber?.toLowerCase().includes(q)
      || s.carrier?.toLowerCase().includes(q);
    const matchStatus = !statusFilter || s.status === statusFilter;
    const matchCarrier = !carrierFilter || s.carrier === carrierFilter;
    const matchRoute = !routeFilter || s.route === routeFilter;
    return matchSearch && matchStatus && matchCarrier && matchRoute;
  });

  const carriers = [...new Set(shipments.map(s => s.carrier).filter(Boolean))].sort();

  const counts = {
    total: shipments.length,
    planned: shipments.filter(s => s.status === 'Planned').length,
    inTransit: shipments.filter(s => s.status === 'In Transit').length,
    delivered: shipments.filter(s => s.status === 'Delivered').length,
    late: shipments.filter(s => {
      if (s.status === 'Delivered') return false;
      if (!s.plannedDate) return false;
      return s.plannedDate < today();
    }).length,
    backorder: shipments.filter(s => s.status === 'Backorder').length,
  };

  return (
    <div className="page">
      <div className="topbar">
        <h1>Shipments</h1>
        <div className="topbar-actions">
          <input className="search" placeholder="Search tracking, customer, label..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="search" style={{ width: 130 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="Planned">Planned</option>
            <option value="In Transit">In Transit</option>
            <option value="Delivered">Delivered</option>
            <option value="Backorder">Backorder</option>
          </select>
          <select className="search" style={{ width: 130 }} value={carrierFilter} onChange={e => setCarrierFilter(e.target.value)}>
            <option value="">All carriers</option>
            {carriers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="search" style={{ width: 130 }} value={routeFilter} onChange={e => setRouteFilter(e.target.value)}>
            <option value="">All routes</option>
            <option value="drop_ship">Drop Ship</option>
            <option value="warehouse">Warehouse</option>
          </select>
        </div>
      </div>

      <div className="content">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
          <div className="metric"><div className="metric-label">Total</div><div className="metric-val">{counts.total}</div></div>
          <div className="metric"><div className="metric-label">Planned</div><div className="metric-val">{counts.planned}</div></div>
          <div className="metric"><div className="metric-label">In transit</div><div className="metric-val" style={{ color: '#0e7490' }}>{counts.inTransit}</div></div>
          <div className="metric"><div className="metric-label">Delivered</div><div className="metric-val" style={{ color: '#15803d' }}>{counts.delivered}</div></div>
          <div className="metric"><div className="metric-label">Late</div><div className="metric-val" style={{ color: counts.late ? '#ef4444' : '#0f172a' }}>{counts.late}</div></div>
          <div className="metric"><div className="metric-label">Backorder</div><div className="metric-val" style={{ color: counts.backorder ? '#ef4444' : '#0f172a' }}>{counts.backorder}</div></div>
        </div>

        <div className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Label</th>
                <th>Qty</th>
                <th>Planned</th>
                <th>Actual</th>
                <th>Carrier / tracking</th>
                <th>Route</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan="8"><div className="empty-state">
                  <div className="empty-state-icon">📦</div>
                  <div className="empty-state-title">No shipments match the filters</div>
                </div></td></tr>
              )}
              {filtered.map(s => {
                const isLate = s.status !== 'Delivered' && s.plannedDate && s.plannedDate < today();
                const daysLate = isLate ? daysBetween(s.plannedDate, today()) : null;
                return (
                  <tr key={s.key} onClick={() => goDetail('orders_v2', s.orderId)}>
                    <td style={{ fontWeight: 600 }}>{s.customerName}</td>
                    <td style={{ fontSize: 12 }}>{s.label}</td>
                    <td>{s.qty}</td>
                    <td style={{ fontSize: 12, color: isLate ? '#ef4444' : '#64748b', fontWeight: isLate ? 600 : 400 }}>
                      {s.plannedDate || '—'}
                      {isLate && <div style={{ fontSize: 10, color: '#ef4444' }}>{daysLate}d late</div>}
                    </td>
                    <td style={{ fontSize: 12, color: s.actualDate ? '#15803d' : '#94a3b8' }}>{s.actualDate || '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {s.trackingNumber ? <span style={{ color: '#1d4ed8' }}>{s.carrier} <strong>{s.trackingNumber}</strong></span> : <span style={{ color: '#94a3b8' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {s.route ? ROUTE_LABELS[s.route] : '—'}
                      {s.isInternational && <div style={{ fontSize: 10, color: '#0e7490', fontWeight: 600 }}>{s.incoterm}</div>}
                    </td>
                    <td><StatusPill s={s.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
