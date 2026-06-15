import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { StorefrontView } from '@/components/store/StorefrontView';
import { ProductDetail } from '@/components/store/ProductDetail';
import { SectionRenderer } from '@/components/store/sections';
import { resolveStorefrontPage } from '@/lib/storefront-page';
import { apiGet } from '@/lib/api';

export const dynamic = 'force-dynamic';

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
          <p className="py-16 text-center opacity-60">Producto no encontrado.</p>
        )}
      </main>
    </StorefrontView>
  );
}
