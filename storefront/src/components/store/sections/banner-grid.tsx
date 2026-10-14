'use client';

import { useContext, type CSSProperties, type ReactNode } from 'react';
import type { BannerRatio, Overlay, TextPosition } from '@tiendafy/types';
import { cn } from '@tiendafy/ui';
import { StoreImage } from '../StoreImage';
import { StoreLink } from '../StoreLink';
import { ImagePlaceholder, SectionTitle, usePreviewPlaceholders } from '../section-primitives';
import { LeadSectionContext } from '../section-context';
import {
  POSITION_CLASS,
  RATIO_CLASS,
  RATIO_CLASS_MD,
  TEXT_SHADOW,
  scrimFor,
  verticalOf,
} from './image-overlay';

/** Lo que la grilla necesita de cada banner (promo o categoría). */
export interface GridBanner {
  image: string;
  mobileImage?: string;
  alt: string;
  link: string;
  newTab: boolean;
  /** El nombre del banner para el link, si no tiene texto visible ni alt. */
  name: string;
}

/** Cuántas columnas por pantalla: celular, tablet (≥ 640 px) y computadora (≥ 1024 px). */
export interface GridColumns {
  mobile: number;
  tablet: number;
  desktop: number;
}

/** Contenedor de 1280 px: el ancho de un banner en computadora, para `sizes`. */
const CONTAINER = 1280;

const COLS_VAR: Record<string, string> = {
  m1: '[--cols:1]',
  m2: '[--cols:2]',
  t1: 'sm:[--cols:1]',
  t2: 'sm:[--cols:2]',
  t3: 'sm:[--cols:3]',
  d1: 'lg:[--cols:1]',
  d2: 'lg:[--cols:2]',
  d3: 'lg:[--cols:3]',
  d4: 'lg:[--cols:4]',
  d5: 'lg:[--cols:5]',
  d6: 'lg:[--cols:6]',
};

/** `sizes` de next/image según las columnas: que baje la foto del tamaño en que se ve. */
export function gridSizes(cols: GridColumns, fullWidth: boolean): string {
  const vw = (n: number) => `${Math.round(100 / n)}vw`;
  const desktop = fullWidth ? vw(cols.desktop) : `${Math.round(CONTAINER / cols.desktop)}px`;
  return `(max-width: 639px) ${vw(cols.mobile)}, (max-width: 1023px) ${vw(cols.tablet)}, ${desktop}`;
}

/**
 * La grilla que comparten los banners de promo y los de categorías.
 *
 * Con flex y no con grid: la última fila, si queda incompleta (5 banners en 3
 * columnas), va centrada en vez de dejar un hueco a la derecha.
 */
export function BannerGrid<B extends GridBanner>({
  title,
  banners,
  fullWidth,
  cols,
  ratio,
  ratioMobile,
  textPosition,
  overlay,
  caption,
}: {
  title: string;
  banners: B[];
  fullWidth: boolean;
  cols: GridColumns;
  ratio: BannerRatio;
  /** Otra proporción en celular (menos de 768 px). Sin valor, la misma. */
  ratioMobile?: BannerRatio;
  textPosition: TextPosition;
  overlay: Overlay;
  /** El texto de cada banner (sin el contenedor): `null` si no tiene. */
  caption: (b: B) => ReactNode;
}) {
  const lead = useContext(LeadSectionContext);
  const placeholders = usePreviewPlaceholders();
  // En la tienda, un banner sin foto no se muestra; en el editor se ve su
  // lugar, así una sección recién agregada no parece que no hizo nada.
  const shown = banners.filter((b) => b.image || placeholders);
  if (shown.length === 0) return null;
  const sizes = gridSizes(cols, fullWidth);
  const gap = fullWidth ? '0px' : '1rem';
  const scrim = scrimFor(textPosition, overlay);
  const v = verticalOf(textPosition);
  return (
    <section className={fullWidth ? 'w-full py-8' : 'mx-auto max-w-container px-4 py-8'}>
      {title && (
        <SectionTitle
          className={cn(
            'mb-6 text-sm font-bold uppercase tracking-widest text-fg-muted',
            fullWidth && 'px-4 text-center',
          )}
        >
          {title}
        </SectionTitle>
      )}
      <div
        className={cn(
          'flex flex-wrap justify-center',
          COLS_VAR[`m${cols.mobile}`],
          COLS_VAR[`t${cols.tablet}`],
          COLS_VAR[`d${cols.desktop}`],
        )}
        // --gap lo heredan las tarjetas para calcular su ancho.
        style={{ gap, '--gap': gap } as CSSProperties}
      >
        {banners.map((b, i) => {
          if (!shown.includes(b)) return null;
          const text = caption(b);
          const body = (
            <>
              {/* next/image y no <img>: el comercio sube la foto como la tiene
                  (a veces un PNG de varios MB) y acá se sirve al tamaño del
                  banner. Lazy salvo que la grilla abra la portada. */}
              <div
                className={cn(
                  'relative w-full',
                  ratioMobile && ratioMobile !== ratio
                    ? `${RATIO_CLASS[ratioMobile]} ${RATIO_CLASS_MD[ratio]}`
                    : RATIO_CLASS[ratio],
                )}
              >
                {b.image ? (
                  <StoreImage
                    src={b.image}
                    mobileSrc={b.mobileImage || undefined}
                    alt={b.alt}
                    sizes={sizes}
                    lcp={lead && i === 0}
                    className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
                  />
                ) : (
                  <ImagePlaceholder chip={text ? (v === 'top' ? 'bottom' : 'top') : undefined} />
                )}
                {text && scrim.cover && <div className={cn('absolute inset-0', scrim.cover)} />}
              </div>
              {text && (
                <div
                  className={cn(
                    'absolute flex max-h-full flex-col gap-1 overflow-hidden p-3 text-white sm:p-4',
                    v === 'center'
                      ? 'inset-0'
                      : v === 'top'
                        ? 'inset-x-0 top-0 pb-8'
                        : 'inset-x-0 bottom-0 pt-8',
                    POSITION_CLASS[textPosition],
                    scrim.caption,
                    overlay === 'none' && TEXT_SHADOW,
                  )}
                >
                  {text}
                </div>
              )}
              {/* Sin texto visible ni alt, el link igual tiene que decir a dónde lleva. */}
              {b.link && !text && !b.alt && <span className="sr-only">{b.name || 'Ver más'}</span>}
            </>
          );
          const cardClass = cn(
            'group relative block shrink-0 overflow-hidden w-[calc((100%-(var(--cols)-1)*var(--gap))/var(--cols))]',
            !fullWidth && 'rounded-lg',
          );
          return b.link ? (
            <StoreLink key={i} href={b.link} newTab={b.newTab} className={cardClass}>
              {body}
            </StoreLink>
          ) : (
            <div key={i} className={cardClass}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
