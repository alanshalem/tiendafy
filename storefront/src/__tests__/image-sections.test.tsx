/**
 * Las secciones de imágenes de la portada (carrusel, hero con video, banners,
 * imagen y texto, marcas): deslizar, pausar, menos movimiento, foto de
 * celular, links sin "#", textos alternativos y que el texto se lea.
 */
import type { SectionType, ThemeSection } from '@tiendafy/types';
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeSections } from '../components/store/HomeSections';
import { defaultTheme } from '../lib/theme';
import { mockApi } from '../test/api';
import { watchCrashes } from '../test/explore';
import { renderInStore as render } from '../test/store';

const img = (n: number) => `https://cdn.example.com/img-${n}.jpg`;
const section = (type: SectionType, data: Record<string, unknown>, id = `s-${type}`): ThemeSection =>
  ({ id, type, visible: true, data }) as ThemeSection;
const home = (sections: ThemeSection[]) =>
  render(
    <HomeSections
      sections={sections}
      products={[]}
      storeName="Tienda"
      productList={defaultTheme.productList}
    />,
  );

/** Simula las preferencias del sistema (menos movimiento, pantalla de celular). */
function mockMedia(match: (query: string) => boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: match(query),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

let crashes: () => unknown[][];
beforeEach(() => {
  crashes = watchCrashes();
  mockApi();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  expect(crashes()).toEqual([]);
});

const slides = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ image: img(i + 1), alt: `Foto ${i + 1}` }));

