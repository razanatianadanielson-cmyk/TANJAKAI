'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken, setToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let annule = false;
    (async () => {
      if (getToken()) {
        try { const me = await api.get('/auth/me'); if (!annule) setUser(me); } catch { setToken(null); }
      }
      if (!annule) setLoading(false);
    })();
    return () => { annule = true; };
  }, []);

  useEffect(() => {
    const surExpiration = () => { setToken(null); setUser(null); router.replace('/login?expire=1'); };
    window.addEventListener('tjk:unauthorized', surExpiration);
    return () => window.removeEventListener('tjk:unauthorized', surExpiration);
  }, [router]);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.requiresSecondFactor) return { secondFactor: true };
    setToken(res.accessToken);
    setUser(await api.get('/auth/me'));
    return { ok: true };
  }, []);

  const logout = useCallback(() => { setToken(null); setUser(null); router.replace('/login'); }, [router]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
