'use client';

import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@tiendafy/ui';
import { Icon, type IconName } from './Icon';
import { colClass, type ProductListConfig } from '@/lib/theme';
import { ProductCard, type StoreProduct } from './ProductCard';
import { baseTheme } from '@tiendafy/types';
import { useSectionStyle } from './section-context';
import { PreviewContext } from './preview';

// Mapea el slug guardado en la sección al nombre semántico del kit de íconos.
export const INFO_ICON_MAP: Record<string, IconName> = {
  shipping: 'shipping',
  card: 'card',
  security: 'security',
  gift: 'gift',
  support: 'support',
  returns: 'returns',
};

export const defaultList: ProductListConfig = baseTheme.productList;

/** Imágenes que no son la de portada: el navegador las pide al acercarse. */
export const LAZY = { loading: 'lazy', decoding: 'async' } as const;

/**
 * El título de una sección: siempre un h2. La página tiene un solo h1 (el de
 * la portada o uno invisible con el nombre de la tienda) y antes los títulos
 * de sección eran h3 colgando directo de él, salteando un nivel: los lectores
 * de pantalla y Google arman el índice de la página con eso.
 *
 * Respeta la alineación que el comercio eligió para la sección.
 */
export function SectionTitle({ className, children }: { className?: string; children: ReactNode }) {
  const align = useSectionStyle()?.align;
  return (
    <h2
      className={cn(className, align === 'left' && 'text-left', align === 'center' && 'text-center')}
      style={{ fontFamily: 'var(--font-heading)' }}
    >
      {children}
    </h2>
  );
}

/**
 * Lo que se ve en la vista previa del editor en lugar de una imagen que
 * todavía no se subió. En la tienda no se dibuja nada: un hueco gris
 * publicado por descuido se ve roto, uno en el editor dice "subí una foto".
 */
export function usePreviewPlaceholders(): boolean {
  return useContext(PreviewContext);
}

export function ImagePlaceholder({
  className,
  label = 'Subí una imagen',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-2 bg-fg/5 text-xs font-medium text-fg-muted',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-8 w-8 opacity-60"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="2" />
        <path d="m21 16-5-5-9 9" />
      </svg>
      {label}
    </div>
  );
}

/** Selecciona productos por id preservando el orden elegido. */
export function pickProducts(products: StoreProduct[], ids: string[]): StoreProduct[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is StoreProduct => !!p);
}

export function ProductGrid({
  title,
  products,
  list,
  carousel,
}: {
  title: string;
  products: StoreProduct[];
  list: ProductListConfig;
  carousel?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollByCards = (dir: number) => scrollRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  // Flechas deshabilitadas en los extremos: antes "Anterior" quedaba activa al
  // abrir el carrusel y tocarla no hacía nada.
  const [edge, setEdge] = useState({ start: true, end: false });
  const measureEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Al montar y cuando cambia el ancho (rotar el teléfono, más productos).
    const ro = new ResizeObserver(measureEdges);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureEdges, products.length]);
  if (products.length === 0) return null;
  return (
    <section className="store-section mx-auto max-w-container px-6 py-12 sm:px-4">
      {title && (
        <SectionTitle className="mb-6 text-sm font-bold uppercase tracking-widest text-fg-muted">
          {title}
        </SectionTitle>
      )}
      {carousel ? (
        <div className="group/car relative">
          <div
            ref={scrollRef}
            onScroll={measureEdges}
            className="flex snap-x gap-5 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {products.map((p, i) => (
              <div
                key={p.id}
                className="tf-in w-40 shrink-0 snap-start sm:w-52"
                style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
              >
                <ProductCard product={p} list={list} />
              </div>
            ))}
          </div>
          {/* Flechas: scrollean el carrusel (desktop; en mobile se desliza). */}
          {products.length > 2 && (
            <>
              <button
                type="button"
                onClick={() => scrollByCards(-1)}
                disabled={edge.start}
                aria-label="Anterior"
                className="absolute -left-3 top-[38%] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-black/70 shadow-md transition hover:scale-105 disabled:pointer-events-none disabled:opacity-0 sm:flex"
              >
                <Icon name="chevronLeft" className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => scrollByCards(1)}
                disabled={edge.end}
                aria-label="Siguiente"
                className="absolute -right-3 top-[38%] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-black/70 shadow-md transition hover:scale-105 disabled:pointer-events-none disabled:opacity-0 sm:flex"
              >
                <Icon name="chevronRight" className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      ) : (
        <div className={`grid gap-x-5 gap-y-8 ${colClass[list.columns] ?? colClass[4]}`}>
          {products.map((p, i) => (
            <div key={p.id} className="tf-in" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
              <ProductCard product={p} list={list} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