describe('carrusel', () => {
  const current = () =>
    screen
      .getAllByRole('group')
      .filter((g) => g.getAttribute('aria-roledescription') === 'diapositiva' && !g.hasAttribute('inert'));

  it('se anuncia como carrusel y cada diapositiva dice cuál es; solo la visible se puede enfocar', () => {
    home([section('carousel', { slides: slides(3) })]);
    expect(screen.getByRole('region', { name: 'Carrusel de imágenes' })).toHaveAttribute(
      'aria-roledescription',
      'carrusel',
    );
    expect(current()).toHaveLength(1);
    expect(current()[0]).toHaveAttribute('aria-label', '1 de 3');
    // Las fotos van con su texto alternativo.
    expect(screen.getByAltText('Foto 1')).toBeInTheDocument();
  });

  it('flechas, puntos y teclado mueven la diapositiva; el punto actual lo dice', async () => {
    const user = userEvent.setup({ delay: null });
    home([section('carousel', { slides: slides(3), autoplay: false })]);
    const dots = screen.getAllByRole('button', { name: /Ir a la diapositiva/ });
    expect(dots[0]).toHaveAttribute('aria-current', 'true');
    await user.click(screen.getByRole('button', { name: 'Diapositiva siguiente' }));
    expect(current()[0]).toHaveAttribute('aria-label', '2 de 3');
    expect(dots[1]).toHaveAttribute('aria-current', 'true');
    expect(dots[0]).not.toHaveAttribute('aria-current');
    await user.click(dots[2]!);
    expect(current()[0]).toHaveAttribute('aria-label', '3 de 3');
    // Vuelta al principio, y con el teclado.
    fireEvent.keyDown(screen.getByRole('region'), { key: 'ArrowRight' });
    expect(current()[0]).toHaveAttribute('aria-label', '1 de 3');
    fireEvent.keyDown(screen.getByRole('region'), { key: 'ArrowLeft' });
    expect(current()[0]).toHaveAttribute('aria-label', '3 de 3');
  });

  it('deslizar con el dedo (scroll de la pista) cambia la diapositiva', () => {
    const { container } = home([section('carousel', { slides: slides(3), autoplay: false })]);
    const track = container.querySelector('[aria-roledescription="carrusel"] > div')!;
    Object.defineProperty(track, 'clientWidth', { value: 400, configurable: true });
    track.scrollLeft = 800;
    fireEvent.scroll(track);
    expect(current()[0]).toHaveAttribute('aria-label', '3 de 3');
  });

  it('pasa sola al ritmo elegido, se pausa con el botón y al pasar el mouse', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    home([section('carousel', { slides: slides(3), speed: '3' })]);
    act(() => void vi.advanceTimersByTime(3000));
    expect(current()[0]).toHaveAttribute('aria-label', '2 de 3');

    const region = screen.getByRole('region');
    fireEvent.pointerOver(region);
    act(() => void vi.advanceTimersByTime(9000));
    expect(current()[0]).toHaveAttribute('aria-label', '2 de 3');
    fireEvent.pointerOut(region);

    fireEvent.click(screen.getByRole('button', { name: 'Pausar el carrusel' }));
    act(() => void vi.advanceTimersByTime(9000));
    expect(current()[0]).toHaveAttribute('aria-label', '2 de 3');
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir el carrusel' }));
    act(() => void vi.advanceTimersByTime(3000));
    expect(current()[0]).toHaveAttribute('aria-label', '3 de 3');
  });

  it('con "reducir movimiento" no arranca solo (pero se puede reproducir)', () => {
    mockMedia((q) => q.includes('reduce'));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    home([section('carousel', { slides: slides(2) })]);
    act(() => void vi.advanceTimersByTime(20000));
    expect(current()[0]).toHaveAttribute('aria-label', '1 de 2');
    expect(screen.getByRole('button', { name: 'Reproducir el carrusel' })).toBeInTheDocument();
  });

  it('foto de celular: un <picture> con la fuente para pantallas chicas', () => {
    const { container } = home([
      section('carousel', { slides: [{ image: img(1), mobileImage: img(2), alt: 'A' }] }),
    ]);
    const source = container.querySelector('picture source')!;
    expect(source).toHaveAttribute('media', '(max-width: 767px)');
    expect(source.getAttribute('srcset')).toContain(img(2));
    expect(container.querySelector('picture img')).toHaveAttribute('src', img(1));
  });

  it('link de la diapositiva: sin "#", con nombre; con botón, el botón es el link', () => {
    const { container } = home([
      section('carousel', {
        slides: [
          { image: img(1), link: '/ofertas', alt: 'Ofertas de invierno' },
          { image: img(2), link: 'javascript:alert(1)', title: 'Mal' },
          { image: img(3), title: 'Nuevo', buttonText: 'Ver', link: '/nuevo' },
        ],
      }),
    ]);
    expect(container.querySelector('a[href="#"]')).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    // El link se nombra con el alt (y la foto no lo repite).
    const link = container.querySelector('a[href="/ofertas"]')!;
    expect(link).toHaveTextContent('Ofertas de invierno');
    expect(container.querySelector(`img[src="${img(1)}"]`)).toHaveAttribute('alt', '');
    expect(container.querySelector('a[href="/nuevo"]')).toHaveTextContent('Ver');
  });

  it('sin fotos: el nombre de la tienda y un botón, sin promesas inventadas', () => {
    home([section('carousel', { slides: [] })]);
    expect(screen.getByRole('heading', { level: 2, name: 'Tienda' })).toBeInTheDocument();
    expect(screen.queryByText(/Envíos a todo el país/)).not.toBeInTheDocument();
    expect(screen.queryByText(/compra protegida/)).not.toBeInTheDocument();
  });

  it('muchas diapositivas: "3 / 12" en vez de 12 puntos que no entran en un celular', () => {
    home([section('carousel', { slides: slides(12), autoplay: false })]);
    expect(screen.queryByRole('button', { name: /Ir a la diapositiva/ })).toBeNull();
    expect(screen.getByText('1 / 12')).toBeInTheDocument();
  });
});

