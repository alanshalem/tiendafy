/**
 * Cada tipo de sección de la portada, con todos sus datos cargados (como la
 * deja el editor) y vacía (recién agregada): se renderiza, muestra lo suyo y
 * aguanta que la toquen. También en el preview del editor, que anima altas y
 * bajas.
 *
 * La lista de tipos es un Record<SectionType, …>: si se agrega un tipo de
 * sección y no se suma acá, el test no compila.
 */
import type { SectionType, ThemeSection } from '@tiendafy/types';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeSections } from '../components/store/sections';
import { PreviewContext } from '../components/store/preview';
import { defaultTheme } from '../lib/theme';
import { toStoreProducts, type ProductDto } from '../lib/catalog';
import { fixture, mockApi } from '../test/api';
import { explore, settle, watchCrashes } from '../test/explore';
import { renderInStore as render } from '../test/store';

const dto = fixture<ProductDto>('/api/v1/products/by-slug/x');
/** Seis productos (el carrusel y las ofertas necesitan varios), el primero en oferta. */
const products = toStoreProducts(
  Array.from({ length: 6 }, (_, i) => ({
    ...dto,
    id: `${dto.id.slice(0, -1)}${i}`,
    name: `${dto.name} ${i}`,
  })),
).map((p, i) => (i === 0 ? { ...p, compareAtAmount: p.priceAmount * 2 } : p));

const img = (n: number) => `https://cdn.example.com/img-${n}.jpg`;

/** Datos completos de cada tipo y el texto que tiene que aparecer. */
const FULL: Record<SectionType, { data: Record<string, unknown>; shows?: string }> = {
  'hero-video': {
    data: {
      videoMp4: 'https://cdn.example.com/v.mp4',
      videoWebm: 'https://cdn.example.com/v.webm',
      poster: img(1),
      title: 'Hero grande',
      subtitle: 'Sub',
      buttonText: 'Ver más',
      link: '/productos',
      align: 'left',
      height: 'full',
      overlay: 'strong',
    },
    shows: 'Hero grande',
  },
  carousel: { data: { images: [img(1), img(2), img(3)], fullHeightMobile: true } },
  featured: { data: { productIds: products.map((p) => p.id), title: 'Lo mejor' }, shows: 'Lo mejor' },
  'new-products': { data: { carousel: false }, shows: 'Recién llegados' },
  'sale-products': { data: {}, shows: 'Ofertas' },
  'promo-banners': {
    data: {
      banners: [
        { image: img(1), title: 'Promo A', description: 'desc', link: '/productos' },
        { image: img(2), title: 'Oculto', show: false },
      ],
      fullWidth: true,
    },
    shows: 'Promo A',
  },
  'category-banners': {
    data: { banners: [{ image: img(3), title: 'Categoría X', link: '/productos?category=x' }] },
    shows: 'Categoría X',
  },
  institutional: { data: { title: 'Quiénes somos', description: 'Importadores' }, shows: 'Quiénes somos' },
  'image-text': {
    data: {
      image: img(4),
      title: 'Imagen y texto',
      description: 'd',
      buttonText: 'Ir',
      link: '/x',
      textColor: '#fff',
    },
    shows: 'Imagen y texto',
  },
  'info-bar': {
    data: {
      items: [
        { icon: 'truck', title: 'Envíos', description: 'a todo el país', link: '/envios' },
        { icon: 'nope', title: 'Cuotas' },
      ],
    },
    shows: 'Envíos',
  },
  newsletter: { data: { image: img(5), title: 'Suscribite', text: 'Novedades' }, shows: 'Suscribite' },
  instagram: { data: { video: 'https://www.youtube.com/watch?v=abc123' } },
  testimonials: {
    data: {
      title: 'Opiniones',
      items: [{ quote: 'Excelente', name: 'Ana', detail: 'CABA', photo: img(6) }, { quote: 'Bien' }],
    },
    shows: 'Excelente',
  },
  faq: {
    data: {
      title: 'Preguntas',
      items: [{ question: 'Hacen envíos', answer: 'A todo el país.' }, { question: 'Vacía' }],
    },
    shows: 'Hacen envíos',
  },
  brands: { data: { title: 'Marcas', images: [1, 2, 3, 4, 5, 6].map(img) }, shows: 'Marcas' },
  'countdown-offer': {
    data: {
      title: 'Hot Sale',
      text: 'Hasta 50% off',
      endsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      buttonText: 'Ver ofertas',
      link: '/productos',
    },
    shows: 'Hot Sale',
  },
  'featured-product': {
    data: { productId: products[1]!.id, badge: 'Elegido del mes', layout: 'image-right' },
    shows: 'Elegido del mes',
  },
  // No se ve hasta que se abre (a los segundos): en la página no ocupa lugar.
  'promo-popup': {
    data: { title: 'Promo', couponCode: 'HOLA', newsletter: true, image: img(7), mobileImage: img(8) },
  },
  'rich-text': {
    data: {
      title: 'Nuestra historia',
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Empezamos en 2010', marks: [{ type: 'bold' }] }],
          },
        ],
      },
      image: img(9),
      buttonText: 'Leer más',
      link: '/paginas/nosotros',
    },
    shows: 'Nuestra historia',
  },
  // Las categorías de la tienda sembrada (las pide el árbol del menú).
  'category-list': {
    data: { title: 'Por categoría', mode: 'auto', layout: 'carousel' },
    shows: 'Musculación',
  },
  video: {
    data: {
      source: 'link',
      url: 'https://youtu.be/dQw4w9WgXcQ',
      title: 'Mirá cómo se usa',
      buttonText: 'Comprar',
      link: '/productos',
    },
    shows: 'Mirá cómo se usa',
  },
  'icon-columns': {
    data: {
      title: 'Por qué elegirnos',
      items: [
        { icon: 'shipping', title: 'Envíos', text: 'Rápidos', link: '/envios' },
        { icon: 'none', image: img(10), title: 'Garantía' },
      ],
      mobile: 'swipe',
    },
    shows: 'Por qué elegirnos',
  },
};

