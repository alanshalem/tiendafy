'use client';

import { LAZY, SectionTitle } from '../section-primitives';
import type { SectionRenderProps } from '../section-types';

export function ImageTextSection({ data }: SectionRenderProps<'image-text'>) {
  const light = data.textColor === 'light';
  if (!data.image && !data.title) return null;

  const hasText = !!(data.title || data.description || data.buttonText);

  // Solo imagen (sin texto): a todo el ancho del contenedor, centrada — no media
  // columna a la izquierda. Sirve para banners de cualquier proporción.
  if (data.image && !hasText) {
    return (
      <section className="mx-auto max-w-container px-4 py-14">
        <img src={data.image} alt="" {...LAZY} className="mx-auto w-full rounded-lg" />
      </section>
    );
  }

  // Imagen + texto = 2 columnas. Solo texto = una columna a todo el ancho.
  return (
    <section
      className={`mx-auto max-w-container items-center gap-8 px-4 py-14 ${data.image ? 'grid md:grid-cols-2' : ''}`}
    >
      {data.image && <img src={data.image} alt="" {...LAZY} className="w-full rounded-lg object-cover" />}
      <div className={light ? 'text-white' : undefined}>
        {data.title && <SectionTitle className="text-2xl font-bold">{data.title}</SectionTitle>}
        {data.description && <p className="mt-3 opacity-70">{data.description}</p>}
        {data.buttonText && (
          <a
            href={data.link || '#'}
            className="mt-5 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg"
          >
            {data.buttonText}
          </a>
        )}
      </div>
    </section>
  );
}
