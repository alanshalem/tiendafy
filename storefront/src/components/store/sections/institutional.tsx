import { cn } from '@tiendafy/ui/cn';
import { SectionTitle } from '../section-primitives';
import { StoreLink } from '../StoreLink';
import type { SectionRenderProps } from '../section-types';

/**
 * Un título, un texto y un botón opcional. La alineación y el fondo los pone
 * "Diseño de la sección" (centrado si no se eligió nada, como siempre). El
 * texto respeta los saltos de línea que escribió el comercio.
 */
export function InstitutionalSection({ section, data }: SectionRenderProps<'institutional'>) {
  const left = section.style?.align === 'left';
  const button = data.buttonText.trim() && data.link.trim() ? data : null;
  if (!data.title && !data.description) return null;
  return (
    <section className={cn('mx-auto max-w-container px-4 py-14', left ? 'text-left' : 'text-center')}>
      {data.title && (
        <SectionTitle align={section.style?.align} className="text-2xl font-bold wrap-anywhere">
          {data.title}
        </SectionTitle>
      )}
      {data.description && (
        <p
          className={cn('mt-3 max-w-2xl whitespace-pre-line opacity-70 wrap-anywhere', left ? '' : 'mx-auto')}
        >
          {data.description}
        </p>
      )}
      {button && (
        <StoreLink
          href={button.link}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-fg transition-opacity hover:opacity-90"
        >
          {button.buttonText}
        </StoreLink>
      )}
    </section>
  );
}