describe('hero con video', () => {
  const hero = {
    videoMp4: 'https://cdn.example.com/v.mp4',
    videoWebm: 'https://cdn.example.com/v.webm',
    videoMobile: 'https://cdn.example.com/v-cel.mp4',
    poster: img(1),
    posterMobile: img(2),
    title: 'Nueva temporada',
    buttonText: 'Comprar',
    link: '/productos',
  };

  it('pide el video en el navegador, con botón de pausa', () => {
    const { container } = home([section('hero-video', hero)]);
    const sources = [...container.querySelectorAll('video source')].map((s) => s.getAttribute('src'));
    expect(sources).toEqual([hero.videoWebm, hero.videoMp4]);
    fireEvent.click(screen.getByRole('button', { name: 'Pausar el video' }));
    expect(screen.getByRole('button', { name: 'Reproducir el video' })).toBeInTheDocument();
  });

  it('en celular, el video y la foto de celular', () => {
    mockMedia((q) => q.includes('max-width'));
    const { container } = home([section('hero-video', hero)]);
    expect([...container.querySelectorAll('video source')].map((s) => s.getAttribute('src'))).toEqual([
      hero.videoMobile,
    ]);
    expect(container.querySelector('picture source')?.getAttribute('srcset')).toContain(img(2));
  });

  it('con "reducir movimiento" o ahorro de datos no se baja el video: queda la foto', () => {
    mockMedia((q) => q.includes('reduce'));
    const { container, unmount } = home([section('hero-video', hero)]);
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector(`img[src="${img(1)}"]`)).toBeInTheDocument();
    // Quien quiera, lo reproduce.
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir el video' }));
    expect(container.querySelector('video')).not.toBeNull();
    unmount();
    vi.restoreAllMocks();

    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true } });
    const again = home([section('hero-video', hero)]);
    expect(again.container.querySelector('video')).toBeNull();
  });

  it('segundo botón, alineación a la derecha y texto oscuro sobre velo claro', () => {
    const { container } = home([
      section('hero-video', {
        ...hero,
        secondButtonText: 'Contacto',
        secondLink: '/contacto',
        align: 'right',
        verticalAlign: 'bottom',
        textColor: 'dark',
        overlay: 'light',
      }),
    ]);
    expect(screen.getByRole('link', { name: 'Contacto' })).toHaveAttribute('href', '/contacto');
    const block = screen.getByRole('heading', { name: 'Nueva temporada' }).parentElement!;
    expect(block).toHaveClass('items-end', 'justify-end', 'text-right');
    expect(container.querySelector('.bg-white\\/30')).not.toBeNull();
  });

  it('sin foto ni video, el color de la marca de fondo (no un bloque gris)', () => {
    const { container } = home([section('hero-video', { title: 'Hola' })]);
    const el = container.querySelector('section')!;
    expect(el.getAttribute('style')).toContain('linear-gradient');
  });
});

describe('banners', () => {
  it('promo: sin "#", alt propio, el texto en una franja con degradé y botón', () => {
    const { container } = home([
      section('promo-banners', {
        title: 'Promos',
        banners: [
          { image: img(1), title: 'Hasta 30%', description: 'd', buttonText: 'Ver', link: 'www.x.com' },
          { image: img(2), title: 'Sin link' },
          { image: img(3), alt: 'Cuotas sin interés', link: '/cuotas' },
        ],
      }),
    ]);
    expect(screen.getByRole('heading', { name: 'Promos' })).toBeInTheDocument();
    expect(container.querySelector('a[href="#"]')).toBeNull();
    // "www.x.com" ya no es un link roto (/www.x.com): sale como externo o no sale.
    expect(container.querySelector('a[href="/www.x.com"]')).toBeNull();
    // El título no se lee dos veces (antes alt = título).
    expect(container.querySelector(`img[src="${img(1)}"]`)).toHaveAttribute('alt', '');
    expect(screen.getByAltText('Cuotas sin interés').closest('a')).toHaveAttribute('href', '/cuotas');
    // Sin link: no es un link.
    expect(screen.getByText('Sin link').closest('a')).toBeNull();
    const caption = screen.getByText('Hasta 30%').parentElement!;
    expect(caption.className).toMatch(/bg-linear-to-t/);
    expect(screen.getByText('Hasta 30%')).toHaveClass('line-clamp-2');
  });

  it('columnas por dispositivo y la última fila centrada', () => {
    const { container } = home([
      section('promo-banners', {
        columns: '4',
        columnsMobile: '2',
        ratio: '1x1',
        banners: [1, 2, 3, 4, 5].map((n) => ({ image: img(n), title: `B${n}` })),
      }),
    ]);
    const grid = container.querySelector('.flex-wrap')!;
    expect(grid.className).toContain('[--cols:2]');
    expect(grid.className).toContain('lg:[--cols:4]');
    expect(grid).toHaveClass('justify-center');
    expect(container.querySelector('.aspect-square')).not.toBeNull();
  });

  it('categorías: 2 por fila en celular, nombre centrado con margen', () => {
    const { container } = home([
      section('category-banners', {
        banners: [{ image: img(1), title: 'Accesorios de musculación', link: '/productos?category=x' }],
      }),
    ]);
    expect(container.querySelector('.flex-wrap')!.className).toContain('[--cols:2]');
    const name = screen.getByText('Accesorios de musculación');
    expect(name).toHaveClass('break-words', 'line-clamp-3');
    expect(name.parentElement).toHaveClass('items-center', 'justify-center');
    expect(name.closest('a')).toHaveAttribute('href', '/productos?category=x');
  });

  it('un banner con link y sin ningún texto igual tiene nombre', () => {
    const { container } = home([section('promo-banners', { banners: [{ image: img(1), link: '/x' }] })]);
    expect(container.querySelector('a[href="/x"]')).toHaveTextContent('Ver más');
  });
});

