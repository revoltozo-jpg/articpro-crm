import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import './Shared.css';

export default function Dashboard({ goDetail, perms }) {
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [pos, setPOs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'customers')),
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'purchase_orders')),
    ]).then(([cs, os, ps]) => {
      setCustomers(cs.docs.map(d => ({ id: d.id, ...d.data() })));
      setOrders(os.docs.map(d => ({ id: d.id, ...d.data() })));
      setPOs(ps.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="page">
      <div className="topbar"><h1>Dashboard</h1></div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Loading...</div>
    </div>
  );

  const canSeeMoney = perms?.canViewFinancials;
  const fmt = n => '$' + Number(n).toLocaleString();

  const revenue = orders.filter(o => ['Delivered','Active'].includes(o.status)).reduce((a, o) => a + Number(o.qty) * Number(o.unitPrice), 0);
  const pipeline = orders.filter(o => ['Quoted','Pending','In Progress'].includes(o.status)).reduce((a, o) => a + Number(o.qty) * Number(o.unitPrice), 0);
  const openPOs = pos.filter(p => p.status !== 'Received').length;

  const recentOrders = [...orders].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  const pendingPOs = pos.filter(p => p.status !== 'Received').slice(0, 6);

  const statusDot = (s) => {
    const map = { Delivered: 'dot-green', Active: 'dot-green', 'In Progress': 'dot-blue', Ordered: 'dot-blue', Shipped: 'dot-blue', Pending: 'dot-yellow', Quoted: 'dot-yellow', Draft: 'dot-yellow', 'On Hold': 'dot-red', Inactive: 'dot-gray', Received: 'dot-green' };
    return <span className={`status-dot ${map[s] || 'dot-gray'}`}></span>;
  };

  const metrics = [
    { label: 'Active customers', val: customers.filter(c => c.status === 'Active').length, sub: `${customers.length} total accounts`, show: true },
    { label: 'Closed revenue', val: fmt(revenue), sub: 'delivered & active orders', show: canSeeMoney },
    { label: 'Pipeline value', val: fmt(pipeline), sub: 'quoted & in progress', show: canSeeMoney },
    { label: 'Open vendor POs', val: openPOs, sub: 'awaiting receipt', show: true },
    { label: 'Orders in progress', val: orders.filter(o => o.status === 'In Progress').length, sub: 'being fulfilled', show: !canSeeMoney },
    { label: 'Quoted orders', val: orders.filter(o => o.status === 'Quoted').length, sub: 'awaiting confirmation', show: !canSeeMoney },
  ].filter(m => m.show);

  return (
    <div className="page">
      <div className="topbar">
        <h1>Dashboard</h1>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>
      <div className="content">
        <div className="metric-grid">
          {metrics.map(m => (
            <div key={m.label} className="metric">
              <div className="metric-label">{m.label}</div>
              <div className="metric-val">{m.val}</div>
              <div className="metric-sub">{m.sub}</div>
            </div>
          ))}
        </div>

        <div className="two-col">
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="section-title" style={{ margin: 0 }}>Recent customer orders</div>
              <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => goDetail('orders', null)}>View all</button>
            </div>
            {recentOrders.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-title">No orders yet</div></div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Product</th>
                    {canSeeMoney && <th>Value</th>}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map(o => (
                    <tr key={o.id} onClick={() => goDetail('orders', o.id)}>
                      <td style={{ fontWeight: 500 }}>{o.customerName || '—'}</td>
                      <td style={{ color: '#64748b', fontSize: 12 }}>{o.product?.slice(0, 22)}{o.product?.length > 22 ? '...' : ''}</td>
                      {canSeeMoney && <td style={{ fontWeight: 600 }}>{fmt(Number(o.qty) * Number(o.unitPrice))}</td>}
                      <td>{statusDot(o.status)}<span className={`badge ${o.status}`}>{o.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="section-title" style={{ margin: 0 }}>Open vendor POs</div>
              <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => goDetail('purchase_orders', null)}>View all</button>
            </div>
            {pendingPOs.length === 0 ? (
              <div className="empty-state"><div className="empty-state-icon">🚚</div><div className="empty-state-title">No open POs</div></div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th>Items</th>
                    {canSeeMoney && <th>Total</th>}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPOs.map(p => (
                    <tr key={p.id} onClick={() => goDetail('purchase_orders', p.id)}>
                      <td style={{ fontWeight: 500 }}>{p.vendorName || '—'}</td>
                      <td style={{ color: '#64748b', fontSize: 12 }}>{p.items?.slice(0, 22)}{p.items?.length > 22 ? '...' : ''}</td>
                      {canSeeMoney && <td style={{ fontWeight: 600 }}>{fmt(p.total)}</td>}
                      <td><span className={`badge ${p.status}`}>{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {orders.filter(o => o.status === 'In Progress' && !o.vendorPO).length > 0 && (
          <div style={{ marginTop: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>Orders missing vendor POs</div>
              <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>
                {orders.filter(o => o.status === 'In Progress' && !o.vendorPO).length} order(s) are in progress but have no linked purchase order.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}