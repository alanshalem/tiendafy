import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Paquetes workspace en TS source — Next los transpila.
  transpilePackages: ['@tiendafy/ui', '@tiendafy/types', '@tiendafy/design-system'],
};

export default nextConfig;
