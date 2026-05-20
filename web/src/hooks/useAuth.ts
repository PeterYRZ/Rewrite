import { useState, useCallback, useEffect } from 'react';

const API_BASE = '/api';
const TOKEN_KEY = 'rw-auth-token';
const USER_KEY = 'rw-auth-user';

interface AuthUser {
  username: string;
  role: string;
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY),
  );
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const login = useCallback(async (accessKey: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_key: accessKey }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return false;
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      const u = { username: data.username, role: data.role };
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      setToken(data.token);
      setUser(u);
      return true;
    } catch {
      setError('Network error');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, [token]);

  const verify = useCallback(async () => {
    if (!token) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.valid) {
        logout();
        return false;
      }
      return true;
    } catch {
      return !!token; // Offline: trust cached token
    }
  }, [token, logout]);

  // Verify token on mount
  useEffect(() => {
    if (token) verify();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    token,
    user,
    loading,
    error,
    login,
    logout,
    verify,
    isLoggedIn: !!token && !!user,
  };
}
