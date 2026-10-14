import { Suspense } from 'react';
import type { Metadata } from 'next';
import { StorefrontView } from '@/components/store/StorefrontView';
import { ProductGridSkeleton } from '@/components/store/Skeletons';
import { CatalogBrowser } from '@/components/store/CatalogBrowser';
import { resolveStorefrontPage } from '@/lib/storefront-page';
import { searchProducts, fetchCategories, toStoreProduct, type CategoryDto } from '@/lib/catalog';
import { categoryParam, findCategory, readableQuery } from '@/lib/category-url';
import { resolveTenant } from '@/lib/tenancy';
import type { StoreProduct } from '@/components/store/sections';
import { siteBase } from '@/lib/storefront';
import type { ThemeConfig } from '@/lib/theme';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El número de página pedido (1 si no vino o no es un número). */
const pageOf = (sp: SearchParams) => Math.max(1, Number.parseInt(one(sp.page) || '1', 10) || 1);

/**
 * La URL canónica del listado: la categoría y la página, nada más. El orden,
 * la búsqueda y los filtros son variantes de la misma lista y no tienen que
 * competir con ella en Google; cada categoría y cada página siguiente sí son
 * una lista distinta (antes todo apuntaba a /productos, y Google no indexaba
 * ninguna categoría).
 */
function canonicalPath(category: CategoryDto | undefined, page: number): string {
  const qs = new URLSearchParams();
  if (category) qs.set('category', categoryParam(category));
  if (page > 1) qs.set('page', String(page));
  const query = readableQuery(qs);
  return query ? `/productos?${query}` : '/productos';
}

// La página de catálogo es la #2 en importancia SEO de cada tienda, y cada
// categoría es la puerta de entrada de las búsquedas por rubro ("pesas rusas").
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const tenant = await resolveTenant();
  if (!tenant) return { title: 'Productos' };
  const sp = await searchParams;
  const category = findCategory(await fetchCategories(tenant.id).catch(() => []), one(sp.category));
  const page = pageOf(sp);
  const base = await siteBase();
  const suffix = page > 1 ? ` (página ${page})` : '';
  return {
    // La plantilla del layout le suma " · <Tienda>".
    title: `${category?.name ?? 'Productos'}${suffix}`,
    description: category
      ? `${category.name} en ${tenant.name}. Comprá online con envíos a todo el país.`
      : `Todos los productos de ${tenant.name}. Comprá online con envíos a todo el país.`,
    ...(base ? { alternates: { canonical: `${base}${canonicalPath(category, page)}` } } : {}),
  };
}

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
  const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

  const page = pageOf(sp);
  const sort = one(sp.sort);
  const q = one(sp.q);
  const brand = one(sp.brand);
  const options = many(sp.option);
  const specs = many(sp.spec);
  const priceMin = Number.parseInt(one(sp.priceMin), 10);
  const priceMax = Number.parseInt(one(sp.priceMax), 10);

  // Orden y tamaño de página salen del diseño. El 48 es el techo del backend:
  // pedir más de lo que sirve devolvería una página incompleta sin avisar.
  const list = theme.productList;
  const pageSize = Math.min(48, Math.max(1, list.pageSize || 24));

  // ?category= trae la ruta ("ropa/remeras") o, en links viejos, el id. La API
  // filtra por id. Una que no está en el árbol (recién creada, todavía fuera
  // de la caché) pasa tal cual si es un id; si no, se ignora.
  const categories = await fetchCategories(tenantId);
  const raw = one(sp.category);
  const active = findCategory(categories, raw);
  const category = active?.id ?? (UUID.test(raw) ? raw : '');

  const result = await searchProducts(tenantId, {
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
  });

  const products = result.items.map(toStoreProduct).filter((p): p is StoreProduct => p !== null);

  return (
    <main className="min-h-[60vh]">
      <div className="mx-auto max-w-container px-4 pt-8">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          {active?.name ?? 'Todos los productos'}
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
