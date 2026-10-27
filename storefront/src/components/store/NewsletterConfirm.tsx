'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { confirmNewsletter } from '@/lib/newsletter';
import { TOKEN_PAGES, useScrubUrlParams } from '@/lib/scrub-url';
import { useCart } from './cart-context';
import { usePreviewHref } from './preview';
import { BTN_PRIMARY_BLOCK } from './styles';

/**
 * El link del mail "Confirmá tu suscripción" (doble confirmación del
 * newsletter). Confirma con un botón y no al abrir la página: los filtros de
 * correo que abren los links para revisarlos no tienen que poder suscribir a
 * nadie.
 */
export function NewsletterConfirm() {
  const params = useSearchParams();
  // Se guarda al montar y se saca de la URL (ver lib/scrub-url): con la URL
  // sin el token, useSearchParams deja de verlo.
  const [token] = useState(() => params.get('token') ?? '');
  useScrubUrlParams(TOKEN_PAGES['/suscripcion/confirmar']);
  const { tenantId } = useCart();
  const href = usePreviewHref();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const confirm = async () => {
    setError(null);
    setBusy(true);
    const problem = await confirmNewsletter(tenantId, token);
    setBusy(false);
    if (problem) setError(problem);
    else setDone(true);
  };

  if (!token) {
    return (
      <p className="py-16 text-center text-sm opacity-70">
        Link inválido. Dejá tu email de nuevo en la tienda para recibir uno nuevo.
      </p>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-sm py-20 text-center" role="status">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
        <h1 className="mt-3 text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          ¡Listo, ya estás suscripto!
        </h1>
        <p className="mt-1 text-sm opacity-70">Te vamos a escribir cuando haya novedades.</p>
        <Link
          href={href('/')}
          className="mt-5 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg"
        >
          Volver a la tienda
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
        Confirmá tu suscripción
      </h1>
      <p className="mt-1 text-sm text-fg-muted">
        Tocá el botón para empezar a recibir las novedades de la tienda.
      </p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <button type="button" onClick={confirm} disabled={busy} className={`mt-4 ${BTN_PRIMARY_BLOCK}`}>
        {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Confirmar suscripción'}
      </button>
    </div>
  );
}
