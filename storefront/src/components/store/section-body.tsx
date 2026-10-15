import type { ComponentType } from 'react';
import { DEFAULT_PRODUCT_LIST, isSectionType, sectionData } from '@tiendafy/types';
import type { ProductListConfig, ThemeSection } from '@/lib/theme';
import type { StoreProduct } from './ProductCard';
import { SectionFrame } from './SectionFrame';
import { SECTION_RENDERERS } from './sections/registry';
import type { SectionRenderProps } from './section-types';

export interface SectionBodyProps {
  section: ThemeSection;
  products: StoreProduct[];
  storeName: string;
  productList?: ProductListConfig;
  /** Abre la portada (ver SectionRenderProps.lead). */
  lead?: boolean;
  /** Vista previa del editor (ver SectionRenderProps.preview). */
  preview?: boolean;
  /** Página oscura (ver SectionRenderProps.darkPage). */
  darkPage?: boolean;
}

/**
 * Dibuja una sección: normaliza su data (nunca llega un `null` donde se
 * esperaba una lista) y la envuelve en su marco (estilo, dispositivos y un
 * límite de errores propio: si una se rompe, el resto de la página sigue).
 *
 * Sin hooks, así sirve igual en el servidor —la portada de la tienda: lo que
 * piden las secciones (si abren la página, si es la vista previa, si la
 * página es oscura) llega por props y no por contexto— que en el navegador
 * (la vista previa en vivo, vía SectionRenderer).
 */
export function SectionBody({
  section,
  products,
  storeName,
  productList = DEFAULT_PRODUCT_LIST,
  lead = false,
  preview = false,
  darkPage = false,
}: SectionBodyProps) {
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
        lead={lead}
        preview={preview}
        darkPage={darkPage}
      />
    </SectionFrame>
  );
}
