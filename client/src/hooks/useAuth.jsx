// Auth контекст: Supabase (когато anon key е наличен) с локален JWT
// fallback на Express сървъра. Излага единен интерфейс независимо от
// backend-а: { user, token, login, register, logout, authFetch }.
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = SUPA_URL && SUPA_KEY ? createClient(SUPA_URL, SUPA_KEY) : null;
export const AUTH_BACKEND = supabase ? 'supabase' : 'local';

const STORAGE_KEY = 'chorus-auth';
const AuthContext = createContext(null);

const supaUser = (session) =>
  session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        username: session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'artist',
        createdAt: session.user.created_at,
      }
    : null;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Възстановяване на сесията
  useEffect(() => {
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        setUser(supaUser(data.session));
        setToken(data.session?.access_token || null);
        setLoading(false);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        setUser(supaUser(session));
        setToken(session?.access_token || null);
      });
      return () => sub.subscription.unsubscribe();
    }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved?.token && saved?.user) {
        setUser(saved.user);
        setToken(saved.token);
      }
    } catch { /* повреден запис */ }
    setLoading(false);
    return undefined;
  }, []);

  const localAuth = async (path, body) => {
    const res = await fetch(`${SERVER_URL}/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Authentication failed');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setUser(data.user);
    setToken(data.token);
    return data.user;
  };

  const login = useCallback(async (email, password) => {
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      return supaUser(data.session);
    }
    return localAuth('login', { email, password });
  }, []);

  const register = useCallback(async (email, username, password) => {
    if (supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      if (error) throw new Error(error.message);
      if (!data.session) {
        // Проектът изисква email потвърждение
        throw new Error('Check your inbox — confirm your email, then log in.');
      }
      return supaUser(data.session);
    }
    return localAuth('register', { email, username, password });
  }, []);

  const logout = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setToken(null);
  }, []);

  const authFetch = useCallback(
    (url, options = {}) =>
      fetch(url.startsWith('http') ? url : `${SERVER_URL}${url}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }),
    [token]
  );

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, authFetch, backend: AUTH_BACKEND }),
    [user, token, loading, login, register, logout, authFetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
