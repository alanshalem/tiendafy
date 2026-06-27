import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { StorefrontView } from '@/components/store/StorefrontView';
import { ProductDetail } from '@/components/store/ProductDetail';
import { SectionRenderer } from '@/components/store/sections';
import { EmptyState } from '@/components/store/EmptyState';
import type { Metadata } from 'next';
import { resolveStorefrontPage } from '@/lib/storefront-page';
import { loadStorefront } from '@/lib/storefront';
import { apiGet } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadStorefront();
  if (!data) return { title: 'Tienda' };
  const product = await apiGet<{ name: string; description: string | null; images: { url: string }[] }>(
    `/api/v1/products/by-slug/${slug}`,
    { headers: { 'X-Tenant-Id': data.tenant.id }, cache: 'no-store' },
  ).catch(() => null);
  if (!product) return { title: data.tenant.name };
  return {
    title: `${product.name} · ${data.tenant.name}`,
    description: product.description?.slice(0, 160) ?? `${product.name} en ${data.tenant.name}.`,
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
  variants: { id: string; sku: string; optionValues: string[]; price: { amount: number; currency: string }; compareAtPrice: { amount: number; currency: string } | null }[];
  images: { url: string; altText: string | null }[];
}

export default async function ProductDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug } = await params;
  const resolved = await resolveStorefrontPage(searchParams);
  if (!resolved.ok) return resolved.fallback;
  const { data, theme, preview } = resolved;

  const product = await apiGet<ProductDto>(`/api/v1/products/by-slug/${slug}`, {
    headers: { 'X-Tenant-Id': data.tenant.id },
    cache: 'no-store',
  });

  const related = data.products.filter((p) => p.slug !== slug).slice(0, 4);

  return (
    <StorefrontView tenantId={data.tenant.id} tenantName={data.tenant.name} theme={theme} products={data.products} live={preview}>
      <main className="mx-auto max-w-container px-4 py-8">
        <Link href={preview ? '/productos?preview=1' : '/productos'} className="inline-flex items-center gap-1.5 text-sm opacity-60 hover:underline"><ArrowLeft className="h-4 w-4" /> Volver</Link>
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
                section={{ id: 'related', type: 'featured', visible: true, data: { title: 'También te puede gustar' } }}
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
