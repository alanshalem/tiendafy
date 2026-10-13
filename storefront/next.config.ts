import path from 'node:path';
import type { NextConfig } from 'next';

// El Content-Security-Policy NO va acá: depende de la API de cada ambiente,
// que se conoce al arrancar el contenedor y no al compilar. Lo pone proxy.ts
// en cada respuesta (ver src/lib/csp.ts).
const securityHeaders = [
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
  // Node 22.12+ resuelve la condición `module-sync` también en require(), y
  // @swc/helpers la apunta a su versión esm/. El tracing de Next solo copia la
  // cjs/, así que el server standalone no arrancaba ("Cannot find module
  // .../@swc/helpers/esm/_interop_require_default.js"). Es el único paquete
  // del standalone con ese hueco (revisado sobre la imagen, oct-2026).
  outputFileTracingIncludes: {
    '/*': ['../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*'],
  },
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
