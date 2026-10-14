'use client';

import { Icon } from '../Icon';
import { LAZY, SectionTitle } from '../section-primitives';
import type { SectionRenderProps } from '../section-types';

/** Testimonios: cards de prueba social (cita + nombre + foto opcional). */
export function TestimonialsSection({ data }: SectionRenderProps<'testimonials'>) {
  const items = data.items.filter((t) => t.quote.trim());
  if (items.length === 0) return null;
  const cols =
    items.length === 1
      ? 'sm:grid-cols-1 max-w-xl'
      : items.length === 2
        ? 'sm:grid-cols-2 max-w-3xl'
        : 'sm:grid-cols-3';
  return (
    <section className="store-section mx-auto max-w-container px-6 py-14 sm:px-4">
      <SectionTitle className="mb-8 text-center text-2xl font-bold">
        {data.title || 'Lo que dicen nuestros clientes'}
      </SectionTitle>
      <div className={`mx-auto grid gap-5 ${cols}`}>
        {items.map((t, i) => (
          <figure
            key={i}
            className="tf-in flex flex-col rounded-lg border border-black/10 bg-black/[0.02] p-6"
            style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
          >
            <Icon name="quote" className="mb-3 h-6 w-6 text-primary-ink opacity-70" />
            <blockquote className="flex-1 text-sm leading-relaxed opacity-85">{t.quote}</blockquote>
            {/* mt-auto: el pie queda abajo aunque las cards tengan alturas parejas */}
            <figcaption className="mt-5 flex items-center gap-3">
              {t.photo ? (
                <img src={t.photo} alt="" {...LAZY} className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary-ink">
                  {(t.name || '·').trim().charAt(0).toUpperCase()}
                </span>
              )}
              <span>
                {t.name && <span className="block text-sm font-semibold">{t.name}</span>}
                {t.detail && <span className="block text-xs text-fg-muted">{t.detail}</span>}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
