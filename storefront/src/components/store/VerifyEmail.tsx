'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from './auth';
import { usePreviewHref } from './preview';
import { TOKEN_PAGES, useScrubUrlParams } from '@/lib/scrub-url';
import { BTN_PRIMARY_BLOCK, INPUT_THEMED_11 } from './styles';

/**
 * El link del mail de activación: "Elegí tu contraseña". Al guardarla se
 * verifica el email y queda la sesión iniciada. El registro no pide
 * contraseña: así la pone siempre quien controla el email, y nadie puede
 * dejar la suya en la cuenta de otro.
 */
export function VerifyEmail() {
  const params = useSearchParams();
  // Se guarda al montar y se saca de la URL (ver lib/scrub-url): con la URL
  // sin el token, useSearchParams deja de verlo.
  const [token] = useState(() => params.get('token') ?? '');
  useScrubUrlParams(TOKEN_PAGES['/cuenta/verificar']);
  const { verify } = useAuth();
  const href = usePreviewHref();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && confirm !== password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setError(null);
    setBusy(true);
    const res = await verify(token, password);
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error ?? 'El link no es válido o venció.');
  };

  if (!token) {
    return (
      <p className="py-16 text-center text-sm opacity-70">
        Link inválido. Volvé a registrarte con tu email para recibir uno nuevo.
      </p>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-sm py-20 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
        <h1 className="mt-3 text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          ¡Listo!
        </h1>
        <p className="mt-1 text-sm opacity-70">Tu cuenta quedó activada y ya iniciaste sesión.</p>
        <Link
          href={href('/cuenta')}
          className="mt-5 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg"
        >
          Ir a mi cuenta
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm py-12">
      <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
        Elegí tu contraseña
      </h1>
      <p className="mt-1 text-sm text-fg-muted">
        Para activar tu cuenta, elegí una contraseña de al menos 8 caracteres.
      </p>
      <input
        type="password"
        aria-label="Contraseña"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Contraseña"
        required
        minLength={8}
        className={`mt-4 ${INPUT_THEMED_11}`}
      />
      <input
        type="password"
        aria-label="Repetí la contraseña"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Repetí la contraseña"
        required
        minLength={8}
        aria-invalid={mismatch || undefined}
        className={`mt-3 ${INPUT_THEMED_11}`}
      />
      {mismatch && <p className="mt-2 text-sm text-danger">Las contraseñas no coinciden.</p>}
      {error && !mismatch && <p className="mt-2 text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={busy || password.length < 8 || confirm !== password}
        className={`mt-4 ${BTN_PRIMARY_BLOCK}`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar y entrar'}
      </button>
    </form>
  );
}
