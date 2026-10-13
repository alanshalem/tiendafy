import { Suspense } from 'react';
import type { Metadata } from 'next';
import { StorefrontView } from '@/components/store/StorefrontView';
import { ProductGridSkeleton } from '@/components/store/Skeletons';
import { CatalogBrowser } from '@/components/store/CatalogBrowser';
import { resolveStorefrontPage } from '@/lib/storefront-page';
import { searchProducts, fetchCategories, toStoreProduct } from '@/lib/catalog';
import { resolveTenant } from '@/lib/tenancy';
import type { StoreProduct } from '@/components/store/sections';
import { siteBase } from '@/lib/storefront';
import type { ThemeConfig } from '@/lib/theme';

export const dynamic = 'force-dynamic';

// La página de catálogo es la #2 en importancia SEO de cada tienda: sin esto
// se titulaba "Tiendafy" (¡ni el nombre del comercio!) y sin canonical.
export async function generateMetadata(): Promise<Metadata> {
  const tenant = await resolveTenant();
  if (!tenant) return { title: 'Productos' };
  const base = await siteBase();
  return {
    title: `Productos · ${tenant.name}`,
    description: `Todos los productos de ${tenant.name}. Comprá online con envíos a todo el país.`,
    ...(base ? { alternates: { canonical: `${base}/productos` } } : {}),
  };
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolved = await resolveStorefrontPage(searchParams);
  if (!resolved.ok) return resolved.fallback;
  const { data, theme, preview } = resolved;

  // El marco de la tienda sale ya; la búsqueda (lo que tarda) llega después,
  // con el esqueleto de la grilla en su lugar.
  return (
    <StorefrontView
      tenantId={data.tenant.id}
      tenantName={data.tenant.name}
      theme={theme}
      products={data.products}
      live={preview}
    >
      <Suspense fallback={<ProductGridSkeleton count={12} />}>
        <Catalog tenantId={data.tenant.id} theme={theme} searchParams={searchParams} />
      </Suspense>
    </StorefrontView>
  );
}

async function Catalog({
  tenantId,
  theme,
  searchParams,
}: {
  tenantId: string;
  theme: ThemeConfig;
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

  const page = Math.max(1, Number.parseInt(one(sp.page) || '1', 10) || 1);
  const sort = one(sp.sort);
  const q = one(sp.q);
  const category = one(sp.category);
  const brand = one(sp.brand);
  const options = many(sp.option);
  const specs = many(sp.spec);
  const priceMin = Number.parseInt(one(sp.priceMin), 10);
  const priceMax = Number.parseInt(one(sp.priceMax), 10);

  // Orden y tamaño de página salen del diseño. El 48 es el techo del backend:
  // pedir más de lo que sirve devolvería una página incompleta sin avisar.
  const list = theme.productList;
  const pageSize = Math.min(48, Math.max(1, list.pageSize || 24));

  const [result, categories] = await Promise.all([
    searchProducts(tenantId, {
      q,
      category,
      sort: sort || list.defaultSort,
      page,
      pageSize,
      brand,
      options,
      specs,
      priceMin: Number.isFinite(priceMin) ? priceMin : undefined,
      priceMax: Number.isFinite(priceMax) ? priceMax : undefined,
    }),
    fetchCategories(tenantId),
  ]);

  const products = result.items.map(toStoreProduct).filter((p): p is StoreProduct => p !== null);

  return (
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
          specs,
          priceMin: one(sp.priceMin),
          priceMax: one(sp.priceMax),
        }}
      />
    </main>
  );
}
