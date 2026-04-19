import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { ROLES } from '../App';
import './Shared.css';

const FIREBASE_API_KEY = 'AIzaSyDqwHHr0f3b28ChjAi4WagYay77nka4seo';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [resetModal, setResetModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'sales' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const usersSnap = await getDocs(collection(db, 'crm_users'));
      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createUser = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email, password: form.password, returnSecureToken: true }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      await setDoc(doc(db, 'crm_users', data.localId), {
        name: form.name,
        email: form.email,
        uid: data.localId,
        role: form.role,
        isAdmin: form.role === 'admin',
        createdAt: new Date().toISOString(),
        status: 'Active',
        mustChangePassword: true,
      });

      if (form.role === 'admin') {
        await setDoc(doc(db, 'admins', form.email), { isAdmin: true, name: form.name });
      }

      setSuccess(`User ${form.email} created! They will be prompted to set their own password on first login.`);
      setForm({ name: '', email: '', password: '', role: 'sales' });
      setModal(false);
      load();
    } catch (err) {
      setError(err.message.replace(/_/g, ' ').toLowerCase());
    }
    setSaving(false);
  };

  const updateRole = async (u, newRole) => {
    await setDoc(doc(db, 'crm_users', u.uid), { ...u, role: newRole, isAdmin: newRole === 'admin' }, { merge: true });
    if (newRole === 'admin') {
      await setDoc(doc(db, 'admins', u.email), { isAdmin: true, name: u.name });
    } else {
      try { await deleteDoc(doc(db, 'admins', u.email)); } catch (e) {}
    }
    setSuccess(`${u.name}'s role updated to ${ROLES[newRole]?.label}`);
    load();
  };

  const sendPasswordReset = async (email) => {
    try {
      await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
        }
      );
      setSuccess(`Password reset email sent to ${email}`);
      setResetModal(false);
    } catch (err) { setError('Failed to send reset email'); }
  };

  const deleteUser = async (user) => {
    await deleteDoc(doc(db, 'crm_users', user.uid));
    if (user.isAdmin) { try { await deleteDoc(doc(db, 'admins', user.email)); } catch (e) {} }
    setSuccess(`${user.email} has been removed`);
    setDeleteConfirm(null);
    load();
  };

  const roleBadgeColor = {
    viewer: '#64748b', sales: '#1d4ed8', manager: '#0f6e56', admin: '#6d28d9'
  };

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>Admin</div>
          <h1>User management</h1>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => { setForm({ name: '', email: '', password: '', role: 'sales' }); setError(''); setModal(true); }}>
            + Add user
          </button>
        </div>
      </div>

      <div className="content">
        {success && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#15803d', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {success}
            <button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#15803d', fontSize: 16 }}>×</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
          {Object.entries(ROLES).map(([key, r]) => (
            <div key={key} className="metric">
              <div className="metric-label">{r.label}</div>
              <div className="metric-val">{users.filter(u => u.role === key).length}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title" style={{ marginBottom: 16 }}>Permission levels</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Permission</th>
                {Object.entries(ROLES).map(([key, r]) => (
                  <th key={key} style={{ textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: roleBadgeColor[key], color: '#fff', fontSize: 10, fontWeight: 600 }}>{r.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'View all records', keys: ['viewer','sales','manager','admin'] },
                { label: 'Create customers & orders', keys: ['sales','manager','admin'] },
                { label: 'Create vendors & POs', keys: ['manager','admin'] },
                { label: 'Edit all records', keys: ['sales','manager','admin'] },
                { label: 'Delete records', keys: ['admin'] },
                { label: 'Import from Excel', keys: ['admin'] },
                { label: 'View reports', keys: ['manager','admin'] },
                { label: 'Manage users', keys: ['admin'] },
              ].map(row => (
                <tr key={row.label}>
                  <td style={{ fontSize: 13 }}>{row.label}</td>
                  {Object.keys(ROLES).map(key => (
                    <td key={key} style={{ textAlign: 'center' }}>
                      {row.keys.includes(key)
                        ? <span style={{ color: '#15803d', fontWeight: 700, fontSize: 16 }}>✓</span>
                        : <span style={{ color: '#e2e8f0', fontSize: 16 }}>✗</span>
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="section-title" style={{ marginBottom: 16 }}>Team members</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Password</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="6" style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Loading...</td></tr>}
              {!loading && users.length === 0 && (
                <tr><td colSpan="6">
                  <div className="empty-state">
                    <div className="empty-state-icon">👥</div>
                    <div className="empty-state-title">No users yet</div>
                  </div>
                </td></tr>
              )}
              {users.map(u => (
                <tr key={u.uid}>
                  <td style={{ fontWeight: 600 }}>{u.name || '—'}</td>
                  <td style={{ color: '#64748b', fontSize: 12 }}>{u.email}</td>
                  <td>
                    {u.email === auth.currentUser?.email ? (
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: roleBadgeColor[u.role] || '#6d28d9', color: '#fff', fontSize: 11, fontWeight: 600 }}>
                        {ROLES[u.role]?.label || 'Admin'}
                      </span>
                    ) : (
                      <select value={u.role || 'viewer'} onChange={e => updateRole(u, e.target.value)}
                        style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: '#f8fafc', cursor: 'pointer' }}>
                        {Object.entries(ROLES).map(([key, r]) => (
                          <option key={key} value={key}>{r.label}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    {u.mustChangePassword
                      ? <span style={{ fontSize: 11, color: '#854d0e', background: '#fef9c3', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>Pending reset</span>
                      : <span style={{ fontSize: 11, color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>Set</span>
                    }
                  </td>
                  <td><span className={`badge ${u.status}`}>{u.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setSelectedUser(u); setResetModal(true); }}>
                        Reset pwd
                      </button>
                      {u.email !== auth.currentUser?.email && (
                        <button className="btn" style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: '#fecaca' }} onClick={() => setDeleteConfirm(u)}>
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 16, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#92400e' }}>
          ⚠️ Role changes take effect the next time the user logs in or refreshes. New users are prompted to set their own password on first login.
        </div>
      </div>

      {modal && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 460 }}>
            <div className="modal-header">
              <h3>Add new user</h3>
              <button className="close-btn" onClick={() => setModal(false)}>×</button>
            </div>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c', marginBottom: 16 }}>{error}</div>
            )}
            <div className="form-group"><label>Full name</label><input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="John Smith" /></div>
            <div className="form-group"><label>Email address</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="john@protec.com" /></div>
            <div className="form-group"><label>Temporary password</label><input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min. 6 characters" /></div>
            <div className="form-group">
              <label>Role</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {Object.entries(ROLES).map(([key, r]) => (
                  <option key={key} value={key}>{r.label} — {
                    key === 'viewer' ? 'view only' :
                    key === 'sales' ? 'create & edit customers and orders' :
                    key === 'manager' ? 'full operations, no delete' :
                    'full access including delete & users'
                  }</option>
                ))}
              </select>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#15803d', marginBottom: 16 }}>
              ✓ The user will be prompted to set their own password on their first login.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createUser} disabled={saving}>{saving ? 'Creating...' : 'Create user'}</button>
            </div>
          </div>
        </div>
      )}

      {resetModal && selectedUser && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 420 }}>
            <div className="modal-header"><h3>Reset password</h3><button className="close-btn" onClick={() => setResetModal(false)}>×</button></div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>Send a password reset email to <strong>{selectedUser.email}</strong>?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setResetModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => sendPasswordReset(selectedUser.email)}>Send reset email</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 420 }}>
            <div className="modal-header"><h3>Remove user</h3><button className="close-btn" onClick={() => setDeleteConfirm(null)}>×</button></div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>Are you sure you want to remove <strong>{deleteConfirm.email}</strong>?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn" style={{ background: '#ef4444', color: '#fff', borderColor: '#ef4444' }} onClick={() => deleteUser(deleteConfirm)}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}