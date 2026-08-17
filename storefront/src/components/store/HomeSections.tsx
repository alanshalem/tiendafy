'use client';

import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ProductListConfig, ThemeSection } from '@/lib/theme';
import type { StoreProduct } from './ProductCard';
import { SectionRenderer, SECTION_LABELS } from './sections';
import { PreviewContext } from './preview';
import { EditableRegion } from './EditableRegion';

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
      <main>
        {visible.map((s) => (
          <SectionRenderer
            key={s.id}
            section={s}
            products={products}
            storeName={storeName}
            productList={productList}
          />
        ))}
      </main>
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
    <main>
      {items.map((it) => (
        <PresenceItem key={it.id} show={it.show}>
          <EditableRegion target="section" id={it.section.id} label={SECTION_LABELS[it.section.type]}>
            <SectionRenderer
              section={it.section}
              products={products}
              storeName={storeName}
              productList={productList}
            />
          </EditableRegion>
        </PresenceItem>
      ))}
    </main>
  );
}
