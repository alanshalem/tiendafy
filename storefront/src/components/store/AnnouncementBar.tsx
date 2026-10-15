'use client';

import { useEffect, useState } from 'react';
import { EDITOR_MSG } from '@tiendafy/types';
import { Pencil } from 'lucide-react';
import { cn } from '@tiendafy/ui/cn';
import { Icon } from './Icon';
import { PlayPauseIcon } from './PlayPauseIcon';
import { MarqueeTrack } from './MarqueeTrack';
import { postToEditor } from '@/lib/editor-bridge';
import { StoreLink } from './StoreLink';
import { usePrefersReducedMotion } from './use-media';
import type { ThemeConfig } from '@/lib/theme';

type Announcement = ThemeConfig['announcement'];
type AnnouncementItem = Announcement['items'][number];

/** Segundos por vuelta de la marquesina (la de siempre, 22 s, es "normal"). */
const MARQUEE_SECONDS = { slow: 40, normal: 22, fast: 13 } as const;

/**
 * Los controles de la barra miden 40 px: se tocan con el dedo aunque la
 * barra sea angosta. Heredan el color del texto de la barra.
 */
const CONTROL =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full opacity-80 transition-opacity hover:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none';

/** Botón de pausa: WCAG 2.2.2 pide poder frenar lo que se mueve solo más de 5 segundos. */
function PauseButton({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={paused ? 'Reanudar los anuncios' : 'Pausar los anuncios'}
      className={CONTROL}
    >
      <PlayPauseIcon playing={!paused} />
    </button>
  );
}

/**
 * "Uno por vez": cada anuncio queda `interval` segundos y cambia al siguiente
 * con un fundido corto (sube apenas). Se frena con el mouse encima, con el
 * foco adentro y con el botón de pausa; con "menos movimiento" en el sistema
 * no gira nunca solo y quedan las flechas para ver los demás.
 *
 * Todos los anuncios se dibujan apilados en la misma celda: la barra mide lo
 * que el más largo y no salta de alto al cambiar. Los que no se ven van
 * `inert` (ni el teclado ni el lector de pantalla entran a un link oculto).
 *
 * El lector de pantalla lee el anuncio nuevo solo cuando lo pidió la persona
 * (las flechas): anunciar cada giro automático lo interrumpiría cada 5
 * segundos sin que nadie lo haya pedido.
 */
function RotatingAnnouncements({ items, interval }: { items: AnnouncementItem[]; interval: number }) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const n = items.length;
  // El editor puede quitar anuncios mientras se ve uno de los últimos.
  const current = index % n;
  const rotating = !reduced && !paused && !hover && !focusIn;

  // Un timeout por anuncio (y no un intervalo fijo): al tocar una flecha, el
  // que se eligió queda su tiempo entero.
  useEffect(() => {
    if (!rotating) return;
    const t = window.setTimeout(() => {
      setAnnounce(false);
      setIndex((i) => (i + 1) % n);
    }, interval * 1000);
    return () => window.clearTimeout(t);
  }, [rotating, current, interval, n]);

  const go = (delta: number) => {
    setAnnounce(true);
    setIndex((i) => ((((i % n) + delta) % n) + n) % n);
  };

  // En la compu las flechas aparecen al pasar el mouse o con el foco; en el
  // celular (no hay mouse) y con "menos movimiento", siempre.
  const arrow = cn(
    CONTROL,
    !reduced && 'md:opacity-0 md:group-hover:opacity-80 md:group-focus-within:opacity-80',
  );
  return (
    <div
      role="group"
      aria-roledescription="carrusel"
      aria-label="Anuncios"
      className="group mx-auto flex max-w-container items-center px-1"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocusIn(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIn(false);
      }}
    >
      {/* Del ancho de la pausa: así el anuncio queda centrado en la compu. En
          el celular no, que ahí cada píxel es para el texto. */}
      {!reduced && <span aria-hidden className="hidden w-10 shrink-0 md:block" />}
      {/* Las flechas pegadas al texto (no en los bordes): se ve que son de él. */}
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <button type="button" onClick={() => go(-1)} aria-label="Anuncio anterior" className={arrow}>
          <Icon name="chevronLeft" className="h-4 w-4" />
        </button>
        <div className="grid min-w-0" aria-live={announce ? 'polite' : 'off'} aria-atomic="true">
          {items.map((it, i) => {
            const shown = i === current;
            return (
              <div
                key={i}
                aria-hidden={!shown}
                inert={!shown}
                className={cn(
                  'col-start-1 row-start-1 flex items-center justify-center px-1 py-2 text-center',
                  'transition-[opacity,transform,visibility] duration-500 ease-out motion-reduce:transition-none',
                  shown ? 'visible opacity-100' : 'invisible translate-y-1 opacity-0',
                )}
              >
                <StoreLink href={it.link} newTab={it.newTab} className="[&[href]]:hover:underline">
                  {it.text}
                </StoreLink>
              </div>
            );
          })}
        </div>
        <button type="button" onClick={() => go(1)} aria-label="Anuncio siguiente" className={arrow}>
          <Icon name="chevronRight" className="h-4 w-4" />
        </button>
      </div>
      {/* Con "menos movimiento" no hay nada que frenar. */}
      {!reduced && <PauseButton paused={paused} onToggle={() => setPaused((p) => !p)} />}
    </div>
  );
}

