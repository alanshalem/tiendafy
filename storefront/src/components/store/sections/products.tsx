'use client';

import { pickProducts, ProductGrid } from '../section-primitives';
import type { SectionRenderProps } from '../section-types';

/** Destacados, recién llegados y ofertas: la misma grilla; cambia qué productos van si no se eligió ninguno. */
export function ProductsSection({
  section,
  data,
  products,
  productList,
}: SectionRenderProps<'featured' | 'new-products' | 'sale-products'>) {
  const fallback =
    section.type === 'sale-products'
      ? products.filter((p) => p.compareAtAmount).slice(0, 8)
      : products.slice(0, 8);
  const list = data.productIds.length > 0 ? pickProducts(products, data.productIds) : fallback;
  return <ProductGrid title={data.title} products={list} list={productList} carousel={data.carousel} />;
}
