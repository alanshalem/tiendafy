/*
 * Piezas comunes de las secciones que se dibujan igual en el servidor y en el
 * navegador (sin hooks): títulos, huecos de la vista previa, clases de las
 * grillas. Lo interactivo (tiras deslizables, la grilla de cards) vive en
 * product-grid.tsx.
 */

import type { ReactNode } from 'react';
import { cn } from '@tiendafy/ui/cn';
import type { IconName } from './Icon';
import type { ProductListConfig } from '@/lib/theme';
import type { StoreProduct } from './ProductCard';

// Mapea el slug guardado en la sección al nombre semántico del kit de íconos.
export const INFO_ICON_MAP: Record<string, IconName> = {
  shipping: 'shipping',
  card: 'card',
  security: 'security',
  gift: 'gift',
  support: 'support',
  returns: 'returns',
};

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
export function SectionTitle({
  className,
  align,
  children,
}: {
  className?: string;
  /** La alineación que el comercio eligió para la sección (section.style.align). */
  align?: 'left' | 'center';
  children: ReactNode;
}) {
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
 * todavía no se subió. En la tienda no se dibuja nada (cada sección lo decide
 * con su prop `preview`): un hueco gris publicado por descuido se ve roto, uno
 * en el editor dice "subí una foto".
 */
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
