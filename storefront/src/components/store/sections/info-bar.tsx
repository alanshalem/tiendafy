'use client';

import { Icon } from '../Icon';
import { INFO_ICON_MAP } from '../section-primitives';
import type { InfoItemData, SectionRenderProps } from '../section-types';

/** Lo que muestra la barra si el comercio todavía no cargó nada. */
const DEFAULT_ITEMS: InfoItemData[] = [
  { icon: 'shipping', title: 'Envíos a todo el país', description: '', link: '' },
  { icon: 'card', title: 'Pagá con Mercado Pago', description: '', link: '' },
  { icon: 'security', title: 'Compra protegida', description: '', link: '' },
];

export function InfoBarSection({ data }: SectionRenderProps<'info-bar'>) {
  const list = data.items.length > 0 ? data.items : DEFAULT_ITEMS;
  return (
    <section className="border-y border-black/10">
      <div className="mx-auto grid max-w-container gap-6 px-4 py-8 sm:grid-cols-3">
        {list.map((it, idx) => {
          const iconName = INFO_ICON_MAP[it.icon] ?? 'shipping';
          const inner = (
            <div className="inline-flex items-center justify-center gap-3 text-sm">
              <Icon name={iconName} className="h-6 w-6 shrink-0 opacity-70" />
              <div className="text-left">
                {it.title && <div className="font-semibold">{it.title}</div>}
                {it.description && <div className="text-xs text-fg-muted">{it.description}</div>}
              </div>
            </div>
          );
          return (
            <div key={idx} className="flex justify-center">
              {it.link ? (
                <a href={it.link} className="hover:opacity-80">
                  {inner}
                </a>
              ) : (
                inner
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
