'use client';

import { productSourceListingHref, sectionProductPlan, type ProductSource } from '@tiendafy/types';
import { pickProducts } from '../section-primitives';
import { ProductGrid } from '../product-grid';
import type { StoreProduct } from '../ProductCard';
import { useSectionProducts } from '../SectionProductsContext';
import type { ProductsData, SectionRenderProps } from '../section-types';

/**
 * Lo que se muestra si los productos de la sección no se pudieron resolver
 * (la API no respondió): lo elegido a mano que esté en la lista general, o
 * los primeros del catálogo (en ofertas, los que tienen precio tachado).
 */
export function fallbackProducts(
  type: string,
  source: ProductSource,
  products: StoreProduct[],
  limit: number,
): StoreProduct[] {
  if (source.kind === 'manual') return pickProducts(products, source.ids).slice(0, limit);
  const onSale = type === 'sale-products' || source.kind === 'on-sale';
  const pool = onSale
    ? products.filter((p) => p.compareAtAmount && p.compareAtAmount > p.priceAmount)
    : products;
  return pool.slice(0, limit);
}

/** "Ver todos": el link propio, o el listado que corresponde al origen. */
function viewAllOf(data: ProductsData, source: ProductSource) {
  if (!data.viewAll) return null;
  return {
    href: data.viewAllLink.trim() || productSourceListingHref(source),
    text: data.viewAllText.trim() || 'Ver todos',
  };
}

export const EMPTY_BY_KIND: Record<ProductSource['kind'], string> = {
  manual: 'Todavía no elegiste productos para esta sección.',
  category: 'Esta categoría no tiene productos publicados.',
  brand: 'No hay productos publicados de esta marca.',
  newest: 'Todavía no hay productos publicados.',
  'on-sale': 'No hay productos en oferta (con precio anterior tachado).',
  'best-sellers': 'Todavía no hay ventas en ese período.',
};

/**
 * Destacados, recién llegados y ofertas: la misma grilla. Los productos los
 * resuelve el servidor según el origen de la sección (useSectionProducts);
 * en la tienda, una sección sin productos no se dibuja, y en la vista previa
 * del editor dice por qué está vacía.
 */
export function ProductsSection({
  section,
  data,
  products,
  productList,
  preview: placeholders,
}: SectionRenderProps<'featured' | 'new-products' | 'sale-products'>) {
  const resolved = useSectionProducts(section.id);
  const plan = sectionProductPlan(section)!;
  const list = resolved ?? fallbackProducts(section.type, plan.source, products, plan.limit);

  const columns = data.columns === 'auto' ? null : Number(data.columns);
  const mobileColumns = data.mobileColumns === 'auto' ? null : (Number(data.mobileColumns) as 1 | 2);
  return (
    <ProductGrid
      title={data.title}
      subtitle={data.subtitle}
      products={list}
      list={productList}
      carousel={data.carousel}
      columns={columns}
      mobileColumns={mobileColumns}
      viewAll={viewAllOf(data, plan.source)}
      empty={
        placeholders ? (
          <p className="rounded-lg border border-dashed border-fg/20 px-4 py-8 text-center text-sm text-fg-muted">
            {EMPTY_BY_KIND[plan.source.kind]} En la tienda esta sección no se muestra hasta que haya
            productos.
          </p>
        ) : undefined
      }
    />
  );
}
