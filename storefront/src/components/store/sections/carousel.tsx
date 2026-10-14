'use client';

import Link from 'next/link';
import { useContext } from 'react';
import { usePreviewHref } from '../preview';
import { ImageCarousel } from '../ImageCarousel';
import { ImagePlaceholder, usePreviewPlaceholders } from '../section-primitives';
import { LeadSectionContext } from '../section-context';
import type { SectionRenderProps } from '../section-types';

export function CarouselSection({ data, storeName }: SectionRenderProps<'carousel'>) {
  const lead = useContext(LeadSectionContext);
  const placeholders = usePreviewPlaceholders();
  const href = usePreviewHref();
  // En la tienda, una diapositiva sin foto no se muestra; en el editor se ve
  // su lugar (y sus textos), así se entiende qué falta.
  const slides = data.slides.filter((s) => s.image || placeholders);
  if (slides.length === 0) {
    // Portada de una tienda que todavía no cargó fotos: el nombre de la
    // tienda sobre un degradé de su color y un botón al catálogo. Sin textos
    // inventados ("envíos a todo el país…"): la tienda puede no hacerlos.
    return (
      <section className="relative overflow-hidden border-b border-fg/5">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 50% -10%, rgb(var(--color-primary) / 0.16), transparent 60%)',
          }}
        />
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary opacity-20 blur-3xl" />
        <div
          className={`relative mx-auto flex max-w-container flex-col items-center justify-center px-4 py-24 text-center sm:py-32 ${data.heightMobile === 'full' ? 'min-h-[82svh] sm:min-h-0' : ''}`}
        >
          <h2
            className="tf-in max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl"
            style={{ fontFamily: 'var(--font-heading)', animationDelay: '60ms' }}
          >
            {storeName}
          </h2>
          <Link
            href={href('/productos')}
            className="tf-in mt-7 inline-flex min-h-11 items-center rounded-full bg-primary px-7 text-sm font-semibold text-primary-fg shadow-lg transition-transform hover:scale-[1.03]"
            style={{ animationDelay: '120ms' }}
          >
            Ver productos
          </Link>
        </div>
      </section>
    );
  }
  return (
    <ImageCarousel
      slides={slides}
      data={data}
      lcp={lead}
      renderPlaceholder={(chip) => <ImagePlaceholder label="Subí la foto de esta diapositiva" chip={chip} />}
    />
  );
}
