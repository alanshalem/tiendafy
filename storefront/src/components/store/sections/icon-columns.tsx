'use client';

import { safeHref, type IconColumnItem } from '@tiendafy/types';
import { cn } from '@tiendafy/ui';
import { Icon, type IconName } from '../Icon';
import { SectionTitle, usePreviewPlaceholders } from '../section-primitives';
import { useSectionStyle } from '../section-context';
import type { SectionRenderProps } from '../section-types';
import { StoreImage } from '../StoreImage';
import { StoreLink } from '../StoreLink';

// Clases enteras (Tailwind no ve las armadas con plantillas).
const DESKTOP_COLS: Record<number, string> = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-2 lg:grid-cols-4',
  5: 'md:grid-cols-3 lg:grid-cols-5',
  6: 'md:grid-cols-3 lg:grid-cols-6',
};

function Column({ item, center }: { item: IconColumnItem; center: boolean }) {
  const href = safeHref(item.link);
  return (
    <div
      className={cn(
        'flex h-full flex-col gap-3',
        center ? 'items-center text-center' : 'items-start text-left',
      )}
    >
      {item.image ? (
        <span className="relative block h-14 w-14 shrink-0" aria-hidden="true">
          <StoreImage src={item.image} alt="" sizes="56px" className="object-contain" />
        </span>
      ) : (
        item.icon !== 'none' && (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
            <Icon name={item.icon as IconName} className="h-7 w-7" />
          </span>
        )
      )}
      {item.title && <h3 className="text-base font-semibold">{item.title}</h3>}
      {item.text && <p className="whitespace-pre-line text-sm text-fg-muted">{item.text}</p>}
      {href && (
        <StoreLink
          href={href}
          className="mt-auto inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-2 hover:opacity-80"
        >
          Ver más
          {/* El destino completo, para quien no ve la columna entera. */}
          {item.title && <span className="sr-only">{` sobre ${item.title}`}</span>}
        </StoreLink>
      )}
    </div>
  );
}

/**
 * Íconos con texto (beneficios, pasos, garantías): columnas con un ícono del
 * kit de la tienda —o una imagen propia—, título, texto y link. En celular
 * van de a una, de a dos o deslizándose.
 */
export function IconColumnsSection({ data }: SectionRenderProps<'icon-columns'>) {
  const preview = usePreviewPlaceholders();
  const center = (useSectionStyle()?.align ?? 'center') === 'center';
  const items = data.items.filter((it) => it.title || it.text || it.image);
  if (items.length === 0) {
    if (!preview) return null;
    return (
      <section className="mx-auto max-w-container px-4 py-12">
        <p className="rounded-md bg-fg/5 p-4 text-sm text-fg-muted">
          Agregá columnas con un ícono y un texto.
        </p>
      </section>
    );
  }
  const swipe = data.mobile === 'swipe';
  return (
    <section className="mx-auto max-w-container px-4 py-12">
      {/* El título acompaña a las columnas: centradas (como vienen), centrado. */}
      {data.title && (
        <SectionTitle className={cn('mb-8 text-2xl font-bold', center && 'text-center')}>
          {data.title}
        </SectionTitle>
      )}
      <ul
        className={cn(
          swipe
            ? '-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 md:mx-0 md:grid md:overflow-visible md:px-0 md:pb-0'
            : cn('grid', data.mobile === '2' ? 'grid-cols-2' : 'grid-cols-1'),
          'gap-x-6 gap-y-8',
          DESKTOP_COLS[data.columnsDesktop],
        )}
      >
        {items.map((it, i) => (
          // Deslizando, cada columna va en una tarjeta: con el contenido
          // centrado, la siguiente asomaba vacía y no se notaba que había más.
          <li
            key={i}
            className={cn(
              swipe &&
                'w-[72%] shrink-0 snap-start rounded-lg bg-fg/[0.04] p-5 md:w-auto md:bg-transparent md:p-0',
            )}
          >
            <Column item={it} center={center} />
          </li>
        ))}
      </ul>
    </section>
  );
}
