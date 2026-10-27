'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from './auth';
import { usePreviewHref } from './preview';

/**
 * El link del mail de activación. Verifica el email y deja la sesión
 * iniciada: el registro solo no la abre, así que este es el primer ingreso de
 * una cuenta nueva.
 */
export function VerifyEmail() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const { verify } = useAuth();
  const href = usePreviewHref();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  // El token es de un solo uso: un segundo POST (StrictMode, un re-render) daría "link inválido".
  const sent = useRef(false);

  useEffect(() => {
    if (!token) {
      setState('error');
      return;
    }
    if (sent.current) return;
    sent.current = true;
    verify(token).then((r) => setState(r.ok ? 'ok' : 'error'));
  }, [token, verify]);

  return (
    <div className="mx-auto max-w-sm py-20 text-center">
      {state === 'loading' && <Loader2 className="mx-auto h-8 w-8 animate-spin opacity-60" />}
      {state === 'ok' && (
        <>
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
          <h1 className="mt-3 text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
            Email verificado
          </h1>
          <p className="mt-1 text-sm opacity-70">Tu cuenta quedó activada y ya iniciaste sesión.</p>
          <Link
            href={href('/cuenta')}
            className="mt-5 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg"
          >
            Ir a mi cuenta
          </Link>
        </>
      )}
      {state === 'error' && (
        <>
          <XCircle className="mx-auto h-10 w-10 text-danger" />
          <h1 className="mt-3 text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
            Link inválido
          </h1>
          <p className="mt-1 text-sm opacity-70">
            El link no es válido o expiró. Iniciá sesión y pedí otro desde tu cuenta.
          </p>
        </>
      )}
    </div>
  );
}
