import React, { useState } from 'react';
import Customers from './components/Customers';
import Orders from './components/Orders';
import Vendors from './components/Vendors';
import PurchaseOrders from './components/PurchaseOrders';
import Dashboard from './components/Dashboard';
import './App.css';

export default function App() {
  const [view, setView] = useState('dashboard');
  const [detail, setDetail] = useState(null);

  const nav = (v) => { setView(v); setDetail(null); };
  const goDetail = (v, id) => { setView(v); setDetail(id); };

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