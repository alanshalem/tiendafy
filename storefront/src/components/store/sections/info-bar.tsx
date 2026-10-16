import { SECTION_REGISTRY } from '@tiendafy/types';
import { cn } from '@tiendafy/ui/cn';
import { Icon } from '../Icon';
import { INFO_ICON_MAP, LAZY } from '../section-primitives';
import { StoreLink } from '../StoreLink';
import type { InfoItemData, SectionRenderProps } from '../section-types';

/**
 * Lo que muestra la barra si el comercio todavía no cargó nada: los mismos
 * ítems con que arranca el editor (el registro), así lo que se edita es lo
 * que se ve.
 */
const DEFAULT_INFO_ITEMS: readonly InfoItemData[] = SECTION_REGISTRY['info-bar'].defaults.items ?? [];

// Columnas en pantallas grandes según cuántos ítems hay: antes era siempre
// 3, y con 4 el cuarto quedaba solo en otra fila.
const DESKTOP_COLS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

// En el celular: uno abajo del otro (como bloque centrado, con los íconos
// alineados entre sí), de a dos, o deslizables (scroll-px: al encajar, el
// primero no queda pegado al borde de la pantalla).
const MOBILE_LAYOUT = {
  stack: 'mx-auto grid w-fit max-w-full grid-cols-1 gap-5 sm:w-auto',
  grid: 'grid grid-cols-2 gap-x-4 gap-y-6',
  carousel:
    'flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto overscroll-x-contain [scrollbar-width:none] sm:grid sm:overflow-visible [&::-webkit-scrollbar]:hidden',
} as const;

function InfoItem({ item }: { item: InfoItemData }) {
  const iconName = INFO_ICON_MAP[item.icon] ?? 'shipping';
  return (
    <span className="flex min-w-0 items-center gap-3 text-sm">
      {item.image ? (
        // Un ícono propio chico (28 px): un <img> alcanza, no hace falta srcset.
        <img src={item.image} alt="" {...LAZY} className="h-7 w-7 shrink-0 object-contain" />
      ) : (
        // Mismo casillero que el ícono propio: los textos quedan alineados entre sí.
        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
          <Icon name={iconName} className="h-6 w-6 opacity-70" />
        </span>
      )}
      <span className="min-w-0 text-left">
        {item.title && <span className="block font-semibold wrap-anywhere">{item.title}</span>}
        {item.description && (
          <span className="block whitespace-pre-line text-xs text-fg-muted wrap-anywhere">
            {item.description}
          </span>
        )}
      </span>
    </span>
  );
}

export function InfoBarSection({ data }: SectionRenderProps<'info-bar'>) {
  // Un ítem sin título, descripción ni ícono propio es un casillero vacío.
  const own = data.items.filter((it) => it.title.trim() || it.description.trim() || it.image);
  const list = data.items.length > 0 ? own : DEFAULT_INFO_ITEMS;
  if (list.length === 0) return null;
  const layout = data.mobileLayout;
  return (
    <section className="border-y border-fg/10">
      <div
        className={cn(
          'mx-auto max-w-container px-4 py-8 sm:grid sm:justify-items-center sm:gap-6',
          MOBILE_LAYOUT[layout],
          DESKTOP_COLS[list.length] ?? DESKTOP_COLS[4],
        )}
      >
        {list.map((it, idx) => (
          <div
            key={idx}
            className={cn('min-w-0', layout === 'carousel' && 'w-[70%] shrink-0 snap-start sm:w-auto')}
          >
            {it.link ? (
              <StoreLink href={it.link} className="flex min-h-10 items-center rounded-md hover:opacity-80">
                <InfoItem item={it} />
              </StoreLink>
            ) : (
              <InfoItem item={it} />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