describe('imagen y texto', () => {
  it('"Claro" sobre la página clara va sobre un recuadro oscuro', () => {
    home([section('image-text', { image: img(1), title: 'Historia', textColor: 'light' })]);
    const block = screen.getByRole('heading', { name: 'Historia' }).parentElement!;
    expect(block).toHaveClass('text-white');
    expect(block.className).toContain('bg-[rgb(17_24_39)]');
  });

  it('imagen a la derecha, texto primero en celular, botón con link y sin "#"', () => {
    const { container } = home([
      section('image-text', {
        image: img(1),
        alt: 'El local',
        title: 'Historia',
        buttonText: 'Conocenos',
        link: '/nosotros',
        imagePosition: 'right',
        mobileOrder: 'text',
        ratio: '1x1',
        buttonStyle: 'outline',
      }),
    ]);
    const photo = screen.getByAltText('El local');
    const imageCol = photo.closest('.aspect-square')!.parentElement!;
    expect(imageCol).toHaveClass('order-2', 'md:order-2');
    expect(screen.getByRole('link', { name: 'Conocenos' })).toHaveClass('border-2');
    expect(container.querySelector('a[href="#"]')).toBeNull();
  });

  it('un botón sin link no se dibuja (antes era un link a "#")', () => {
    home([section('image-text', { image: img(1), title: 'T', buttonText: 'Ir' })]);
    expect(screen.queryByText('Ir')).toBeNull();
  });

  it('proporción original: un alto máximo y foto de celular en <picture>', () => {
    const { container } = home([
      section('image-text', { image: img(1), mobileImage: img(2), title: 'T', ratio: 'original' }),
    ]);
    const tag = container.querySelector('picture img')!;
    expect(tag.className).toContain('max-h-');
    expect(container.querySelector('picture source')?.getAttribute('srcset')).toContain(img(2));
  });
});

describe('marcas', () => {
  const logos = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ image: img(i + 1), name: `Marca ${i + 1}` }));

  it('cada logo con su nombre; con link, va al link', () => {
    home([
      section('brands', {
        title: 'Marcas',
        logos: [...logos(2), { image: img(9), name: 'Acme', link: '/acme' }],
      }),
    ]);
    expect(screen.getByAltText('Marca 1')).toBeInTheDocument();
    expect(screen.getByAltText('Acme').closest('a')).toHaveAttribute('href', '/acme');
  });

  it('en movimiento: la copia no se enfoca y hay botón de pausa', () => {
    const { container } = home([section('brands', { logos: logos(6).map((l) => ({ ...l, link: '/m' })) })]);
    const copy = container.querySelector('.tf-marquee > [aria-hidden="true"]')!;
    expect(copy).toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Pausar las marcas' }));
    expect(container.querySelector('.tf-marquee')).toHaveStyle({ animationPlayState: 'paused' });
  });

  it('grilla fija, velocidad y gris', () => {
    const { container, rerender } = home([
      section('brands', { logos: logos(6), layout: 'grid', grayscale: true }),
    ]);
    expect(container.querySelector('.tf-marquee')).toBeNull();
    expect(within(container).getByAltText('Marca 1')).toHaveClass('grayscale');
    rerender(
      <HomeSections
        sections={[section('brands', { logos: logos(2), layout: 'marquee', speed: 'fast' })]}
        products={[]}
        storeName="Tienda"
        productList={defaultTheme.productList}
      />,
    );
    expect(container.querySelector('.tf-marquee')).toHaveStyle({ animationDuration: '13s' });
  });
});
