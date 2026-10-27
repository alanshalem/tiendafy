'use client';

import { useEffect, useId, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { apiUrl, problemMessage, tenantHeaders } from '@/lib/api-client';
import { readJson, writeJson } from '@/lib/storage';
import { Captcha } from './Captcha';
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
  // El mismo captcha que contacto y registro: cada aviso termina en un email a
  // la dirección cargada. null = pendiente; el token sirve una vez, así que
  // tras un rechazo se pide otro (`captchaKey`).
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  useEffect(() => {
    setEmail(readJson<string>(emailKey(tenantId), ''));
  }, [tenantId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === 'sending' || captcha === null) return;
    setState('sending');
    setMessage(null);
    const failed = (text: string) => {
      setMessage(text);
      setState('error');
      setCaptcha(null);
      setCaptchaKey((k) => k + 1);
    };
    try {
      const res = await fetch(`${apiUrl()}/api/v1/back-in-stock`, {
        method: 'POST',
        headers: tenantHeaders(tenantId, true),
        body: JSON.stringify({ variantId, email: email.trim(), website, captcha: captcha || undefined }),
      });
      if (res.ok) {
        writeJson(emailKey(tenantId), email.trim());
        setState('done');
      } else {
        failed(await problemMessage(res, 'No se pudo guardar. Probá de nuevo.'));
      }
    } catch {
      failed('No se pudo guardar. Probá de nuevo.');
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
          disabled={state === 'sending' || captcha === null}
          className="h-10 shrink-0 rounded-md bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-60"
        >
          {state === 'sending' ? 'Guardando…' : 'Avisarme'}
        </button>
      </div>
      <div className="mt-2 empty:hidden">
        <Captcha key={captchaKey} onToken={setCaptcha} />
      </div>
      {state === 'error' && message && (
        <p role="alert" className="mt-1.5 text-xs font-medium">
          {message}
        </p>
      )}
    </form>
  );
}
