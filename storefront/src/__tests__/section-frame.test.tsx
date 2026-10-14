/**
 * Lo común a todas las secciones de la portada: su marco (fondo, espaciado,
 * en qué dispositivo se ve), que una sección rota no se lleve puesta la
 * página, el inicio vacío a propósito vs. el que nunca se configuró, la
 * jerarquía de títulos (un solo h1) y un único FAQPage para Google.
 */
import type { ThemeSection } from '@tiendafy/types';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeSections } from '../components/store/sections';
import { PreviewContext } from '../components/store/preview';
import { defaultTheme, mergeTheme } from '../lib/theme';
import { mockApi } from '../test/api';
import { renderInStore as render } from '../test/store';

// Una sección que revienta al dibujarse, para probar el límite de errores.
vi.mock('../components/store/sections/instagram', () => ({
  InstagramSection: () => {
    throw new Error('sección rota');
  },
}));

beforeEach(() => {
  mockApi();
});
afterEach(() => vi.restoreAllMocks());

const section = (
  id: string,
  type: string,
  data: Record<string, unknown>,
  extra: Partial<ThemeSection> = {},
) => ({ id, type, visible: true, data, ...extra }) as ThemeSection;

const home = (sections: ThemeSection[], preview = false) =>
  render(
    <PreviewContext.Provider value={preview}>
      <HomeSections
        sections={sections}
        products={[]}
        storeName="Puente Oriente"
        productList={defaultTheme.productList}
      />
    </PreviewContext.Provider>,
  );

const faq = (id: string, ...qa: [string, string][]) =>
  section(id, 'faq', { title: `FAQ ${id}`, items: qa.map(([question, answer]) => ({ question, answer })) });

describe('marco de cada sección', () => {
  it('una sección que se rompe no se muestra y el resto de la portada sigue', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    home([
      section('a', 'institutional', { title: 'Antes' }),
      section('b', 'instagram', { video: 'https://youtube.com/watch?v=x' }),
      section('c', 'institutional', { title: 'Después' }),
    ]);
    expect(screen.getByText('Antes')).toBeInTheDocument();
    expect(screen.getByText('Después')).toBeInTheDocument();
    expect(errors.mock.calls.some((c) => String(c[0]).includes('"instagram" no se pudo mostrar'))).toBe(true);
  });

  it('datos rotos (null en la lista, data null) no rompen nada', () => {
    const theme = mergeTheme({
      sections: [
        null,
        section('p', 'promo-banners', { banners: [null, { image: 'https://cdn.x/a.jpg', title: 'Promo' }] }),
        { id: 'f', type: 'faq', visible: true, data: null },
      ],
    } as never);
    home(theme.sections);
    expect(screen.getByText('Promo')).toBeInTheDocument();
  });

  it('por dispositivo, con CSS (sin saltos al hidratar)', () => {
    const { container } = home([
      section('m', 'institutional', { title: 'Solo compu' }, { hideOn: 'mobile' }),
      section('d', 'institutional', { title: 'Solo celu' }, { hideOn: 'desktop' }),
      section('t', 'institutional', { title: 'En todos' }),
    ]);
    const frame = (text: string) => screen.getByText(text).closest('[data-section-frame]');
    expect(frame('Solo compu')).toHaveClass('max-md:hidden');
    expect(frame('Solo celu')).toHaveClass('md:hidden');
    // Sin estilo ni dispositivo, la sección no lleva marco extra.
    expect(frame('En todos')).toBeNull();
    expect(container.querySelector('main')!.children).toHaveLength(4); // h1 invisible + 3
  });

  it('fondo, espaciado y alineación del comercio', () => {
    home([
      section(
        's',
        'institutional',
        { title: 'Con fondo' },
        {
          style: {
            background: 'custom',
            backgroundColor: '20 20 20',
            paddingTop: 'lg',
            paddingBottom: 'none',
            align: 'left',
          },
        },
      ),
      section('a', 'institutional', { title: 'Tenue' }, { style: { background: 'accent' } }),
    ]);
    const frame = screen.getByText('Con fondo').closest('[data-section-frame]') as HTMLElement;
    expect(frame).toHaveClass('[&>*]:pt-20!', '[&>*]:pb-0!', 'text-left');
    expect(frame.style.backgroundColor).toBe('rgb(20, 20, 20)');
    // Sobre un fondo oscuro, el texto pasa a claro para que se lea.
    expect(frame.style.getPropertyValue('--color-fg')).toBe('255 255 255');
    expect(screen.getByRole('heading', { name: 'Con fondo' })).toHaveClass('text-left');
    expect(
      (screen.getByText('Tenue').closest('[data-section-frame]') as HTMLElement).style.backgroundColor,
    ).toContain('var(--color-primary)');
  });
});

