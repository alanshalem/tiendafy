/**
 * Las secciones de contenido de la portada (productos, preguntas, barra de
 * información, video, testimonios, newsletter e institucional) con las
 * opciones de la fase 2 del editor: lo que cada opción cambia en la tienda
 * y los arreglos de lo que se veía mal (palabras largas que desbordaban,
 * saltos de línea perdidos, links "#", columnas fijas…).
 */
import type { SectionStyle, SectionType, ThemeSection } from '@tiendafy/types';
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeSections } from '../components/store/sections';
import { PreviewContext } from '../components/store/preview';
import { SectionProductsContext } from '../components/store/SectionProductsContext';
import type { StoreProduct } from '../components/store/ProductCard';
import { defaultTheme } from '../lib/theme';
import { mockApi } from '../test/api';
import { renderInStore } from '../test/store';

const product = (i: number, extra: Partial<StoreProduct> = {}): StoreProduct => ({
  id: `p-${i}`,
  name: `Producto ${i}`,
  slug: `producto-${i}`,
  priceAmount: 1_000_00,
  currency: 'ARS',
  compareAtAmount: null,
  image: null,
  images: [],
  variantId: `v-${i}`,
  variantLabel: 'Única',
  variantCount: 1,
  stock: null,
  ...extra,
});
const catalog = [1, 2, 3, 4, 5, 6].map((i) => product(i, i === 3 ? { compareAtAmount: 2_000_00 } : {}));

const section = (
  type: SectionType,
  data: Record<string, unknown>,
  extra: { id?: string; style?: SectionStyle } = {},
): ThemeSection => ({ id: extra.id ?? `s-${type}`, type, visible: true, data, ...extra }) as ThemeSection;

function home(
  sections: ThemeSection[],
  { resolved = {}, preview = false }: { resolved?: Record<string, StoreProduct[]>; preview?: boolean } = {},
) {
  return renderInStore(
    <PreviewContext.Provider value={preview}>
      <SectionProductsContext.Provider value={resolved}>
        <HomeSections
          sections={sections}
          products={catalog}
          storeName="Tienda"
          productList={defaultTheme.productList}
        />
      </SectionProductsContext.Provider>
    </PreviewContext.Provider>,
  );
}

beforeEach(() => {
  mockApi();
});
afterEach(() => vi.restoreAllMocks());

