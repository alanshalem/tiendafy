'use client';

import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@tiendafy/ui';
import { Icon, type IconName } from './Icon';
import type { ProductListConfig } from '@/lib/theme';
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
  chip,
}: {
  className?: string;
  label?: string;
  /**
   * Con texto encima (un banner, una diapositiva): el aviso va chico, arriba
   * o abajo, del lado donde no hay texto. Centrado quedaba tapado por el título.
   */
  chip?: 'top' | 'bottom';
}) {
  const icon = (
    <svg
      viewBox="0 0 24 24"
      className={chip ? 'h-4 w-4' : 'h-8 w-8 opacity-60'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 16-5-5-9 9" />
    </svg>
  );
  if (chip)
    return (
      <div
        className={cn(
          'flex h-full w-full bg-fg/5 p-3',
          chip === 'top' ? 'items-start' : 'items-end',
          className,
        )}
      >
        <span className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-bg/80 px-2.5 py-1 text-xs font-medium text-fg-muted shadow-sm">
          {icon}
          {label}
        </span>
      </div>
    );
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-2 bg-fg/5 text-xs font-medium text-fg-muted',
        className,
      )}
    >
      {icon}
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

/**
 * Una tira que se desliza de costado (productos, testimonios, categorías):
 * el ref del contenedor con scroll, si está en una punta o en la otra, y
 * cómo avanzar una "página". `deps`: lo que cambia el ancho del contenido.
 */
export function useRail<T extends HTMLElement>(deps: readonly unknown[] = []) {
  const ref = useRef<T>(null);
  // Flechas deshabilitadas en los extremos: antes "Anterior" quedaba activa al
  // abrir el carrusel y tocarla no hacía nada.
  const [edge, setEdge] = useState({ start: true, end: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Al montar y cuando cambia el ancho (rotar el teléfono, más ítems).
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps: lo que cambia el contenido
  }, [measure, ...deps]);
  // Una "página": lo que se ve, menos un poco, así lo que quedó a medias
  // pasa a ser lo primero de la vista siguiente.
  const page = (dir: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.9), behavior: 'smooth' });
  };
  return { ref, edge, measure, page };
}

const ARROW =
  'absolute z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-black/70 shadow-md transition hover:scale-105 disabled:pointer-events-none disabled:opacity-0 sm:flex';

/**
 * Las flechas de una tira deslizable, para la computadora (en el celular se
 * desliza con el dedo). Sin ellas, con mouse y sin trackpad no había forma de
 * ver lo que quedaba a la derecha. Van adentro de un contenedor `relative`.
 */
export function RailArrows({
  edge,
  page,
  top = 'top-1/2',
}: {
  edge: { start: boolean; end: boolean };
  page: (dir: number) => void;
  /** A qué altura van (en las de productos, a la altura de la foto). */
  top?: string;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => page(-1)}
        disabled={edge.start}
        aria-label="Anterior"
        className={cn(ARROW, '-left-3', top)}
      >
        <Icon name="chevronLeft" className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => page(1)}
        disabled={edge.end}
        aria-label="Siguiente"
        className={cn(ARROW, '-right-3', top)}
      >
        <Icon name="chevronRight" className="h-5 w-5" />
      </button>
    </>
  );
}

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
  const { ref: railRef, edge, measure, page } = useRail<HTMLDivElement>([products.length, carousel]);
  const align = useSectionStyle()?.align;
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
            ref={railRef}
            onScroll={measure}
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
          {products.length > 2 && <RailArrows edge={edge} page={page} top="top-[38%]" />}
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