describe('inicio vacío vs. nunca configurado', () => {
  it('si el comercio sacó todas las secciones, el inicio queda vacío (no vuelve el de ejemplo)', () => {
    const theme = mergeTheme({ sections: [] });
    expect(theme.sections).toEqual([]);
    const { container } = home(theme.sections);
    expect(container.querySelector('main')!.children).toHaveLength(1); // solo el h1 invisible
  });

  it('un tema que nunca se configuró muestra las secciones iniciales', () => {
    expect(mergeTheme({}).sections.map((s) => s.type)).toEqual(['carousel', 'featured', 'info-bar']);
  });
});

describe('títulos de la portada', () => {
  it('los títulos de sección son h2 (no saltean niveles debajo del h1)', () => {
    home([section('i', 'institutional', { title: 'Quiénes somos' }), faq('f', ['¿Envían?', 'Sí.'])]);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Quiénes somos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'FAQ f' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('el hero es el h1 solo si abre la portada; más abajo es un h2', () => {
    const hero = section('h', 'hero-video', { title: 'Equipá tu gimnasio' });
    home([section('i', 'institutional', { title: 'Arriba' }), hero]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Puente Oriente');
    expect(screen.getByRole('heading', { level: 2, name: 'Equipá tu gimnasio' })).toBeInTheDocument();
  });

  it('un hero que se oculta en un dispositivo no es el h1 (va el invisible)', () => {
    home([section('h', 'hero-video', { title: 'Equipá tu gimnasio' }, { hideOn: 'mobile' })]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('sr-only');
    expect(screen.getByRole('heading', { level: 2, name: 'Equipá tu gimnasio' })).toBeInTheDocument();
  });
});

describe('preguntas frecuentes para Google', () => {
  it('un solo FAQPage con las preguntas de todas las secciones visibles', () => {
    const { container } = home([
      faq('a', ['¿Envían?', 'Sí, a todo el país.'], ['¿Cuotas?', '']),
      faq('b', ['¿Cambios?', 'Hasta 30 días.']),
      { ...faq('c', ['¿Oculta?', 'No va.']), visible: false },
    ]);
    const scripts = [...container.ownerDocument.querySelectorAll('script[type="application/ld+json"]')];
    const pages = scripts.map((s) => JSON.parse(s.textContent!)).filter((j) => j['@type'] === 'FAQPage');
    expect(pages).toHaveLength(1);
    expect(pages[0].mainEntity.map((q: { name: string }) => q.name)).toEqual(['¿Envían?', '¿Cambios?']);
  });

  it('sin preguntas respondidas no hay FAQPage', () => {
    const { container } = home([faq('a', ['¿Sin respuesta?', ''])]);
    expect(container.ownerDocument.querySelector('script[type="application/ld+json"]')).toBeNull();
  });
});

describe('vista previa del editor', () => {
  it('los banners sin foto se ven como lugar a completar; en la tienda no', () => {
    const banners = section('p', 'promo-banners', { banners: [{ title: 'Hasta 30% off' }] });
    const live = home([banners]);
    expect(screen.queryByText('Hasta 30% off')).not.toBeInTheDocument();
    live.unmount();
    home([banners], true);
    expect(screen.getByText('Hasta 30% off')).toBeInTheDocument();
    expect(screen.getByText('Subí una imagen')).toBeInTheDocument();
  });

  it('el botón de editar usa el nombre propio de la sección', async () => {
    const { container } = home(
      [section('n', 'institutional', { title: 'Hola' }, { name: 'Bloque de marca' })],
      true,
    );
    const region = container.querySelector('[data-tf-focus="section:n"]') as HTMLElement;
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.mouseEnter(region);
    expect(await screen.findByText(/Editar «Bloque de marca»/)).toBeInTheDocument();
  });
});
