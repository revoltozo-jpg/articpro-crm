import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import './Shared.css';

export default function Dashboard({ goDetail }) {
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [pos, setPOs] = useState([]);

  useEffect(() => {
    getDocs(collection(db, 'customers')).then(s => setCustomers(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    getDocs(collection(db, 'orders')).then(s => setOrders(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    getDocs(collection(db, 'purchase_orders')).then(s => setPOs(s.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  const revenue = orders.filter(o => ['Delivered','Active'].includes(o.status)).reduce((a, o) => a + (o.qty * o.unitPrice), 0);
  const pipeline = orders.filter(o => ['Pending','In Progress','Quoted'].includes(o.status)).reduce((a, o) => a + (o.qty * o.unitPrice), 0);
  const openPOs = pos.filter(p => p.status !== 'Received').length;
  const fmt = n => '$' + Number(n).toLocaleString();

  return (
    <div className="page">
      <div className="topbar"><h1>Dashboard</h1></div>
      <div className="content">
        <div className="metric-grid">
          <div className="metric"><div className="metric-label">Active customers</div><div className="metric-val">{customers.filter(c => c.status === 'Active').length}</div></div>
          <div className="metric"><div className="metric-label">Revenue closed</div><div className="metric-val">{fmt(revenue)}</div></div>
          <div className="metric"><div className="metric-label">Pipeline value</div><div className="metric-val">{fmt(pipeline)}</div></div>
          <div className="metric"><div className="metric-label">Open POs</div><div className="metric-val">{openPOs}</div></div>
        </div>
        <div className="two-col">
          <div className="card">
            <div className="section-title">Recent orders</div>
            <table className="tbl">
              <thead><tr><th>Order</th><th>Customer</th><th>Status</th></tr></thead>
              <tbody>
                {orders.slice(0, 5).map(o => (
                  <tr key={o.id} onClick={() => goDetail('orders', o.id)}>
                    <td>{o.id}</td><td>{o.customerName}</td>
                    <td><span className={`badge ${o.status}`}>{o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="section-title">Purchase orders</div>
            <table className="tbl">
              <thead><tr><th>PO</th><th>Vendor</th><th>Status</th></tr></thead>
              <tbody>
                {pos.slice(0, 5).map(p => (
                  <tr key={p.id} onClick={() => goDetail('purchase_orders', p.id)}>
                    <td>{p.id}</td><td>{p.vendorName}</td>
                    <td><span className={`badge ${p.status}`}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}