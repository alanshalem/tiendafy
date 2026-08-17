'use client';

import type { ReactNode } from 'react';

/**
 * Pista de marquee duplicada para loop continuo sin salto (aria-hidden en la
 * copia); reduced-motion la frena por CSS. Compartida por la barra de anuncio
 * y la sección de marcas.
 */
export function MarqueeTrack({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={`tf-marquee flex w-max ${className} will-change-transform`}>
      {[0, 1].map((dup) => (
        <div key={dup} className="flex shrink-0 items-center" aria-hidden={dup === 1}>
          {children}
        </div>
      ))}
    </div>
  );
}
