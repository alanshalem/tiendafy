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
 * Mercado Pago, Turnstile, Google Fonts, la medición que el panel deja
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

/** El origen (esquema + host + puerto) de la URL de la API; null si no es una URL. */
export function apiOrigin(apiUrl: string): string | null {
  try {
    const { origin } = new URL(apiUrl);
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

export function buildCsp(apiUrl: string): string {
  const api = apiOrigin(apiUrl);
  return [
    "default-src 'self'",
    // 'unsafe-inline'/'unsafe-eval' los necesita Next (bootstrap inline + webpack).
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com https://*.mercadopago.com https://challenges.cloudflare.com ${TRACKING_SCRIPT}`,
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
      'https://*.mercadopago.com https://api.mercadopago.com https://challenges.cloudflare.com',
      TRACKING_CONNECT,
    ]
      .filter(Boolean)
      .join(' '),
    // Embeds de la sección Instagram/Video: iframes de YouTube, Vimeo e Instagram.
    'frame-src https://*.mercadopago.com https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.instagram.com',
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://*.mercadopago.com",
  ].join('; ');
}
