'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { apiUrl, problemMessage, tenantHeaders } from '@/lib/api-client';
import { readJson, removeKey, writeJson } from '@/lib/storage';

interface ShopUser {
  id: string;
  name: string;
  email: string;
  /** false hasta tocar el link del mail de activación: sin eso no se ven los pedidos. */
  emailVerified?: boolean;
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
  /**
   * Crea la cuenta (nombre y email) y manda el mail de activación. NO abre
   * sesión ni pide contraseña: las dos cosas pasan en el link del mail.
   */
  register: (name: string, email: string, captcha?: string) => Promise<AuthResult>;
  forgot: (email: string, captcha?: string) => Promise<AuthResult>;
  /** El link del mail de activación: guarda la contraseña elegida, verifica el email y deja la sesión iniciada. */
  verify: (token: string, password: string) => Promise<AuthResult>;
  /** Otro mail de activación para la cuenta logueada que todavía no verificó su email. */
  resendVerification: () => Promise<AuthResult>;
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

/**
 * ¿Vale la pena preguntarle a la API si hay sesión? La cookie es HttpOnly y JS
 * no la ve, así que antes se preguntaba en cada vista de página: un 401 (y un
 * error en la consola) por cada visitante anónimo, que son casi todos.
 *
 * Se pregunta solo si hay motivo: el comprador quedó guardado de un login
 * anterior, vuelve de entrar con Google (la API le puso la cookie en otra
 * pestaña de la historia, sin pasar por acá) o está en su cuenta —ahí la
 * pregunta es la página misma, y además cubre al que cambió la clave con el
 * link del mail, que también deja la sesión iniciada—.
 */
function shouldAskForSession({
  cachedUser,
  pendingGoogle,
  onAccountPage,
}: {
  cachedUser: boolean;
  pendingGoogle: boolean;
  onAccountPage: boolean;
}): boolean {
  return cachedUser || pendingGoogle || onAccountPage;
}

export function AuthProvider({ storeKey, children }: { storeKey: string; children: ReactNode }) {
  // Solo cacheamos datos NO sensibles (nombre/email) para pintar rápido; la
  // credencial real es la cookie HttpOnly que pone el backend y que JS no puede leer.
  const userKey = `tiendafy.shop.user.${storeKey}`;
  // Marca de "salió a entrar con Google": al volver hay que preguntar por la sesión.
  const googleKey = `tiendafy.shop.google.${storeKey}`;
  const onAccountPage = (usePathname() ?? '').startsWith('/cuenta');
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

  // Hidratación: cache optimista + validación contra /me (con la cookie), solo
  // si hay motivo para creer que hay sesión (ver shouldAskForSession).
  useEffect(() => {
    const cached = readJson<ShopUser | null>(userKey, null);
    if (cached) setUser(cached);
    // Migración: limpiar tokens viejos que vivían en localStorage (pre-cookie).
    removeKey(`tiendafy.shop.token.${storeKey}`);

    const pendingGoogle = readJson<number | null>(googleKey, null) !== null;
    if (!shouldAskForSession({ cachedUser: !!cached, pendingGoogle, onAccountPage })) {
      setReady(true);
      return;
    }
    // La marca de Google se usa una vez: si el login no se completó, la
    // próxima vista ya no pregunta.
    removeKey(googleKey);

    fetch(`${apiUrl()}/api/v1/shop/auth/me`, { headers, credentials: 'include' })
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
  }, [storeKey, userKey, googleKey, onAccountPage, headers, persistUser]);

  // POST a /shop/auth/* con manejo de error uniforme; persist guarda data.customer.
  const authPost = useCallback(
    async (path: string, body: unknown, persist = false): Promise<AuthResult> => {
      // Un corte de red rechaza el fetch: se devuelve como cualquier otro
      // error, así los formularios lo muestran y sueltan el botón en vez de
      // que la excepción les llegue sin atajar.
      const res = await fetch(`${apiUrl()}/api/v1/shop/auth/${path}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body),
      }).catch(() => null);
      if (!res) return { ok: false, error: 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.' };
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
    (name: string, email: string, captcha?: string) => authPost('register', { name, email, captcha }),
    [authPost],
  );

  const forgot = useCallback(
    (email: string, captcha?: string) => authPost('forgot', { email, captcha }),
    [authPost],
  );

  const verify = useCallback(
    (token: string, password: string) => authPost('verify', { token, password }, true),
    [authPost],
  );

  const resendVerification = useCallback(() => authPost('verify/resend', {}), [authPost]);

  const logout = useCallback(() => {
    fetch(`${apiUrl()}/api/v1/shop/auth/logout`, { method: 'POST', headers, credentials: 'include' }).catch(
      () => {},
    );
    persistUser(null);
  }, [headers, persistUser]);

  // Se pide justo antes de navegar a Google: deja la marca para que, a la
  // vuelta (con la cookie ya puesta por la API), la tienda pregunte por la sesión.
  const googleUrl = useCallback(
    (returnTo: string) => {
      writeJson(googleKey, Date.now());
      return `${apiUrl()}/api/v1/shop/auth/google/start?tenant=${encodeURIComponent(storeKey)}&return=${encodeURIComponent(returnTo)}`;
    },
    [storeKey, googleKey],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token: user ? 'cookie' : null,
      ready,
      login,
      register,
      forgot,
      verify,
      resendVerification,
      logout,
      googleUrl,
    }),
    [user, ready, login, register, forgot, verify, resendVerification, logout, googleUrl],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