const TYPES = Object.keys(FULL) as SectionType[];

const section = (type: SectionType, data: Record<string, unknown>, visible = true): ThemeSection =>
  ({ id: `s-${type}`, type, visible, data }) as ThemeSection;

const view = (sections: ThemeSection[]) => (
  <HomeSections
    sections={sections}
    products={products}
    storeName="Tienda"
    productList={defaultTheme.productList}
  />
);

const preview = (sections: ThemeSection[]) => (
  <PreviewContext.Provider value={true}>{view(sections)}</PreviewContext.Provider>
);

let crashes: () => unknown[][];
beforeEach(() => {
  crashes = watchCrashes();
  mockApi();
});
afterEach(() => vi.restoreAllMocks());

/** Las secciones de la portada (sin el h1 invisible que va cuando ninguna pone título). */
const sectionsIn = (container: HTMLElement) =>
  container.querySelector('main')!.querySelectorAll(':scope > :not(h1.sr-only)').length;

describe('secciones de la portada', () => {
  it.each(TYPES)('%s con todo cargado', { timeout: 30_000 }, async (type) => {
    const { container } = render(view([section(type, FULL[type].data)]));
    await settle(1);
    expect(sectionsIn(container)).toBe(1);
    const shows = FULL[type].shows;
    if (shows) expect(screen.getAllByText(shows).length).toBeGreaterThan(0);

    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    await explore(user, () => container, 20);
    expect(crashes()).toEqual([]);
  });

  it.each(TYPES)('%s recién agregada (sin datos)', async (type) => {
    render(view([section(type, {})]));
    await settle(1);
    expect(crashes()).toEqual([]);
  });

  it('las ocultas no se muestran', () => {
    const { container } = render(view([section('institutional', FULL.institutional.data, false)]));
    expect(sectionsIn(container)).toBe(0);
  });

  it('en el preview anima altas, bajas y secciones que se ocultan', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
    try {
      const all = TYPES.map((t) => section(t, FULL[t].data));
      const { rerender, unmount } = render(preview(all));
      expect(screen.getAllByText('Quiénes somos').length).toBeGreaterThan(0);

      // Se saca una, se oculta otra y se agrega una nueva.
      const next = all
        .filter((s) => s.type !== 'faq')
        .map((s) => (s.type === 'brands' ? { ...s, visible: false } : s))
        .concat({ ...section('institutional', { title: 'Nueva' }), id: 'nueva' });
      rerender(preview(next));
      await act(async () => {
        vi.advanceTimersByTime(20);
      });
      expect(screen.getByText('Nueva')).toBeInTheDocument();
      // La que se sacó sigue en el DOM mientras colapsa…
      expect(screen.getAllByText('Hacen envíos').length).toBeGreaterThan(0);
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      // …y después se va.
      expect(screen.queryByText('Hacen envíos')).not.toBeInTheDocument();
      unmount();
    } finally {
      vi.useRealTimers();
    }
    expect(crashes()).toEqual([]);
  });

  it('Instagram: un post se embebe, un perfil es una tarjeta y Vimeo se reproduce', () => {
    const { rerender } = render(
      view([section('instagram', { video: 'https://www.instagram.com/reel/Cx1-ab_C/' })]),
    );
    expect(screen.getByTitle('Instagram')).toHaveAttribute(
      'src',
      'https://www.instagram.com/p/Cx1-ab_C/embed',
    );

    rerender(view([section('instagram', { video: 'https://instagram.com/tienda.oficial?hl=es' })]));
    expect(screen.getByRole('link', { name: /tienda\.oficial/ })).toHaveAttribute(
      'href',
      'https://instagram.com/tienda.oficial',
    );

    rerender(view([section('instagram', { video: 'https://vimeo.com/123456' })]));
    expect(document.querySelector('iframe')?.getAttribute('src')).toBe(
      'https://player.vimeo.com/video/123456',
    );
    expect(crashes()).toEqual([]);
  });

  it('imagen y texto sin texto es un banner a lo ancho; sin imagen ni título no se muestra', () => {
    const { container, rerender } = render(view([section('image-text', { image: img(9) })]));
    expect(container.querySelector('main img')).toHaveAttribute('src', img(9));
    expect(container.querySelector('main h2')).toBeNull();

    rerender(view([section('image-text', { description: 'solo descripción' })]));
    expect(sectionsIn(container)).toBe(0);
  });

  it('una sección de un tipo que no existe no rompe la portada', () => {
    const { container } = render(view([section('no-existe' as SectionType, {})]));
    expect(sectionsIn(container)).toBe(0);
  });
});

describe('título principal de la portada', () => {
  const section = (type: SectionType, data: Record<string, unknown> = {}) =>
    ({ id: type, type, visible: true, data }) as ThemeSection;
  const home = (sections: ThemeSection[]) =>
    render(
      <HomeSections
        sections={sections}
        products={[]}
        storeName="Puente Oriente"
        productList={defaultTheme.productList}
      />,
    );

  it('si ninguna sección lo pone, va un h1 invisible con el nombre de la tienda', () => {
    home([]);
    expect(screen.getByRole('heading', { level: 1, name: 'Puente Oriente' })).toHaveClass('sr-only');
  });

  it('con un video de portada con título, ese es el h1 (y uno solo)', () => {
    home([section('hero-video', { title: 'Equipá tu gimnasio' })]);
    const titles = screen.getAllByRole('heading', { level: 1 });
    expect(titles).toHaveLength(1);
    expect(titles[0]).toHaveTextContent('Equipá tu gimnasio');
  });
});
