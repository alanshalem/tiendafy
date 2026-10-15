'use client';

import { useEffect, useId, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { API_URL, problemMessage, tenantHeaders } from '@/lib/api-client';
import { readJson, writeJson } from '@/lib/storage';
import { useCart } from './cart-context';
import { INPUT_10 } from './styles';

type State = 'idle' | 'sending' | 'done' | 'error';

/** El email que dejó la última vez: no se lo pedimos en cada talle agotado. */
const emailKey = (storeKey: string) => `tiendafy.stock-alert-email.${storeKey}`;

/**
 * "Avisame cuando ingrese" en una variante agotada. Antes el botón de compra
 * quedaba muerto y la visita se perdía; ahora deja su email y le escribimos
 * UNA vez cuando vuelve a haber stock (lo manda el backend, con link de baja).
 * No hace falta cuenta. Se monta con `key` = la variante: otra variante
 * agotada vuelve a ofrecer el formulario.
 */
export function BackInStock({ variantId, label }: { variantId: string; label?: string }) {
  const { tenantId } = useCart();
  const id = useId();
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setEmail(readJson<string>(emailKey(tenantId), ''));
  }, [tenantId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === 'sending') return;
    setState('sending');
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/back-in-stock`, {
        method: 'POST',
        headers: tenantHeaders(tenantId, true),
        body: JSON.stringify({ variantId, email: email.trim(), website }),
      });
      if (res.ok) {
        writeJson(emailKey(tenantId), email.trim());
        setState('done');
      } else {
        setMessage(await problemMessage(res, 'No se pudo guardar. Probá de nuevo.'));
        setState('error');
      }
    } catch {
      setMessage('No se pudo guardar. Probá de nuevo.');
      setState('error');
    }
  };

  if (state === 'done')
    return (
      <p role="status" className="flex items-start gap-2 rounded-md border border-fg/10 p-3 text-sm">
        <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          ¡Listo! Te escribimos a <strong className="wrap-anywhere">{email.trim()}</strong> cuando ingrese
          {label ? ` ${label}` : ''}.
        </span>
      </p>
    );

  return (
    <form onSubmit={submit} className="rounded-md border border-fg/10 p-3" aria-labelledby={`${id}-title`}>
      <p id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold">
        <Bell className="h-4 w-4" aria-hidden /> Avisame cuando ingrese
      </p>
      <p className="mt-0.5 text-xs text-fg-muted">Te mandamos un solo email cuando vuelva a haber stock.</p>
      <div className="mt-2 flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          aria-label="Tu email para el aviso"
          autoComplete="email"
          className={`${INPUT_10} min-w-0 flex-1`}
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
          {state === 'sending' ? 'Guardando…' : 'Avisarme'}
        </button>
      </div>
      {state === 'error' && message && (
        <p role="alert" className="mt-1.5 text-xs font-medium">
          {message}
        </p>
      )}
    </form>
  );
}
