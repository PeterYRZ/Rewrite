import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api';

interface AdminUser {
  username: string;
  role: string;
}

interface Props {
  token: string;
  onClose: () => void;
}

export default function AdminPanel({ token, onClose }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // New user form
  const [newUsername, setNewUsername] = useState('');
  const [newKey, setNewKey] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: { 'X-Auth-Token': token },
      });
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch {
      setError('Failed to fetch users');
    }
  }, [token]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleAdd = async () => {
    if (!newUsername || !newKey) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ username: newUsername, access_key: newKey, role: 'user' }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setNewUsername('');
      setNewKey('');
      fetchUsers();
    } catch {
      setError('Failed to add user');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (username: string) => {
    try {
      await fetch(`${API_BASE}/admin/users/${username}`, {
        method: 'DELETE',
        headers: { 'X-Auth-Token': token },
      });
      fetchUsers();
    } catch {
      setError('Failed to delete user');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-start justify-center pt-20 overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 p-6 shadow-sm mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-700">用户管理</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            ✕ 关闭
          </button>
        </div>

        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

        {/* User list */}
        <div className="space-y-1 mb-4 max-h-48 overflow-y-auto">
          {users.map((u) => (
            <div key={u.username} className="flex items-center justify-between p-2 rounded bg-slate-50 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-700">{u.username}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${u.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>
                  {u.role}
                </span>
              </div>
              {u.role !== 'admin' && (
                <button
                  onClick={() => handleDelete(u.username)}
                  className="text-red-400 hover:text-red-600 text-xs cursor-pointer"
                >
                  删除
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add user form */}
        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-600 mb-2">添加用户</h3>
          <div className="space-y-2">
            <input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="用户名"
              className="w-full p-2 border border-slate-200 rounded text-sm outline-none"
            />
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Access Key"
              className="w-full p-2 border border-slate-200 rounded text-sm outline-none"
            />
            <button
              onClick={handleAdd}
              disabled={loading || !newUsername || !newKey}
              className="w-full py-2 bg-slate-800 text-white rounded text-sm hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
            >
              {loading ? '添加中...' : '添加用户'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
