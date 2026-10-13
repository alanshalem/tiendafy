import { Suspense } from 'react';
import { StorefrontView } from '@/components/store/StorefrontView';
import { ProductDetailSkeleton } from '@/components/store/Skeletons';
import { StoreBreadcrumbs } from '@/components/store/StoreBreadcrumbs';
import { ProductDetail } from '@/components/store/ProductDetail';
import { SectionRenderer } from '@/components/store/sections';
import { EmptyState } from '@/components/store/EmptyState';
import type { Metadata } from 'next';
import { resolveStorefrontPage } from '@/lib/storefront-page';
import { loadStorefront, siteBase, type StorefrontData } from '@/lib/storefront';
import type { ThemeConfig } from '@/lib/theme';
import { apiGetTenant } from '@/lib/api';
import { searchProducts, toStoreProduct } from '@/lib/catalog';
import type { StoreProduct } from '@/components/store/sections';
import type { MoneyDto } from '@tiendafy/types';
import { REVALIDATE } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadStorefront();
  if (!data) return { title: 'Tienda' };
  const product = await apiGetTenant<{
    name: string;
    description: string | null;
    images: { url: string }[];
  }>(`/api/v1/products/by-slug/${slug}`, data.tenant.id, { next: { revalidate: REVALIDATE.catalog } }).catch(
    () => null,
  );
  if (!product) return { title: data.tenant.name };
  const base = await siteBase();
  return {
    title: `${product.name} · ${data.tenant.name}`,
    description: product.description?.slice(0, 160) ?? `${product.name} en ${data.tenant.name}.`,
    // Canonical: la URL limpia del producto (sin ?preview ni tracking).
    ...(base ? { alternates: { canonical: `${base}/productos/${slug}` } } : {}),
    openGraph: {
      title: product.name,
      description: product.description?.slice(0, 160) ?? undefined,
      images: product.images[0]?.url ? [product.images[0].url] : [],
    },
  };
}

interface ProductDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  options: { name: string; values: string[] }[];
  variants: {
    id: string;
    sku: string;
    optionValues: string[];
    price: MoneyDto;
    compareAtPrice: MoneyDto | null;
  }[];
  images: { url: string; altText: string | null }[];
  categoryIds: string[];
  specs: { definitionId: string; value: string }[];
  stock: number | null;
}

/** Definición de un campo de ficha técnica: da el nombre y la unidad. */
interface SpecDefinitionDto {
  id: string;
  name: string;
  unit: string | null;
  showOnProduct: boolean;
  sortOrder: number;
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const resolved = await resolveStorefrontPage(searchParams);
  if (!resolved.ok) return resolved.fallback;
  const { data, theme, preview } = resolved;

  // El marco de la tienda sale ya; la ficha (producto, relacionados, miga y
  // ficha técnica: lo que tarda) llega después, con su esqueleto en el lugar.
  return (
    <StorefrontView
      tenantId={data.tenant.id}
      tenantName={data.tenant.name}
      theme={theme}
      products={data.products}
      live={preview}
    >
      <Suspense fallback={<ProductDetailSkeleton />}>
        <ProductContent slug={slug} data={data} theme={theme} preview={preview} />
      </Suspense>
    </StorefrontView>
  );
}

async function ProductContent({
  slug,
  data,
  theme,
  preview,
}: {
  slug: string;
  data: StorefrontData;
  theme: ThemeConfig;
  preview: boolean;
}) {
  // Data cache 30s keyed por tenant (_mt): TTFB decente sin SSR+DB en cada hit.
  const product = await apiGetTenant<ProductDto>(`/api/v1/products/by-slug/${slug}`, data.tenant.id, {
    next: { revalidate: REVALIDATE.catalog },
  });

  // "También te puede gustar": productos de la MISMA categoría del que se está
  // viendo (antes eran siempre los primeros 4 del catálogo). Si la categoría no
  // llega a 4, rellenamos con el resto del catálogo para no dejar huecos.
  const related = await buildRelated(data.tenant.id, slug, product?.categoryIds ?? [], data.products);

  // La ficha técnica se arma acá y no en el componente: los valores vienen con
  // el producto y los nombres con las definiciones de la tienda, y unirlos en
  // el servidor evita un pedido más desde el navegador.
  const specRows = await buildSpecRows(data.tenant.id, product?.specs ?? []);

  // Miga: Inicio › (cadena de categorías) › Producto — navegación + BreadcrumbList
  // para que Google muestre migas en el resultado en vez de la URL.
  const trail = product ? await buildCategoryTrail(data.tenant.id, product.categoryIds) : [];
  const crumbs = product
    ? [
        { label: 'Inicio', href: '/' },
        { label: 'Productos', href: '/productos' },
        ...trail.map((c) => ({ label: c.name, href: `/productos?category=${c.id}` })),
        { label: product.name },
      ]
    : [];
  const base = await siteBase();
  const breadcrumbJsonLd =
    product && base
      ? {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: crumbs.map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: typeof c.label === 'string' ? c.label : product.name,
            ...(c.href ? { item: `${base}${c.href}` } : {}),
          })),
        }
      : null;

  // Rich results de producto en Google: precio, moneda y disponibilidad.
  const firstVariant = product?.variants[0];
  const productJsonLd =
    product && firstVariant
      ? {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          ...(product.description ? { description: product.description.slice(0, 500) } : {}),
          ...(product.images.length ? { image: product.images.map((i) => i.url) } : {}),
          ...(base ? { url: `${base}/productos/${product.slug}` } : {}),
          offers: {
            '@type': 'Offer',
            priceCurrency: firstVariant.price.currency,
            price: (firstVariant.price.amount / 100).toFixed(2), // minor units → pesos
            // Disponibilidad REAL (datos falsos = perder rich results).
            // stock null = desconocido → optimista InStock.
            availability:
              product.stock === 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
            ...(base ? { url: `${base}/productos/${product.slug}` } : {}),
          },
        }
      : null;

  return (
    <main className="mx-auto max-w-container px-4 py-8">
      {product && <StoreBreadcrumbs items={crumbs} />}
      {breadcrumbJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
      )}
      {productJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
      )}
      {product ? (
        <>
          <ProductDetail
            name={product.name}
            description={product.description}
            images={product.images}
            options={product.options}
            variants={product.variants}
            specs={specRows}
            config={theme.productDetail}
            paymentLogos={theme.footer.paymentLogos}
            whatsappPhone={theme.whatsappButton.phone}
          />
          {theme.productDetail.showRelated && related.length > 0 && (
            <SectionRenderer
              section={{
                id: 'related',
                type: 'featured',
                visible: true,
                data: { title: 'También te puede gustar' },
              }}
              products={related}
              storeName={data.tenant.name}
              productList={theme.productList}
            />
          )}
        </>
      ) : (
        <EmptyState
          title="Producto no encontrado"
          message="Puede que ya no esté disponible o que el enlace sea incorrecto."
          cta={{ href: preview ? '/productos?preview=1' : '/productos', label: 'Ver todos los productos' }}
        />
      )}
    </main>
  );
}

