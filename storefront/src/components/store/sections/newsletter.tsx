'use client';

import { NewsletterForm } from '../NewsletterForm';
import { LAZY, SectionTitle } from '../section-primitives';
import type { SectionRenderProps } from '../section-types';

export function NewsletterSection({ data }: SectionRenderProps<'newsletter'>) {
  return (
    <section className="bg-black/[0.03]">
      <div className="mx-auto max-w-container px-4 py-14 text-center">
        {data.image && (
          <img
            src={data.image}
            alt=""
            {...LAZY}
            className="mx-auto mb-5 h-28 w-auto rounded-lg object-cover"
          />
        )}
        <SectionTitle className="text-xl font-bold">{data.title || 'Recibí novedades'}</SectionTitle>
        {data.text && <p className="mx-auto mt-2 max-w-md opacity-70">{data.text}</p>}
        <NewsletterForm source="home" />
      </div>
    </section>
  );
}
