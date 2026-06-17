import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
};

export default nextConfig;
