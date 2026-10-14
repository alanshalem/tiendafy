'use client';

import Link from 'next/link';
import { useContext } from 'react';
import { usePreviewHref } from '../preview';
import { StoreImage } from '../StoreImage';
import { OVERLAY_CLASS, usePreviewPlaceholders } from '../section-primitives';
import { LeadSectionContext } from '../section-context';
import type { SectionRenderProps } from '../section-types';

/**
 * El título del hero es el h1 de la portada solo si el hero la abre y se ve
 * en todos los dispositivos (ver isPageTitleSection en HomeSections); más
 * abajo es una sección más, con su h2.
 */
export function HeroVideoSection({ section, data }: SectionRenderProps<'hero-video'>) {
  const lead = useContext(LeadSectionContext);
  const placeholders = usePreviewPlaceholders();
  const href = usePreviewHref();
  const { videoWebm: webm, videoMp4: mp4, poster, title, subtitle, buttonText, link } = data;
  const alignLeft = data.align === 'left';
  const full = data.height === 'full';
  const overlay = OVERLAY_CLASS[data.overlay] ?? OVERLAY_CLASS.medium;
  const Heading = lead && !section.hideOn ? 'h1' : 'h2';

  if (!webm && !mp4 && !poster && !title) return null;

  return (
    <section className={`relative w-full overflow-hidden ${full ? 'h-[100svh]' : 'h-[70vh] min-h-[420px]'}`}>
      {webm || mp4 ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster={poster || undefined}
          aria-hidden
        >
          {webm && <source src={webm} type="video/webm" />}
          {mp4 && <source src={mp4} type="video/mp4" />}
        </video>
      ) : poster ? (
        <StoreImage src={poster} alt="" sizes="100vw" lcp={lead} className="object-cover" />
      ) : placeholders ? (
        // En el editor, una sección recién agregada todavía sin video: el
        // color de la marca de fondo, para que el texto blanco se lea.
        <div className="absolute inset-0 bg-primary" />
      ) : null}

      <div className={`absolute inset-0 ${overlay}`} />

      {(title || subtitle || buttonText) && (
        <div
          className={`relative z-10 mx-auto flex h-full max-w-container flex-col justify-center gap-4 px-6 text-white ${alignLeft ? 'items-start text-left' : 'items-center text-center'}`}
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
          {buttonText && (
            <Link
              href={href(link || '/productos')}
              className="mt-2 inline-flex w-fit rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-fg"
            >
              {buttonText}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
