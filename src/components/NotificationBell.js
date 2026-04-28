// NotificationBell — global delay-alert bell that lives in the App shell.
// Polls the orders + purchase_orders collections every 60s, computes alerts
// using the same logic as the Operations Dashboard (collectAlerts in
// orderLifecycle), and surfaces a popover list when clicked.

import React, { useEffect, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { collectAlerts } from '../lib/orderLifecycle';

const POLL_MS = 60 * 1000;

export default function NotificationBell({ goDetail }) {
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);
  const buttonRef = useRef(null);

  const load = async () => {
    try {
      const [os, ps] = await Promise.all([
        getDocs(collection(db, 'orders')),
        getDocs(collection(db, 'purchase_orders')),
      ]);
      const orders = os.docs.map(d => ({ id: d.id, ...d.data() }));
      const pos = ps.docs.map(d => ({ id: d.id, ...d.data() }));
      setAlerts(collectAlerts(orders, pos));
    } catch (e) {
      // network error or rules issue — keep prior state, don't crash
      // eslint-disable-next-line no-console
      console.warn('alerts load failed', e);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (popoverRef.current?.contains(e.target)) return;
      if (buttonRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const count = alerts.length;
  const highCount = alerts.filter(a => a.severity === 'high').length;
  const dotColor = highCount > 0 ? '#ef4444' : count > 0 ? '#f59e0b' : null;

  const onClickAlert = (a) => {
    setOpen(false);
    if (a.target && goDetail) goDetail(a.target.view, a.target.id);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        onClick={() => setOpen(o => !o)}
        title={count === 0 ? 'No alerts' : `${count} alert${count > 1 ? 's' : ''}`}
        style={{
          position: 'relative', width: 32, height: 32, borderRadius: 8,
          border: 'none', background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#cbd5e1',
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {dotColor && (
          <span style={{
            position: 'absolute', top: 4, right: 4, minWidth: 14, height: 14,
            borderRadius: 7, background: dotColor, color: '#fff',
            fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '0 4px',
            boxShadow: '0 0 0 2px #0f1729',
          }}>{count > 99 ? '99+' : count}</span>
        )}
      </button>

      {open && (
        <div
          ref={popoverRef}
          style={{
            // Position to the right of the bell, anchored to bottom so it opens upward.
            // The bell sits at the bottom of a fixed-width sidebar, so we use position:fixed
            // and compute coordinates from the button so the popover escapes the sidebar's
            // overflow:hidden parent and doesn't get clipped.
            position: 'fixed',
            left: buttonRef.current ? (buttonRef.current.getBoundingClientRect().right + 8) : 240,
            bottom: buttonRef.current ? (window.innerHeight - buttonRef.current.getBoundingClientRect().bottom) : 16,
            width: 360, maxHeight: 480,
            overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0',
            borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
            zIndex: 9999, fontFamily: 'inherit',
          }}
        >
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>Alerts</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{count} item{count !== 1 ? 's' : ''}</div>
          </div>
          {count === 0 ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>✓</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>All clear</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Nothing requires attention.</div>
            </div>
          ) : (
            alerts.slice(0, 30).map((a, i) => {
              const c = a.severity === 'high'
                ? { bg: '#fef2f2', border: '#fecaca', icon: '#ef4444' }
                : a.severity === 'medium'
                ? { bg: '#fffbeb', border: '#fde68a', icon: '#f59e0b' }
                : { bg: '#f0f9ff', border: '#bae6fd', icon: '#0ea5e9' };
              return (
                <div
                  key={i}
                  onClick={() => onClickAlert(a)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 14px', borderBottom: '1px solid #f1f5f9',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: c.bg, border: `1px solid ${c.border}`, color: c.icon, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{a.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', lineHeight: 1.3 }}>{a.label}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.3 }}>{a.sub}</div>
                  </div>
                </div>
              );
            })
          )}
          {count > 0 && (
            <div style={{ padding: '10px 14px', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
              <button
                onClick={() => { setOpen(false); goDetail && goDetail('ops_dashboard', null); }}
                style={{ background: 'transparent', border: 'none', fontSize: 11, color: '#1d4ed8', cursor: 'pointer', fontWeight: 600 }}
              >
                View all on dashboard →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
