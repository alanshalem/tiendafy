'use client';

import { useContext, type ReactNode } from 'react';
import { StoreImage } from '../StoreImage';
import { ImagePlaceholder, usePreviewPlaceholders } from '../section-primitives';
import { LeadSectionContext } from '../section-context';
import type { BannerItem, SectionRenderProps } from '../section-types';

/** La grilla que comparten los banners de promo y los de categorías. */
export function BannerGrid({
  data,
  colsClass,
  aspectClass,
  sizes,
  caption,
}: SectionRenderProps<'promo-banners' | 'category-banners'> & {
  colsClass: string;
  aspectClass: string;
  /** Ancho con que se ve cada banner, para que next/image elija el tamaño justo. */
  sizes: string;
  caption: (b: BannerItem) => ReactNode;
}) {
  const lead = useContext(LeadSectionContext);
  const placeholders = usePreviewPlaceholders();
  // En la tienda, un banner sin foto no se muestra; en el editor se ve su
  // lugar, así una sección recién agregada no parece que no hizo nada.
  const banners = data.banners.filter((b) => b.show && (b.image || placeholders));
  if (banners.length === 0) return null;
  const full = data.fullWidth;
  return (
    <section className={full ? 'w-full py-8' : 'mx-auto max-w-container px-4 py-8'}>
      <div className={`grid gap-4 ${colsClass} ${full ? 'gap-0 sm:gap-0' : ''}`}>
        {banners.map((b, i) => (
          <a
            key={i}
            href={b.link || '#'}
            className={`group relative block overflow-hidden ${full ? '' : 'rounded-lg'}`}
          >
            {/* next/image y no <img>: el comercio sube la foto como la tiene
                (a veces un PNG de varios MB) y acá se sirve al tamaño del
                banner. Lazy salvo que la grilla abra la portada. */}
            <div className={`relative ${aspectClass} w-full`}>
              {b.image ? (
                <StoreImage
                  src={b.image}
                  alt={b.title}
                  sizes={full ? '100vw' : sizes}
                  lcp={lead && i === 0}
                  className="object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <ImagePlaceholder />
              )}
            </div>
            {caption(b)}
          </a>
        ))}
      </div>
    </section>
  );
}
