import { sectionData, type FaqItem, type ThemeSection } from '@tiendafy/types';
import { Icon } from '../Icon';
import { SectionTitle } from '../section-primitives';
import type { SectionRenderProps } from '../section-types';

/** Las preguntas que se muestran: con pregunta y respuesta (una a medias no sirve ni a Google). */
const answered = (items: FaqItem[]) => items.filter((f) => f.question.trim() && f.answer.trim());

/**
 * El FAQPage (JSON-LD) de la página: UNO solo con las preguntas de todas las
 * secciones de preguntas visibles. Antes cada sección emitía el suyo, y Google
 * espera un único FAQPage por página. Lo pone HomeSections.
 */
export function faqPageJsonLd(sections: readonly ThemeSection[]) {
  const items = sections
    .filter((s) => s.visible && s.type === 'faq')
    .flatMap((s) => answered(sectionData(s as ThemeSection & { type: 'faq' }).items));
  if (items.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

/**
 * Preguntas frecuentes: accordion nativo (details/summary). La pregunta y la
 * respuesta cortan palabras larguísimas (un link pegado): antes empujaban la
 * flecha fuera de la caja. La respuesta respeta los saltos de línea.
 */
export function FaqSection({ section, data }: SectionRenderProps<'faq'>) {
  const items = answered(data.items);
  if (items.length === 0) return null;
  return (
    <section className="store-section mx-auto max-w-3xl px-6 py-14 sm:px-4">
      {data.title && (
        <SectionTitle
          align={section.style?.align}
          className="mb-6 text-center text-2xl font-bold wrap-anywhere"
        >
          {data.title}
        </SectionTitle>
      )}
      <div className="divide-y divide-fg/10 rounded-lg border border-fg/10">
        {items.map((f, i) => (
          <details key={i} className="group px-5 py-1" open={data.openFirst && i === 0 ? true : undefined}>
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 wrap-anywhere">{f.question}</span>
              <Icon
                name="chevronDown"
                className="h-4 w-4 shrink-0 opacity-60 transition-transform group-open:rotate-180"
              />
            </summary>
            <p className="whitespace-pre-line pb-4 text-sm leading-relaxed opacity-75 wrap-anywhere">
              {f.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
