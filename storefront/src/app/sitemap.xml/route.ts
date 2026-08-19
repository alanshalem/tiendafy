import { headers } from 'next/headers';
import { resolveTenant } from '@/lib/tenancy';
import { apiGetTenant } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Sitemap por host: cada tienda lista sus productos + páginas publicadas.
export async function GET() {
  const h = await headers();
  const host = h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const base = `${proto}://${host}`;

  const locs: string[] = [`${base}/`, `${base}/productos`, `${base}/contacto`];

  const tenant = await resolveTenant();
  if (tenant) {
    // apiGetTenant y no apiGet: todo fetch server-side pasa por el guardrail
    // que evita cachear respuestas de un tenant para otro.
    const products = await apiGetTenant<{ items: { slug: string }[] }>(
      '/api/v1/products?status=ACTIVE&limit=100',
      tenant.id,
      { cache: 'no-store' },
    ).catch(() => null);
    products?.items.forEach((p) => locs.push(`${base}/productos/${p.slug}`));

    const pages = await apiGetTenant<{ items: { slug: string }[] }>('/api/v1/pages/published', tenant.id, {
      cache: 'no-store',
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
