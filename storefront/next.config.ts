import path from 'node:path';
import type { NextConfig } from 'next';

// Origen de la API (para connect-src del CSP). En build queda inline; default dev.
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5080';

// CSP de defensa-en-profundidad. Permite los terceros que el storefront sí usa
// (MercadoPago SDK, Cloudflare Turnstile, Google fonts) y nada más. No es airtight
// porque las imágenes multi-tenant vienen de hosts arbitrarios, pero bloquea la
// carga de <script> externos no autorizados (vector principal de XSS/exfiltración).
const csp = [
  "default-src 'self'",
  // 'unsafe-inline'/'unsafe-eval' los necesita Next (bootstrap inline + webpack).
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com https://*.mercadopago.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https: http:",
  // Videos de hero (webm/mp4): vienen del bucket de media (MinIO http en dev, R2/S3
  // https en prod) y de hosts multi-tenant arbitrarios. Sin esto, <video> cae al
  // fallback default-src 'self' y el navegador bloquea la carga.
  "media-src 'self' data: blob: https: http:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' ${API} https://*.mercadopago.com https://api.mercadopago.com https://challenges.cloudflare.com`,
  // Embeds de la sección Instagram/Video: iframes de YouTube, Vimeo e Instagram.
  // Sin estos orígenes el navegador bloquea el iframe ("This content is blocked").
  "frame-src https://*.mercadopago.com https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.instagram.com",
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
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
