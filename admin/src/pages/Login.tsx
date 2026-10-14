import { useEffect, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, ApiRequestError } from '../lib/api';
import { Captcha } from '../components/Captcha';
import { LogoMark } from '../components/LogoMark';
import { Spinner } from '@tiendafy/ui';

const AUTH_INPUT =
  'h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg outline-none focus:border-primary';
const AUTH_SUBMIT =
  'mt-5 flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-fg hover:bg-primary-hover';

/**
 * Un campo del login con su etiqueta visible. Antes eran inputs con solo un
 * placeholder: el lector de pantalla no los nombraba y el texto desaparecía
 * apenas se empezaba a escribir. `autoComplete` es lo que usa el gestor de
 * contraseñas para completar (y para ofrecer guardar la nueva).
 */
function AuthField({ label, ...input }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-fg">
        {label}
      </label>
      <input id={id} className={AUTH_INPUT} {...input} />
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-subtle px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-7 shadow-card">
        <div className="mb-6 flex items-center gap-2.5">
          <LogoMark className="h-9 w-9" />
          <span className="text-xl font-bold text-fg">tiendafy</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [needsVerify, setNeedsVerify] = useState(false); // login bloqueado por email sin verificar
  const [resent, setResent] = useState(false);

  // El panel no tiene alta pública: el equipo se da de alta desde Usuarios. La
  // única excepción es una instalación vacía, donde hay que poder crear al
  // primer dueño — el backend decide y acá solo se refleja.
  const [registrationOpen, setRegistrationOpen] = useState(false);
  useEffect(() => {
    api
      .get<{ open: boolean }>('/api/v1/auth/registration-open')
      .then((r) => setRegistrationOpen(r.open))
      .catch(() => setRegistrationOpen(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNeedsVerify(false);
    setBusy(true);
    if (mode === 'forgot') {
      try {
        await api.post('/api/v1/auth/forgot', { email });
        setSent(true);
      } catch {
        setSent(true);
      } finally {
        // respuesta uniforme: no revela si el email existe
        setBusy(false);
      }
      return;
    }
    const res =
      mode === 'login'
        ? await login(email, password, captcha || undefined)
        : await register(name, email, password, captcha || undefined);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Algo salió mal.');
      if (res.code === 'Auth.EmailNotVerified') setNeedsVerify(true);
    }
  };

  const resendVerification = async () => {
    setResent(false);
    try {
      await api.post('/api/v1/auth/resend-verification', { email });
    } catch {
      /* respuesta uniforme */
    }
    setResent(true);
  };

  return (
    <Shell>
      <h1 className="text-lg font-semibold text-fg">
        {mode === 'forgot'
          ? 'Recuperar contraseña'
          : mode === 'login'
            ? 'Entrá a tu panel'
            : 'Creá tu cuenta'}
      </h1>
      <p className="mt-1 text-sm text-fg-muted">
        {mode === 'forgot'
          ? 'Te enviamos un link para crear una nueva.'
          : mode === 'login'
            ? 'Administrá tus tiendas.'
            : 'Y empezá a vender.'}
      </p>

      {sent ? (
        <p className="mt-5 rounded-lg bg-bg-muted p-4 text-sm text-fg">
          Si hay una cuenta con ese email, te llegó un link para cambiar la contraseña. Revisá tu correo (y
          spam).
        </p>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3">
          {mode === 'register' && (
            <AuthField
              label="Tu nombre"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}
          <AuthField
            label="Email"
            type="email"
            // Al entrar, el email es el usuario de la cuenta; al crearla, un email nuevo.
            autoComplete={mode === 'login' ? 'username' : 'email'}
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@empresa.com"
            required
          />
          {mode !== 'forgot' && (
            <AuthField
              label="Contraseña"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Mínimo 10 caracteres' : undefined}
              required
              minLength={10}
            />
          )}

          {mode !== 'forgot' && <Captcha onToken={setCaptcha} />}

          {error && <p className="text-sm text-danger">{error}</p>}
          {needsVerify && (
            <button
              type="button"
              onClick={resendVerification}
              className="text-sm font-semibold text-primary hover:underline"
            >
              {resent ? 'Email reenviado — revisá tu correo (y spam).' : 'Reenviar email de verificación'}
            </button>
          )}

          <button
            type="submit"
            disabled={busy || (mode !== 'forgot' && captcha === null)}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? (
              <Spinner inline />
            ) : mode === 'forgot' ? (
              'Enviar link'
            ) : mode === 'login' ? (
              'Iniciar sesión'
            ) : (
              'Crear cuenta'
            )}
          </button>
        </form>
      )}

      {mode === 'login' && !sent && (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setMode('forgot');
          }}
          className="mt-3 block w-full text-center text-sm text-fg-muted hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </button>
      )}

      <p className="mt-4 text-center text-sm text-fg-muted">
        {mode === 'forgot' ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSent(false);
              setMode('login');
            }}
            className="font-semibold text-primary hover:underline"
          >
            Volver a iniciar sesión
          </button>
        ) : (
          registrationOpen && (
            <>
              {mode === 'login' ? '¿Sos el primero?' : '¿Ya tenés cuenta?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode(mode === 'login' ? 'register' : 'login');
                }}
                className="font-semibold text-primary hover:underline"
              >
                {mode === 'login' ? 'Creá la cuenta de dueño' : 'Iniciá sesión'}
              </button>
            </>
          )
        )}
      </p>
    </Shell>
  );
}

