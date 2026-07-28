import { headers } from 'next/headers';
import { StorefrontView } from '@/components/store/StorefrontView';
import { StoreBreadcrumbs } from '@/components/store/StoreBreadcrumbs';
import { ProductDetail } from '@/components/store/ProductDetail';
import { SectionRenderer } from '@/components/store/sections';
import { EmptyState } from '@/components/store/EmptyState';
import type { Metadata } from 'next';
import { resolveStorefrontPage } from '@/lib/storefront-page';
import { loadStorefront } from '@/lib/storefront';
import { apiGetTenant } from '@/lib/api';
import { searchProducts, toStoreProduct } from '@/lib/catalog';
import type { StoreProduct } from '@/components/store/sections';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadStorefront();
  if (!data) return { title: 'Tienda' };
  const product = await apiGetTenant<{
    name: string;
    description: string | null;
    images: { url: string }[];
  }>(`/api/v1/products/by-slug/${slug}`, data.tenant.id, { next: { revalidate: 30 } }).catch(() => null);
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

/** Base absoluta del sitio a partir del Host (http en localhost, https afuera). */
async function siteBase(): Promise<string> {
  const host = (await headers()).get('host') ?? '';
  return host ? `http${host.includes('localhost') ? '' : 's'}://${host}` : '';
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
    price: { amount: number; currency: string };
    compareAtPrice: { amount: number; currency: string } | null;
  }[];
  images: { url: string; altText: string | null }[];
  categoryIds: string[];
  stock: number | null;
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

  // Data cache 30s keyed por tenant (_mt): TTFB decente sin SSR+DB en cada hit.
  const product = await apiGetTenant<ProductDto>(`/api/v1/products/by-slug/${slug}`, data.tenant.id, {
    next: { revalidate: 30 },
  });

  // "También te puede gustar": productos de la MISMA categoría del que se está
  // viendo (antes eran siempre los primeros 4 del catálogo). Si la categoría no
  // llega a 4, rellenamos con el resto del catálogo para no dejar huecos.
  const related = await buildRelated(data.tenant.id, slug, product?.categoryIds ?? [], data.products);

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
    <StorefrontView
      tenantId={data.tenant.id}
      tenantName={data.tenant.name}
      theme={theme}
      products={data.products}
      live={preview}
    >
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
              config={theme.productDetail}
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
    </StorefrontView>
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
      next: { revalidate: 60 },
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
