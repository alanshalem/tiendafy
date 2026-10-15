import { withinPageLimits } from '@tiendafy/types';
import type { ProductListConfig, ThemeSection } from '@/lib/theme';
import { jsonLd } from '@/lib/json-ld';
import type { StoreProduct } from './ProductCard';
import { SectionBody } from './section-body';
import { faqPageJsonLd } from './sections/faq';

/**
 * ¿Esta sección pone el título principal (h1) de la portada? Solo el video de
 * portada con título, y solo si abre la página y se ve en todos los
 * dispositivos: más abajo, su título es un h2 como el de cualquier sección
 * (un h1 en el medio de la página desordena el índice que arman Google y los
 * lectores de pantalla).
 */
export function isPageTitleSection(section: ThemeSection, index: number): boolean {
  return (
    index === 0 &&
    section.visible &&
    !section.hideOn &&
    section.type === 'hero-video' &&
    typeof section.data?.title === 'string' &&
    section.data.title.trim() !== ''
  );
}

/**
 * ¿La portada ya tiene su h1? Si ninguna sección lo pone, la portada iba sin
 * h1 —Google y los lectores de pantalla no encontraban de qué es la página— y
 * va uno invisible con el nombre de la tienda.
 */
export function homeHasTitle(sections: ThemeSection[]): boolean {
  const first = sections.find((s) => s.visible);
  return !!first && isPageTitleSection(first, 0);
}

/** Un solo FAQPage por página, con las preguntas de todas las secciones de preguntas. */
export function FaqJsonLd({ sections }: { sections: ThemeSection[] }) {
  const data = faqPageJsonLd(sections);
  return data ? <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(data)} /> : null;
}

/** Las secciones visibles de la portada (un tema viejo con dos pop-ups o dos newsletters: va el primero). */
export const visibleSections = (sections: ThemeSection[]) =>
  withinPageLimits(sections.filter((s) => s.visible));

/**
 * La portada de la tienda publicada: las secciones una debajo de la otra, sin
 * altas ni bajas en vivo. Sin hooks: en la tienda se dibuja en el servidor y
 * solo las secciones interactivas suman JavaScript (ver sections/registry).
 * La vista previa del editor usa HomeSections, que anima los cambios.
 */
export function StoreHome({
  sections,
  products,
  storeName,
  productList,
  darkPage,
}: {
  sections: ThemeSection[];
  products: StoreProduct[];
  storeName: string;
  productList: ProductListConfig;
  darkPage: boolean;
}) {
  const visible = visibleSections(sections);
  return (
    <>
      <FaqJsonLd sections={visible} />
      <main>
        {!homeHasTitle(visible) && <h1 className="sr-only">{storeName}</h1>}
        {visible.map((s, i) => (
          // La primera sección es la que se ve al abrir: su imagen va con prioridad.
          <SectionBody
            key={s.id}
            section={s}
            products={products}
            storeName={storeName}
            productList={productList}
            lead={i === 0}
            darkPage={darkPage}
          />
        ))}
      </main>
    </>
  );
}