/** Formulario de reset (link del email): /restablecer?email=&token= */
function ResetPasswordForm() {
  const params = new URLSearchParams(window.location.search);
  const email = params.get('email') ?? '';
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/api/v1/auth/reset', { email, token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.error.message : 'El link no es válido o expiró.');
    } finally {
      setBusy(false);
    }
  };

  if (!email || !token) {
    return (
      <Shell>
        <p className="text-sm text-fg-muted">
          Link inválido. Pedí uno nuevo desde &quot;Olvidaste tu contraseña&quot;.
        </p>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-fg">¡Listo!</h1>
        <p className="mt-1 text-sm text-fg-muted">Tu contraseña fue cambiada.</p>
        <a href="/" className={AUTH_SUBMIT}>
          Iniciar sesión
        </a>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-lg font-semibold text-fg">Nueva contraseña</h1>
      <p className="mt-1 text-sm text-fg-muted">Para {email}. Mínimo 10 caracteres.</p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <AuthField
          label="Nueva contraseña"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={10}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={busy || password.length < 10}
          className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60"
        >
          {busy ? <Spinner inline /> : 'Cambiar contraseña'}
        </button>
      </form>
    </Shell>
  );
}

/** Pantalla del link de verificación de email: /verificar?email=&token= */
function VerifyEmailScreen() {
  const params = new URLSearchParams(window.location.search);
  const email = params.get('email') ?? '';
  const token = params.get('token') ?? '';
  // Sin email o token el link está roto: se sabe sin preguntarle a nadie.
  const [state, setState] = useState<'busy' | 'ok' | 'fail'>(email && token ? 'busy' : 'fail');

  useEffect(() => {
    if (!email || !token) return;
    api
      .post('/api/v1/auth/verify', { email, token })
      .then(() => setState('ok'))
      .catch(() => setState('fail'));
  }, [email, token]);

  return (
    <Shell>
      {state === 'busy' && <p className="text-sm text-fg-muted">Verificando tu email…</p>}
      {state === 'ok' && (
        <>
          <h1 className="text-lg font-semibold text-fg">¡Email verificado!</h1>
          <p className="mt-1 text-sm text-fg-muted">Tu cuenta quedó confirmada.</p>
          <a href="/" className={AUTH_SUBMIT}>
            Ir al panel
          </a>
        </>
      )}
      {state === 'fail' && (
        <>
          <h1 className="text-lg font-semibold text-fg">Link inválido o vencido</h1>
          <p className="mt-1 text-sm text-fg-muted">Pedí un reenvío desde la pantalla de inicio de sesión.</p>
          <a href="/" className={AUTH_SUBMIT}>
            Volver
          </a>
        </>
      )}
    </Shell>
  );
}

/** Gate: muestra el login si no hay sesión; el resto de la app si la hay. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, ready, unreachable, retry } = useAuth();
  // Links del email (reset / verificación) llegan sin sesión: antes del gate.
  if (typeof window !== 'undefined' && window.location.pathname === '/restablecer') {
    return <ResetPasswordForm />;
  }
  if (typeof window !== 'undefined' && window.location.pathname === '/verificar') {
    return <VerifyEmailScreen />;
  }
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-subtle">
        <Spinner inline size={24} className="text-fg-muted" />
      </div>
    );
  }
  if (!user && unreachable) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-subtle px-4">
        <div role="alert" className="max-w-sm text-center">
          <p className="text-base font-semibold text-fg">No pudimos conectar con el servidor</p>
          <p className="mt-1 text-sm text-fg-muted">
            Tu sesión no se cerró: es un corte momentáneo. Probá de nuevo en unos segundos.
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }
  if (!user) return <Login />;
  return <>{children}</>;
}
