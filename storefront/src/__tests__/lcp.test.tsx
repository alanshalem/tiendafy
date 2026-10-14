/**
 * La foto de portada es lo más grande que se ve al abrir la tienda (el LCP):
 * va con prioridad, y SOLO ella. El resto de las imágenes de la portada se
 * piden al acercarse, para no competirle el ancho de banda.
 */
import type { SectionType, ThemeSection } from '@tiendafy/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { HomeSections } from '../components/store/sections';
import { Footer } from '../components/store/StoreFooter';
import { defaultTheme } from '../lib/theme';
import { mockApi } from '../test/api';
import { renderInStore as render } from '../test/store';

beforeEach(() => {
  mockApi();
});

const img = (n: number) => `https://cdn.example.com/img-${n}.jpg`;
const section = (id: string, type: SectionType, data: Record<string, unknown>): ThemeSection =>
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

const urgent = (c: HTMLElement) =>
  [...c.querySelectorAll('img[fetchpriority="high"]')].map((i) => i.getAttribute('src'));

describe('la imagen de portada', () => {
  it('el primer slide del carrusel que abre la portada va con prioridad; los demás no', () => {
    const { container } = home([
      section('a', 'carousel', { images: [img(1), img(2)] }),
      section('b', 'carousel', { images: [img(3)] }),
    ]);
    expect(urgent(container)).toEqual([img(1)]);
  });

  it('un hero con video lleva prioridad en el póster solo si abre la portada', () => {
    const poster = { poster: img(4), title: 'Hola' };
    expect(urgent(home([section('h', 'hero-video', poster)]).container)).toEqual([img(4)]);
    expect(
      urgent(
        home([section('i', 'institutional', { title: 'Hola' }), section('h', 'hero-video', poster)])
          .container,
      ),
    ).toEqual([]);
  });

  it('una grilla de banners que abre la portada prioriza el primero', () => {
    const banners = {
      banners: [
        { image: img(5), title: 'A' },
        { image: img(6), title: 'B' },
      ],
    };
    expect(urgent(home([section('p', 'promo-banners', banners)]).container)).toEqual([img(5)]);
  });
});

describe('el resto de las imágenes', () => {
  it('se piden al acercarse (lazy)', () => {
    const { container } = home([
      section('a', 'carousel', { images: [img(1)] }),
      section('t', 'image-text', { image: img(2), title: 'Nosotros' }),
      section('n', 'newsletter', { image: img(3) }),
      section('b', 'brands', { images: [img(4)] }),
      section('q', 'testimonials', { items: [{ quote: 'Bien', photo: img(5) }] }),
    ]);
    for (const n of [2, 3, 4, 5]) {
      const tags = container.querySelectorAll(`img[src="${img(n)}"]`);
      expect(tags.length).toBeGreaterThan(0);
      tags.forEach((t) => expect(t).toHaveAttribute('loading', 'lazy'));
    }
  });
});

describe('el pie', () => {
  it('los logos de medios de pago no se precargan: van lazy', () => {
    const theme = {
      ...defaultTheme,
      footer: { ...defaultTheme.footer, showPaymentLogos: true, paymentLogos: ['visa', 'mastercard'] },
    };
    const { container } = render(<Footer theme={theme} tenantName="Tienda" />);
    const logos = container.querySelectorAll('img[src^="/payment-logos/"]');
    expect(logos).toHaveLength(2);
    logos.forEach((l) => expect(l).toHaveAttribute('loading', 'lazy'));
  });

  it('los logos dicen qué medio son y reservan su lugar', () => {
    const theme = {
      ...defaultTheme,
      footer: { ...defaultTheme.footer, showPaymentLogos: true, paymentLogos: ['visa', 'pago-facil'] },
    };
    const { container } = render(<Footer theme={theme} tenantName="Tienda" />);
    const logos = [...container.querySelectorAll('img[src^="/payment-logos/"]')];
    expect(logos.map((l) => l.getAttribute('alt'))).toEqual(['Visa', 'Pago Fácil']);
    logos.forEach((l) => {
      expect(l).toHaveAttribute('width');
      expect(l).toHaveAttribute('height');
    });
  });
});
