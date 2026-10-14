import { headers } from 'next/headers';
import { resolveTenant } from '@/lib/tenancy';
import { apiGetTenant } from '@/lib/api';
import { fetchAllActiveEntries, fetchCategories, SITEMAP_MAX_URLS } from '@/lib/catalog';
import { categoryHref } from '@/lib/category-url';
import { fetchPublishedTheme } from '@/lib/theme';
import { REVALIDATE } from '@/lib/cache';

export const dynamic = 'force-dynamic';

/** Lo que va dentro de <loc>: una ruta de categoría o un slug no pueden romper el XML. */
const xmlText = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// Sitemap por host: cada tienda lista sus categorías, productos y páginas publicadas.
export async function GET() {
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const base = `${proto}://${host}`;

  // Cada URL con su lastmod si se sabe (los productos: su último cambio).
  const locs: { loc: string; lastmod?: string }[] = [`${base}/`, `${base}/productos`, `${base}/contacto`].map(
    (loc) => ({ loc }),
  );

  const tenant = await resolveTenant();
  // En construcción el catálogo no se muestra: listar sus productos le
  // ofrecería a Google cientos de URLs que dicen todas "estamos en camino".
  const comingSoon = tenant
    ? ((await fetchPublishedTheme(tenant.id).catch(() => null))?.comingSoon.enabled ?? false)
    : false;
  if (comingSoon) locs.splice(1);
  if (tenant && !comingSoon) {
    // Cada categoría es su propio listado (título, canonical): sin esto Google
    // solo las encontraba si seguía el menú.
    const categories = await fetchCategories(tenant.id).catch(() => []);
    categories.forEach((c) => locs.push({ loc: `${base}${categoryHref(c)}` }));

    // Todo el catálogo activo, no la primera página: ver fetchAllActiveEntries.
    const products = await fetchAllActiveEntries(tenant.id, SITEMAP_MAX_URLS - locs.length);
    products.forEach((p) => locs.push({ loc: `${base}/productos/${p.slug}`, lastmod: p.lastmod }));

    // apiGetTenant y no apiGet: todo fetch server-side pasa por el guardrail
    // que evita cachear respuestas de un tenant para otro.
    const pages = await apiGetTenant<{ items: { slug: string }[] }>('/api/v1/pages/published', tenant.id, {
      next: { revalidate: REVALIDATE.cms },
    }).catch(() => null);
    pages?.items.forEach((pg) => locs.push({ loc: `${base}/paginas/${pg.slug}` }));
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    locs
      .map(({ loc, lastmod }) => {
        const date = lastmod ? new Date(lastmod) : null;
        const mod = date && !Number.isNaN(date.getTime()) ? `<lastmod>${date.toISOString()}</lastmod>` : '';
        return `  <url><loc>${xmlText(loc)}</loc>${mod}</url>`;
      })
      .join('\n') +
    `\n</urlset>`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
