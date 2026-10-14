/**
 * La barra de anuncio "uno por vez" (gira, se frena con el mouse, el foco y
 * el botón de pausa, no se mueve con "menos movimiento", cada anuncio con su
 * link) y el color del encabezado según la página (por la ruta, y el inicio
 * transparente sobre la portada que sigue funcionando).
 */
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from '../components/store/StoreHeader';
import { PreviewContext } from '../components/store/preview';
import { headerPageKind } from '../lib/header-page';
import { mergeTheme, type ThemeConfig } from '../lib/theme';
import { fixture, mockApi } from '../test/api';
import { nav } from '../test/next';
import { settle, watchCrashes } from '../test/explore';
import { renderInStore } from '../test/store';

const base = mergeTheme(fixture<ThemeConfig>('/api/v1/theme'));

const ITEMS = [
  { text: 'Envío gratis', link: '/productos' },
  { text: 'Cuotas sin interés', link: '' },
  { text: 'Cupón BIENVENIDA', link: 'https://blog.example.com', newTab: true },
];

function theme(extra: Partial<ThemeConfig> = {}, header: Partial<ThemeConfig['header']> = {}): ThemeConfig {
  return { ...base, ...extra, header: { ...base.header, ...header } };
}

const rotating = (patch: Partial<ThemeConfig['announcement']> = {}) =>
  theme({
    announcement: {
      ...base.announcement,
      show: true,
      animation: 'rotate',
      interval: 3,
      items: ITEMS,
      ...patch,
    },
  });

async function show(t: ThemeConfig, path = '/') {
  nav.at(path);
  const view = renderInStore(
    <PreviewContext.Provider value={false}>
      <Header theme={t} tenantName="Tienda Seed" />
    </PreviewContext.Provider>,
  );
  await settle(2);
  return view;
}

/** El anuncio que se ve (los demás están apilados, ocultos e inertes). */
const shown = () =>
  document.querySelector('[data-tf-focus="announcement"] [aria-hidden="false"]')?.textContent ?? null;
const live = () => document.querySelector('[data-tf-focus="announcement"] [aria-live]')!;
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

/** Simula "reducir movimiento" en el sistema. */
function reducedMotion() {
  return vi.spyOn(window, 'matchMedia').mockImplementation(
    (q) =>
      ({
        matches: q.includes('reduce'),
        media: q,
        addEventListener() {},
        removeEventListener() {},
      }) as never,
  );
}