/**
 * Arma los "También te puede gustar": primero productos de la misma categoría del
 * que se ve, y si no llegan a 4, rellena con el resto del catálogo. Nunca repite ni
 * incluye el producto actual.
 */
async function buildRelated(
  tenantId: string,
  currentSlug: string,
  categoryIds: string[],
  fallback: StoreProduct[],
): Promise<StoreProduct[]> {
  const seen = new Set<string>();
  const out: StoreProduct[] = [];
  const push = (p: StoreProduct) => {
    if (p.slug === currentSlug || seen.has(p.id)) return;
    seen.add(p.id);
    out.push(p);
  };

  const catId = categoryIds[0];
  if (catId) {
    try {
      const res = await searchProducts(tenantId, { category: catId, pageSize: 16 });
      res.items
        .map(toStoreProduct)
        .filter((p): p is StoreProduct => p !== null)
        .forEach(push);
    } catch {
      // Si falla la búsqueda por categoría, seguimos con el fallback.
    }
  }

  if (out.length < RELATED_COUNT) fallback.forEach(push);

  return out.slice(0, RELATED_COUNT);
}

// Cuántos mostrar en "También te puede gustar". El carrusel tiene flechas y
// next/image lazy-loadea las tarjetas fuera de vista, así que 12 llena la página
// sin penalizar la carga inicial.
const RELATED_COUNT = 12;

interface CategoryDto {
  id: string;
  name: string;
  parentId: string | null;
}

/**
 * Cadena de categorías del producto, de la raíz a la hoja (para la miga).
 * Usa la primera categoría del producto; si algo falla, miga sin categorías.
 */
async function buildCategoryTrail(tenantId: string, categoryIds: string[]): Promise<CategoryDto[]> {
  const catId = categoryIds[0];
  if (!catId) return [];
  try {
    const res = await apiGetTenant<{ items?: CategoryDto[] }>('/api/v1/categories', tenantId, {
      next: { revalidate: REVALIDATE.categories },
    });
    const byId = new Map((res?.items ?? []).map((c) => [c.id, c]));
    const trail: CategoryDto[] = [];
    let cur = byId.get(catId);
    while (cur && trail.length < 5) {
      trail.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return trail;
  } catch {
    return [];
  }
}

/** Cruza los valores del producto con las definiciones de la tienda. */
async function buildSpecRows(
  tenantId: string,
  values: { definitionId: string; value: string }[],
): Promise<{ name: string; value: string }[]> {
  if (values.length === 0) return [];

  const defs = await apiGetTenant<{ items: SpecDefinitionDto[] }>('/api/v1/spec-definitions/', tenantId, {
    next: { revalidate: REVALIDATE.catalog },
  }).catch(() => null);
  if (!defs) return [];

  const byId = new Map(defs.items.map((d) => [d.id, d]));
  return values
    .map((v) => ({ def: byId.get(v.definitionId), value: v.value }))
    .filter((x): x is { def: SpecDefinitionDto; value: string } => !!x.def && x.def.showOnProduct)
    .sort((a, b) => a.def.sortOrder - b.def.sortOrder)
    .map((x) => ({
      name: x.def.name,
      value: x.def.unit ? `${x.value} ${x.def.unit}` : x.value,
    }));
}
