import React, { useState } from 'react';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase';

export default function ChangePassword({ onClose, forced = false }) {
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = async () => {
    setError('');
    if (newPass.length < 6) { setError('New password must be at least 6 characters.'); return; }
    if (newPass !== confirm) { setError('New passwords do not match.'); return; }
    if (!forced && !current) { setError('Please enter your current password.'); return; }
    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!forced) {
        const credential = EmailAuthProvider.credential(user.email, current);
        await reauthenticateWithCredential(user, credential);
      }
      await updatePassword(user, newPass);
      const snap = await getDocs(collection(db, 'crm_users'));
      const userDoc = snap.docs.find(d => d.data().email === user.email);
      if (userDoc) {
        await updateDoc(doc(db, 'crm_users', userDoc.id), { mustChangePassword: false });
      }
      if (onClose) onClose(true);
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Current password is incorrect.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Use at least 6 characters.');
      } else {
        setError('Something went wrong. Please try again.');
      }
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 440 }}>
        <div className="modal-header">
          <h3>{forced ? 'Set your password' : 'Change password'}</h3>
          {!forced && <button className="close-btn" onClick={() => onClose(false)}>×</button>}
        </div>

        {forced && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1e40af', marginBottom: 18, lineHeight: 1.6 }}>
            Welcome to PROTEC CRM! For security, please set your own password before continuing.
          </div>
        )}

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!forced && (
          <div className="form-group">
            <label>Current password</label>
            <input type="password" value={current} onChange={e => setCurrent(e.target.value)} placeholder="Your current password" />
          </div>
        )}

        <div className="form-group">
          <label>New password</label>
          <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Min. 6 characters" />
        </div>

        <div className="form-group">
          <label>Confirm new password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat new password" />
        </div>

        <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#64748b', marginBottom: 16 }}>
          Password must be at least 6 characters. Use a mix of letters, numbers, and symbols for best security.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {!forced && <button className="btn" onClick={() => onClose(false)}>Cancel</button>}
          <button className="btn btn-primary" onClick={handleChange} disabled={saving}>
            {saving ? 'Saving...' : forced ? 'Set password & continue' : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  );
}