/** La marquesina con su botón de pausa (además de frenarse con el mouse o el foco, por CSS). */
function MarqueeAnnouncements({ items, speed }: { items: AnnouncementItem[]; speed: Announcement['speed'] }) {
  const reduced = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  return (
    <div className="flex items-center">
      <div className="min-w-0 flex-1 overflow-hidden py-2">
        {/* La pista se duplica para un loop continuo sin saltos. */}
        <MarqueeTrack className="whitespace-nowrap" durationSeconds={MARQUEE_SECONDS[speed]} paused={paused}>
          {items.map((it, i) => (
            <span key={i} className="flex items-center">
              {/* Sin link válido, StoreLink deja el texto solo (nunca un href="#"). */}
              <StoreLink href={it.link} newTab={it.newTab} className="px-6 [&[href]]:hover:underline">
                {it.text}
              </StoreLink>
              <span className="opacity-50">•</span>
            </span>
          ))}
        </MarqueeTrack>
      </div>
      {!reduced && (
        <span className="shrink-0 bg-primary px-1">
          <PauseButton paused={paused} onToggle={() => setPaused((p) => !p)} />
        </span>
      )}
    </div>
  );
}

/**
 * Barra de anuncio: uno o varios textos (cada uno con link opcional), fijos,
 * desplazándose (marquesina) o de a uno por vez. Sólo se muestra si hay al
 * menos un texto con contenido.
 */
export function AnnouncementBar({ ann, preview }: { ann: Announcement; preview: boolean }) {
  const [annHover, setAnnHover] = useState(false);
  const annItems = (ann.items ?? []).filter((i) => i.text.trim());
  if (!(ann.show && annItems.length > 0)) return null;
  // Con un solo anuncio no hay nada que rotar: se ve fijo.
  const mode = ann.animation === 'rotate' && annItems.length < 2 ? 'static' : ann.animation;
  // Una región con nombre (landmark): antes quedaba suelta, fuera de todo
  // landmark, y un lector de pantalla no tenía cómo encontrarla ni saltearla.
  return (
    <section
      aria-label="Anuncios de la tienda"
      data-tf-focus="announcement"
      className={cn(
        'relative overflow-hidden bg-primary text-sm font-semibold text-primary-fg',
        mode === 'static' && 'px-4 py-2',
      )}
      onMouseEnter={preview ? () => setAnnHover(true) : undefined}
      onMouseLeave={preview ? () => setAnnHover(false) : undefined}
    >
      {preview && annHover && (
        <>
          <div className="pointer-events-none absolute inset-0 z-[55] ring-2 ring-inset ring-white/70" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              postToEditor({ type: EDITOR_MSG.editSection, target: 'announcement' });
            }}
            // Fija, a la derecha (no tapa nada). Con flechas y pausa, a la
            // izquierda: a la derecha tapaba la pausa justo al querer probarla.
            className={cn(
              'absolute top-1/2 z-[56] inline-flex -translate-y-1/2 items-center gap-1.5 rounded-md bg-black/30 px-2.5 py-1 text-xs font-semibold text-white shadow-lg hover:bg-black/40',
              mode === 'static' ? 'right-3' : 'left-3',
            )}
          >
            <Pencil className="h-3.5 w-3.5" /> Editar barra de anuncio
          </button>
        </>
      )}
      {mode === 'marquee' ? (
        <MarqueeAnnouncements items={annItems} speed={ann.speed} />
      ) : mode === 'rotate' ? (
        <RotatingAnnouncements items={annItems} interval={ann.interval} />
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
          {annItems.map((it, i) => (
            <span key={i} className="flex items-center gap-3">
              {i > 0 && <span className="opacity-50">•</span>}
              <StoreLink href={it.link} newTab={it.newTab} className="[&[href]]:hover:underline">
                {it.text}
              </StoreLink>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
