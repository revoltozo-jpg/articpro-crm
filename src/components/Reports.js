import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';
import './Shared.css';

const COLORS = ['#1d4ed8', '#0f6e56', '#854d0e', '#6d28d9', '#b91c1c', '#0e7490'];

const fmt = n => '$' + Number(n).toLocaleString();

export default function Reports() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [pos, setPOs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sales');

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'orders')),
      getDocs(collection(db, 'customers')),
      getDocs(collection(db, 'vendors')),
      getDocs(collection(db, 'purchase_orders')),
    ]).then(([os, cs, vs, ps]) => {
      setOrders(os.docs.map(d => ({ id: d.id, ...d.data() })));
      setCustomers(cs.docs.map(d => ({ id: d.id, ...d.data() })));
      setVendors(vs.docs.map(d => ({ id: d.id, ...d.data() })));
      setPOs(ps.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="page">
      <div className="topbar"><h1>Reports</h1></div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Loading...</div>
    </div>
  );

  const totalRevenue = orders.filter(o => ['Delivered','Active'].includes(o.status)).reduce((a, o) => a + Number(o.qty) * Number(o.unitPrice), 0);
  const totalPipeline = orders.filter(o => ['Quoted','Pending','In Progress'].includes(o.status)).reduce((a, o) => a + Number(o.qty) * Number(o.unitPrice), 0);
  const totalCost = pos.filter(p => p.status !== 'Draft').reduce((a, p) => a + Number(p.total), 0);
  const totalMargin = totalRevenue - pos.filter(p => ['Received'].includes(p.status)).reduce((a, p) => a + Number(p.total), 0);

  const statusData = ['Quoted','Pending','In Progress','Active','Delivered','On Hold'].map(s => ({
    name: s, value: orders.filter(o => o.status === s).length
  })).filter(d => d.value > 0);

  const customerRevenue = customers.map(c => {
    const cOrders = orders.filter(o => o.customerId === c.id);
    const revenue = cOrders.filter(o => ['Delivered','Active'].includes(o.status)).reduce((a, o) => a + Number(o.qty) * Number(o.unitPrice), 0);
    const pipeline = cOrders.filter(o => ['Quoted','Pending','In Progress'].includes(o.status)).reduce((a, o) => a + Number(o.qty) * Number(o.unitPrice), 0);
    return { name: c.name?.slice(0, 20) || '—', revenue, pipeline, orders: cOrders.length };
  }).filter(c => c.orders > 0).sort((a, b) => b.revenue + b.pipeline - (a.revenue + a.pipeline)).slice(0, 8);

  const vendorData = vendors.map(v => {
    const vPOs = pos.filter(p => p.vendorId === v.id);
    const total = vPOs.reduce((a, p) => a + Number(p.total), 0);
    const received = vPOs.filter(p => p.status === 'Received').length;
    const open = vPOs.filter(p => p.status !== 'Received').length;
    return { name: v.name?.slice(0, 20) || '—', total, received, open, count: vPOs.length };
  }).filter(v => v.count > 0).sort((a, b) => b.total - a.total);

  const poStatusData = ['Draft','Ordered','Shipped','Received'].map(s => ({
    name: s, value: pos.filter(p => p.status === s).length
  })).filter(d => d.value > 0);

  const monthlyData = (() => {
    const months = {};
    orders.forEach(o => {
      if (!o.date) return;
      const month = o.date.slice(0, 7);
      if (!months[month]) months[month] = { month, revenue: 0, orders: 0, pipeline: 0 };
      if (['Delivered','Active'].includes(o.status)) months[month].revenue += Number(o.qty) * Number(o.unitPrice);
      if (['Quoted','Pending','In Progress'].includes(o.status)) months[month].pipeline += Number(o.qty) * Number(o.unitPrice);
      months[month].orders++;
    });
    return Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  })();

  const tabs = [
    { key: 'sales', label: 'Sales performance' },
    { key: 'fulfillment', label: 'Order fulfillment' },
    { key: 'customers', label: 'Customer activity' },
    { key: 'vendors', label: 'Vendor performance' },
  ];

  return (
    <div className="page">
      <div className="topbar">
        <h1>Reports</h1>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>
      <div className="content">

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Closed revenue', val: fmt(totalRevenue), sub: 'delivered & active orders' },
            { label: 'Pipeline value', val: fmt(totalPipeline), sub: 'quoted & in progress' },
            { label: 'Total PO cost', val: fmt(totalCost), sub: 'vendor orders placed' },
            { label: 'Gross margin', val: fmt(totalMargin), sub: 'on closed orders' },
          ].map(m => (
            <div key={m.label} className="metric">
              <div className="metric-label">{m.label}</div>
              <div className="metric-val">{m.val}</div>
              <div className="metric-sub">{m.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', marginBottom: 24 }}>
          {tabs.map(t => (
            <div key={t.key} onClick={() => setActiveTab(t.key)} style={{ padding: '10px 20px', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === t.key ? 600 : 400, color: activeTab === t.key ? '#0f172a' : '#64748b', borderBottom: activeTab === t.key ? '2px solid #0f172a' : '2px solid transparent', marginBottom: -1 }}>
              {t.label}
            </div>
          ))}
        </div>

        {activeTab === 'sales' && (
          <div>
            <div className="two-col" style={{ marginBottom: 20 }}>
              <div className="card">
                <div className="section-title">Revenue vs pipeline by month</div>
                {monthlyData.length === 0 ? (
                  <div className="empty-state"><div className="empty-state-icon">📊</div><div className="empty-state-title">No data yet</div><div>Add orders with dates to see monthly trends</div></div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }}/>
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'}/>
                      <Tooltip formatter={(v) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}/>
                      <Legend wrapperStyle={{ fontSize: 12 }}/>
                      <Bar dataKey="revenue" name="Revenue" fill="#1d4ed8" radius={[4,4,0,0]}/>
                      <Bar dataKey="pipeline" name="Pipeline" fill="#93c5fd" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="card">
                <div className="section-title">Orders by status</div>
                {statusData.length === 0 ? (
                  <div className="empty-state"><div className="empty-state-icon">📊</div><div className="empty-state-title">No orders yet</div></div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                        {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}/>
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <div className="card">
              <div className="section-title">Order summary</div>
              <table className="tbl">
                <thead><tr><th>Status</th><th>Count</th><th>Total value</th><th>% of total</th></tr></thead>
                <tbody>
                  {['Quoted','Pending','In Progress','Active','Delivered','On Hold'].map(s => {
                    const sOrders = orders.filter(o => o.status === s);
                    const val = sOrders.reduce((a, o) => a + Number(o.qty) * Number(o.unitPrice), 0);
                    const total = orders.reduce((a, o) => a + Number(o.qty) * Number(o.unitPrice), 0);
                    if (sOrders.length === 0) return null;
                    return (
                      <tr key={s}>
                        <td><span className={`badge ${s}`}>{s}</span></td>
                        <td>{sOrders.length}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(val)}</td>
                        <td>{total > 0 ? Math.round(val / total * 100) : 0}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'fulfillment' && (
          <div>
            <div className="two-col" style={{ marginBottom: 20 }}>
              <div className="card">
                <div className="section-title">PO status breakdown</div>
                {poStatusData.length === 0 ? (
                  <div className="empty-state"><div className="empty-state-icon">🚚</div><div className="empty-state-title">No POs yet</div></div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={poStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                        {poStatusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }}/>
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="card">
                <div className="section-title">Orders missing vendor PO</div>
                <div style={{ marginBottom: 16 }}>
                  {['Pending','In Progress'].map(s => {
                    const missing = orders.filter(o => o.status === s && !o.vendorPO);
                    return (
                      <div key={s} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <span className={`badge ${s}`}>{s}</span>
                        <span style={{ fontWeight: 600, color: missing.length > 0 ? '#ef4444' : '#15803d', fontSize: 20 }}>{missing.length}</span>
                      </div>
                    );
                  })}
                </div>
                {orders.filter(o => ['Pending','In Progress'].includes(o.status) && !o.vendorPO).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '10px 0', color: '#15803d', fontSize: 13, fontWeight: 600 }}>✓ All active orders have vendor POs</div>
                ) : (
                  <table className="tbl">
                    <thead><tr><th>Customer</th><th>Product</th><th>Status</th></tr></thead>
                    <tbody>
                      {orders.filter(o => ['Pending','In Progress'].includes(o.status) && !o.vendorPO).map(o => (
                        <tr key={o.id}>
                          <td style={{ fontWeight: 600 }}>{o.customerName}</td>
                          <td style={{ color: '#64748b', fontSize: 12 }}>{o.product?.slice(0, 25)}</td>
                          <td><span className={`badge ${o.status}`}>{o.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <div className="card">
              <div className="section-title">Purchase order details</div>
              <table className="tbl">
                <thead><tr><th>PO</th><th>Vendor</th><th>Linked order</th><th>Cost</th><th>Expected</th><th>Status</th></tr></thead>
                <tbody>
                  {pos.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>No purchase orders yet</td></tr>}
                  {pos.map(p => {
                    const so = orders.find(o => o.id === p.relatedSO);
                    return (
                      <tr key={p.id}>
                        <td style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>{p.id}</td>
                        <td style={{ fontWeight: 600 }}>{p.vendorName || '—'}</td>
                        <td style={{ fontSize: 12, color: '#2563eb' }}>{so ? so.customerName : '—'}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(p.total)}</td>
                        <td style={{ color: '#94a3b8', fontSize: 12 }}>{p.expectedDate || '—'}</td>
                        <td><span className={`badge ${p.status}`}>{p.status}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'customers' && (
          <div>
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="section-title">Revenue & pipeline by customer</div>
              {customerRevenue.length === 0 ? (
                <div className="empty-state"><div className="empty-state-icon">👥</div><div className="empty-state-title">No customer data yet</div></div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={customerRevenue} margin={{ top: 5, right: 10, left: 10, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} angle={-35} textAnchor="end" interval={0}/>
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'}/>
                    <Tooltip formatter={v => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}/>
                    <Legend wrapperStyle={{ fontSize: 12 }}/>
                    <Bar dataKey="revenue" name="Revenue" fill="#1d4ed8" radius={[4,4,0,0]}/>
                    <Bar dataKey="pipeline" name="Pipeline" fill="#93c5fd" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="card">
              <div className="section-title">Customer breakdown</div>
              <table className="tbl">
                <thead><tr><th>Customer</th><th>Industry</th><th>Orders</th><th>Revenue</th><th>Pipeline</th><th>Total value</th></tr></thead>
                <tbody>
                  {customerRevenue.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>No data yet</td></tr>}
                  {customerRevenue.map(c => (
                    <tr key={c.name}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td style={{ color: '#64748b', fontSize: 12 }}>{customers.find(x => x.name?.slice(0,20) === c.name)?.industry || '—'}</td>
                      <td>{c.orders}</td>
                      <td style={{ fontWeight: 600, color: '#15803d' }}>{fmt(c.revenue)}</td>
                      <td style={{ color: '#1d4ed8' }}>{fmt(c.pipeline)}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(c.revenue + c.pipeline)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'vendors' && (
          <div>
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="section-title">Total spend by vendor</div>
              {vendorData.length === 0 ? (
                <div className="empty-state"><div className="empty-state-icon">🏭</div><div className="empty-state-title">No vendor data yet</div></div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={vendorData} margin={{ top: 5, right: 10, left: 10, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} angle={-35} textAnchor="end" interval={0}/>
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'}/>
                    <Tooltip formatter={v => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }}/>
                    <Legend wrapperStyle={{ fontSize: 12 }}/>
                    <Bar dataKey="total" name="Total spend" fill="#0f6e56" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="card">
              <div className="section-title">Vendor performance</div>
              <table className="tbl">
                <thead><tr><th>Vendor</th><th>Total POs</th><th>Received</th><th>Open</th><th>Total spend</th><th>Status</th></tr></thead>
                <tbody>
                  {vendorData.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>No data yet</td></tr>}
                  {vendorData.map(v => (
                    <tr key={v.name}>
                      <td style={{ fontWeight: 600 }}>{v.name}</td>
                      <td>{v.count}</td>
                      <td style={{ color: '#15803d', fontWeight: 600 }}>{v.received}</td>
                      <td style={{ color: v.open > 0 ? '#854d0e' : '#94a3b8', fontWeight: 600 }}>{v.open}</td>
                      <td style={{ fontWeight: 700 }}>{fmt(v.total)}</td>
                      <td>
                        <span className="badge Active">{vendors.find(x => x.name?.slice(0,20) === v.name)?.status || 'Active'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}