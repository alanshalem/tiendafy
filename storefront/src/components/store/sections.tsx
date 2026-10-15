'use client';

import { useContext } from 'react';
import { SECTION_REGISTRY, SECTION_TYPES, isSectionType } from '@tiendafy/types';
import type { ProductListConfig, SectionType, ThemeSection } from '@/lib/theme';
import type { StoreProduct } from './ProductCard';
import { PreviewContext } from './preview';
import { DarkPageContext, LeadSectionContext } from './section-context';
import { SectionBody } from './section-body';
// ProductCard vive en su propio archivo; re-exportamos para consumidores externos
// (FavoritesList, CatalogBrowser, catalog.ts) que importan desde './sections'.
export { ProductCard, CashDiscountContext, type StoreProduct } from './ProductCard';
export type { SectionRenderProps } from './section-types';
export { LeadSectionContext } from './section-context';
export { HomeSections } from './HomeSections';

/*
 * Cada tipo de sección tiene su renderer en ./sections/<tipo>.tsx y su
 * definición (campos, nombre, límites…) en el registro compartido de
 * @tiendafy/types. Lo que los une es SectionBody; esto es su versión para el
 * navegador (la vista previa en vivo), que lee del contexto lo que el
 * servidor le pasa por props.
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

/** Una sección en el navegador: SectionBody con lo que dicen los contextos de la tienda. */
export function SectionRenderer(props: {
  section: ThemeSection;
  products: StoreProduct[];
  storeName: string;
  productList?: ProductListConfig;
}) {
  const lead = useContext(LeadSectionContext);
  const preview = useContext(PreviewContext);
  const darkPage = useContext(DarkPageContext);
  return <SectionBody {...props} lead={lead} preview={preview} darkPage={darkPage} />;
}
