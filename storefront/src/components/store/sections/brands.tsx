'use client';

import { useState } from 'react';
import { cn } from '@tiendafy/ui/cn';
import { MarqueeTrack } from '../MarqueeTrack';
import { PlayPauseIcon } from '../PlayPauseIcon';
import { StoreImage } from '../StoreImage';
import { StoreLink } from '../StoreLink';
import { SectionTitle } from '../section-primitives';
import type { SectionRenderProps } from '../section-types';
import { usePrefersReducedMotion } from '../use-media';

/** Segundos por vuelta (la de antes, 22 s, es "normal"). */
const SPEED = { slow: 40, normal: 22, fast: 13 } as const;

/**
 * Marcas que vendemos: logos fijos o en una tira que se desliza sola.
 *
 * Cada logo lleva su nombre (antes alt="": para un lector de pantalla y para
 * Google la sección era una lista de imágenes mudas) y, si tiene, su link. La
 * tira se pausa con el botón, al pasar el mouse o al entrar con el teclado,
 * y queda quieta si el sistema pide menos movimiento.
 */
export function BrandsSection({ section, data, preview: placeholders }: SectionRenderProps<'brands'>) {
  const reduced = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  const logos = data.logos.filter((l) => l.image);
  if (logos.length === 0 && !placeholders) return null;
  const title = data.title && (
    <SectionTitle
      align={section.style?.align}
      className="mb-6 text-center text-sm font-bold uppercase tracking-widest text-fg-muted"
    >
      {data.title}
    </SectionTitle>
  );
  if (logos.length === 0) {
    // En el editor, recién agregada: el lugar de los logos.
    return (
      <section className="store-section overflow-hidden border-y border-fg/5 py-8">
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
  const marquee = data.layout === 'marquee' || (data.layout === 'auto' && logos.length > 4);
  const items = logos.map((logo, i) => {
    const img = (
      <span className="relative block h-10 w-28 sm:h-12 sm:w-36">
        <StoreImage
          src={logo.image}
          alt={logo.name}
          sizes="144px"
          className={cn(
            'object-contain transition duration-300',
            data.grayscale
              ? 'opacity-70 grayscale group-hover:opacity-100 group-hover:grayscale-0'
              : 'opacity-80 group-hover:opacity-100',
          )}
        />
      </span>
    );
    const cell = 'group mx-2 flex shrink-0 items-center justify-center p-2 sm:mx-4';
    return logo.link ? (
      <StoreLink
        key={i}
        href={logo.link}
        newTab={logo.newTab}
        className={cn(cell, 'rounded-md focus-visible:outline-2 focus-visible:outline-primary')}
      >
        {img}
      </StoreLink>
    ) : (
      <span key={i} className={cell}>
        {img}
      </span>
    );
  });
  return (
    <section
      className={cn(
        'store-section relative overflow-hidden border-y border-fg/5 pt-8',
        // Lugar para el botón de pausa, abajo a la derecha, sin tapar logos.
        marquee && !reduced ? 'pb-12' : 'pb-8',
      )}
      aria-label={data.title ? undefined : 'Marcas'}
    >
      {title}
      {marquee ? (
        <>
          {/* Pista duplicada para loop continuo sin salto; reduced-motion la frena (CSS). */}
          <MarqueeTrack className="items-center" durationSeconds={SPEED[data.speed]} paused={paused}>
            {items}
          </MarqueeTrack>
          {!reduced && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Mover las marcas' : 'Pausar las marcas'}
              className="absolute bottom-1 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-bg/90 text-fg-muted shadow-sm ring-1 ring-fg/10 hover:text-fg"
            >
              <PlayPauseIcon playing={!paused} />
            </button>
          )}
        </>
      ) : (
        // Pocas marcas (o "grilla fija"): centradas, sin moverse.
        <div className="flex flex-wrap items-center justify-center gap-y-2 px-4">{items}</div>
      )}
    </section>
  );
}
