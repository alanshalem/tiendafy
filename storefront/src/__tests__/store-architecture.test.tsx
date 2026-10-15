/**
 * La tienda publicada se arma en el servidor y baja solo el JS de lo que
 * dibuja; la vista previa del editor corre entera en el navegador. Estos
 * tests cuidan esa división: si una pieza que se dibuja en el servidor
 * empieza a usar hooks, el build lo marca recién al servir la página.
 */
import { isValidElement, type ComponentType, type ReactElement } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SECTION_TYPES, sectionData } from '@tiendafy/types';
import { mergeTheme, type SectionType, type ThemeSection } from '../lib/theme';
import { StorefrontView } from '../components/store/StorefrontView';
import { LiveStorefront, StoreChrome } from '../components/store/store-islands';
import { StoreHome } from '../components/store/StoreHome';
import { StoreRoot } from '../components/store/StoreRoot';
import { SECTION_RENDERERS } from '../components/store/sections/registry';
import * as lazySections from '../components/store/sections/lazy';
import type { SectionRenderProps } from '../components/store/section-types';
import { Icon, IconKitContext, type IconName } from '../components/store/Icon';
import type { IconKit } from '../lib/theme';

const theme = mergeTheme(null);
const base = { tenantId: 't1', tenantName: 'Tienda', theme, products: [] };

/** Los hijos de un elemento, aplanados. */
const kids = (el: ReactElement<{ children?: unknown }>) =>
  ([] as unknown[]).concat(el.props.children ?? []).filter(isValidElement) as ReactElement<
    Record<string, unknown>
  >[];

describe('StorefrontView', () => {
  it('en la tienda publicada no carga la vista previa: raíz del tema + marco + portada del servidor', () => {
    const tree = StorefrontView(base) as ReactElement<{ children?: unknown }>;
    expect(tree.type).toBe(StoreRoot);
    const [chrome] = kids(tree);
    expect(chrome!.type).toBe(StoreChrome);
    // La portada va como contenido del marco, ya armada (no la arma el cliente).
    expect((chrome!.props.children as ReactElement).type).toBe(StoreHome);
  });

  it('con contenido propio, el contenido va adentro del marco', () => {
    const tree = StorefrontView({ ...base, children: <p>hola</p> }) as ReactElement<{ children?: unknown }>;
    const [chrome] = kids(tree);
    expect((chrome!.props.children as ReactElement).type).toBe('p');
  });

  it('en la vista previa del editor la tienda entera corre en el navegador', () => {
    const tree = StorefrontView({ ...base, live: true }) as ReactElement;
    expect(tree.type).toBe(LiveStorefront);
  });
});

describe('secciones', () => {
  const lazy = new Set<unknown>(Object.values(lazySections));
  const section = (type: SectionType): ThemeSection => ({ id: `s-${type}`, type, visible: true, data: {} });
  const props = (type: SectionType): SectionRenderProps => ({
    section: section(type),
    data: sectionData(section(type)),
    products: [],
    storeName: 'Tienda',
    productList: theme.productList,
    lead: false,
    preview: true,
    darkPage: false,
  });

  it('las que no son interactivas se dibujan en el servidor: no usan hooks', () => {
    const server = SECTION_TYPES.filter((t) => !lazy.has(SECTION_RENDERERS[t]));
    expect(server.length).toBeGreaterThan(5);
    for (const type of server) {
      const Render = SECTION_RENDERERS[type] as (p: SectionRenderProps) => unknown;
      // Llamada "en seco", fuera de un render de React: con un hook, tira.
      expect(() => Render(props(type)), type).not.toThrow();
    }
  });

  it('las interactivas se cargan aparte, una por tipo', () => {
    for (const type of ['hero-video', 'carousel', 'featured', 'promo-popup', 'countdown-offer'] as const)
      expect(lazy.has(SECTION_RENDERERS[type]), type).toBe(true);
  });
});

/** El nombre de cada ícono en Phosphor (los mismos que usaba Icon.tsx). */
const PHOSPHOR: Record<Exclude<IconName, 'quote'>, string> = {
  cart: 'ShoppingCart',
  heart: 'Heart',
  user: 'User',
  search: 'MagnifyingGlass',
  menu: 'List',
  close: 'X',
  chevronDown: 'CaretDown',
  chevronLeft: 'CaretLeft',
  chevronRight: 'CaretRight',
  shipping: 'Truck',
  card: 'CreditCard',
  security: 'ShieldCheck',
  gift: 'Gift',
  support: 'Headphones',
  returns: 'ArrowsClockwise',
  mapPin: 'MapPin',
  phone: 'Phone',
  mail: 'EnvelopeSimple',
  chat: 'ChatCircle',
};

describe('íconos', () => {
  const NAMES: IconName[] = [
    'cart',
    'heart',
    'user',
    'search',
    'menu',
    'close',
    'chevronDown',
    'chevronLeft',
    'chevronRight',
    'shipping',
    'card',
    'security',
    'gift',
    'support',
    'returns',
    'mapPin',
    'phone',
    'mail',
    'chat',
    'quote',
  ];
  const KITS: IconKit[] = ['lucide', 'phosphor', 'tabler', 'heroicons', 'feather'];

  it.each(KITS)('el kit %s dibuja cada ícono (lo que no tiene, de lucide)', (kit) => {
    const { container } = render(
      <IconKitContext.Provider value={kit}>
        {NAMES.map((n) => (
          <Icon key={n} name={n} className={`i-${n}`} />
        ))}
      </IconKitContext.Provider>,
    );
    for (const n of NAMES) expect(container.querySelector(`svg.i-${n}`), `${kit}/${n}`).not.toBeNull();
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(NAMES.length);
  });

  // Los trazos van copiados del paquete (ver icons/phosphor.tsx): si alguien
  // los toca, o el paquete cambia, este test lo marca.
  it.each(Object.entries(PHOSPHOR))(
    'el kit de Phosphor dibuja el trazo "fill" del paquete: %s',
    async (name, file) => {
      const mod = (await import(`../../node_modules/@phosphor-icons/react/dist/csr/${file}.es.js`)) as Record<
        string,
        ComponentType<{ weight: string; className: string }>
      >;
      const Ph = mod[file]!;
      const { container } = render(
        <>
          <Ph weight="fill" className="paquete" />
          <IconKitContext.Provider value="phosphor">
            <Icon name={name as IconName} className="propio" />
          </IconKitContext.Provider>
        </>,
      );
      const paths = (sel: string) =>
        [...container.querySelectorAll(`${sel} path`)].map((e) => e.getAttribute('d'));
      expect(paths('svg.propio')).toEqual(paths('svg.paquete'));
      expect(container.querySelector('svg.propio')?.getAttribute('viewBox')).toBe('0 0 256 256');
    },
  );
});
