import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import './Shared.css';

const FIREBASE_API_KEY = 'AIzaSyDqwHHr0f3b28ChjAi4WagYay77nka4seo';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [resetModal, setResetModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', isAdmin: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const adminsSnap = await getDocs(collection(db, 'admins'));
      const adminsList = adminsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAdmins(adminsList);

      const usersSnap = await getDocs(collection(db, 'crm_users'));
      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
    }
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
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            returnSecureToken: true,
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      await setDoc(doc(db, 'crm_users', data.localId), {
        name: form.name,
        email: form.email,
        uid: data.localId,
        isAdmin: form.isAdmin,
        createdAt: new Date().toISOString(),
        status: 'Active',
      });

      if (form.isAdmin) {
        await setDoc(doc(db, 'admins', form.email), { isAdmin: true, name: form.name });
      }

      setSuccess(`User ${form.email} created successfully!`);
      setForm({ name: '', email: '', password: '', isAdmin: false });
      setModal(false);
      load();
    } catch (err) {
      setError(err.message.replace(/_/g, ' ').toLowerCase());
    }
    setSaving(false);
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
    } catch (err) {
      setError('Failed to send reset email');
    }
  };

  const deleteUser = async (user) => {
    try {
      await deleteDoc(doc(db, 'crm_users', user.uid));
      if (user.isAdmin) {
        await deleteDoc(doc(db, 'admins', user.email));
      }
      setSuccess(`${user.email} has been removed`);
      setDeleteConfirm(null);
      load();
    } catch (err) {
      setError('Failed to remove user');
    }
  };

  const isAdmin = (email) => admins.some(a => a.id === email);

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>Admin</div>
          <h1>User management</h1>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => { setForm({ name: '', email: '', password: '', isAdmin: false }); setError(''); setModal(true); }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
          <div className="metric"><div className="metric-label">Total users</div><div className="metric-val">{users.length}</div></div>
          <div className="metric"><div className="metric-label">Admins</div><div className="metric-val">{users.filter(u => u.isAdmin).length}</div></div>
          <div className="metric"><div className="metric-label">Active</div><div className="metric-val">{users.filter(u => u.status === 'Active').length}</div></div>
        </div>

        <div className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Loading users...</td></tr>
              )}
              {!loading && users.length === 0 && (
                <tr><td colSpan="6">
                  <div className="empty-state">
                    <div className="empty-state-icon">👥</div>
                    <div className="empty-state-title">No users yet</div>
                    <div>Add your first team member to get started</div>
                  </div>
                </td></tr>
              )}
              {users.map(u => (
                <tr key={u.uid}>
                  <td style={{ fontWeight: 600 }}>{u.name || '—'}</td>
                  <td style={{ color: '#64748b' }}>{u.email}</td>
                  <td>
                    {u.isAdmin
                      ? <span className="badge Active">Admin</span>
                      : <span className="badge Quoted">User</span>
                    }
                  </td>
                  <td style={{ color: '#94a3b8', fontSize: 12 }}>
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td><span className={`badge ${u.status}`}>{u.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn"
                        style={{ fontSize: 11, padding: '4px 10px' }}
                        onClick={() => { setSelectedUser(u); setResetModal(true); }}
                      >
                        Reset password
                      </button>
                      {u.email !== auth.currentUser?.email && (
                        <button
                          className="btn"
                          style={{ fontSize: 11, padding: '4px 10px', color: '#ef4444', borderColor: '#fecaca' }}
                          onClick={() => setDeleteConfirm(u)}
                        >
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
          ⚠️ <strong>Note:</strong> Removing a user here removes them from the CRM user list. To fully revoke Firebase access, also remove them from the Firebase Console → Authentication → Users.
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
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c', marginBottom: 16 }}>
                {error}
              </div>
            )}
            <div className="form-group">
              <label>Full name</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="John Smith" />
            </div>
            <div className="form-group">
              <label>Email address</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="john@protec.com" />
            </div>
            <div className="form-group">
              <label>Temporary password</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min. 6 characters" />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select value={form.isAdmin ? 'admin' : 'user'} onChange={e => setForm({ ...form, isAdmin: e.target.value === 'admin' })}>
                <option value="user">User — standard access</option>
                <option value="admin">Admin — can manage users</option>
              </select>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#64748b', marginBottom: 16 }}>
              💡 The user will be able to log in immediately with the temporary password. Send them a password reset email so they can set their own.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createUser} disabled={saving}>
                {saving ? 'Creating...' : 'Create user'}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetModal && selectedUser && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 420 }}>
            <div className="modal-header">
              <h3>Reset password</h3>
              <button className="close-btn" onClick={() => setResetModal(false)}>×</button>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
              Send a password reset email to <strong>{selectedUser.email}</strong>? They will receive a link to set a new password.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setResetModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => sendPasswordReset(selectedUser.email)}>
                Send reset email
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal" style={{ width: 420 }}>
            <div className="modal-header">
              <h3>Remove user</h3>
              <button className="close-btn" onClick={() => setDeleteConfirm(null)}>×</button>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
              Are you sure you want to remove <strong>{deleteConfirm.email}</strong> from the CRM?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn" style={{ background: '#ef4444', color: '#fff', borderColor: '#ef4444' }} onClick={() => deleteUser(deleteConfirm)}>
                Remove user
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}