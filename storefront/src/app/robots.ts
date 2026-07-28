import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';

// Dinámico: la URL del sitemap debe ser ABSOLUTA (lo exige el protocolo
// sitemaps.org; relativa es no-conforme) y este host es multi-tenant.
export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host') ?? 'localhost:3000';
  const proto = host.includes('localhost') ? 'http' : 'https';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/checkout', '/favoritos'],
    },
    sitemap: `${proto}://${host}/sitemap.xml`,
  };
}
