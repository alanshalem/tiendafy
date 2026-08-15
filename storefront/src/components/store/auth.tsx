'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { API_URL as API, problemMessage, tenantHeaders } from '@/lib/api-client';

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
  /** Marcador de sesión (la sesión real vive en una cookie HttpOnly, no accesible por JS). */
  token: string | null;
  ready: boolean;
  login: (email: string, password: string, captcha?: string) => Promise<AuthResult>;
  register: (name: string, email: string, password: string, captcha?: string) => Promise<AuthResult>;
  forgot: (email: string) => Promise<AuthResult>;
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

export function AuthProvider({ storeKey, children }: { storeKey: string; children: ReactNode }) {
  // Solo cacheamos datos NO sensibles (nombre/email) para pintar rápido; la
  // credencial real es la cookie HttpOnly que pone el backend y que JS no puede leer.
  const userKey = `tiendafy.shop.user.${storeKey}`;
  const [user, setUser] = useState<ShopUser | null>(null);
  const [ready, setReady] = useState(false);

  // Headers comunes. La sesión va en cookie → `credentials: 'include'` en cada fetch.
  const headers = useMemo<Record<string, string>>(() => tenantHeaders(storeKey, true), [storeKey]);

  const persistUser = useCallback(
    (u: ShopUser | null) => {
      setUser(u);
      try {
        if (u) localStorage.setItem(userKey, JSON.stringify(u));
        else localStorage.removeItem(userKey);
      } catch {
        /* localStorage no disponible: seguimos solo en memoria */
      }
    },
    [userKey],
  );

  // Hidratación: cache optimista + validación contra /me (con la cookie).
  useEffect(() => {
    try {
      const cached = localStorage.getItem(userKey);
      if (cached) setUser(JSON.parse(cached));
    } catch {
      /* ignore */
    }
    // Migración: limpiar tokens viejos que vivían en localStorage (pre-cookie).
    try {
      localStorage.removeItem(`tiendafy.shop.token.${storeKey}`);
    } catch {
      /* ignore */
    }

    fetch(`${API}/api/v1/shop/auth/me`, { headers, credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((u: ShopUser | null) => {
        if (u) persistUser(u);
        else persistUser(null);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [storeKey, userKey, headers, persistUser]);

  const login = useCallback(
    async (email: string, password: string, captcha?: string): Promise<AuthResult> => {
      const res = await fetch(`${API}/api/v1/shop/auth/login`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ email, password, captcha }),
      });
      if (!res.ok) return { ok: false, error: await problemMessage(res, 'Algo salió mal. Probá de nuevo.') };
      const data = await res.json();
      persistUser(data.customer);
      return { ok: true };
    },
    [headers, persistUser],
  );

  const register = useCallback(
    async (name: string, email: string, password: string, captcha?: string): Promise<AuthResult> => {
      const res = await fetch(`${API}/api/v1/shop/auth/register`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ name, email, password, captcha }),
      });
      if (!res.ok) return { ok: false, error: await problemMessage(res, 'Algo salió mal. Probá de nuevo.') };
      const data = await res.json();
      persistUser(data.customer);
      return { ok: true };
    },
    [headers, persistUser],
  );

  const forgot = useCallback(
    async (email: string): Promise<AuthResult> => {
      const res = await fetch(`${API}/api/v1/shop/auth/forgot`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      return res.ok
        ? { ok: true }
        : { ok: false, error: await problemMessage(res, 'Algo salió mal. Probá de nuevo.') };
    },
    [headers],
  );

  const logout = useCallback(() => {
    fetch(`${API}/api/v1/shop/auth/logout`, { method: 'POST', headers, credentials: 'include' }).catch(
      () => {},
    );
    persistUser(null);
  }, [headers, persistUser]);

  const googleUrl = useCallback(
    (returnTo: string) =>
      `${API}/api/v1/shop/auth/google/start?tenant=${encodeURIComponent(storeKey)}&return=${encodeURIComponent(returnTo)}`,
    [storeKey],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, token: user ? 'cookie' : null, ready, login, register, forgot, logout, googleUrl }),
    [user, ready, login, register, forgot, logout, googleUrl],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
