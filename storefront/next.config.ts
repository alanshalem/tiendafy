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

const isProduction = process.env.NODE_ENV === 'production';

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
  // /_next/image baja la foto de donde diga la URL y la sirve desde nuestro
  // origen. Los productos traen fotos de nuestro storage y de hosts de
  // proveedores (re-hospedadas o no), así que no se puede cerrar a un host:
  // se cierra todo lo demás que se puede.
  images: {
    remotePatterns: [
      // Solo https. Por http, solo el MinIO local de desarrollo.
      { protocol: 'https', hostname: '**' },
      ...(isProduction
        ? []
        : [
            { protocol: 'http' as const, hostname: 'localhost' },
            { protocol: 'http' as const, hostname: '127.0.0.1' },
          ]),
    ],
    // Next 16 bloquea upstreams que resuelven a IP privada (anti-SSRF). En dev
    // las imágenes viven en el MinIO local (localhost:9000), así que sin esto
    // next/image rompe todas las cards. En prod queda la protección activa:
    // el bucket se sirve por URL pública (Media:PublicBaseUrl).
    dangerouslyAllowLocalIP: !isProduction,
    // Una foto de producto pesa hasta 5 MB (el tope de Media); 10 MB deja
    // margen a la de un proveedor y no deja bajar cualquier cosa (el default
    // de Next son 50 MB por pedido, en la RAM del servidor).
    maximumResponseBody: 10_000_000,
    // Las redirecciones no pasan por remotePatterns (una https puede llevar a
    // http): una alcanza para el CDN de un proveedor.
    maximumRedirects: 1,
    // La caché de imágenes optimizadas, acotada: el default es la mitad del
    // disco libre al arrancar, y el servidor es compartido.
    maximumDiskCacheSize: 500_000_000,
    // Nunca SVG por el optimizador (puede traer scripts); los SVG van directo
    // (next/image los marca unoptimized solo). Y lo que sirve, como descarga
    // y sin poder ejecutar nada si alguien abre la URL a mano.
    dangerouslyAllowSVG: false,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
