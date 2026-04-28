// Scheduler — surfaces orders that are ready to be routed.
// An order is "ready" when it's Confirmed (or its gates are cleared) and has
// not yet been routed to drop-ship or warehouse. The user picks a route from
// here and is taken to the order detail to confirm dates.
//
// This is the "Scheduler Engine" from the owner's flowchart, in its v1 form:
// assisted, not automated. We surface the inputs (vendor lead time, promise
// date, etc.) and the user makes the call.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  LIFECYCLE, isReadyToSchedule, normalizeStatus, computePlannedShipDate,
  daysBetween, ROUTE_LABELS, logOrderEvent,
} from '../lib/orderLifecycle';
import './Shared.css';

export default function Scheduler({ goDetail, perms }) {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [pos, setPOs] = useState([]);
  const [routeChoices, setRouteChoices] = useState({}); // orderId -> { route, vendorId }
  const canEdit = perms?.canEdit;

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

  // "Ready to schedule" + "Not yet cleared" buckets
  const ready = useMemo(() => orders.filter(isReadyToSchedule), [orders]);
  const blocked = useMemo(() => orders.filter(o => {
    const s = normalizeStatus(o.status);
    if (s !== LIFECYCLE.CONFIRMED && s !== LIFECYCLE.QUOTE && s !== LIFECYCLE.AWAITING_PO && s !== LIFECYCLE.AWAITING_SUBMITTALS) return false;
    return !o.customerPOReceived || !o.submittalsApproved || !o.validationComplete;
  }), [orders]);

  const setChoice = (orderId, patch) => {
    setRouteChoices(prev => ({ ...prev, [orderId]: { ...(prev[orderId] || {}), ...patch } }));
  };

  const commitRoute = async (order) => {
    const choice = routeChoices[order.id] || {};
    if (!choice.route) return;
    const vendor = vendors.find(v => v.id === choice.vendorId);
    const planned = computePlannedShipDate(order.date, vendor?.leadTimeDays);
    await updateDoc(doc(db, 'orders', order.id), {
      route: choice.route,
      isInternational: !!choice.isInternational,
      incoterm: choice.isInternational ? (choice.incoterm || 'FCA') : '',
      plannedShipDate: planned,
      status: LIFECYCLE.SCHEDULED,
    });
    await logOrderEvent(order.id, 'routed', `Routed as ${ROUTE_LABELS[choice.route]} via Scheduler`);
    load();
  };

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>Operations</div>
          <h1>Scheduler</h1>
        </div>
      </div>

      <div className="content">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
          <div className="metric"><div className="metric-label">Ready to schedule</div><div className="metric-val">{ready.length}</div></div>
          <div className="metric"><div className="metric-label">Blocked (PO/submittals)</div><div className="metric-val" style={{ color: blocked.length ? '#ef4444' : '#0f172a' }}>{blocked.length}</div></div>
          <div className="metric"><div className="metric-label">Already routed</div><div className="metric-val">{orders.filter(o => !!o.route).length}</div></div>
        </div>

        {/* Ready */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="section-title">Ready to route</div>
          {ready.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">✅</div>
              <div className="empty-state-title">No orders waiting on routing.</div>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Promise</th>
                  <th>Route</th>
                  <th>Vendor (for lead time)</th>
                  <th>Planned ship</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ready.map(o => {
                  const choice = routeChoices[o.id] || {};
                  const vendor = vendors.find(v => v.id === choice.vendorId);
                  const planned = computePlannedShipDate(o.date, vendor?.leadTimeDays);
                  const slip = (o.promiseDate && planned) ? daysBetween(planned, o.promiseDate) : null;
                  const slipColor = slip === null ? '#64748b' : slip < 0 ? '#ef4444' : slip < 3 ? '#92400e' : '#15803d';
                  return (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600, fontSize: 12 }}>
                        <span className="link" onClick={() => goDetail('orders_v2', o.id)}>{o.id.slice(0, 8)}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{o.customerName}</td>
                      <td style={{ color: '#64748b', fontSize: 12 }}>{(o.product || '').slice(0, 24)}</td>
                      <td style={{ fontSize: 12 }}>{o.promiseDate || '—'}</td>
                      <td>
                        <select value={choice.route || ''} onChange={e => setChoice(o.id, { route: e.target.value })} style={{ fontSize: 12, padding: '4px 6px' }}>
                          <option value="">— Pick —</option>
                          <option value="drop_ship">Drop Ship</option>
                          <option value="warehouse">Warehouse</option>
                        </select>
                      </td>
                      <td>
                        <select value={choice.vendorId || ''} onChange={e => setChoice(o.id, { vendorId: e.target.value })} style={{ fontSize: 12, padding: '4px 6px', maxWidth: 180 }}>
                          <option value="">— Vendor —</option>
                          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}{v.leadTimeDays ? ` (${v.leadTimeDays}d)` : ''}</option>)}
                        </select>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {planned}
                        {slip !== null && (
                          <div style={{ fontSize: 10, color: slipColor, fontWeight: 600 }}>
                            {slip < 0 ? `${Math.abs(slip)}d late` : slip === 0 ? 'on date' : `${slip}d buffer`}
                          </div>
                        )}
                      </td>
                      <td>
                        {canEdit && (
                          <button className="btn btn-primary" style={{ fontSize: 11, padding: '5px 12px' }}
                            disabled={!choice.route} onClick={() => commitRoute(o)}>
                            Route
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Blocked */}
        <div className="card">
          <div className="section-title">Blocked — needs PO, submittals, or validation</div>
          {blocked.length === 0 ? (
            <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: 12 }}>Nothing blocked.</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>PO received</th>
                  <th>Submittals</th>
                  <th>Validation</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {blocked.map(o => (
                  <tr key={o.id} onClick={() => goDetail('orders_v2', o.id)}>
                    <td style={{ fontWeight: 600, fontSize: 12 }}>{o.id.slice(0, 8)}</td>
                    <td style={{ fontWeight: 600 }}>{o.customerName}</td>
                    <td>{o.customerPOReceived ? <span style={{ color: '#15803d' }}>✓</span> : <span style={{ color: '#ef4444' }}>✗</span>}</td>
                    <td>{o.submittalsApproved ? <span style={{ color: '#15803d' }}>✓</span> : <span style={{ color: '#ef4444' }}>✗</span>}</td>
                    <td>{o.validationComplete ? <span style={{ color: '#15803d' }}>✓</span> : <span style={{ color: '#ef4444' }}>✗</span>}</td>
                    <td><span style={{ fontSize: 11, color: '#64748b' }}>{normalizeStatus(o.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
