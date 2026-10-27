/**
 * Content-Security-Policy de la tienda: de dónde puede cargar scripts y a
 * dónde puede pedir datos el navegador.
 *
 * Se arma AL SERVIR cada página (proxy.ts) y no al compilar: la API de cada
 * ambiente se conoce recién cuando arranca el contenedor (`PUBLIC_API_URL`).
 * Antes vivía en next.config.ts con `NEXT_PUBLIC_API_URL`, que en una imagen
 * sin ambiente está vacía: en producción quedó `connect-src 'self'  …` sin la
 * API y el navegador bloqueaba el login, el menú, el checkout y la medición.
 *
 * Defensa en profundidad: permite los terceros que la tienda sí usa (SDK de
 * Mercado Pago, SDK de Payway, Turnstile, Google Fonts, la medición que el panel deja
 * prender) y nada más. No es hermético —las imágenes de cada tienda vienen de
 * hosts arbitrarios— pero bloquea <script> externos no autorizados, el vector
 * principal de XSS y exfiltración.
 */

/**
 * Orígenes de las herramientas de medición que el panel deja habilitar. Es una
 * lista cerrada y revisable: el comercio elige cuáles enciende, pero no puede
 * agregar un origen nuevo —para eso hay que tocar este archivo y que alguien
 * lea el diff—. Van siempre, encienda o no la tienda sus tags: son hosts de
 * Google, Meta y Microsoft, no del comercio.
 */
const TRACKING_SCRIPT = [
  'https://www.googletagmanager.com',
  'https://connect.facebook.net',
  'https://www.clarity.ms',
  'https://*.clarity.ms',
].join(' ');

const TRACKING_CONNECT = [
  'https://www.google-analytics.com',
  'https://*.google-analytics.com',
  'https://*.analytics.google.com',
  'https://www.googletagmanager.com',
  'https://*.g.doubleclick.net',
  'https://www.facebook.com',
  'https://connect.facebook.net',
  'https://*.clarity.ms',
].join(' ');

/**
 * SDK de Payway (`decidir.js`). Se sirve siempre desde el host productivo,
 * aunque la tienda cobre en sandbox: el ambiente se le pasa al constructor,
 * no al script. Va la URL exacta del archivo, no el host entero; el formulario
 * de tarjeta importa esta misma constante para que no se desfasen.
 */
export const PAYWAY_SDK_URL = 'https://ventasonline.payway.com.ar/static/v2.6.4/decidir.js';

/**
 * Hosts de la API de Payway contra los que `decidir.js` tokeniza la tarjeta
 * (y consulta `/frauddetectionconf`): el de sandbox, el productivo que usa el
 * backend (`PaywayConnection.ProductionBaseUrl`) y el productivo alternativo
 * que usan los SDK de Node y Java, que es el que se cargaría como host
 * alternativo si Payway confirma ese. Un host alternativo distinto de estos
 * tres necesita sumarse acá.
 *
 * El script de huella de dispositivo de Cybersource (`h.online-metrix.net`) que
 * el SDK inyecta si el comercio tiene antifraude NO se permite: el antifraude
 * no está implementado a propósito y la tokenización no depende de él.
 */
const PAYWAY_CONNECT = [
  'https://developers.decidir.com',
  'https://live.decidir.com',
  'https://ventasonline.payway.com.ar',
].join(' ');

/**
 * De dónde bajan los Bricks de Mercado Pago su código y sus textos. El SDK
 * (`sdk.mercadopago.com/js/v2`) es solo el cargador: cada Brick (`payment.js`,
 * `statusScreen.js` y sus partes) se agrega como `<script>` desde
 * `http2.mlstatic.com/frontend-assets/op-cho-bricks/build/<versión>/components/`,
 * y los textos y la configuración se piden con fetch al mismo host. Mercado
 * Pago no publica esta lista: sale de leer el SDK (v3.19.0, oct-2026). Sin
 * esto el Brick no aparece.
 */
const MP_BRICKS_ASSETS = 'https://http2.mlstatic.com';

