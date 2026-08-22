'use client';

import { useState } from 'react';
import { subscribeNewsletter, type NewsletterSource } from '@/lib/newsletter';
import { useCart } from './cart';
import { INPUT_LIGHT_10 } from './styles';

type State = 'idle' | 'sending' | 'done' | 'error';

/**
 * Suscripción a novedades. Se usa en la sección del inicio, en el pie y en la
 * pantalla de "en construcción".
 *
 * Antes esto era un formulario que hacía `preventDefault()` y nada más: el
 * visitante dejaba su email, el comercio creía estar juntando una lista, y no
 * se guardaba nadie.
 */
export function NewsletterForm({
  source,
  compact = false,
  tenantId,
}: {
  source: NewsletterSource;
  compact?: boolean;
  /** La pantalla de "en construcción" se dibuja sin el resto de la tienda: ahí llega por prop. */
  tenantId?: string;
}) {
  return tenantId ? (
    <Form tenantId={tenantId} source={source} compact={compact} />
  ) : (
    <FormInStore source={source} compact={compact} />
  );
}

/** Dentro de la tienda el id sale del carrito, que envuelve todo el storefront. */
function FormInStore({ source, compact }: { source: Source; compact: boolean }) {
  const { tenantId } = useCart();
  return <Form tenantId={tenantId} source={source} compact={compact} />;
}

type Source = NewsletterSource;

function Form({ tenantId, source, compact }: { tenantId: string; source: Source; compact: boolean }) {
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [state, setState] = useState<State>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === 'sending') return;
    setState('sending');
    const ok = await subscribeNewsletter(tenantId, email, source, website);
    setState(ok ? 'done' : 'error');
    if (ok) setEmail('');
  };

  if (state === 'done')
    return (
      <p className={`text-sm font-medium ${compact ? '' : 'mt-4'}`}>
        ¡Listo! Te vamos a escribir cuando haya novedades.
      </p>
    );

  return (
    <form className={compact ? 'flex gap-2' : 'mx-auto mt-4 flex max-w-sm gap-2'} onSubmit={submit}>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@email.com"
        aria-label="Email"
        autoComplete="email"
        className={INPUT_LIGHT_10}
      />
      {/* Honeypot: invisible para una persona, irresistible para un bot. */}
      <input
        type="text"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="hidden"
      />
      <button
        type="submit"
        disabled={state === 'sending'}
        className="h-10 shrink-0 rounded-md bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-60"
      >
        {state === 'sending' ? 'Enviando…' : 'Suscribirme'}
      </button>
      {state === 'error' && (
        <span className="self-center text-xs opacity-70">No se pudo. Probá de nuevo.</span>
      )}
    </form>
  );
}
