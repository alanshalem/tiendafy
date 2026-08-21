import path from 'node:path';
import type { NextConfig } from 'next';

// Origen de la API (para connect-src del CSP). En build queda inline; default dev.
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5080';

// CSP de defensa-en-profundidad. Permite los terceros que el storefront sí usa
// (MercadoPago SDK, Cloudflare Turnstile, Google fonts) y nada más. No es airtight
// porque las imágenes multi-tenant vienen de hosts arbitrarios, pero bloquea la
// carga de <script> externos no autorizados (vector principal de XSS/exfiltración).
// Orígenes de las herramientas de medición que el panel deja habilitar. Es una
// lista cerrada y revisable: el comercio elige cuáles enciende, pero no puede
// agregar un origen nuevo — para eso hay que tocar este archivo y que alguien
// lea el diff. Van siempre, encienda o no la tienda sus tags: el CSP se arma en
// build y es el mismo para todas, y no cambia nada — el navegador solo permite
// cargar desde estos hosts, que son de Google, Meta y Microsoft, no del comercio.
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

const csp = [
  "default-src 'self'",
  // 'unsafe-inline'/'unsafe-eval' los necesita Next (bootstrap inline + webpack).
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com https://*.mercadopago.com https://challenges.cloudflare.com ${TRACKING_SCRIPT}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https: http:",
  // Videos de hero (webm/mp4): vienen del bucket de media (MinIO http en dev, R2/S3
  // https en prod) y de hosts multi-tenant arbitrarios. Sin esto, <video> cae al
  // fallback default-src 'self' y el navegador bloquea la carga.
  "media-src 'self' data: blob: https: http:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' ${API} https://*.mercadopago.com https://api.mercadopago.com https://challenges.cloudflare.com ${TRACKING_CONNECT}`,
  // Embeds de la sección Instagram/Video: iframes de YouTube, Vimeo e Instagram.
  // Sin estos orígenes el navegador bloquea el iframe ("This content is blocked").
  'frame-src https://*.mercadopago.com https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.instagram.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.mercadopago.com",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Sin X-Frame-Options/frame-ancestors: el editor del admin previsualiza la tienda
  // dentro de un iframe; restringir el framing rompería la preview.
];

const nextConfig: NextConfig = {
  // Docker: `next build` emite .next/standalone (server.js + node_modules podados
  // por file-tracing) → runtime chico sin el repo entero. El tracing root es la
  // raíz del monorepo para que resuelva los paquetes workspace (@tiendafy/*).
  output: 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '..'),
  // Paquetes workspace en TS source — Next los transpila.
  transpilePackages: ['@tiendafy/ui', '@tiendafy/types', '@tiendafy/design-system'],
  // Multi-tenant: cada merchant sube imágenes a hosts arbitrarios → permitimos
  // cualquier host. next/image igual optimiza, hace lazy-load y srcset responsive.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
    // Next 16 bloquea upstreams que resuelven a IP privada (anti-SSRF). En dev
    // las imágenes viven en el MinIO local (localhost:9000), así que sin esto
    // next/image rompe todas las cards. En prod queda la protección activa:
    // el bucket se sirve por URL pública (Media:PublicBaseUrl).
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== 'production',
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