/**
 * La página de pago, la única que muestra el desafío 3DS del banco ("confirmá
 * que sos vos"). El Status Screen Brick lo arma en ESTA página: un `<iframe>` y
 * un `<form method="post" target=…>` hacia `three_ds_info.external_resource_url`,
 * que es el servidor de autenticación (ACS) del banco que emitió la tarjeta
 * (en la doc oficial, `acs-public.tp.mastercard.com`). Cada banco tiene el suyo
 * y la lista no se puede saber de antemano, así que solo en esta ruta
 * `frame-src` y `form-action` aceptan cualquier origen https. El resto de la
 * tienda sigue sin iframes ni formularios hacia afuera de la lista.
 */
export function isCardChallengePage(pathname: string): boolean {
  return pathname === '/checkout' || pathname === '/checkout/';
}

/** El origen (esquema + host + puerto) de la URL de la API; null si no es una URL. */
export function apiOrigin(apiUrl: string): string | null {
  try {
    const { origin } = new URL(apiUrl);
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

export interface CspOptions {
  /** Ver isCardChallengePage: el desafío 3DS del banco, solo en la página de pago. */
  cardChallenge?: boolean;
  /**
   * Origen del panel. El editor de diseño muestra la tienda en un iframe
   * desde el panel, así que es el único sitio ajeno que puede enmarcarla.
   */
  adminOrigin?: string;
  /**
   * DSN de Sentry del navegador (`PUBLIC_SENTRY_DSN`). Su host de ingesta va al
   * connect-src: sin él el navegador bloquea el envío y los errores de la
   * tienda se pierden en silencio.
   */
  sentryDsn?: string;
  /** Solo en `next dev`: React usa eval() para reconstruir los stacks en desarrollo. */
  dev?: boolean;
}

export function buildCsp(apiUrl: string, options: CspOptions = {}): string {
  const { cardChallenge = false, adminOrigin = '', sentryDsn = '', dev = false } = options;
  const api = apiOrigin(apiUrl);
  const admin = apiOrigin(adminOrigin);
  // El origen sale del DSN (https://clave@host/proyecto): la clave no es parte de él.
  const sentry = sentryDsn ? apiOrigin(sentryDsn) : null;
  // Nadie más puede enmarcar la tienda (clickjacking): ella misma y el panel.
  const frameAncestors = ["'self'", admin].filter(Boolean).join(' ');
  // Ver isCardChallengePage: el desafío 3DS del banco, solo en la página de pago.
  const challenge = cardChallenge ? ' https:' : '';
  return [
    "default-src 'self'",
    // 'unsafe-inline' se queda: Next mete scripts inline (bootstrap y datos del
    // render) y la alternativa son nonces, que obligan a renderizar TODAS las
    // páginas en forma dinámica; la tienda vive de la caché (Data Cache y ISR),
    // así que no se pueden usar. 'unsafe-eval' solo en desarrollo: en
    // producción Next no hace eval().
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''} https://sdk.mercadopago.com https://*.mercadopago.com ${MP_BRICKS_ASSETS} https://challenges.cloudflare.com ${PAYWAY_SDK_URL} ${TRACKING_SCRIPT}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https: http:",
    // Videos de hero (webm/mp4): vienen del bucket de media (MinIO http en dev,
    // R2/S3 https en prod) y de hosts multi-tenant arbitrarios. Sin esto,
    // <video> cae al fallback default-src 'self' y el navegador bloquea la carga.
    "media-src 'self' data: blob: https: http:",
    "font-src 'self' data: https://fonts.gstatic.com",
    [
      'connect-src',
      "'self'",
      api,
      'https://*.mercadopago.com https://api.mercadopago.com',
      MP_BRICKS_ASSETS,
      'https://challenges.cloudflare.com',
      PAYWAY_CONNECT,
      TRACKING_CONNECT,
      sentry,
    ]
      .filter(Boolean)
      .join(' '),
    // Embeds de la sección Instagram/Video: iframes de YouTube, Vimeo e Instagram.
    `frame-src https://*.mercadopago.com https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.instagram.com${challenge}`,
    "object-src 'none'",
    "base-uri 'self'",
    `frame-ancestors ${frameAncestors}`,
    `form-action 'self' https://*.mercadopago.com${challenge}`,
  ].join('; ');
}
