'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@tiendafy/ui/cn';
import { MOBILE_MEDIA, StoreImage } from '../StoreImage';
import { PlayPauseIcon } from '../PlayPauseIcon';
import { StoreLink } from '../StoreLink';
import type { SectionRenderProps } from '../section-types';
import { useHydrated, useMediaQuery, usePrefersReducedMotion, useSaveData } from '../use-media';
import { OVERLAY_BG, TEXT_SHADOW } from './image-overlay';

const HEIGHT = {
  small: 'h-[50svh] min-h-[320px]',
  medium: 'h-[60svh] min-h-[380px]',
  large: 'h-[70vh] min-h-[420px]',
  full: 'h-[100svh]',
} as const;

/** Con texto oscuro, el velo aclara la foto en vez de oscurecerla. */
const LIGHT_VEIL = { none: '', light: 'bg-white/30', medium: 'bg-white/50', strong: 'bg-white/70' } as const;

const H_ALIGN = {
  left: 'items-start text-left',
  center: 'items-center text-center',
  right: 'items-end text-right',
} as const;
const V_ALIGN = { top: 'justify-start', center: 'justify-center', bottom: 'justify-end' } as const;

/**
 * Video de portada.
 *
 * El HTML del servidor trae solo la foto de respaldo (que es la imagen de
 * portada, con prioridad). El video se pide recién en el navegador, y solo si
 * va a reproducirse: con "reducir movimiento" o "ahorro de datos" se queda la
 * foto y no se baja nada (antes: autoplay con preload="metadata", que igual
 * bajaba los hasta 20 MB del video). En celular va el video y la foto de
 * celular, si hay. Siempre hay un botón para pausarlo (WCAG 2.2.2).
 *
 * El título es el h1 de la portada solo si el hero la abre y se ve en todos
 * los dispositivos (ver isPageTitleSection en StoreHome); más abajo es
 * una sección más, con su h2.
 */
export function HeroVideoSection({ section, data, lead }: SectionRenderProps<'hero-video'>) {
  const hydrated = useHydrated();
  const reduced = usePrefersReducedMotion();
  const saveData = useSaveData();
  const mobile = useMediaQuery(MOBILE_MEDIA);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [choice, setChoice] = useState<'auto' | 'playing' | 'paused'>('auto');
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const { videoWebm: webm, videoMp4: mp4, videoMobile, poster, title, subtitle, buttonText } = data;
  const posterMobile = data.posterMobile || poster;
  const hasVideo = !!(webm || mp4 || videoMobile);
  const sources =
    mobile && videoMobile
      ? [{ src: videoMobile, type: 'video/mp4' }]
      : [
          ...(webm ? [{ src: webm, type: 'video/webm' }] : []),
          ...(mp4 ? [{ src: mp4, type: 'video/mp4' }] : []),
          // Solo hay video de celular: también sirve en la computadora.
          ...(!webm && !mp4 && videoMobile ? [{ src: videoMobile, type: 'video/mp4' }] : []),
        ];
  const videoKey = sources[0]?.src;
  const playing = choice === 'playing' || (choice === 'auto' && !reduced && !saveData);
  // Una vez pedido el video, queda (pausarlo no lo vuelve a bajar).
  const showVideo = hydrated && hasVideo && (playing || loaded);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) void v.play?.()?.catch(() => {});
    else v.pause?.();
  }, [playing, showVideo, videoKey]);

  const darkText = data.textColor === 'dark';
  const veil = (darkText ? LIGHT_VEIL : OVERLAY_BG)[data.overlay];
  const Heading = lead && !section.hideOn ? 'h1' : 'h2';
  const hasImage = !!(poster || posterMobile);

  if (!hasVideo && !poster && !data.posterMobile && !title) return null;

  return (
    <section
      className={cn(
        'relative w-full overflow-hidden',
        HEIGHT[data.height],
        // Sin foto de respaldo: el color de la marca de fondo (antes, un
        // bloque gris mientras cargaba el video, o blanco con texto blanco).
        !hasImage && (darkText ? 'bg-primary/15' : 'bg-primary'),
      )}
      style={
        !hasImage && !darkText
          ? {
              backgroundImage:
                'linear-gradient(135deg, rgb(var(--color-primary)), rgb(var(--color-primary) / 0.55) 55%, rgb(17 24 39))',
            }
          : undefined
      }
    >
      {hasImage && (
        <StoreImage
          src={poster || posterMobile}
          mobileSrc={posterMobile !== poster ? posterMobile : undefined}
          alt=""
          sizes="100vw"
          lcp={lead}
          className="object-cover"
        />
      )}
      {showVideo && (
        <video
          // Al cambiar de video (celular ↔ computadora al rotar), uno nuevo.
          key={videoKey}
          ref={videoRef}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-500 motion-reduce:transition-none',
            ready ? 'opacity-100' : 'opacity-0',
          )}
          autoPlay={playing}
          loop
          muted
          playsInline
          preload="auto"
          onLoadStart={() => setLoaded(true)}
          onPlaying={() => setReady(true)}
          aria-hidden
          tabIndex={-1}
        >
          {sources.map((s) => (
            <source key={s.src} src={s.src} type={s.type} />
          ))}
        </video>
      )}

      {veil && <div className={cn('absolute inset-0', veil)} />}

      {(title || subtitle || buttonText) && (
        <div
          className={cn(
            'relative z-10 mx-auto flex h-full max-w-container flex-col gap-4 px-6 py-12',
            H_ALIGN[data.align],
            V_ALIGN[data.verticalAlign],
            hasVideo && data.verticalAlign === 'bottom' && 'pb-16',
            darkText ? 'text-[rgb(17_24_39)]' : 'text-white',
            !darkText && data.overlay === 'none' && TEXT_SHADOW,
          )}
        >
          {title && (
            <Heading
              className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl md:text-6xl"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {title}
            </Heading>
          )}
          {subtitle && <p className="max-w-xl text-lg opacity-90">{subtitle}</p>}
          {(buttonText || (data.secondButtonText && data.secondLink)) && (
            <div className="mt-2 flex flex-wrap gap-3 [text-shadow:none]">
              {buttonText && (
                <StoreLink
                  href={data.link || '/productos'}
                  newTab={data.newTab}
                  className="inline-flex min-h-11 w-fit items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-fg"
                >
                  {buttonText}
                </StoreLink>
              )}
              {data.secondButtonText && data.secondLink && (
                <StoreLink
                  href={data.secondLink}
                  newTab={data.secondNewTab}
                  className={cn(
                    'inline-flex min-h-11 w-fit items-center rounded-md border-2 px-6 text-sm font-semibold',
                    darkText
                      ? 'border-current hover:bg-black/5'
                      : 'border-white bg-black/10 text-white hover:bg-white/10',
                  )}
                >
                  {data.secondButtonText}
                </StoreLink>
              )}
            </div>
          )}
        </div>
      )}

      {hydrated && hasVideo && (
        <button
          type="button"
          onClick={() => setChoice(playing ? 'paused' : 'playing')}
          aria-label={playing ? 'Pausar el video' : 'Reproducir el video'}
          className="absolute bottom-3 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/60 focus-visible:outline-2 focus-visible:outline-white"
        >
          <PlayPauseIcon playing={playing} />
        </button>
      )}
    </section>
  );
}
