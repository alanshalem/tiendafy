import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiRequestError } from '../lib/api';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
}

interface AuthResult {
  ok: boolean;
  error?: string;
  /** Código RFC 7807 (title) del backend, p.ej. Auth.EmailNotVerified. */
  code?: string;
}

interface AuthContextValue {
  user: AdminUser | null;
  ready: boolean;
  login: (email: string, password: string, captcha?: string) => Promise<AuthResult>;
  register: (name: string, email: string, password: string, captcha?: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api.get<AdminUser>('/api/v1/auth/me')
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const login = async (email: string, password: string, captcha?: string): Promise<AuthResult> => {
    try {
      const u = await api.post<AdminUser>('/api/v1/auth/login', { email, password, captcha });
      setUser(u);
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiRequestError) return { ok: false, error: e.error.message, code: e.error.code };
      return { ok: false, error: 'No se pudo iniciar sesión.' };
    }
  };

  const register = async (name: string, email: string, password: string, captcha?: string): Promise<AuthResult> => {
    try {
      const u = await api.post<AdminUser>('/api/v1/auth/register', { name, email, password, captcha });
      setUser(u);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof ApiRequestError ? e.error.message : 'No se pudo crear la cuenta.' };
    }
  };

  const logout = async () => {
    try { await api.post('/api/v1/auth/logout', {}); } catch { /* ignore */ }
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, ready, login, register, logout }}>{children}</AuthContext.Provider>;
}
