'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { API_URL as API, problemMessage, tenantHeaders } from '@/lib/api-client';
import { readJson, removeKey, writeJson } from '@/lib/storage';

interface ShopUser {
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
      if (u) writeJson(userKey, u);
      else removeKey(userKey);
    },
    [userKey],
  );

  // Hidratación: cache optimista + validación contra /me (con la cookie).
  useEffect(() => {
    const cached = readJson<ShopUser | null>(userKey, null);
    if (cached) setUser(cached);
    // Migración: limpiar tokens viejos que vivían en localStorage (pre-cookie).
    removeKey(`tiendafy.shop.token.${storeKey}`);

    fetch(`${API}/api/v1/shop/auth/me`, { headers, credentials: 'include' })
      .then((r) => {
        if (r.ok) return r.json();
        // Solo 401/403 dicen "no hay sesión". Un 429 o un 5xx es no haber podido
        // preguntar: antes borraba al comprador cacheado y lo mostraba afuera.
        if (r.status === 401 || r.status === 403) return null;
        throw new Error(`auth/me ${r.status}`);
      })
      .then((u: ShopUser | null) => persistUser(u))
      .catch(() => {})
      .finally(() => setReady(true));
  }, [storeKey, userKey, headers, persistUser]);

  // POST a /shop/auth/* con manejo de error uniforme; persist guarda data.customer.
  const authPost = useCallback(
    async (path: string, body: unknown, persist = false): Promise<AuthResult> => {
      const res = await fetch(`${API}/api/v1/shop/auth/${path}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) return { ok: false, error: await problemMessage(res, 'Algo salió mal. Probá de nuevo.') };
      if (persist) persistUser((await res.json()).customer);
      return { ok: true };
    },
    [headers, persistUser],
  );

  const login = useCallback(
    (email: string, password: string, captcha?: string) =>
      authPost('login', { email, password, captcha }, true),
    [authPost],
  );

  const register = useCallback(
    (name: string, email: string, password: string, captcha?: string) =>
      authPost('register', { name, email, password, captcha }, true),
    [authPost],
  );

  const forgot = useCallback((email: string) => authPost('forgot', { email }), [authPost]);

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
