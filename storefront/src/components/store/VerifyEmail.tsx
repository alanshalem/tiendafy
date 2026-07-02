'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useCart } from './cart';
import { usePreviewHref } from './preview';

import { API_URL as API } from '@/lib/api-client';

export function VerifyEmail() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const { tenantId } = useCart();
  const href = usePreviewHref();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    if (!token) { setState('error'); return; }
    let cancelled = false;
    fetch(`${API}/api/v1/shop/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
      body: JSON.stringify({ token }),
    })
      .then((r) => { if (!cancelled) setState(r.ok ? 'ok' : 'error'); })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [token, tenantId]);

  return (
    <div className="mx-auto max-w-sm py-20 text-center">
      {state === 'loading' && <Loader2 className="mx-auto h-8 w-8 animate-spin opacity-60" />}
      {state === 'ok' && (
        <>
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
          <h1 className="mt-3 text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Email verificado</h1>
          <p className="mt-1 text-sm opacity-70">Tu cuenta quedó activada.</p>
          <Link href={href('/cuenta')} className="mt-5 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg">Ir a mi cuenta</Link>
        </>
      )}
      {state === 'error' && (
        <>
          <XCircle className="mx-auto h-10 w-10 text-red-500" />
          <h1 className="mt-3 text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Link inválido</h1>
          <p className="mt-1 text-sm opacity-70">El link no es válido o expiró.</p>
        </>
      )}
    </div>
  );
}
