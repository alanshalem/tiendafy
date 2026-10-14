'use client';

import { useState } from 'react';
import { subscribeNewsletter, type NewsletterSource } from '@/lib/newsletter';
import { useCart } from './cart';
import { INPUT_10 } from './styles';

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
  align = 'center',
  successMessage,
}: {
  source: NewsletterSource;
  compact?: boolean;
  /** La pantalla de "en construcción" se dibuja sin el resto de la tienda: ahí llega por prop. */
  tenantId?: string;
  /** Dónde va el formulario (no compacto): centrado o al principio de la línea. */
  align?: 'center' | 'start';
  /** Lo que se lee al suscribirse. Vacío = el mensaje de siempre. */
  successMessage?: string;
}) {
  const opts = { source, compact, align, successMessage };
  return tenantId ? <Form tenantId={tenantId} {...opts} /> : <FormInStore {...opts} />;
}

type Source = NewsletterSource;
interface FormOptions {
  source: Source;
  compact: boolean;
  align: 'center' | 'start';
  successMessage?: string;
}

/** Dentro de la tienda el id sale del carrito, que envuelve todo el storefront. */
function FormInStore(opts: FormOptions) {
  const { tenantId } = useCart();
  return <Form tenantId={tenantId} {...opts} />;
}

function Form({ tenantId, source, compact, align, successMessage }: FormOptions & { tenantId: string }) {
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
      <p role="status" className={`text-sm font-medium whitespace-pre-line ${compact ? '' : 'mt-4'}`}>
        {successMessage?.trim() || '¡Listo! Te vamos a escribir cuando haya novedades.'}
      </p>
    );

  return (
    // Compacto (el pie): en una columna angosta el botón baja abajo del campo, en
    // vez de dejar un campo donde no entra ni "tu@email".
    <form
      className={
        compact ? 'flex flex-wrap gap-2' : `${align === 'center' ? 'mx-auto ' : ''}mt-4 flex max-w-sm gap-2`
      }
      onSubmit={submit}
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@email.com"
        aria-label="Email"
        autoComplete="email"
        className={compact ? `${INPUT_10} min-w-0 flex-[1_1_10rem]` : INPUT_10}
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
