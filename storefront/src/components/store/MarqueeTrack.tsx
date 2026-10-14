'use client';

import type { CSSProperties, ReactNode } from 'react';

/**
 * Pista de marquee duplicada para loop continuo sin salto; reduced-motion la
 * frena por CSS. Compartida por la barra de anuncio y la sección de marcas.
 *
 * La copia va `inert` además de aria-hidden: si la pista tiene links, el
 * teclado no entra a la copia (un link enfocable adentro de algo oculto para
 * el lector de pantalla es un foco "fantasma").
 */
export function MarqueeTrack({
  className,
  children,
  durationSeconds,
  paused = false,
}: {
  className: string;
  children: ReactNode;
  /** Cuánto tarda una vuelta. Sin valor, el de la hoja de estilos (22 s). */
  durationSeconds?: number;
  /** Frenada (botón de pausa de quien la usa). */
  paused?: boolean;
}) {
  const style: CSSProperties = {};
  if (durationSeconds) style.animationDuration = `${durationSeconds}s`;
  if (paused) style.animationPlayState = 'paused';
  return (
    <div
      className={`tf-marquee flex w-max ${className} will-change-transform`}
      style={Object.keys(style).length ? style : undefined}
    >
      {[0, 1].map((dup) => (
        <div key={dup} className="flex shrink-0 items-center" aria-hidden={dup === 1} inert={dup === 1}>
          {children}
        </div>
      ))}
    </div>
  );
}
