import { StorefrontView } from '@/components/store/StorefrontView';
import { CatalogBrowser } from '@/components/store/CatalogBrowser';
import { resolveStorefrontPage } from '@/lib/storefront-page';
import { searchProducts, fetchCategories, toStoreProduct } from '@/lib/catalog';
import type { StoreProduct } from '@/components/store/sections';

export const dynamic = 'force-dynamic';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await resolveStorefrontPage(searchParams);
  if (!resolved.ok) return resolved.fallback;
  const { data, theme, preview } = resolved;

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

  const page = Math.max(1, Number.parseInt(one(sp.page) || '1', 10) || 1);
  const sort = one(sp.sort);
  const q = one(sp.q);
  const category = one(sp.category);
  const brand = one(sp.brand);
  const options = many(sp.option);
  const priceMin = Number.parseInt(one(sp.priceMin), 10);
  const priceMax = Number.parseInt(one(sp.priceMax), 10);

  const [result, categories] = await Promise.all([
    searchProducts(data.tenant.id, {
      q,
      category,
      sort,
      page,
      pageSize: 24,
      brand,
      options,
      priceMin: Number.isFinite(priceMin) ? priceMin : undefined,
      priceMax: Number.isFinite(priceMax) ? priceMax : undefined,
    }),
    fetchCategories(data.tenant.id),
  ]);

  const products = result.items.map(toStoreProduct).filter((p): p is StoreProduct => p !== null);

  return (
    <StorefrontView
      tenantId={data.tenant.id}
      tenantName={data.tenant.name}
      theme={theme}
      products={products}
      live={preview}
    >
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
          facets={result.facets}
          productList={theme.productList}
          current={{
            q,
            sort,
            category,
            brand,
            options,
            priceMin: one(sp.priceMin),
            priceMax: one(sp.priceMax),
          }}
        />
      </main>
    </StorefrontView>
  );
}
