'use client';

import { useEffect, useRef, useState } from 'react';
import {
  parseVideoUrl,
  videoEmbedUrl,
  videoThumbnail,
  type VideoData,
  type VideoLink,
} from '@tiendafy/types';
import { cn } from '@tiendafy/ui';
import { SectionTitle, usePreviewPlaceholders } from '../section-primitives';
import type { SectionRenderProps } from '../section-types';
import { StoreImage } from '../StoreImage';
import { SectionButton } from './section-button';

/** Proporción del recuadro y hasta qué ancho crece (un vertical a lo ancho sería una pared). */
const RATIO: Record<VideoData['ratio'], string> = {
  '16:9': 'aspect-video max-w-4xl',
  '4:3': 'aspect-[4/3] max-w-3xl',
  '1:1': 'aspect-square max-w-xl',
  '9:16': 'aspect-[9/16] max-w-sm',
};

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="ml-1 h-8 w-8" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

/**
 * YouTube o Vimeo "de fachada": hasta que se toca reproducir es una imagen
 * con un botón. El reproductor de YouTube pesa cientos de KB y abre
 * conexiones (y cookies) apenas se carga; así la portada no lo paga si nadie
 * mira el video. Al tocar, entra el iframe (youtube-nocookie) y arranca solo.
 */
function EmbedFacade({ video, poster, title }: { video: VideoLink; poster: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const thumb = poster || videoThumbnail(video);
  const name = title || (video.provider === 'youtube' ? 'Video de YouTube' : 'Video de Vimeo');
  if (playing)
    return (
      <iframe
        src={videoEmbedUrl(video)}
        title={name}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
    );
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Reproducir: ${name}`}
      className="group absolute inset-0 flex h-full w-full items-center justify-center bg-black"
    >
      {thumb && (
        <StoreImage
          src={thumb}
          alt=""
          sizes="(max-width: 768px) 100vw, 56rem"
          className="object-cover opacity-90"
        />
      )}
      <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-black/70 text-white shadow-lg transition-transform group-hover:scale-110 group-focus-visible:scale-110 motion-reduce:transition-none">
        <PlayIcon />
      </span>
    </button>
  );
}

/**
 * Un MP4 de la tienda. Con "reproducir solo" arranca sin sonido y en loop
 * (si la persona no pidió menos movimiento), con un botón de pausa siempre a
 * mano; si no, con los controles del navegador. El play se decide en el
 * navegador: el servidor no sabe de "reducir movimiento".
 */
function FileVideo({
  src,
  poster,
  autoplay,
  title,
}: {
  src: string;
  poster: string;
  autoplay: boolean;
  title: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || !autoplay) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    el.muted = true;
    void el.play?.()?.catch(() => {});
  }, [autoplay, src]);
  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    // Por el estado (que siguen los eventos play/pause) y no por el.paused:
    // es lo que muestra el botón.
    if (paused) void el.play?.()?.catch(() => {});
    else el.pause();
  };
  return (
    <>
      <video
        ref={ref}
        src={src}
        poster={poster || undefined}
        muted={autoplay}
        loop={autoplay}
        playsInline
        controls={!autoplay}
        preload="metadata"
        aria-label={title || 'Video'}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        className="absolute inset-0 h-full w-full bg-black object-cover"
      />
      {autoplay && (
        <button
          type="button"
          onClick={toggle}
          aria-label={paused ? 'Reproducir el video' : 'Pausar el video'}
          className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/75"
        >
          {paused ? (
            <PlayIcon />
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          )}
        </button>
      )}
    </>
  );
}

/** Video propio (no el de Instagram): YouTube/Vimeo con fachada o un MP4 subido. */
export function VideoSection({ data }: SectionRenderProps<'video'>) {
  const preview = usePreviewPlaceholders();
  const embed = data.source === 'link' ? parseVideoUrl(data.url) : null;
  const file = data.source === 'file' ? data.file : '';
  const hasVideo = !!embed || !!file;
  if (!hasVideo && !preview) return null;

  return (
    <section className="mx-auto max-w-container px-4 py-12">
      {(data.title || data.text) && (
        <div className="mx-auto mb-6 max-w-2xl text-center">
          {data.title && <SectionTitle className="text-2xl font-bold">{data.title}</SectionTitle>}
          {data.text && <p className="mt-2 whitespace-pre-line text-fg-muted">{data.text}</p>}
        </div>
      )}
      <div className={cn('relative mx-auto w-full overflow-hidden rounded-lg bg-black/5', RATIO[data.ratio])}>
        {embed ? (
          <EmbedFacade video={embed} poster={data.poster} title={data.title} />
        ) : file ? (
          <FileVideo src={file} poster={data.poster} autoplay={data.autoplay} title={data.title} />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-fg-muted">
            {data.source === 'link'
              ? data.url
                ? 'Ese link no es de un video de YouTube o Vimeo.'
                : 'Pegá el link de un video de YouTube o Vimeo.'
              : 'Subí un video MP4.'}
          </div>
        )}
      </div>
      <div className="mt-6 text-center empty:hidden">
        <SectionButton text={data.buttonText} link={data.link} />
      </div>
    </section>
  );
}
