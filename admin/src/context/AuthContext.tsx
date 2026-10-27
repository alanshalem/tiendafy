import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@tiendafy/ui';
import { api, ApiRequestError, setSessionExpiredHandler, setTwoFactorSetupRequiredHandler } from '../lib/api';
import { SessionExpiredDialog } from '../components/SessionExpiredDialog';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  /** Si tiene activa la verificación en dos pasos. */
  twoFactorEnabled?: boolean;
  /**
   * Si se la exigen (dueños y administradores, cuando la plataforma la pide):
   * sin activarla no usa el panel, y no la puede desactivar.
   */
  twoFactorMandatory?: boolean;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  /** Código RFC 7807 (title) del backend, p.ej. Auth.EmailNotVerified. */
  code?: string;
  /**
   * La contraseña estuvo bien pero la cuenta tiene la verificación en dos
   * pasos: falta el código de la app (o uno de recuperación) con verifyTwoFactor.
   */
  twoFactor?: boolean;
  /**
   * La contraseña estuvo bien pero es dueño o administrador y no tiene la
   * verificación en dos pasos, que es obligatoria: hay que configurarla para
   * entrar (RequiredTwoFactorSetup); la sesión se abre al activarla.
   */
  twoFactorSetup?: boolean;
}

/** Lo que responde /auth/login cuando falta el segundo paso (o configurarlo). */
type TwoFactorPending = { twoFactorRequired: true } | { twoFactorSetupRequired: true };

interface AuthContextValue {
  user: AdminUser | null;
  ready: boolean;
  /**
   * No se pudo saber si hay sesión (API caída, 429, error 5xx). No es lo mismo
   * que "sin sesión": mostrar el login ahí invitaba a reescribir la clave y
   * gastar el cupo anti fuerza bruta por un corte momentáneo.
   */
  unreachable: boolean;
  retry: () => void;
  login: (email: string, password: string, captcha?: string) => Promise<AuthResult>;
  /** Segundo paso del login: el código de la app o uno de recuperación. */
  verifyTwoFactor: (code: string) => Promise<AuthResult>;
  /** Refleja en la sesión que se activó o desactivó la verificación en dos pasos. */
  setTwoFactorEnabled: (enabled: boolean) => void;
  /** Se configuró la verificación obligatoria: la sesión ya está abierta (con la persona, si llegó). */
  completeTwoFactorSetup: (user?: AdminUser) => void;
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
  const [unreachable, setUnreachable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // La sesión venció con el panel abierto (un 401 de cualquier pedido).
  const [expired, setExpired] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    setSessionExpiredHandler(() => setExpired(true));
    // La API dice que falta configurar la verificación obligatoria (una sesión
    // de antes de que se exigiera): el gate muestra la pantalla para hacerlo.
    setTwoFactorSetupRequiredHandler(() =>
      setUser((u) => (u ? { ...u, twoFactorMandatory: true, twoFactorEnabled: false } : u)),
    );
    return () => {
      setSessionExpiredHandler(null);
      setTwoFactorSetupRequiredHandler(null);
    };
  }, []);

  useEffect(() => {
    api
      .get<AdminUser>('/api/v1/auth/me')
      .then((u) => {
        setUser(u);
        setUnreachable(false);
      })
      .catch((e) => {
        setUser(null);
        // Solo 401/403 dicen "no hay sesión"; lo demás es no haber podido preguntar.
        setUnreachable(!(e instanceof ApiRequestError && (e.status === 401 || e.status === 403)));
      })
      .finally(() => setReady(true));
  }, [attempt]);

  // Reintentar vuelve a "verificando sesión" en el mismo evento: así el efecto
  // solo pregunta, sin cambiar estado antes de tener la respuesta.
  const retry = () => {
    setReady(false);
    setAttempt((n) => n + 1);
  };

  const login = async (email: string, password: string, captcha?: string): Promise<AuthResult> => {
    try {
      const u = await api.post<AdminUser | TwoFactorPending>('/api/v1/auth/login', {
        email,
        password,
        captcha,
      });
      // Con la verificación en dos pasos la contraseña sola no abre la sesión.
      if ('twoFactorRequired' in u) return { ok: false, twoFactor: true };
      if ('twoFactorSetupRequired' in u) return { ok: false, twoFactorSetup: true };
      setUser(u);
      setUnreachable(false);
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiRequestError) return { ok: false, error: e.error.message, code: e.error.code };
      return { ok: false, error: 'No se pudo iniciar sesión.' };
    }
  };

  const verifyTwoFactor = async (code: string): Promise<AuthResult> => {
    try {
      const u = await api.post<AdminUser>('/api/v1/auth/login/2fa', { code });
      setUser(u);
      setUnreachable(false);
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiRequestError) return { ok: false, error: e.error.message, code: e.error.code };
      return { ok: false, error: 'No se pudo verificar el código.' };
    }
  };

  const setTwoFactorEnabled = (enabled: boolean) =>
    setUser((u) => (u ? { ...u, twoFactorEnabled: enabled } : u));

  const completeTwoFactorSetup = (configured?: AdminUser) => {
    setUser((u) => configured ?? (u ? { ...u, twoFactorEnabled: true } : u));
    setUnreachable(false);
    setExpired(false);
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    captcha?: string,
  ): Promise<AuthResult> => {
    try {
      const u = await api.post<AdminUser>('/api/v1/auth/register', { name, email, password, captcha });
      setUser(u);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof ApiRequestError ? e.error.message : 'No se pudo crear la cuenta.',
      };
    }
  };

  // Volver a entrar sin salir de la pantalla: lo que falló al cargar se pide
  // de nuevo; lo que no se guardó lo repite la persona (no se reintenta solo:
  // un "guardar" a ciegas podría ir dos veces).
  const relogin = async (password: string, captcha?: string) => {
    if (!user) return { ok: false };
    const res = await login(user.email, password, captcha);
    if (res.ok) welcomeBack();
    // Le falta configurar la verificación obligatoria: la pantalla del gate.
    if (res.twoFactorSetup) {
      setExpired(false);
      setUser((u) => (u ? { ...u, twoFactorMandatory: true, twoFactorEnabled: false } : u));
    }
    return res;
  };

  const reloginCode = async (code: string) => {
    const res = await verifyTwoFactor(code);
    if (res.ok) welcomeBack();
    return res;
  };

  const welcomeBack = () => {
    setExpired(false);
    void queryClient.refetchQueries({ predicate: (q) => q.state.status === 'error' });
    toast('Listo, volviste a ingresar. Si algo no se guardó, repetilo.', { variant: 'success' });
  };

  const logout = async () => {
    try {
      await api.post('/api/v1/auth/logout', {});
    } catch {
      /* ignore */
    }
    setUser(null);
    setExpired(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        unreachable,
        retry,
        login,
        verifyTwoFactor,
        setTwoFactorEnabled,
        completeTwoFactorSetup,
        register,
        logout,
      }}
    >
      {children}
      {user && expired && (
        <SessionExpiredDialog
          email={user.email}
          onLogin={relogin}
          onCode={reloginCode}
          onSwitchAccount={() => void logout()}
          // Cerrarlo deja ver (y copiar) lo que había; el próximo pedido que
          // falle lo vuelve a abrir.
          onDismiss={() => setExpired(false)}
        />
      )}
    </AuthContext.Provider>
  );
}
