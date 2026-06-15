import { StorefrontView } from '@/components/store/StorefrontView';
import { CatalogBrowser } from '@/components/store/CatalogBrowser';
import { resolveStorefrontPage } from '@/lib/storefront-page';
import { searchProducts, fetchCategories, toStoreProduct } from '@/lib/catalog';
import type { StoreProduct } from '@/components/store/sections';

export const dynamic = 'force-dynamic';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const resolved = await resolveStorefrontPage(searchParams);
  if (!resolved.ok) return resolved.fallback;
  const { data, theme, preview } = resolved;

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const sort = sp.sort ?? '';
  const q = sp.q ?? '';
  const category = sp.category ?? '';

  const [result, categories] = await Promise.all([
    searchProducts(data.tenant.id, { q, category, sort, page, pageSize: 24 }),
    fetchCategories(data.tenant.id),
  ]);

  const products = result.items
    .map(toStoreProduct)
    .filter((p): p is StoreProduct => p !== null);

  return (
    <StorefrontView tenantId={data.tenant.id} tenantName={data.tenant.name} theme={theme} products={products} live={preview}>
      <main className="min-h-[60vh]">
        <div className="mx-auto max-w-container px-4 pt-8">
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
            Todos los productos
          </h1>
        </div>
        <CatalogBrowser
          products={products}
          total={result.total}
          page={result.page}
          totalPages={result.totalPages}
          categories={categories}
          productList={theme.productList}
          current={{ q, sort, category }}
        />
      </main>
    </StorefrontView>
  );
}
