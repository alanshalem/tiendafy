'use client';

import { SectionTitle } from '../section-primitives';
import type { SectionRenderProps } from '../section-types';

export function InstitutionalSection({ data }: SectionRenderProps<'institutional'>) {
  if (!data.title && !data.description) return null;
  return (
    <section className="mx-auto max-w-container px-4 py-14 text-center">
      {data.title && <SectionTitle className="text-2xl font-bold">{data.title}</SectionTitle>}
      {data.description && <p className="mx-auto mt-3 max-w-2xl opacity-70">{data.description}</p>}
    </section>
  );
}
