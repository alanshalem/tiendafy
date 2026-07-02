'use client';

import { useEffect, useRef, useState } from 'react';

import { API_URL as API } from '@/lib/api-client';
const SCRIPT_ID = 'cf-turnstile-script';

/**
 * Cloudflare Turnstile, gated por config del backend.
 * - Sin captcha configurado → llama onToken('') (token "vacío ok") y no renderiza.
 * - Configurado → muestra el widget; al resolverlo llama onToken(token real).
 * El form deja init en null y habilita submit cuando recibe un token (vacío o real).
 */
export function Captcha({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/api/v1/captcha/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.enabled && d.siteKey) setSiteKey(d.siteKey);
        else onToken(''); // sin captcha
      })
      .catch(() => onToken(''));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!siteKey || !ref.current) return;
    const render = () => {
      const w = window as unknown as { turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => void } };
      if (w.turnstile && ref.current) {
        ref.current.innerHTML = '';
        w.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (t: string) => onToken(t),
          'error-callback': () => onToken(''),
        });
      }
    };
    if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement('script');
      s.id = SCRIPT_ID;
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    } else {
      render();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={ref} className="my-1" />;
}
