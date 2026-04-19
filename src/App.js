import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import Login from './components/Login';
import Customers from './components/Customers';
import Orders from './components/Orders';
import Vendors from './components/Vendors';
import PurchaseOrders from './components/PurchaseOrders';
import Dashboard from './components/Dashboard';
import './App.css';

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState('dashboard');
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const nav = (v) => { setView(v); setDetail(null); };
  const goDetail = (v, id) => { setView(v); setDetail(id); };

  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f6fa' }}>
      <div style={{ fontSize: 14, color: '#6b7280' }}>Loading...</div>
    </div>
  );

  if (!user) return <Login />;

  const navItems = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'customers', label: 'Customers' },
    { key: 'orders', label: 'Customer orders' },
    { key: 'vendors', label: 'Vendors' },
    { key: 'purchase_orders', label: 'Purchase orders' },
  ];

  return (
    <div className="app-layout">
      <div className="sidebar">
        <div className="sidebar-logo">
          <h2>ArcticPro CRM</h2>
          <p>Industrial HVAC</p>
        </div>
        {navItems.map(item => (
          <div
            key={item.key}
            className={`nav-item ${view === item.key ? 'active' : ''}`}
            onClick={() => nav(item.key)}
          >
            {item.label}
          </div>
        ))}
        <div style={{ marginTop: 'auto', padding: 16, borderTop: '1px solid #ffffff15' }}>
          <div style={{ fontSize: 11, color: '#ffffff60', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
          <button
            onClick={() => signOut(auth)}
            style={{ width: '100%', padding: '7px', background: 'transparent', border: '1px solid #ffffff30', borderRadius: 8, color: '#ffffff80', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Sign out
          </button>
        </div>
      </div>
      <div className="main">
        {view === 'dashboard' && <Dashboard goDetail={goDetail} />}
        {view === 'customers' && <Customers detail={detail} setDetail={setDetail} />}
        {view === 'orders' && <Orders detail={detail} setDetail={setDetail} goDetail={goDetail} />}
        {view === 'vendors' && <Vendors detail={detail} setDetail={setDetail} />}
        {view === 'purchase_orders' && <PurchaseOrders detail={detail} setDetail={setDetail} goDetail={goDetail} />}
      </div>
    </div>
  );
}