let crashes: () => unknown[][];
beforeEach(() => {
  mockApi();
  crashes = watchCrashes();
});
afterEach(() => {
  vi.useRealTimers();
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

describe('barra de anuncio: uno por vez', () => {
  it('gira sola cada `interval` segundos, en ronda, sin anunciarlo al lector de pantalla', async () => {
    await show(rotating());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // El primer turno arrancó con el reloj de verdad: pasar el mouse y salir lo reinicia con el falso.
    const group = screen.getByRole('group', { name: 'Anuncios' });
    fireEvent.mouseEnter(group);
    fireEvent.mouseLeave(group);
    expect(shown()).toBe('Envío gratis');
    expect(live()).toHaveAttribute('aria-live', 'off');
    await wait(2900);
    expect(shown()).toBe('Envío gratis');
    await wait(100);
    expect(shown()).toBe('Cuotas sin interés');
    await wait(3000);
    expect(shown()).toBe('Cupón BIENVENIDA');
    await wait(3000);
    expect(shown()).toBe('Envío gratis');
    // Lo automático nunca se anuncia.
    expect(live()).toHaveAttribute('aria-live', 'off');
  });

  it('cada anuncio con su link (y los ocultos, inertes)', async () => {
    await show(rotating());
    const bar = document.querySelector<HTMLElement>('[data-tf-focus="announcement"]')!;
    // Solo el que se ve está en el árbol accesible.
    expect(within(bar).getByRole('link', { name: 'Envío gratis' })).toHaveAttribute('href', '/productos');
    expect(within(bar).queryByRole('link', { name: 'Cupón BIENVENIDA' })).not.toBeInTheDocument();
    const hidden = within(bar).getByRole('link', { name: 'Cupón BIENVENIDA', hidden: true });
    expect(hidden).toHaveAttribute('href', 'https://blog.example.com');
    expect(hidden).toHaveAttribute('target', '_blank');
    expect(hidden.closest('[inert]')).not.toBeNull();
    // Sin link queda el texto solo.
    expect(within(bar).queryByRole('link', { name: 'Cuotas sin interés', hidden: true })).toBeNull();
  });

  it('las flechas pasan de anuncio (en ronda) y eso sí se anuncia', async () => {
    await show(rotating());
    fireEvent.click(screen.getByRole('button', { name: 'Anuncio anterior' }));
    expect(shown()).toBe('Cupón BIENVENIDA');
    expect(live()).toHaveAttribute('aria-live', 'polite');
    fireEvent.click(screen.getByRole('button', { name: 'Anuncio siguiente' }));
    expect(shown()).toBe('Envío gratis');
  });

  it('se frena con el mouse encima y sigue al salir', async () => {
    await show(rotating());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const group = screen.getByRole('group', { name: 'Anuncios' });
    fireEvent.mouseEnter(group);
    await wait(10_000);
    expect(shown()).toBe('Envío gratis');
    fireEvent.mouseLeave(group);
    await wait(3000);
    expect(shown()).toBe('Cuotas sin interés');
  });

  it('se frena con el foco adentro (teclado) y sigue al salir', async () => {
    await show(rotating());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const next = screen.getByRole('button', { name: 'Anuncio siguiente' });
    act(() => next.focus());
    await wait(10_000);
    expect(shown()).toBe('Envío gratis');
    act(() => next.blur());
    await wait(3000);
    expect(shown()).toBe('Cuotas sin interés');
  });

  it('el botón de pausa la frena hasta que se reanuda (WCAG 2.2.2)', async () => {
    await show(rotating());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pause = screen.getByRole('button', { name: 'Pausar los anuncios' });
    expect(pause).toHaveClass('h-10', 'w-10'); // 40 px para el dedo
    fireEvent.click(pause);
    act(() => pause.blur());
    expect(pause).toHaveAccessibleName('Reanudar los anuncios');
    await wait(10_000);
    expect(shown()).toBe('Envío gratis');
    fireEvent.click(pause);
    act(() => pause.blur());
    await wait(3000);
    expect(shown()).toBe('Cuotas sin interés');
  });

  it('con "menos movimiento" no gira sola: quedan las flechas y no hay pausa', async () => {
    reducedMotion();
    await show(rotating());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await wait(20_000);
    expect(shown()).toBe('Envío gratis');
    expect(screen.queryByRole('button', { name: 'Pausar los anuncios' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Anuncio siguiente' }));
    expect(shown()).toBe('Cuotas sin interés');
  });

  it('con un solo anuncio queda fijo (sin flechas ni pausa)', async () => {
    await show(rotating({ items: [ITEMS[0]!, { text: '  ', link: '' }] }));
    expect(screen.getByRole('link', { name: 'Envío gratis' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anuncio siguiente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pausar/ })).not.toBeInTheDocument();
  });
});

describe('barra de anuncio: desplazándose', () => {
  it('la velocidad elegida y un botón de pausa', async () => {
    await show(
      theme({
        announcement: { ...base.announcement, show: true, animation: 'marquee', speed: 'fast', items: ITEMS },
      }),
    );
    const track = document.querySelector<HTMLElement>('.tf-marquee')!;
    expect(track.style.animationDuration).toBe('13s');
    fireEvent.click(screen.getByRole('button', { name: 'Pausar los anuncios' }));
    expect(track.style.animationPlayState).toBe('paused');
    fireEvent.click(screen.getByRole('button', { name: 'Reanudar los anuncios' }));
    expect(track.style.animationPlayState).toBe('');
  });

  it('con "menos movimiento" no hay botón de pausa (la pista no se mueve)', async () => {
    reducedMotion();
    await show(
      theme({ announcement: { ...base.announcement, show: true, animation: 'marquee', items: ITEMS } }),
    );
    expect(screen.queryByRole('button', { name: 'Pausar los anuncios' })).not.toBeInTheDocument();
  });
});

describe('color del encabezado por página', () => {
  const pageColors: ThemeConfig['header']['pageColors'] = {
    home: { bg: '255 255 255', textColor: '' },
    listing: { bg: '230 240 250', textColor: '' },
    product: { bg: '10 60 40', textColor: '' },
    content: { bg: '250 250 250', textColor: '200 0 0' },
    checkout: { bg: '0 0 0', textColor: '' },
  };
  const general = { bg: '27 21 16', textColor: '', pageColors };

  it.each([
    ['/', 'rgb(255, 255, 255)', 'rgb(17, 24, 39)'],
    ['/productos', 'rgb(230, 240, 250)', 'rgb(17, 24, 39)'],
    ['/productos/remera-negra', 'rgb(10, 60, 40)', 'rgb(255, 255, 255)'],
    ['/paginas/envios', 'rgb(250, 250, 250)', 'rgb(200, 0, 0)'],
    ['/contacto', 'rgb(250, 250, 250)', 'rgb(200, 0, 0)'],
    ['/checkout/success', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)'],
    // Lo que no es ninguno de esos usa los generales.
    ['/favoritos', 'rgb(27, 21, 16)', 'rgb(255, 255, 255)'],
  ])('en %s: fondo %s y el texto que se lee', async (path, bg, color) => {
    await show(theme({}, general), path);
    const banner = screen.getByRole('banner');
    expect(banner.style.background).toBe(bg);
    expect(banner.style.color).toBe(color);
    // El aro de los globitos recorta contra el fondo de esta página.
    expect(banner.style.getPropertyValue('--store-header-bg')).toBe(
      bg.replace(/rgb\((\d+), (\d+), (\d+)\)/, '$1 $2 $3'),
    );
  });

  it('una página sin color propio usa el general, aunque otras tengan', async () => {
    await show(theme({}, { bg: '27 21 16', pageColors: { home: pageColors.home! } }), '/productos');
    expect(screen.getByRole('banner').style.background).toBe('rgb(27, 21, 16)');
  });

  it('el inicio transparente sobre la portada gana arriba; al bajar, sólido con el color del inicio', async () => {
    const withHero: ThemeConfig['sections'] = [
      {
        id: 'c',
        type: 'carousel',
        visible: true,
        data: { slides: [{ image: 'https://cdn.example.com/a.jpg' }] },
      },
    ];
    await show(theme({ sections: withHero }, { ...general, transparentOnHome: true }), '/');
    const banner = screen.getByRole('banner');
    expect(banner.style.color).toBe('rgb(255, 255, 255)');
    expect(banner.getAttribute('style')).toContain('linear-gradient');
    Object.defineProperty(window, 'scrollY', { value: 100, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(banner.style.background).toBe('rgb(255, 255, 255)');
    expect(banner.style.color).toBe('rgb(17, 24, 39)');
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('los desplegables del menú y la barra de anuncio no toman el color de la página', async () => {
    await show(
      theme(
        { announcement: { ...base.announcement, show: true, items: [{ text: 'Hola', link: '' }] } },
        general,
      ),
      '/productos/remera-negra',
    );
    const bar = document.querySelector<HTMLElement>('[data-tf-focus="announcement"]')!;
    expect(bar).toHaveClass('bg-primary', 'text-primary-fg');
    expect(bar.getAttribute('style')).toBeNull();
  });
});

describe('headerPageKind', () => {
  it.each([
    ['/', 'home'],
    ['/preview', 'home'],
    ['/productos', 'listing'],
    ['/productos/remera', 'product'],
    ['/paginas/como-comprar', 'content'],
    ['/contacto', 'content'],
    ['/terminos', 'content'],
    ['/privacidad', 'content'],
    ['/arrepentimiento', 'content'],
    ['/checkout', 'checkout'],
    ['/checkout/failure', 'checkout'],
    ['/favoritos', null],
    ['/cuenta', null],
    ['/productosx', null],
  ])('%s → %s', (path, kind) => {
    expect(headerPageKind(path)).toBe(kind);
  });
});
