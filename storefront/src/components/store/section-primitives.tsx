'use client';

import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@tiendafy/ui';
import { Icon, type IconName } from './Icon';
import type { ProductListConfig } from '@/lib/theme';
import { StoreImage } from './StoreImage';
import { StoreLink } from './StoreLink';
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

/*
 * Columnas de las grillas y carruseles de productos de la portada. Las clases
 * van escritas enteras: Tailwind solo genera las que encuentra literales.
 * En la tablet (sm) nunca más de 3: cinco cards en 820 px no se leen.
 */
const GRID_MOBILE: Record<1 | 2, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2' };
const GRID_DESKTOP: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-3 lg:grid-cols-4',
  5: 'sm:grid-cols-3 lg:grid-cols-5',
};
// En el carrusel, el ancho de cada card sale de las mismas columnas (antes
// era fijo, 160/208 px, y en una pantalla grande sobraba lugar al final). En
// el celular se asoma la card siguiente: así se nota que se desliza.
const RAIL_MOBILE: Record<1 | 2, string> = { 1: 'w-[78%]', 2: 'w-[calc((100%-1rem)/2.25)]' };
const RAIL_DESKTOP: Record<number, string> = {
  2: 'sm:w-[calc((100%-1.25rem)/2)]',
  3: 'sm:w-[calc((100%-2.5rem)/3)]',
  4: 'sm:w-[calc((100%-2.5rem)/3)] lg:w-[calc((100%-3.75rem)/4)]',
  5: 'sm:w-[calc((100%-2.5rem)/3)] lg:w-[calc((100%-5rem)/5)]',
};

export interface GridColumns {
  columns: number;
  mobileColumns: 1 | 2;
}

/** Las columnas de una sección: las suyas, o las del listado de productos (Diseño → Listado). */
export function sectionColumns(
  list: Pick<ProductListConfig, 'columns' | 'mobileColumns'>,
  own?: { columns?: number | null; mobileColumns?: 1 | 2 | null },
): GridColumns {
  const columns = own?.columns ?? list.columns;
  return {
    columns: GRID_DESKTOP[columns] ? columns : 4,
    mobileColumns: own?.mobileColumns ?? (list.mobileColumns === 1 ? 1 : 2),
  };
}

export const productGridClasses = (cols: GridColumns): string =>
  `${GRID_MOBILE[cols.mobileColumns]} ${GRID_DESKTOP[cols.columns] ?? GRID_DESKTOP[4]}`;

export const productRailItemClasses = (cols: GridColumns): string =>
  `${RAIL_MOBILE[cols.mobileColumns]} ${RAIL_DESKTOP[cols.columns] ?? RAIL_DESKTOP[4]}`;

export interface ProductGridProps {
  title: string;
  subtitle?: string;
  products: StoreProduct[];
  list: ProductListConfig;
  carousel?: boolean;
  /** Columnas propias de la sección (escritorio). Sin valor, las del listado. */
  columns?: number | null;
  /** Columnas propias en el celular. Sin valor, las del listado. */
  mobileColumns?: 1 | 2 | null;
  /** Link "Ver todos" del encabezado. */
  viewAll?: { href: string; text: string } | null;
  /** Lo que se ve si no hay productos. Sin valor, la sección no se dibuja. */
  empty?: ReactNode;
}

export function ProductGrid({
  title,
  subtitle,
  products,
  list,
  carousel,
  columns,
  mobileColumns,
  viewAll,
  empty,
}: ProductGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const align = useSectionStyle()?.align;
  // Una "página" del carrusel: lo que se ve, menos un poco, así la card que
  // quedó a medias pasa a ser la primera de la vista siguiente.
  const scrollPage = (dir: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.9), behavior: 'smooth' });
  };
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
  }, [measureEdges, products.length, carousel]);
  if (products.length === 0 && !empty) return null;

  const cols = sectionColumns(list, { columns, mobileColumns });
  const centered = align === 'center';
  const showViewAll = !!viewAll && products.length > 0;
  const header =
    title || subtitle || showViewAll ? (
      <div
        className={cn(
          'mb-6 flex gap-x-6 gap-y-1',
          centered ? 'flex-col items-center text-center' : 'items-end justify-between',
        )}
      >
        <div className="min-w-0">
          {title && (
            <SectionTitle className="text-sm font-bold uppercase tracking-widest text-fg-muted wrap-anywhere">
              {title}
            </SectionTitle>
          )}
          {subtitle && (
            <p className="mt-1 max-w-2xl whitespace-pre-line text-sm text-fg-muted wrap-anywhere">
              {subtitle}
            </p>
          )}
        </div>
        {showViewAll && (
          <StoreLink
            href={viewAll.href}
            className="-my-2 inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-semibold text-primary-ink hover:underline"
          >
            {viewAll.text}
            <Icon name="chevronRight" className="h-4 w-4" />
          </StoreLink>
        )}
      </div>
    ) : null;

  return (
    <section className="store-section mx-auto max-w-container px-6 py-12 sm:px-4">
      {header}
      {products.length === 0 ? (
        empty
      ) : carousel ? (
        <div className="group/car relative">
          <div
            ref={scrollRef}
            onScroll={measureEdges}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:none] sm:gap-5 [&::-webkit-scrollbar]:hidden"
          >
            {products.map((p, i) => (
              <div
                key={p.id}
                className={cn('tf-in shrink-0 snap-start', productRailItemClasses(cols))}
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
                onClick={() => scrollPage(-1)}
                disabled={edge.start}
                aria-label="Anterior"
                className="absolute -left-3 top-[38%] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-black/70 shadow-md transition hover:scale-105 disabled:pointer-events-none disabled:opacity-0 sm:flex"
              >
                <Icon name="chevronLeft" className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => scrollPage(1)}
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
        <div className={cn('grid gap-x-4 gap-y-8 sm:gap-x-5', productGridClasses(cols))}>
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

/**
 * Carrusel de imágenes del hero (auto-avanza, con puntos). `lcp`: abre la
 * portada, y su primera imagen es la más grande a la vista (ver StoreImage).
 */
export function ImageCarousel({
  images,
  fullHeightMobile,
  lcp = false,
}: {
  images: string[];
  fullHeightMobile: boolean;
  lcp?: boolean;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (images.length < 2) return;
    const timer = setInterval(() => setI((x) => (x + 1) % images.length), 5000);
    return () => clearInterval(timer);
  }, [images.length]);
  // next/image en el hero: srcset responsive, prioridad en el primer slide si
  // abre la portada y lazy en el resto (antes: <img> crudo sin nada de eso).
  const heightClass = fullHeightMobile ? 'h-[78vh] sm:h-[460px]' : 'h-[300px] sm:h-[460px]';
  return (
    <section className="relative overflow-hidden">
      <div
        className="flex transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${i * 100}%)` }}
      >
        {images.map((src, idx) => (
          <div key={idx} className={`relative ${heightClass} w-full shrink-0`}>
            <StoreImage src={src} alt="" sizes="100vw" lcp={lcp && idx === 0} className="object-cover" />
          </div>
        ))}
      </div>
      {images.length > 1 && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {images.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              aria-label={`Ir a imagen ${idx + 1}`}
              className={`h-2 rounded-full bg-white transition-all ${idx === i ? 'w-5' : 'w-2 opacity-60'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export const OVERLAY_CLASS: Record<string, string> = {
  none: 'bg-transparent',
  light: 'bg-black/20',
  medium: 'bg-black/40',
  strong: 'bg-black/60',
};
