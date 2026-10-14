'use client';

import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ProductListConfig, ThemeSection } from '@/lib/theme';
import type { StoreProduct } from './ProductCard';
import { SectionRenderer, sectionPreviewLabel } from './sections';
import { LeadSectionContext } from './section-context';
import { PreviewContext } from './preview';
import { EditableRegion } from './EditableRegion';
import { faqPageJsonLd } from './sections/faq';
import { jsonLd } from '@/lib/json-ld';

/** Envoltorio con animación de entrada/salida: colapsa el alto + fade + leve desplazamiento. */
function PresenceItem({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows,opacity,transform] duration-500 ease-out motion-reduce:transition-none"
      style={{
        gridTemplateRows: show ? '1fr' : '0fr',
        opacity: show ? 1 : 0,
        transform: show ? 'none' : 'translateY(10px)',
      }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

interface PItem {
  id: string;
  section: ThemeSection;
  show: boolean;
}

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
function FaqJsonLd({ sections }: { sections: ThemeSection[] }) {
  const data = faqPageJsonLd(sections);
  return data ? <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(data)} /> : null;
}

/** Render de las secciones del home. En preview anima cuando se agregan/quitan/ocultan. */
export function HomeSections({
  sections,
  products,
  storeName,
  productList,
}: {
  sections: ThemeSection[];
  products: StoreProduct[];
  storeName: string;
  productList: ProductListConfig;
}) {
  const preview = useContext(PreviewContext);
  const visible = sections.filter((s) => s.visible);

  // En la tienda real no hay altas/bajas en vivo: render directo.
  if (!preview) {
    return (
      <>
        <FaqJsonLd sections={visible} />
        <main>
          {!homeHasTitle(visible) && <h1 className="sr-only">{storeName}</h1>}
          {visible.map((s, i) => (
            // La primera sección es la que se ve al abrir: su imagen va con prioridad.
            <LeadSectionContext.Provider key={s.id} value={i === 0}>
              <SectionRenderer
                section={s}
                products={products}
                storeName={storeName}
                productList={productList}
              />
            </LeadSectionContext.Provider>
          ))}
        </main>
      </>
    );
  }
  return (
    <AnimatedSections visible={visible} products={products} storeName={storeName} productList={productList} />
  );
  // (en preview, AnimatedSections envuelve cada sección en EditableRegion)
}

function AnimatedSections({
  visible,
  products,
  storeName,
  productList,
}: {
  visible: ThemeSection[];
  products: StoreProduct[];
  storeName: string;
  productList: ProductListConfig;
}) {
  const [items, setItems] = useState<PItem[]>(() =>
    visible.map((s) => ({ id: s.id, section: s, show: true })),
  );
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Reconciliar al cambiar las secciones visibles (agregar / quitar / ocultar / editar).
  useEffect(() => {
    const visIds = new Set(visible.map((s) => s.id));
    setItems((prev) => {
      const prevById = new Map(prev.map((it) => [it.id, it]));
      const next: PItem[] = visible.map((s) => ({
        id: s.id,
        section: s,
        show: prevById.has(s.id) ? prevById.get(s.id)!.show : false,
      }));
      // Las que dejan de estar visibles y estaban a la vista: las mantenemos colapsando (show:false) en su lugar.
      prev.forEach((it, idx) => {
        if (!visIds.has(it.id) && it.show) {
          next.splice(Math.min(idx, next.length), 0, { id: it.id, section: it.section, show: false });
          if (!timers.current[it.id]) {
            timers.current[it.id] = setTimeout(() => {
              setItems((x) => x.filter((y) => y.id !== it.id));
              delete timers.current[it.id];
            }, 520);
          }
        }
      });
      return next;
    });
  }, [visible]);

  // Disparar la entrada (show:false → true) en el frame siguiente para que transicione.
  useEffect(() => {
    const visIds = new Set(visible.map((s) => s.id));
    if (items.some((it) => !it.show && visIds.has(it.id))) {
      const raf = requestAnimationFrame(() =>
        setItems((prev) => prev.map((it) => (visIds.has(it.id) ? { ...it, show: true } : it))),
      );
      return () => cancelAnimationFrame(raf);
    }
  }, [items, visible]);

  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout);
    },
    [],
  );

  return (
    <>
      <FaqJsonLd sections={visible} />
      <main>
        {!homeHasTitle(visible) && <h1 className="sr-only">{storeName}</h1>}
        {items.map((it, i) => (
          <PresenceItem key={it.id} show={it.show}>
            <EditableRegion target="section" id={it.section.id} label={sectionPreviewLabel(it.section)}>
              <LeadSectionContext.Provider value={i === 0}>
                <SectionRenderer
                  section={it.section}
                  products={products}
                  storeName={storeName}
                  productList={productList}
                />
              </LeadSectionContext.Provider>
            </EditableRegion>
          </PresenceItem>
        ))}
      </main>
    </>
  );
}
