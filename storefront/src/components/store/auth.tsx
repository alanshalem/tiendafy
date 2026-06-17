'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5080';

export interface ShopUser {
  id: string;
  name: string;
  email: string;
}

interface AuthResult {
  ok: boolean;
  error?: string;
}

interface AuthContextValue {
  user: ShopUser | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (name: string, email: string, password: string) => Promise<AuthResult>;
  logout: () => void;
  /** URL de inicio del flujo de Google (navegación full-page). */
  googleUrl: (returnTo: string) => string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

async function problemMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data.detail || data.title || 'Algo salió mal. Probá de nuevo.';
  } catch {
    return 'Algo salió mal. Probá de nuevo.';
  }
}

export function AuthProvider({ storeKey, children }: { storeKey: string; children: ReactNode }) {
  const tokenKey = `tiendafy.shop.token.${storeKey}`;
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<ShopUser | null>(null);
  const [ready, setReady] = useState(false);

  const headers = useCallback(
    (t?: string | null): Record<string, string> => ({
      'Content-Type': 'application/json',
      'X-Tenant-Id': storeKey,
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
    }),
    [storeKey],
  );

  // Hidratación: token del callback de Google (#shop_token) o de localStorage → /me.
  useEffect(() => {
    let initial: string | null = null;
    if (typeof window !== 'undefined' && window.location.hash.includes('shop_token=')) {
      const m = window.location.hash.match(/shop_token=([^&]+)/);
      if (m) {
        initial = decodeURIComponent(m[1]);
        localStorage.setItem(tokenKey, initial);
        // Limpiar el token de la URL.
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }
    initial = initial ?? localStorage.getItem(tokenKey);
    if (!initial) {
      setReady(true);
      return;
    }
    setToken(initial);
    fetch(`${API}/api/v1/shop/auth/me`, { headers: headers(initial) })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (u) setUser(u);
        else {
          localStorage.removeItem(tokenKey);
          setToken(null);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [tokenKey, headers]);

  const persist = useCallback(
    (t: string, u: ShopUser) => {
      localStorage.setItem(tokenKey, t);
      setToken(t);
      setUser(u);
    },
    [tokenKey],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const res = await fetch(`${API}/api/v1/shop/auth/login`, { method: 'POST', headers: headers(), body: JSON.stringify({ email, password }) });
      if (!res.ok) return { ok: false, error: await problemMessage(res) };
      const data = await res.json();
      persist(data.token, data.customer);
      return { ok: true };
    },
    [headers, persist],
  );

  const register = useCallback(
    async (name: string, email: string, password: string): Promise<AuthResult> => {
      const res = await fetch(`${API}/api/v1/shop/auth/register`, { method: 'POST', headers: headers(), body: JSON.stringify({ name, email, password }) });
      if (!res.ok) return { ok: false, error: await problemMessage(res) };
      const data = await res.json();
      persist(data.token, data.customer);
      return { ok: true };
    },
    [headers, persist],
  );

  const logout = useCallback(() => {
    if (token) fetch(`${API}/api/v1/shop/auth/logout`, { method: 'POST', headers: headers(token) }).catch(() => {});
    localStorage.removeItem(tokenKey);
    setToken(null);
    setUser(null);
  }, [token, tokenKey, headers]);

  const googleUrl = useCallback(
    (returnTo: string) => `${API}/api/v1/shop/auth/google/start?tenant=${encodeURIComponent(storeKey)}&return=${encodeURIComponent(returnTo)}`,
    [storeKey],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, ready, login, register, logout, googleUrl }),
    [user, token, ready, login, register, logout, googleUrl],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
