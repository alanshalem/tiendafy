'use client';

import { MarqueeTrack } from '../MarqueeTrack';
import { LAZY, SectionTitle, usePreviewPlaceholders } from '../section-primitives';
import type { SectionRenderProps } from '../section-types';

/** Marcas que vendemos: tira de logos auto-deslizante (marquee, se pausa al hover). */
export function BrandsSection({ data }: SectionRenderProps<'brands'>) {
  const placeholders = usePreviewPlaceholders();
  const { images } = data;
  if (images.length === 0 && !placeholders) return null;
  const title = data.title && (
    <SectionTitle className="mb-6 text-center text-sm font-bold uppercase tracking-widest text-fg-muted">
      {data.title}
    </SectionTitle>
  );
  if (images.length === 0) {
    // En el editor, recién agregada: el lugar de los logos.
    return (
      <section className="store-section overflow-hidden border-y border-black/5 py-8">
        {title}
        <div className="flex flex-wrap items-center justify-center gap-6 px-4 text-xs text-fg-muted">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="flex h-10 w-28 items-center justify-center rounded bg-fg/5">
              Logo
            </span>
          ))}
        </div>
      </section>
    );
  }
  const logos = images.map((src, i) => (
    <img
      key={i}
      src={src}
      alt=""
      {...LAZY}
      className="mx-8 h-10 w-auto shrink-0 object-contain opacity-70 transition-opacity hover:opacity-100 sm:h-12"
    />
  ));
  return (
    <section className="store-section overflow-hidden border-y border-black/5 py-8">
      {title}
      {images.length <= 4 ? (
        // Pocas marcas: fila estática centrada (un marquee con 2 logos queda raro).
        <div className="flex flex-wrap items-center justify-center">{logos}</div>
      ) : (
        // Pista duplicada para loop continuo sin salto; reduced-motion la frena (CSS).
        <MarqueeTrack className="items-center">{logos}</MarqueeTrack>
      )}
    </section>
  );
}
