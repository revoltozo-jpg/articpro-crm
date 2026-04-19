import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError('Invalid email or password. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f1729', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 24px' }}>

        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1e3a8a, #2d5fc4)', width: 64, height: 64, borderRadius: 16, marginBottom: 16 }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.5px', lineHeight: 1 }}>PROTEC<span style={{ color: '#60a5fa' }}>®</span></div>
            <div style={{ fontSize: 11, color: '#60a5fa', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4, fontWeight: 600 }}>Applied Mechanical Products</div>
          </div>
          <div style={{ width: 40, height: 2, background: '#1e3a8a', margin: '0 auto 16px' }}></div>
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>CRM Portal — Sign in to continue</p>
        </div>

        <div style={{ background: '#1a2744', borderRadius: 16, padding: 32, border: '1px solid #1e3a8a' }}>
          {error && (
            <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', color: '#fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 18 }}>
              {error}
            </div>
          )}
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b', display: 'block', marginBottom: 6, fontWeight: 600 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@protec.com"
                style={{ width: '100%', padding: '11px 14px', border: '1px solid #1e3a8a', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#0f1729', color: '#f1f5f9', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b', display: 'block', marginBottom: 6, fontWeight: 600 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{ width: '100%', padding: '11px 14px', border: '1px solid #1e3a8a', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#0f1729', color: '#f1f5f9', boxSizing: 'border-box' }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '12px', background: loading ? '#1e3a8a' : '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'inherit', letterSpacing: '0.02em' }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#334155', fontSize: 11, marginTop: 20 }}>
          Contact your administrator to request access
        </p>
      </div>
    </div>
  );
}