'use client';

import Link from 'next/link';
import { useContext } from 'react';
import { usePreviewHref } from '../preview';
import { ImageCarousel } from '../section-primitives';
import { LeadSectionContext } from '../section-context';
import type { SectionRenderProps } from '../section-types';

export function CarouselSection({ data, storeName }: SectionRenderProps<'carousel'>) {
  const lead = useContext(LeadSectionContext);
  const href = usePreviewHref();
  const { images, fullHeightMobile } = data;
  if (images.length === 0) {
    // Hero por defecto (sin imágenes aún): degradado de marca + titular + CTA.
    return (
      <section className="relative overflow-hidden border-b border-black/5">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 50% -10%, rgb(var(--color-primary) / 0.16), transparent 60%)',
          }}
        />
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary opacity-20 blur-3xl" />
        <div
          className={`relative mx-auto flex max-w-container flex-col items-center justify-center px-4 py-24 text-center sm:py-32 ${fullHeightMobile ? 'min-h-[82svh] sm:min-h-0' : ''}`}
        >
          <span className="tf-in mb-4 inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-black/[0.03] px-3 py-1 text-xs font-medium opacity-70">
            ● Tienda online
          </span>
          <h2
            className="tf-in max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl"
            style={{ fontFamily: 'var(--font-heading)', animationDelay: '60ms' }}
          >
            {storeName}
          </h2>
          <p
            className="tf-in mx-auto mt-4 max-w-xl text-base opacity-70 sm:text-lg"
            style={{ animationDelay: '120ms' }}
          >
            Descubrí toda la colección. Envíos a todo el país y compra protegida.
          </p>
          <Link
            href={href('/productos')}
            className="tf-in mt-7 inline-flex items-center rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-fg shadow-lg transition-transform hover:scale-[1.03]"
            style={{ animationDelay: '180ms' }}
          >
            Ver productos
          </Link>
        </div>
      </section>
    );
  }
  return <ImageCarousel images={images} fullHeightMobile={fullHeightMobile} lcp={lead} />;
}
