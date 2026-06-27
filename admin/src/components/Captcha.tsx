import { useEffect, useRef, useState } from 'react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5080';
const SCRIPT_ID = 'cf-turnstile-script';

/** Cloudflare Turnstile, gated por config del backend. Igual que en el storefront. */
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
        else onToken('');
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
