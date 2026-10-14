import { headers } from 'next/headers';
import { resolveTenant } from '@/lib/tenancy';
import { apiGetTenant } from '@/lib/api';
import { fetchAllActiveSlugs, SITEMAP_MAX_URLS } from '@/lib/catalog';
import { fetchPublishedTheme } from '@/lib/theme';
import { REVALIDATE } from '@/lib/cache';

export const dynamic = 'force-dynamic';

// Sitemap por host: cada tienda lista sus productos + páginas publicadas.
export async function GET() {
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const base = `${proto}://${host}`;

  const locs: string[] = [`${base}/`, `${base}/productos`, `${base}/contacto`];

  const tenant = await resolveTenant();
  // En construcción el catálogo no se muestra: listar sus productos le
  // ofrecería a Google cientos de URLs que dicen todas "estamos en camino".
  const comingSoon = tenant
    ? ((await fetchPublishedTheme(tenant.id).catch(() => null))?.comingSoon.enabled ?? false)
    : false;
  if (comingSoon) locs.splice(1);
  if (tenant && !comingSoon) {
    // Todo el catálogo activo, no la primera página: ver fetchAllActiveSlugs.
    const slugs = await fetchAllActiveSlugs(tenant.id, SITEMAP_MAX_URLS - locs.length);
    slugs.forEach((slug) => locs.push(`${base}/productos/${slug}`));

    // apiGetTenant y no apiGet: todo fetch server-side pasa por el guardrail
    // que evita cachear respuestas de un tenant para otro.
    const pages = await apiGetTenant<{ items: { slug: string }[] }>('/api/v1/pages/published', tenant.id, {
      next: { revalidate: REVALIDATE.cms },
    }).catch(() => null);
    pages?.items.forEach((pg) => locs.push(`${base}/paginas/${pg.slug}`));
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    locs.map((loc) => `  <url><loc>${loc}</loc></url>`).join('\n') +
    `\n</urlset>`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
