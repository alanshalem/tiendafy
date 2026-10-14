'use client';

import type { ComponentType } from 'react';
import { SECTION_REGISTRY, SECTION_TYPES, isSectionType, sectionData } from '@tiendafy/types';
import type { ProductListConfig, SectionType, ThemeSection } from '@/lib/theme';
import type { StoreProduct } from './ProductCard';
import { defaultList } from './section-primitives';
import { SectionFrame } from './SectionFrame';
import { SECTION_RENDERERS } from './sections/registry';
import type { SectionRenderProps } from './section-types';
// ProductCard vive en su propio archivo; re-exportamos para consumidores externos
// (FavoritesList, CatalogBrowser, catalog.ts) que importan desde './sections'.
export { ProductCard, CashDiscountContext, type StoreProduct } from './ProductCard';
export type { SectionRenderProps } from './section-types';
export { LeadSectionContext } from './section-context';
export { HomeSections } from './HomeSections';

/*
 * Cada tipo de sección tiene su renderer en ./sections/<tipo>.tsx y su
 * definición (campos, nombre, límites…) en el registro compartido de
 * @tiendafy/types. Acá solo se arma la pieza que los une.
 */

/** Texto descriptivo para el botón "Editar {label}" del preview (educa al usuario). */
export const SECTION_LABELS = Object.fromEntries(
  SECTION_TYPES.map((t) => [t, SECTION_REGISTRY[t].previewLabel]),
) as Record<SectionType, string>;

/** La etiqueta del botón "Editar …" del preview: el nombre propio de la sección, si tiene. */
export function sectionPreviewLabel(section: Pick<ThemeSection, 'type' | 'name'>): string | undefined {
  const own = section.name?.trim();
  if (own) return `«${own}»`;
  return isSectionType(section.type) ? SECTION_LABELS[section.type] : undefined;
}

/**
 * Dibuja una sección: normaliza su data (nunca llega un `null` donde se
 * esperaba una lista) y la envuelve en su marco (estilo, dispositivos y un
 * límite de errores propio: si una se rompe, el resto de la página sigue).
 */
export function SectionRenderer({
  section,
  products,
  storeName,
  productList = defaultList,
}: {
  section: ThemeSection;
  products: StoreProduct[];
  storeName: string;
  productList?: ProductListConfig;
}) {
  if (!section.visible || !isSectionType(section.type)) return null;
  const Render = SECTION_RENDERERS[section.type] as ComponentType<SectionRenderProps>;
  return (
    <SectionFrame section={section}>
      <Render
        section={section}
        data={sectionData(section)}
        products={products}
        storeName={storeName}
        productList={productList}
      />
    </SectionFrame>
  );
}
