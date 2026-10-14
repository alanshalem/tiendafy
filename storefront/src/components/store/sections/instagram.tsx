'use client';

import { parseVideoEmbed, type VideoEmbed } from '@tiendafy/types';
import { cn } from '@tiendafy/ui';
import type { ReactNode } from 'react';
import { SectionTitle, usePreviewPlaceholders } from '../section-primitives';
import type { InstagramData, SectionRenderProps } from '../section-types';

/** Lo que el iframe le permite al reproductor (lo mismo que pone YouTube en su código de inserción). */
const ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

const ASPECT: Record<Exclude<InstagramData['aspect'], 'auto'>, string> = {
  '16:9': 'aspect-video w-full',
  // Vertical: angosto y centrado, que no ocupe una pantalla y media de alto.
  '9:16': 'mx-auto aspect-[9/16] w-full max-w-[360px]',
  '1:1': 'mx-auto aspect-square w-full max-w-[560px]',
};

function aspectOf(data: InstagramData, embed: VideoEmbed): string {
  if (data.aspect !== 'auto') return ASPECT[data.aspect];
  return embed.kind === 'youtube' && embed.short ? ASPECT['9:16'] : ASPECT['16:9'];
}

function Frame({ data, children }: { data: InstagramData; children: ReactNode }) {
  return (
    <section className="store-section mx-auto max-w-container px-4 py-12">
      {data.title && (
        <SectionTitle className="mb-6 text-center text-2xl font-bold wrap-anywhere">
          {data.title}
        </SectionTitle>
      )}
      {children}
      {data.caption && (
        <p className="mx-auto mt-4 max-w-2xl whitespace-pre-line text-center text-sm text-fg-muted wrap-anywhere">
          {data.caption}
        </p>
      )}
    </section>
  );
}

function PreviewNote({ children }: { children: ReactNode }) {
  return (
    <section className="mx-auto max-w-container px-4 py-12">
      <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-fg/5 px-6 text-center text-sm text-fg-muted">
        {children}
      </div>
    </section>
  );
}

/**
 * Un video de YouTube o Vimeo, o una publicación de Instagram. Un link que no
 * se puede embeber no se dibuja (antes iba crudo al iframe y la tienda
 * mostraba un recuadro gris); en la vista previa se avisa.
 */
export function InstagramSection({ data }: SectionRenderProps<'instagram'>) {
  const placeholders = usePreviewPlaceholders();
  const url = data.video.trim();
  const embed = parseVideoEmbed(url);
  if (!embed) {
    if (!placeholders) return null;
    return (
      <PreviewNote>
        {url
          ? 'Este link no se puede mostrar en la tienda. Pegá el de un video de YouTube o Vimeo, o el de una publicación o perfil de Instagram.'
          : 'Pegá el link de un video de YouTube o Vimeo, o de una publicación de Instagram.'}
      </PreviewNote>
    );
  }

  // Perfil de Instagram: el feed no se puede embeber (Instagram lo bloquea).
  // Va una tarjeta con link al perfil.
  if (embed.kind === 'instagram-profile') {
    return (
      <Frame data={data}>
        <a
          href={embed.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mx-auto flex max-w-md flex-col items-center gap-2 rounded-2xl border border-fg/10 p-8 text-center transition-transform hover:scale-[1.01]"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-10 w-10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="2" y="2" width="20" height="20" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
          </svg>
          <span className="text-lg font-bold wrap-anywhere">@{embed.user}</span>
          <span className="text-sm text-fg-muted">Seguinos en Instagram</span>
          <span className="mt-2 inline-flex min-h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg">
            Ver perfil
          </span>
        </a>
      </Frame>
    );
  }

  if (embed.kind === 'instagram') {
    return (
      <Frame data={data}>
        <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-lg border border-fg/10 bg-white">
          <iframe
            src={embed.src}
            className="h-[560px] w-full"
            loading="lazy"
            scrolling="no"
            allow={ALLOW}
            title={data.title || 'Publicación de Instagram'}
          />
        </div>
      </Frame>
    );
  }

  return (
    <Frame data={data}>
      <div className={cn('overflow-hidden rounded-lg bg-fg/5', aspectOf(data, embed))}>
        <iframe
          src={embed.src}
          className="h-full w-full"
          loading="lazy"
          allow={ALLOW}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          title={data.title || (embed.kind === 'youtube' ? 'Video de YouTube' : 'Video de Vimeo')}
        />
      </div>
    </Frame>
  );
}
