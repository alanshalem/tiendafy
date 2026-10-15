'use client';

import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useAuth } from './auth';
import { Captcha } from './Captcha';
import { useFocusTrap } from './useFocusTrap';
import { clientJson } from '@/lib/api-client';
import { BTN_PRIMARY_BLOCK, INPUT_THEMED_11 } from './styles';

/** Entrar, registrarse o recuperar la clave. También lo abre "Mi cuenta" sin sesión. */
export function AuthModal({
  onClose,
  initialMode = 'login',
}: {
  onClose: () => void;
  initialMode?: 'login' | 'register';
}) {
  const { login, register, forgot, googleUrl } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleOn, setGoogleOn] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const dialogRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    clientJson<{ configured: boolean }>('/api/v1/shop/auth/google/configured').then((d) =>
      setGoogleOn(!!d?.configured),
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    if (mode === 'forgot') {
      const res = await forgot(email);
      setBusy(false);
      if (res.ok) setSent(true);
      else setError(res.error ?? 'Algo salió mal.');
      return;
    }
    const res =
      mode === 'login'
        ? await login(email, password, captcha || undefined)
        : await register(name, email, password, captcha || undefined);
    setBusy(false);
    if (res.ok) onClose();
    else setError(res.error ?? 'Algo salió mal.');
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative flex max-h-[85dvh] w-full max-w-sm flex-col rounded-2xl border border-[rgb(var(--color-fg)/0.12)] bg-bg text-fg shadow-2xl outline-none"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        {/* La X queda fija sobre la tarjeta; lo que scrollea es el formulario.
            En una pantalla baja —o en horizontal— el registro no entra entero,
            y sin esto lo que sobra quedaba fuera de alcance. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 z-10 rounded-full bg-bg p-1 opacity-60 hover:opacity-100"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="overflow-y-auto p-6">
          <h2
            id="auth-modal-title"
            className="text-xl font-bold"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            {mode === 'forgot'
              ? 'Recuperar contraseña'
              : mode === 'login'
                ? 'Iniciá sesión'
                : 'Creá tu cuenta'}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {mode === 'forgot'
              ? 'Te enviamos un link para crear una nueva.'
              : mode === 'login'
                ? 'Para ver tus favoritos y comprar más rápido.'
                : 'Guardá favoritos y seguí tus compras.'}
          </p>

          {sent ? (
            <p className="mt-6 rounded-md bg-[rgb(var(--color-fg)/0.05)] p-4 text-sm">
              Si hay una cuenta con ese email, te llegó un link para cambiar la contraseña. Revisá tu correo
              (y spam).
            </p>
          ) : (
            <>
              {mode !== 'forgot' && googleOn && (
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = googleUrl(
                      typeof window !== 'undefined' ? window.location.href : '/',
                    );
                  }}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-md border border-[rgb(var(--color-fg)/0.2)] py-2.5 text-sm font-semibold transition-colors hover:bg-[rgb(var(--color-fg)/0.05)]"
                >
                  <GoogleIcon /> Continuar con Google
                </button>
              )}

              <form onSubmit={submit} className="mt-4 space-y-3">
                {mode === 'register' && (
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nombre"
                    aria-label="Nombre"
                    autoComplete="name"
                    required
                    className={INPUT_THEMED_11}
                  />
                )}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  aria-label="Email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  className={INPUT_THEMED_11}
                />
                {mode !== 'forgot' && (
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Contraseña"
                    aria-label="Contraseña"
                    // Que el gestor de contraseñas ofrezca la guardada al entrar
                    // y una nueva (y la guarde) al registrarse.
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    required
                    minLength={8}
                    className={INPUT_THEMED_11}
                  />
                )}

                {mode !== 'forgot' && <Captcha onToken={setCaptcha} />}

                {error && <p className="text-sm text-danger">{error}</p>}

                <button
                  type="submit"
                  disabled={busy || (mode !== 'forgot' && captcha === null)}
                  className={BTN_PRIMARY_BLOCK}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : mode === 'forgot' ? (
                    'Enviar link'
                  ) : mode === 'login' ? (
                    'Iniciar sesión'
                  ) : (
                    'Crear cuenta'
                  )}
                </button>
              </form>
            </>
          )}

          {mode === 'login' && !sent && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMode('forgot');
              }}
              className="mt-3 block w-full text-center text-sm opacity-70 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}

          <p className="mt-4 text-center text-sm opacity-70">
            {mode === 'forgot' ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSent(false);
                  setMode('login');
                }}
                className="font-semibold text-primary-ink hover:underline"
              >
                Volver a iniciar sesión
              </button>
            ) : (
              <>
                {mode === 'login' ? '¿No tenés cuenta?' : '¿Ya tenés cuenta?'}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMode(mode === 'login' ? 'register' : 'login');
                  }}
                  className="font-semibold text-primary-ink hover:underline"
                >
                  {mode === 'login' ? 'Registrate' : 'Iniciá sesión'}
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
