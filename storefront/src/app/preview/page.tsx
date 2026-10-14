import type { Metadata } from 'next';
import { StorefrontView } from '@/components/store/StorefrontView';
import { fetchDraftTheme } from '@/lib/theme';
import { loadStorefront, loadHomeSectionProducts } from '@/lib/storefront';
import { NOT_INDEXED } from '@/lib/seo';

// Preview del editor: render del DRAFT, con postMessage live.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Vista previa', robots: NOT_INDEXED };

export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ pt?: string }> }) {
  const data = await loadStorefront();
  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-fg-muted">
        No se pudo resolver la tienda para el preview.
      </div>
    );
  }

  const { pt } = await searchParams;
  const theme = await fetchDraftTheme(data.tenant.id, pt);
  // Los productos de cada sección de la portada, según su origen (elegidos,
  // más vendidos, lo último, ofertas…): un pedido por origen y solo publicados.
  const sectionProducts = await loadHomeSectionProducts(data.tenant.id, theme.sections);

  return (
    <StorefrontView
      tenantId={data.tenant.id}
      tenantName={data.tenant.name}
      theme={theme}
      products={data.products}
      sectionProducts={sectionProducts}
      live
    />
  );
}
