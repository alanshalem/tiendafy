'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import { apiUrl, tenantHeaders } from '@/lib/api-client';
import { setTrackSink, valueOf, type FunnelEvent } from '@/lib/track';

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

/**
 * Órdenes ya medidas en este navegador. La anotación de la pestaña se borra al
 * medir, pero esto cubre lo que ella no: la misma orden anotada de nuevo (un
 * reintento) o abierta en otra pestaña. Una venta contada dos veces infla el
 * retorno de la publicidad, que es justo lo que el comercio mira para decidir.
 */
const PURCHASE_SENT_KEY = 'tiendafy.purchase.sent';

function alreadySent(orderId: string): boolean {
  try {
    const sent = JSON.parse(localStorage.getItem(PURCHASE_SENT_KEY) ?? '[]') as string[];
    if (sent.includes(orderId)) return true;
    localStorage.setItem(PURCHASE_SENT_KEY, JSON.stringify([...sent, orderId].slice(-20)));
  } catch {
    /* sin almacenamiento: queda la anotación de la pestaña como único freno */
  }
  return false;
}

// Nombres de Meta para los mismos pasos del embudo.
const META_EVENT: Record<FunnelEvent['type'], string> = {
  view_item: 'ViewContent',
  add_to_cart: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
};

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
      // `arguments` y no `...args`, a propósito: gtag.js espera el objeto
      // Arguments en el dataLayer. Con un array, Google Analytics deja de
      // registrar sin dar ningún error.
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
  // La configuración ya respondió (bien o mal): recién ahí se sabe si se mide.
  const [ready, setReady] = useState(false);
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

    fetch(`${apiUrl()}/api/v1/tracking/`, { headers: tenantHeaders(tenantId) })
      .then((r) => r.json())
      .then((d: TrackingConfig) => alive && setConfig(d))
      .catch(() => alive && setConfig(null))
      .finally(() => alive && setReady(true));

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
    if (!stash || typeof stash.value !== 'number' || alreadySent(stash.orderId)) return;

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

  // El embudo (ver lib/track): ficha vista, agregado al carrito, inicio de la
  // compra. Mismas reglas que todo lo demás: con permiso se manda; mientras
  // no se sabe (o falta la respuesta del aviso) se encola; con un "no", en la
  // página de pago o sin herramientas configuradas, se descarta.
  const waiting =
    !ready || (config?.requireConsent === true && decision === null && hasAny && !isPaymentPage(pathname));
  useEffect(() => {
    if (allowed && loaded.current) {
      setTrackSink((e) => {
        const win = w();
        const items = e.type === 'begin_checkout' ? e.items : [e.item];
        const currency = items[0]?.currency ?? 'ARS';
        const value = valueOf(items);
        if (ga4 || ads) {
          win.gtag?.('event', e.type, {
            currency,
            value,
            items: items.map((i) => ({
              item_id: i.id,
              item_name: i.name,
              ...(i.variant ? { item_variant: i.variant } : {}),
              price: i.price / 100,
              quantity: i.quantity,
            })),
          });
        }
        if (meta) {
          win.fbq?.('track', META_EVENT[e.type], {
            content_ids: items.map((i) => i.id),
            content_type: 'product',
            contents: items.map((i) => ({ id: i.id, quantity: i.quantity })),
            value,
            currency,
            ...(e.type === 'begin_checkout' ? { num_items: items.reduce((s, i) => s + i.quantity, 0) } : {}),
          });
        }
      });
    } else {
      setTrackSink(waiting ? null : () => {});
    }
    return () => setTrackSink(null);
  }, [allowed, waiting, ga4, ads, meta]);

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

/**
 * Aviso de consentimiento. Aparece en todas las pantallas de la tienda hasta
 * que la persona responde, y no vuelve a aparecer.
 *
 * Toma la estética de la tienda donde está parado sin configurar nada: los
 * colores y las tipografías salen de las variables del tema, y el redondeo lo
 * resuelve la hoja de estilos global según lo que eligió el comercio en el
 * editor de diseño. Un aviso que se ve pegado no genera confianza, y esto es
 * justamente una pregunta de confianza.
 */
function ConsentBar({ onDecide }: { onDecide: (d: Decision) => void }) {
  const box = useRef<HTMLDivElement>(null);

  // Publica el alto del aviso para que lo que flota sobre el borde inferior
  // —hoy el botón de WhatsApp— se corra en vez de taparlo.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty('--tf-consent-h', `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--tf-consent-h');
    };
  }, []);

  return (
    <div
      ref={box}
      role="dialog"
      aria-live="polite"
      aria-label="Preferencias de medición"
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-[rgb(var(--color-fg)/0.12)] bg-bg text-fg shadow-[0_-8px_32px_-12px_rgb(0_0_0/0.35)]"
    >
      <div className="mx-auto flex max-w-container flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
            Antes de seguir
          </p>
          <p className="mt-0.5 text-sm leading-relaxed opacity-70">
            Usamos herramientas de Google y Meta para entender cómo se usa la tienda y qué avisos funcionan.
            Dejan cookies en tu navegador. Podés decir que no y comprar igual.{' '}
            <a href="/privacidad" className="font-semibold underline underline-offset-2">
              Cómo tratamos tus datos
            </a>
            .
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => onDecide('denied')}
            className="rounded-md border border-[rgb(var(--color-fg)/0.25)] px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-[rgb(var(--color-fg)/0.06)]"
          >
            No, gracias
          </button>
          <button
            type="button"
            onClick={() => onDecide('granted')}
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
