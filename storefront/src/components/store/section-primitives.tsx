'use client';

import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@tiendafy/ui';
import { Icon, type IconName } from './Icon';
import { colClass, type ProductListConfig } from '@/lib/theme';
import { StoreImage } from './StoreImage';
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
                aria-label="Anterior"
                className="absolute -left-3 top-[38%] z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-black/70 shadow-md transition hover:scale-105 sm:flex"
              >
                <Icon name="chevronLeft" className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => scrollByCards(1)}
                aria-label="Siguiente"
                className="absolute -right-3 top-[38%] z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-black/70 shadow-md transition hover:scale-105 sm:flex"
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