describe('preguntas frecuentes', () => {
  const long = 'https://una-direccion-larguisima.example.com/' + 'x'.repeat(200);

  it('una palabra larguísima corta en vez de empujar la flecha; la respuesta respeta los saltos', () => {
    home([section('faq', { items: [{ question: long, answer: 'Uno\nDos' }] })]);
    const q = screen.getByText(long);
    expect(q).toHaveClass('min-w-0', 'wrap-anywhere');
    expect(q.parentElement!.querySelector('svg')).toHaveClass('shrink-0');
    expect(screen.getByText(/Uno/)).toHaveClass('whitespace-pre-line');
  });

  it('título: sin dato, el de siempre; vacío a propósito, sin encabezado', () => {
    const items = [{ question: 'P', answer: 'R' }];
    const { unmount } = home([section('faq', { items })]);
    expect(screen.getByRole('heading', { name: 'Preguntas frecuentes' })).toBeInTheDocument();
    unmount();
    home([section('faq', { items, title: '' })]);
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('"abrir la primera" deja solo la primera abierta', () => {
    const items = [
      { question: 'Una', answer: 'A' },
      { question: 'Otra', answer: 'B' },
    ];
    const { container } = home([section('faq', { items, openFirst: true })]);
    const details = container.querySelectorAll('details');
    expect(details[0]).toHaveAttribute('open');
    expect(details[1]).not.toHaveAttribute('open');
  });
});

describe('barra de información', () => {
  const item = (title: string, extra: Record<string, unknown> = {}) => ({ icon: 'card', title, ...extra });

  it('con 4 ítems van los 4 en una fila (antes el cuarto quedaba solo abajo)', () => {
    const { container } = home([section('info-bar', { items: ['A', 'B', 'C', 'D'].map((t) => item(t)) })]);
    const grid = container.querySelector('section > div')!;
    expect(grid).toHaveClass('lg:grid-cols-4');
    expect(grid).not.toHaveClass('sm:grid-cols-3');
  });

  it('sin ítems muestra los mismos que arranca el editor', () => {
    home([section('info-bar', {})]);
    for (const t of ['Envíos a todo el país', 'Pagá con Mercado Pago', 'Compra protegida'])
      expect(screen.getByText(t)).toBeInTheDocument();
  });

  it('un ítem vacío no deja un casillero; el ícono propio reemplaza al del kit', () => {
    const { container } = home([
      section('info-bar', {
        items: [item(''), item('Con imagen', { image: 'https://cdn.example.com/i.png' })],
      }),
    ]);
    expect(container.querySelector('section > div')!.children).toHaveLength(1);
    expect(container.querySelector('img[src="https://cdn.example.com/i.png"]')).toBeInTheDocument();
  });

  it('los links van como link de la tienda (nunca "#"); los inválidos quedan como texto', () => {
    home([
      section('info-bar', {
        items: [item('Envíos', { link: '/paginas/envios' }), item('Roto', { link: '#' })],
      }),
    ]);
    expect(screen.getByRole('link', { name: /Envíos/ })).toHaveAttribute('href', '/paginas/envios');
    expect(screen.queryByRole('link', { name: /Roto/ })).toBeNull();
  });

  it('en el celular: apilados como un bloque (íconos alineados), de a dos o deslizables', () => {
    const items = ['A', 'B', 'C'].map((t) => item(t));
    const grid = (layout?: string) => {
      const { container, unmount } = home([section('info-bar', { items, mobileLayout: layout })]);
      const cls = container.querySelector('section > div')!.className;
      unmount();
      return cls;
    };
    expect(grid()).toContain('w-fit');
    expect(grid('grid')).toContain('grid-cols-2');
    expect(grid('carousel')).toContain('overflow-x-auto');
  });
});

describe('Instagram / video', () => {
  it('un Short va vertical, por youtube-nocookie y con carga diferida', () => {
    const { container } = home([section('instagram', { video: 'https://youtube.com/shorts/dQw4w9WgXcQ' })]);
    const frame = container.querySelector('iframe')!;
    expect(frame.src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
    expect(frame).toHaveAttribute('loading', 'lazy');
    expect(frame.getAttribute('allow')).toContain('encrypted-media');
    expect(frame.parentElement).toHaveClass('aspect-[9/16]');
  });

  it('la proporción elegida manda; título y texto opcionales', () => {
    const { container } = home([
      section('instagram', {
        video: 'https://youtu.be/dQw4w9WgXcQ',
        aspect: '1:1',
        title: 'Cómo se usa',
        caption: 'Paso 1\nPaso 2',
      }),
    ]);
    expect(container.querySelector('iframe')!.parentElement).toHaveClass('aspect-square');
    expect(screen.getByRole('heading', { name: 'Cómo se usa' })).toBeInTheDocument();
    expect(screen.getByText(/Paso 1/)).toHaveClass('whitespace-pre-line');
    expect(container.querySelector('iframe')).toHaveAttribute('title', 'Cómo se usa');
  });

  it('un link que no se puede embeber no se dibuja (antes: recuadro gris); en la vista previa avisa', () => {
    const bad = section('instagram', { video: 'https://otra-pagina.com/video' });
    const { container, unmount } = home([bad]);
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('main section')).toBeNull();
    unmount();
    home([bad], { preview: true });
    expect(screen.getByText(/Este link no se puede mostrar en la tienda/)).toBeInTheDocument();
  });
});

describe('testimonios', () => {
  it('estrellas con nombre accesible; la cita respeta los saltos de línea', () => {
    home([section('testimonials', { items: [{ quote: 'Muy bueno\nVolvería', name: 'Ana', rating: '4' }] })]);
    expect(screen.getByRole('img', { name: '4 de 5 estrellas' })).toBeInTheDocument();
    expect(screen.getByText(/Muy bueno/)).toHaveClass('whitespace-pre-line');
  });

  it('sin nombre ni foto no hay avatar con un "·"', () => {
    const { container } = home([section('testimonials', { items: [{ quote: 'Anónimo y contento' }] })]);
    expect(container.querySelector('figcaption')).toBeNull();
    expect(screen.queryByText('·')).toBeNull();
  });

  it('título vacío a propósito oculta el encabezado; sin dato va el de siempre', () => {
    const items = [{ quote: 'Bien' }];
    const { unmount } = home([section('testimonials', { items })]);
    expect(screen.getByRole('heading', { name: 'Lo que dicen nuestros clientes' })).toBeInTheDocument();
    unmount();
    home([section('testimonials', { items, title: '' })]);
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('en grilla la última fila queda centrada; en carrusel se deslizan', () => {
    const items = [1, 2, 3, 4].map((n) => ({ quote: `Opinión ${n}` }));
    const { container, unmount } = home([section('testimonials', { items })]);
    expect(container.querySelector('.flex-wrap')).toHaveClass('justify-center');
    unmount();
    const car = home([section('testimonials', { items, layout: 'carousel' })]);
    expect(car.container.querySelector('.snap-x')).toBeInTheDocument();
  });
});

describe('newsletter', () => {
  it('la imagen va optimizada (next/image, lazy) y la letra chica abajo del formulario', () => {
    const { container } = home([
      section('newsletter', {
        image: 'https://cdn.example.com/n.jpg',
        legalText: 'Te podés dar de baja cuando quieras.',
      }),
    ]);
    expect(container.querySelector('img[src="https://cdn.example.com/n.jpg"]')).toHaveAttribute(
      'loading',
      'lazy',
    );
    expect(screen.getByText('Te podés dar de baja cuando quieras.')).toBeInTheDocument();
  });

  it('partida: imagen a un lado y el texto alineado a la izquierda', () => {
    const { container } = home([
      section('newsletter', { image: 'https://cdn.example.com/n.jpg', layout: 'split', title: 'Sumate' }),
    ]);
    expect(container.querySelector('.max-w-5xl.grid')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sumate' }).parentElement).toHaveClass('text-left');
  });

  it('con un fondo elegido en "Diseño de la sección" no pone el suyo', () => {
    const { container, unmount } = home([section('newsletter', {})]);
    expect(container.querySelector('main section')).toHaveClass('bg-black/[0.03]');
    unmount();
    const styled = home([section('newsletter', {}, { style: { background: 'accent' } })]);
    expect(styled.container.querySelector('main section')).not.toHaveClass('bg-black/[0.03]');
  });
});

describe('institucional', () => {
  it('respeta los saltos de línea y suma un botón con link de la tienda', () => {
    home([
      section('institutional', {
        title: 'Nosotros',
        description: 'Primera línea\nSegunda línea',
        buttonText: 'Conocenos',
        link: '/paginas/nosotros',
      }),
    ]);
    expect(screen.getByText(/Primera línea/)).toHaveClass('whitespace-pre-line');
    expect(screen.getByRole('link', { name: 'Conocenos' })).toHaveAttribute('href', '/paginas/nosotros');
  });

  it('sin link el botón no se dibuja (nunca un "#"); la alineación sale del diseño de la sección', () => {
    const { container } = home([
      section('institutional', { title: 'Nosotros', buttonText: 'Conocenos' }, { style: { align: 'left' } }),
    ]);
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('main section')).toHaveClass('text-left');
  });
});
