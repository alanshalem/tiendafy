'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import { API_URL as API, tenantHeaders } from '@/lib/api-client';

interface TrackingConfig {
  requireConsent: boolean;
  ga4Id: string | null;
  googleAdsId: string | null;
  metaPixelId: string | null;
  clarityId: string | null;
}

type Decision = 'granted' | 'denied';

/**
 * Los mismos patrones que valida el backend, repetidos a propósito.
 *
 * El identificador ya se validó al guardarlo, pero acá es donde se convierte en
 * una URL y en un argumento de una función del navegador. Validar en el punto
 * de uso y no solo en el borde es lo que hace que un valor raro —por un error
 * nuestro, por una base tocada a mano— no llegue nunca a ejecutarse.
 */
const SHAPES = {
  ga4: /^G-[A-Z0-9]{4,20}$/,
  ads: /^AW-\d{6,15}$/,
  meta: /^\d{10,20}$/,
  clarity: /^[a-z0-9]{5,20}$/,
};

const ok = (value: string | null | undefined, shape: RegExp): string | null =>
  value && shape.test(value) ? value : null;

/** La página de pago nunca carga medición de terceros. */
export const isPaymentPage = (pathname: string) => pathname === '/checkout';

/**
 * La regla completa de cuándo se carga algo, aparte del componente para poder
 * probarla. Es la parte que no puede fallar: si esto devuelve true de más, hay
 * un script de un tercero en la pantalla donde se escribe una tarjeta.
 */
export function shouldLoad(input: {
  hasAnyTag: boolean;
  pathname: string;
  requireConsent: boolean;
  decision: Decision | null;
}): boolean {
  if (!input.hasAnyTag) return false;
  if (isPaymentPage(input.pathname)) return false;
  if (!input.requireConsent) return true;
  return input.decision === 'granted';
}

/** Cuándo mostrar el aviso: solo si hay algo que consentir y falta la respuesta. */
export function shouldAskConsent(input: {
  hasAnyTag: boolean;
  pathname: string;
  requireConsent: boolean;
  decision: Decision | null;
}): boolean {
  return input.hasAnyTag && input.requireConsent && input.decision === null && !isPaymentPage(input.pathname);
}

const consentKey = (tenantId: string) => `tiendafy.consent.${tenantId}`;

/** Lo que el checkout dejó anotado antes de irse a pagar, para medir la venta. */
const PURCHASE_KEY = 'tiendafy.purchase';

interface StashedPurchase {
  orderId: string;
  value: number;
  currency: string;
}

/* -------------------------------------------------------------------------- */
/* Cargadores                                                                  */
/*                                                                             */
/* Escritos acá, en nuestro propio código, y no pegados como fragmento del      */
/* proveedor. La diferencia es la que importa: el identificador del comercio    */
/* viaja siempre como un valor —un argumento de función, un parámetro de URL—   */
/* y nunca como parte de un texto que después se ejecuta. Con esto no queda     */
/* ningún lugar donde algo escrito por una persona pueda convertirse en código. */
/* -------------------------------------------------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
const w = () => window as any;

function appendScript(src: string, id: string) {
  if (document.getElementById(id)) return;
  const el = document.createElement('script');
  el.id = id;
  el.async = true;
  el.src = src;
  document.head.appendChild(el);
}

/** gtag.js sirve a Google Analytics y a Google Ads: se carga una sola vez. */
function loadGtag(ga4: string | null, ads: string | null) {
  const first = ga4 ?? ads;
  if (!first) return;

  const win = w();
  win.dataLayer = win.dataLayer || [];
  if (!win.gtag) {
    win.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      win.dataLayer.push(arguments);
    };
    win.gtag('js', new Date());
  }
  if (ga4) win.gtag('config', ga4);
  if (ads) win.gtag('config', ads);

  appendScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(first)}`, 'tf-gtag');
}

function loadMetaPixel(pixelId: string) {
  const win = w();
  if (!win.fbq) {
    // Cola mínima: hasta que baje fbevents.js las llamadas se guardan, y el
    // propio script del proveedor las procesa cuando carga.
    const fbq: any = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, args);
      else fbq.queue.push(args);
    };
    fbq.queue = [];
    fbq.loaded = true;
    fbq.version = '2.0';
    win.fbq = fbq;
    win._fbq = fbq;
  }
  appendScript('https://connect.facebook.net/en_US/fbevents.js', 'tf-fbq');
  win.fbq('init', pixelId);
  win.fbq('track', 'PageView');
}

function loadClarity(projectId: string) {
  const win = w();
  if (!win.clarity) {
    win.clarity = function clarity(...args: unknown[]) {
      (win.clarity.q = win.clarity.q || []).push(args);
    };
  }
  appendScript(`https://www.clarity.ms/tag/${encodeURIComponent(projectId)}`, 'tf-clarity');
}

/* -------------------------------------------------------------------------- */

/**
 * Medición de terceros de la tienda, con el permiso del visitante por delante.
 *
 * Tres reglas que no se negocian:
 *  1. Nunca en la página de pago. El formulario de tarjeta vive ahí; ningún
 *     script ajeno entra a esa página. Se entra al checkout con una carga
 *     completa de página, así que tampoco queda nada cargado de antes.
 *  2. Nada se carga sin permiso, si el comercio pidió pedirlo.
 *  3. Si el navegador manda la señal de "no me rastreen" (Global Privacy
 *     Control), se toma como un no y ni siquiera se pregunta.
 */
