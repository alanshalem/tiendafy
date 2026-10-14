'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { CarouselData, CarouselSlide } from '@tiendafy/types';
import { cn } from '@tiendafy/ui';
import { Icon } from './Icon';
import { StoreImage } from './StoreImage';
import { StoreLink } from './StoreLink';
import { usePrefersReducedMotion } from './use-media';
import { OVERLAY_BG, POSITION_CLASS, TEXT_SHADOW } from './sections/image-overlay';

/*
 * Carrusel de imágenes de la portada.
 *
 * Antes: una tira que se corría sola cada 5 s, sin forma de frenarla (WCAG
 * 2.2.2), que en el celular no se podía deslizar con el dedo, sin flechas, con
 * puntitos de 8 px imposibles de tocar y que seguía moviéndose aunque el
 * sistema pidiera menos movimiento.
 *
 * Ahora la pista es un scroll horizontal con snap: el dedo la desliza de
 * forma nativa (con inercia, sin código de gestos), y las flechas, los
 * puntos, el teclado y el avance automático solo la scrollean. El avance
 * automático se frena con el botón de pausa, al pasar el mouse, al entrar
 * con el teclado, y no arranca si el sistema pide menos movimiento.
 */

/** Alto en computadora (≥ 768 px) y en celular de cada opción. */
const DESKTOP_H = {
  small: 'md:aspect-auto md:h-[360px]',
  medium: 'md:aspect-auto md:h-[460px]',
  large: 'md:aspect-auto md:h-[600px]',
  full: 'md:aspect-auto md:h-[calc(100svh-4rem)]',
  // La proporción de la medida recomendada (1580×600): sin recorte si se respeta.
  adapt: 'md:h-auto md:aspect-[79/30]',
} as const;
const MOBILE_H = {
  small: 'h-[240px]',
  medium: 'h-[300px]',
  large: 'h-[420px]',
  full: 'h-[calc(100svh-4rem)]',
  adapt: '',
} as const;

function slideBox(data: Pick<CarouselData, 'height' | 'heightMobile'>, slide: CarouselSlide): string {
  const mobile = data.heightMobile === 'auto' ? data.height : data.heightMobile;
  // La foto de celular se recomienda 4:5; sin ella, la misma apaisada.
  const m = mobile === 'adapt' ? (slide.mobileImage ? 'aspect-[4/5]' : 'aspect-[79/30]') : MOBILE_H[mobile];
  return `${m} ${DESKTOP_H[data.height]}`;
}

function PlayPauseIcon({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l10.5-6.5z" />}
    </svg>
  );
}

/** Más que esto, los puntos no entran en un celular: va "3 / 12". */
const MAX_DOTS = 8;

export function ImageCarousel({
  slides,
  data,
  lcp = false,
  label = 'Carrusel de imágenes',
  renderPlaceholder,
}: {
  slides: CarouselSlide[];
  data: Pick<CarouselData, 'autoplay' | 'speed' | 'height' | 'heightMobile' | 'arrows' | 'indicators'>;
  /** Abre la portada: la primera foto es la más grande a la vista (ver StoreImage). */
  lcp?: boolean;
  label?: string;
  /** En la vista previa del editor, una diapositiva todavía sin foto. */
  renderPlaceholder?: () => React.ReactNode;
}) {
  const n = slides.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(0);
  // `auto` = lo que eligió el comercio; el comprador lo pisa con el botón.
  const [choice, setChoice] = useState<'auto' | 'playing' | 'paused'>('auto');
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [warm, setWarm] = useState(false);
  const reduced = usePrefersReducedMotion();
  // A dónde se está scrolleando por código: los scroll intermedios no mueven los puntos.
  const target = useRef<number | null>(null);

  const canPlay = n > 1 && data.autoplay;
  const playing = choice === 'playing' || (choice === 'auto' && canPlay && !reduced);
  const running = n > 1 && playing && !hovered && !focused;
  const interval = Number(data.speed) * 1000 || 5000;

  const goTo = useCallback(
    (i: number) => {
      const el = trackRef.current;
      const next = ((i % n) + n) % n;
      target.current = next;
      setIndex(next);
      el?.scrollTo?.({ left: next * el.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
    },
    [n, reduced],
  );

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => goTo(index + 1), interval);
    return () => window.clearTimeout(t);
  }, [running, index, interval, goTo]);

  // Después de la carga, la segunda foto se pide ya: al pasar no queda un
  // hueco mientras baja. Antes de eso no, para no competirle a la portada.
  useEffect(() => {
    if (n < 2) return;
    const t = window.setTimeout(() => setWarm(true), 1500);
    return () => window.clearTimeout(t);
  }, [n]);

  // Red de seguridad del snap: si el scroll terminó a mitad de camino entre
  // dos diapositivas (pasa con algunos gestos sintéticos y navegadores viejos
  // que no respetan `snap-always`), se termina de acomodar acá.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const settle = () => {
      const w = el.clientWidth;
      if (!w) return;
      const i = Math.round(el.scrollLeft / w);
      if (Math.abs(el.scrollLeft - i * w) > 1)
        el.scrollTo?.({ left: i * w, behavior: reduced ? 'auto' : 'smooth' });
    };
    el.addEventListener('scrollend', settle);
    return () => el.removeEventListener('scrollend', settle);
  }, [reduced]);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (target.current !== null) {
      if (i !== target.current) return;
      target.current = null;
    }
    if (i !== index && i >= 0 && i < n) setIndex(i);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(index - 1);
    }
  };

  // La que se ve, y (ya cargada la página) las vecinas: las que pueden venir.
  const eager = (i: number) => i === index || (warm && (i === (index + 1) % n || i === (index - 1 + n) % n));

  return (
    <section
      aria-roledescription="carrusel"
      aria-label={label}
      className="group/carousel relative overflow-hidden"
      onKeyDown={onKeyDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={(e) => setFocused(e.target !== toggleRef.current)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div
        ref={trackRef}
        onScroll={onScroll}
        // Si el dedo agarra la pista a mitad de un scroll por código, manda el dedo.
        onPointerDown={() => (target.current = null)}
        aria-live={running ? 'off' : 'polite'}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => (
          <Slide
            key={i}
            slide={slide}
            index={i}
            total={n}
            current={i === index}
            boxClass={slideBox(data, slide)}
            lcp={lcp && i === 0}
            eager={eager(i)}
            roomForDots={data.indicators && n > 1}
            roomForArrows={data.arrows && n > 1}
            placeholder={renderPlaceholder}
          />
        ))}
      </div>

      {n > 1 && data.arrows && (
        <>
          <ArrowButton side="left" onClick={() => goTo(index - 1)} />
          <ArrowButton side="right" onClick={() => goTo(index + 1)} />
        </>
      )}

      {n > 1 && (data.indicators || canPlay) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center px-14">
          {data.indicators &&
            (n <= MAX_DOTS ? (
              <div className="pointer-events-auto flex items-center rounded-full bg-black/30 px-1">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`Ir a la diapositiva ${i + 1}`}
                    aria-current={i === index ? 'true' : undefined}
                    className="flex h-6 w-6 items-center justify-center focus-visible:outline-2 focus-visible:outline-white"
                  >
                    <span
                      className={cn(
                        'block h-2 rounded-full bg-white transition-all motion-reduce:transition-none',
                        i === index ? 'w-4' : 'w-2 opacity-60',
                      )}
                    />
                  </button>
                ))}
              </div>
            ) : (
              <span className="rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold tabular-nums text-white">
                {index + 1} / {n}
              </span>
            ))}
        </div>
      )}
      {canPlay && (
        <button
          ref={toggleRef}
          type="button"
          onClick={() => setChoice(playing ? 'paused' : 'playing')}
          aria-label={playing ? 'Pausar el carrusel' : 'Reproducir el carrusel'}
          className="absolute bottom-1 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/60 focus-visible:outline-2 focus-visible:outline-white"
        >
          <PlayPauseIcon playing={playing} />
        </button>
      )}
    </section>
  );
}

function ArrowButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Diapositiva anterior' : 'Diapositiva siguiente'}
      // En celular se desliza con el dedo: las flechas taparían el texto.
      className={cn(
        'absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-black/80 shadow-md transition hover:bg-white sm:flex',
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      <Icon name={side === 'left' ? 'chevronLeft' : 'chevronRight'} className="h-5 w-5" />
    </button>
  );
}

function Slide({
  slide,
  index,
  total,
  current,
  boxClass,
  lcp,
  eager,
  roomForDots,
  roomForArrows,
  placeholder,
}: {
  slide: CarouselSlide;
  index: number;
  total: number;
  current: boolean;
  boxClass: string;
  lcp: boolean;
  eager: boolean;
  roomForDots: boolean;
  roomForArrows: boolean;
  placeholder?: () => React.ReactNode;
}) {
  const hasText = !!(slide.title || slide.subtitle || slide.buttonText);
  // Toda la diapositiva lleva al link; con botón, el botón se estira encima
  // (un link adentro de otro no se puede).
  const wholeLink = !!slide.link && !slide.buttonText;
  const linkLabel = slide.title || slide.alt || 'Ver más';
  return (
    <div
      role="group"
      aria-roledescription="diapositiva"
      aria-label={`${index + 1} de ${total}${slide.title ? `: ${slide.title}` : ''}`}
      // Las que no se ven no reciben el foco ni las lee el lector de pantalla.
      inert={!current}
      className={cn('relative w-full shrink-0 snap-start snap-always overflow-hidden', boxClass)}
    >
      {slide.image ? (
        <StoreImage
          src={slide.image}
          mobileSrc={slide.mobileImage || undefined}
          // Si el link ya se nombra con el alt, la foto no lo repite.
          alt={wholeLink && !slide.title ? '' : slide.alt}
          sizes="100vw"
          lcp={lcp}
          eager={eager}
          className="object-cover"
        />
      ) : (
        <div className="absolute inset-0">{placeholder?.()}</div>
      )}
      {OVERLAY_BG[slide.overlay] && <div className={cn('absolute inset-0', OVERLAY_BG[slide.overlay])} />}
      {hasText && (
        <div
          className={cn(
            'absolute inset-0 flex flex-col gap-3 p-6 text-white md:p-12',
            POSITION_CLASS[slide.textPosition],
            roomForArrows && 'sm:px-20 md:px-20',
            roomForDots && 'pb-12 md:pb-14',
            slide.overlay === 'none' && TEXT_SHADOW,
          )}
        >
          {slide.title && (
            <h2
              className="line-clamp-3 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl md:text-5xl"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {slide.title}
            </h2>
          )}
          {slide.subtitle && (
            <p className="line-clamp-3 max-w-xl text-base opacity-95 sm:text-lg">{slide.subtitle}</p>
          )}
          {slide.buttonText && (
            <StoreLink
              href={slide.link || '/productos'}
              newTab={slide.newTab}
              className="mt-1 inline-flex min-h-11 w-fit items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-fg [text-shadow:none] after:absolute after:inset-0"
            >
              {slide.buttonText}
            </StoreLink>
          )}
        </div>
      )}
      {wholeLink && (
        <StoreLink href={slide.link} newTab={slide.newTab} className="absolute inset-0 z-[1]">
          <span className="sr-only">{linkLabel}</span>
        </StoreLink>
      )}
    </div>
  );
}
