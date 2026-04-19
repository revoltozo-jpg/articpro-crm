import React, { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';
import Login from './components/Login';
import Customers from './components/Customers';
import Orders from './components/Orders';
import Vendors from './components/Vendors';
import PurchaseOrders from './components/PurchaseOrders';
import Dashboard from './components/Dashboard';
import Import from './components/Import';
import Users from './components/Users';
import Reports from './components/Reports';
import ChangePassword from './components/ChangePassword';
import './App.css';

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_BEFORE = 60 * 1000; // warn 1 minute before

const icons = {
  dashboard: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  customers: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  orders: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  vendors: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  purchase_orders: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  reports: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
};

export const ROLES = {
  viewer:  { label: 'Viewer',  canCreate: false, canEdit: false, canDelete: false, canImport: false, canManageUsers: false, canViewReports: false, canViewFinancials: false },
  sales:   { label: 'Sales',   canCreate: true,  canEdit: true,  canDelete: false, canImport: false, canManageUsers: false, canViewReports: false, canViewFinancials: false, salesOnly: true },
  manager: { label: 'Manager', canCreate: true,  canEdit: true,  canDelete: false, canImport: false, canManageUsers: false, canViewReports: true,  canViewFinancials: true },
  admin:   { label: 'Admin',   canCreate: true,  canEdit: true,  canDelete: true,  canImport: true,  canManageUsers: true,  canViewReports: true,  canViewFinancials: true },
};

function SessionWarning({ secondsLeft, onStayLoggedIn, onLogout }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,41,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 32, width: 400, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏱</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Session expiring soon</div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6, lineHeight: 1.6 }}>
          You have been inactive for a while. Your session will expire in
        </div>
        <div style={{ fontSize: 36, fontWeight: 800, color: '#ef4444', marginBottom: 16 }}>
          {secondsLeft}s
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 24 }}>
          Any unsaved changes will be lost.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onLogout} style={{ padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: '#64748b' }}>
            Sign out now
          </button>
          <button onClick={onStayLoggedIn} style={{ padding: '9px 24px', border: 'none', borderRadius: 8, background: '#1d4ed8', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Stay logged in
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userRole, setUserRole] = useState('viewer');
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [view, setView] = useState('dashboard');
  const [detail, setDetail] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  const timeoutRef = useRef(null);
  const warningRef = useRef(null);
  const countdownRef = useRef(null);

  const handleLogout = useCallback(() => {
    clearTimeout(timeoutRef.current);
    clearTimeout(warningRef.current);
    clearInterval(countdownRef.current);
    setShowWarning(false);
    signOut(auth);
  }, []);

  const resetTimer = useCallback(() => {
    if (!user) return;
    clearTimeout(timeoutRef.current);
    clearTimeout(warningRef.current);
    clearInterval(countdownRef.current);
    setShowWarning(false);

    warningRef.current = setTimeout(() => {
      setSecondsLeft(60);
      setShowWarning(true);
      countdownRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            handleLogout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, INACTIVITY_TIMEOUT - WARNING_BEFORE);

    timeoutRef.current = setTimeout(() => {
      handleLogout();
    }, INACTIVITY_TIMEOUT);
  }, [user, handleLogout]);

  useEffect(() => {
    if (!user) return;
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      clearTimeout(timeoutRef.current);
      clearTimeout(warningRef.current);
      clearInterval(countdownRef.current);
    };
  }, [user, resetTimer]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDocs(collection(db, 'crm_users'));
          const found = snap.docs.map(d => d.data()).find(d => d.email === u.email);
          if (found?.role) {
            setUserRole(found.role);
          } else {
            const adminsSnap = await getDocs(collection(db, 'admins'));
            const adminEmails = adminsSnap.docs.map(d => d.id);
            setUserRole(adminEmails.includes(u.email) ? 'admin' : 'viewer');
          }
          if (found?.mustChangePassword) setMustChangePassword(true);
        } catch (err) { setUserRole('viewer'); }
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const nav = (v) => { setView(v); setDetail(null); };
  const goDetail = (v, id) => { setView(v); setDetail(id); };
  const perms = ROLES[userRole] || ROLES.viewer;
  const isAdmin = userRole === 'admin';

  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f1729', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', letterSpacing: '0.5px', marginBottom: 6 }}>PROTEC<span style={{ color: '#60a5fa' }}>®</span></div>
        <div style={{ fontSize: 12, color: '#475569' }}>Loading...</div>
      </div>
    </div>
  );

  if (!user) return <Login />;

  if (mustChangePassword) return (
    <div style={{ minHeight: '100vh', background: '#0f1729', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', letterSpacing: '0.5px', marginBottom: 4 }}>PROTEC<span style={{ color: '#60a5fa' }}>®</span></div>
          <div style={{ fontSize: 11, color: '#60a5fa', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Applied Mechanical Products</div>
        </div>
        <ChangePassword forced={true} onClose={(success) => { if (success) setMustChangePassword(false); }} />
      </div>
    </div>
  );

  const navGroups = [
    { label: 'Overview', items: [
      { key: 'dashboard', label: 'Dashboard' },
      ...(perms.canViewReports ? [{ key: 'reports', label: 'Reports' }] : []),
    ]},
    { label: 'Sales', items: [
      { key: 'customers', label: 'Customers' },
      { key: 'orders', label: 'Customer orders' },
    ]},
    { label: 'Procurement', items: [
      { key: 'vendors', label: 'Vendors' },
      { key: 'purchase_orders', label: 'Purchase orders' },
    ]},
    ...(isAdmin ? [{ label: 'Admin', items: [{ key: 'users', label: 'User management' }] }] : []),
  ];

  const roleBadgeColor = { viewer: '#64748b', sales: '#1d4ed8', manager: '#0f6e56', admin: '#6d28d9' };

  return (
    <div className="app-layout">
      {showWarning && (
        <SessionWarning
          secondsLeft={secondsLeft}
          onStayLoggedIn={resetTimer}
          onLogout={handleLogout}
        />
      )}

      <div className="sidebar">
        <div className="sidebar-logo">
          <div style={{ fontSize: 20, fontWeight: 800, color: '#ffffff', letterSpacing: '1px' }}>PROTEC<span style={{ color: '#60a5fa' }}>®</span></div>
          <div style={{ fontSize: 9, color: '#60a5fa', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 3, fontWeight: 600 }}>Applied Mechanical Products</div>
          <div style={{ fontSize: 10, color: '#475569', marginTop: 6, fontWeight: 500 }}>CRM Portal</div>
        </div>

        {navGroups.map(group => (
          <div key={group.label}>
            <div className="nav-section-label">{group.label}</div>
            {group.items.map(item => (
              <div key={item.key} className={`nav-item ${view === item.key ? 'active' : ''}`} onClick={() => nav(item.key)}>
                {icons[item.key]}{item.label}
              </div>
            ))}
          </div>
        ))}

        {perms.canImport && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #1e3a8a', marginTop: 8 }}>
            <button onClick={() => setShowImport(true)} style={{ width: '100%', padding: '8px', background: '#1a2744', border: '1px solid #1e3a8a', borderRadius: 8, color: '#93c5fd', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 500 }}>
              📂 Import from Excel
            </button>
          </div>
        )}

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div style={{ fontSize: 11, color: '#64748b', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: roleBadgeColor[userRole], color: '#fff' }}>{ROLES[userRole]?.label}</span>
          </div>
          <button onClick={() => setShowChangePassword(true)} style={{ width: '100%', padding: '7px', background: 'transparent', border: '1px solid #1e293b', borderRadius: 6, color: '#64748b', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6 }}>
            Change password
          </button>
          <button className="signout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </div>

      <div className="main">
        {view === 'dashboard' && <Dashboard goDetail={goDetail} perms={perms} />}
        {view === 'reports' && perms.canViewReports && <Reports />}
        {view === 'customers' && <Customers detail={detail} setDetail={setDetail} goDetail={goDetail} perms={perms} />}
        {view === 'orders' && <Orders detail={detail} setDetail={setDetail} goDetail={goDetail} perms={perms} />}
        {view === 'vendors' && <Vendors detail={detail} setDetail={setDetail} goDetail={goDetail} perms={perms} />}
        {view === 'purchase_orders' && <PurchaseOrders detail={detail} setDetail={setDetail} goDetail={goDetail} perms={perms} />}
        {view === 'users' && isAdmin && <Users />}
      </div>

      {showImport && <Import onClose={() => setShowImport(false)} />}
      {showChangePassword && (
        <ChangePassword forced={false} onClose={(success) => {
          setShowChangePassword(false);
          if (success) alert('Password updated successfully!');
        }} />
      )}
    </div>
  );
}