export function TrackingTags({ tenantId }: { tenantId: string }) {
  const pathname = usePathname();
  const [config, setConfig] = useState<TrackingConfig | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [asked, setAsked] = useState(false);
  const loaded = useRef(false);
  const lastPath = useRef<string | null>(null);

  // Config + decisión guardada.
  useEffect(() => {
    if (!tenantId) return;
    let alive = true;

    try {
      const stored = localStorage.getItem(consentKey(tenantId));
      if (stored === 'granted' || stored === 'denied') setDecision(stored);
      // Señal del navegador: vale como respuesta y evita la pregunta.
      else if (w().navigator?.globalPrivacyControl === true) setDecision('denied');
    } catch {
      /* modo incógnito con almacenamiento bloqueado */
    }
    setAsked(true);

    fetch(`${API}/api/v1/tracking/`, { headers: tenantHeaders(tenantId) })
      .then((r) => r.json())
      .then((d: TrackingConfig) => alive && setConfig(d))
      .catch(() => alive && setConfig(null));

    return () => {
      alive = false;
    };
  }, [tenantId]);

  const ga4 = ok(config?.ga4Id, SHAPES.ga4);
  const ads = ok(config?.googleAdsId, SHAPES.ads);
  const meta = ok(config?.metaPixelId, SHAPES.meta);
  const clarity = ok(config?.clarityId, SHAPES.clarity);
  const hasAny = Boolean(ga4 || ads || meta || clarity);

  const allowed = shouldLoad({
    hasAnyTag: hasAny,
    pathname,
    requireConsent: config?.requireConsent !== false,
    decision,
  });

  // Carga inicial.
  useEffect(() => {
    if (!allowed || loaded.current) return;
    loaded.current = true;
    lastPath.current = pathname;
    loadGtag(ga4, ads);
    if (meta) loadMetaPixel(meta);
    if (clarity) loadClarity(clarity);
  }, [allowed, ga4, ads, meta, clarity, pathname]);

  // Navegación interna: sin esto solo se contaría la primera pantalla.
  useEffect(() => {
    if (!loaded.current || !allowed || lastPath.current === pathname) return;
    lastPath.current = pathname;
    const win = w();
    if (ga4) win.gtag?.('event', 'page_view', { page_path: pathname });
    if (meta) win.fbq?.('track', 'PageView');
  }, [pathname, allowed, ga4, meta]);

  // La venta: el checkout deja el monto anotado antes de irse a pagar, y la
  // pantalla de "listo" lo levanta. Sin esto los píxeles miden visitas y no
  // ventas, que es justamente para lo que se ponen.
  useEffect(() => {
    if (!loaded.current || !allowed || pathname !== '/checkout/success') return;
    let stash: StashedPurchase | null = null;
    try {
      const raw = sessionStorage.getItem(PURCHASE_KEY);
      stash = raw ? (JSON.parse(raw) as StashedPurchase) : null;
      sessionStorage.removeItem(PURCHASE_KEY); // una compra se mide una sola vez
    } catch {
      return;
    }
    if (!stash || typeof stash.value !== 'number') return;

    const win = w();
    if (ga4 || ads) {
      win.gtag?.('event', 'purchase', {
        transaction_id: stash.orderId,
        value: stash.value,
        currency: stash.currency,
      });
    }
    if (meta) win.fbq?.('track', 'Purchase', { value: stash.value, currency: stash.currency });
  }, [pathname, allowed, ga4, ads, meta]);

  const decide = useCallback(
    (next: Decision) => {
      setDecision(next);
      try {
        localStorage.setItem(consentKey(tenantId), next);
      } catch {
        /* sin almacenamiento la decisión vale solo para esta visita */
      }
    },
    [tenantId],
  );

  const ask =
    asked &&
    shouldAskConsent({
      hasAnyTag: hasAny,
      pathname,
      requireConsent: config?.requireConsent === true,
      decision,
    });

  if (!ask) return null;
  return <ConsentBar onDecide={decide} />;
}

/** Barra de consentimiento. Aparece solo si hay algo que consentir. */
function ConsentBar({ onDecide }: { onDecide: (d: Decision) => void }) {
  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Preferencias de medición"
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-[rgb(var(--color-fg)/0.12)] bg-bg px-4 py-4 text-fg shadow-2xl sm:px-6"
    >
      <div className="mx-auto flex max-w-container flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed opacity-80">
          Usamos herramientas de Google y Meta para entender cómo se usa la tienda y qué avisos funcionan.
          Dejan cookies en tu navegador. Podés decir que no y comprar igual.{' '}
          <a href="/privacidad" className="font-semibold underline underline-offset-2">
            Cómo tratamos tus datos
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => onDecide('denied')}
            className="rounded-md border border-[rgb(var(--color-fg)/0.25)] px-4 py-2 text-sm font-semibold"
          >
            No, gracias
          </button>
          <button
            type="button"
            onClick={() => onDecide('granted')}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-fg"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
