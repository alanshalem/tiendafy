'use client';

import { cn } from '@tiendafy/ui';
import { Icon } from '../Icon';
import { SectionTitle } from '../section-primitives';
import { StoreImage } from '../StoreImage';
import type { SectionRenderProps, TestimonialItem } from '../section-types';

/** Estrellas de la opinión (de 1 a 5). Con nombre accesible: "5 de 5 estrellas". */
function Stars({ rating }: { rating: number }) {
  return (
    <span
      role="img"
      aria-label={`${rating} de 5 estrellas`}
      className="mb-3 flex h-6 items-center gap-0.5 text-amber-500"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={cn('h-4 w-4', n > rating && 'opacity-25')}
          fill="currentColor"
        >
          <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L10 14.8l-5.2 2.8 1-5.8L1.5 7.7l5.9-.8L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}

function Card({ t, index }: { t: TestimonialItem; index: number }) {
  const rating = t.rating === 'none' ? 0 : Number(t.rating);
  const initial = t.name.trim().charAt(0).toUpperCase();
  return (
    <figure
      className="tf-in flex h-full flex-col rounded-lg border border-black/10 bg-black/[0.02] p-6"
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
    >
      {rating > 0 ? (
        <Stars rating={rating} />
      ) : (
        <Icon name="quote" className="mb-3 h-6 w-6 text-primary-ink opacity-70" />
      )}
      <blockquote className="flex-1 whitespace-pre-line text-sm leading-relaxed opacity-85 wrap-anywhere">
        {t.quote}
      </blockquote>
      {(t.photo || t.name || t.detail) && (
        <figcaption className="mt-5 flex items-center gap-3">
          {t.photo ? (
            <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full">
              <StoreImage src={t.photo} alt="" sizes="36px" className="object-cover" />
            </span>
          ) : initial ? (
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary-ink"
            >
              {initial}
            </span>
          ) : null}
          <span className="min-w-0">
            {t.name && <span className="block text-sm font-semibold wrap-anywhere">{t.name}</span>}
            {t.detail && <span className="block text-xs text-fg-muted wrap-anywhere">{t.detail}</span>}
          </span>
        </figcaption>
      )}
    </figure>
  );
}

/**
 * Testimonios: cards de prueba social (cita, estrellas, nombre y foto). En
 * grilla, la última fila incompleta queda centrada (antes quedaba colgando a
 * la izquierda); en carrusel, se deslizan.
 */
export function TestimonialsSection({ data }: SectionRenderProps<'testimonials'>) {
  const items = data.items.filter((t) => t.quote.trim());
  if (items.length === 0) return null;
  const carousel = data.layout === 'carousel' && items.length > 1;
  return (
    <section className="store-section mx-auto max-w-container px-6 py-14 sm:px-4">
      {data.title && (
        <SectionTitle className="mb-8 text-center text-2xl font-bold wrap-anywhere">
          {data.title}
        </SectionTitle>
      )}
      {carousel ? (
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-3 [scrollbar-width:none] sm:gap-5 [&::-webkit-scrollbar]:hidden">
          {items.map((t, i) => (
            <div
              key={i}
              className="w-[85%] shrink-0 snap-start sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)]"
            >
              <Card t={t} index={i} />
            </div>
          ))}
        </div>
      ) : (
        // flex-wrap + centrado: con 4 o 5 testimonios la fila de abajo queda al
        // medio. Cada card mide un tercio (o la mitad en tablet).
        <div className="flex flex-wrap justify-center gap-5">
          {items.map((t, i) => (
            <div
              key={i}
              className={cn(
                'w-full',
                items.length === 1
                  ? 'max-w-xl'
                  : 'sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)]',
              )}
            >
              <Card t={t} index={i} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
