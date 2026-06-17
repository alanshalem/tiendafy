import { StorefrontView } from '@/components/store/StorefrontView';
import { fetchDraftTheme } from '@/lib/theme';
import { loadStorefront, withReferencedProducts } from '@/lib/storefront';

// Preview del editor: render del DRAFT, con postMessage live.
export const dynamic = 'force-dynamic';

export default async function PreviewPage() {
  const data = await loadStorefront();
  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-fg-muted">
        No se pudo resolver la tienda para el preview.
      </div>
    );
  }

  const theme = await fetchDraftTheme(data.tenant.id);
  const products = await withReferencedProducts(data.tenant.id, theme, data.products);

  return (
    <StorefrontView
      tenantId={data.tenant.id}
      tenantName={data.tenant.name}
      theme={theme}
      products={products}
      live
    />
  );
}
