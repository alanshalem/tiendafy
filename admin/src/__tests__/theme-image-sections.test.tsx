/**
 * Las secciones de imágenes (hero, carrusel, banners, imagen y texto,
 * marcas): la migración de sus datos viejos, el normalizador tolerante, las
 * medidas recomendadas según cómo se muestran y sus editores.
 */
import {
  THEME_MIGRATIONS,
  THEME_SCHEMA_VERSION,
  createSection,
  migrateTheme,
  normalizeSection,
  normalizeTheme,
  sectionData,
  upgradeBrandsData,
  upgradeCarouselData,
  type SectionType,
  type ThemeSection,
} from '@tiendafy/types';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionPanel } from '../pages/theme-editor/sections/SectionPanel';
import {
  UPLOADS,
  bannerIdeal,
  bannerMobileIdeal,
  carouselIdeal,
  carouselMobileIdeal,
  imageTextIdeal,
} from '../lib/uploads';
import { mockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderWithProviders } from '../test/render';

const img = (n: number) => `https://cdn.example/img-${n}.jpg`;

describe('migración 1 → 2 (carrusel y marcas)', () => {
  const v1 = {
    schemaVersion: 1,
    sections: [
      {
        id: 'c',
        type: 'carousel',
        visible: true,
        data: { images: [img(1), '', 'javascript:alert(1)', img(2)], fullHeightMobile: true },
      },
      { id: 'c2', type: 'carousel', visible: true, data: { images: [img(3)], fullHeightMobile: false } },
      { id: 'b', type: 'brands', visible: true, data: { title: 'Marcas', images: [img(4), img(5)] } },
      { id: 'f', type: 'faq', visible: true, data: { title: 'Dudas', images: ['no se toca'] } },
    ],
  };

  it('es la última y sube la versión', () => {
    expect(THEME_MIGRATIONS.at(-1)).toMatchObject({ from: 1, to: 2 });
    expect(THEME_SCHEMA_VERSION).toBe(2);
  });

  it('pasa las fotos a diapositivas y logos, y el alto de celular', () => {
    const v2 = migrateTheme(v1);
    expect(v2.schemaVersion).toBe(2);
    const [c, c2, b, f] = v2.sections as ThemeSection[];
    expect(c!.data).toEqual({ slides: [{ image: img(1) }, { image: img(2) }], heightMobile: 'full' });
    expect(c2!.data).toEqual({ slides: [{ image: img(3) }], heightMobile: 'auto' });
    expect(b!.data).toEqual({ title: 'Marcas', logos: [{ image: img(4) }, { image: img(5) }] });
    // Otro tipo con un campo que se llama igual no se toca.
    expect(f!.data).toEqual({ title: 'Dudas', images: ['no se toca'] });
    // Ya migrado: no se vuelve a aplicar.
    expect(migrateTheme(v2)).toEqual(v2);
  });

  it('el tema viejo se ve igual: mismas fotos, mismo alto, pasan solas con puntos', () => {
    const theme = normalizeTheme(v1 as never);
    const carousel = sectionData(theme.sections[0] as ThemeSection & { type: 'carousel' });
    expect(carousel.slides.map((s) => s.image)).toEqual([img(1), img(2)]);
    expect(carousel).toMatchObject({
      height: 'medium',
      heightMobile: 'full',
      autoplay: true,
      speed: '5',
      indicators: true,
    });
    // Sin textos ni velo: la foto sola, como antes.
    expect(carousel.slides[0]).toMatchObject({ title: '', overlay: 'none', link: '', alt: '' });
    const brands = sectionData(theme.sections[2] as ThemeSection & { type: 'brands' });
    expect(brands).toMatchObject({ layout: 'auto', speed: 'normal', grayscale: false });
    expect(brands.logos.map((l) => l.name)).toEqual(['', '']);
  });

  it('tolera cualquier cosa', () => {
    for (const data of [null, 'x', 3, [], { images: 'x' }, { images: [null, 3] }, { slides: 'x' }]) {
      const theme = { schemaVersion: 1, sections: [{ id: 'c', type: 'carousel', data }] };
      expect(() => migrateTheme(theme)).not.toThrow();
      expect(() => normalizeTheme(theme as never)).not.toThrow();
    }
    expect(upgradeCarouselData({ images: [null, 3] })).toEqual({ slides: [] });
    expect(migrateTheme({ schemaVersion: 1, sections: 'x' }).schemaVersion).toBe(2);
  });

  it('si ya hay diapositivas, manda la lista nueva (una pestaña vieja pudo dejar las dos)', () => {
    expect(upgradeCarouselData({ slides: [{ image: img(9) }], images: [img(1)] })).toEqual({
      slides: [{ image: img(9) }],
    });
    expect(upgradeBrandsData({ logos: [], images: [img(1)] })).toEqual({ logos: [] });
  });
});

describe('normalizador tolerante', () => {
  it('data vieja que llega sin pasar por la migración (un postMessage, un JSON a mano)', () => {
    const s = normalizeSection({ id: 'c', type: 'carousel', visible: true, data: { images: [img(1)] } })!;
    expect((s.data.slides as { image: string }[])[0]!.image).toBe(img(1));
    expect(s.data.images).toBeUndefined();
    expect(sectionData({ type: 'brands', data: { images: [img(2)] } }).logos[0]!.image).toBe(img(2));
  });

  it('los banners viejos conservan su render: 3 columnas, 16:9, texto abajo con degradé', () => {
    const promo = sectionData({ type: 'promo-banners', data: { banners: [{ image: img(1), title: 'A' }] } });
    expect(promo).toMatchObject({
      columns: '3',
      columnsMobile: '1',
      ratio: '16x9',
      textPosition: 'bottom-left',
      overlay: 'medium',
      title: '',
    });
    // Las categorías ahora van de a 2 en celular (antes una por fila: dos pantallas de scroll).
    const cats = sectionData({ type: 'category-banners', data: { banners: [] } });
    expect(cats).toMatchObject({ columns: '3', columnsMobile: '2', ratio: '1x1', textPosition: 'center' });
  });

  it('el hero viejo: texto blanco al centro, alto grande; imagen y texto: imagen a la izquierda', () => {
    expect(sectionData({ type: 'hero-video', data: {} })).toMatchObject({
      align: 'center',
      verticalAlign: 'center',
      textColor: 'light',
      height: 'large',
      overlay: 'medium',
      secondButtonText: '',
    });
    expect(sectionData({ type: 'image-text', data: { textColor: 'light' } })).toMatchObject({
      textColor: 'light',
      imagePosition: 'left',
      mobileOrder: 'image',
      ratio: 'original',
      buttonStyle: 'solid',
    });
  });

  it('una sección nueva trae contenido de ejemplo con la forma nueva', () => {
    expect(createSection('carousel').data).toMatchObject({ slides: [], autoplay: true });
    expect(createSection('brands').data).toMatchObject({ logos: [] });
    const promo = createSection('promo-banners').data.banners as { link: string; newTab: boolean }[];
    expect(promo).toHaveLength(3);
    expect(promo[0]).toMatchObject({ link: '/productos', newTab: false });
  });
});

describe('medida recomendada = como se muestra', () => {
  it('banners: el ancho de una columna al doble, nunca menos que el celular', () => {
    // 3 columnas de 416 px → 832; pero en celular va a lo ancho (1080).
    expect(bannerIdeal({ ratio: '16x9', columns: 3, columnsMobile: 1, fullWidth: false })).toEqual({
      width: 1080,
      height: 610,
    });
    // Es la ficha por defecto: la misma cuenta.
    expect(UPLOADS.promoBanner.ideal).toEqual({ width: 1080, height: 610 });
    // Con foto propia de celular, la de computadora solo cubre la computadora.
    expect(
      bannerIdeal({ ratio: '1x1', columns: 3, columnsMobile: 2, fullWidth: false, hasMobileImage: true }),
    ).toEqual({ width: 830, height: 830 });
    expect(UPLOADS.categoryBanner.ideal).toEqual({ width: 830, height: 830 });
    // Una sola columna a lo ancho de la pantalla: grande, con tope.
    expect(bannerIdeal({ ratio: '3x1', columns: 1, columnsMobile: 1, fullWidth: true })).toEqual({
      width: 2400,
      height: 800,
    });
    expect(bannerMobileIdeal('4x5', 2)).toEqual({ width: 540, height: 680 });
  });

  it('carrusel: según el alto elegido, en computadora y en celular', () => {
    expect(carouselIdeal('adapt')).toEqual({ width: 1580, height: 600 });
    expect(carouselIdeal('medium')).toEqual({ width: 1920, height: 610 });
    expect(carouselIdeal('full')).toEqual({ width: 1920, height: 1080 });
    expect(carouselMobileIdeal('auto', 'adapt')).toEqual({ width: 1080, height: 1350 });
    expect(carouselMobileIdeal('full', 'medium')).toEqual({ width: 1080, height: 1920 });
  });

  it('imagen y texto: media columna; sola, el contenedor', () => {
    expect(imageTextIdeal('1x1', false)).toEqual({ width: 1200, height: 1200 });
    expect(imageTextIdeal('16x9', true)).toEqual({ width: 1600, height: 900 });
    // Antes pedía 1270×300 para un lugar de media columna.
    expect(UPLOADS.imageText.ideal).toEqual({ width: 1200, height: 900 });
  });
});

/* ---------------------------------------------------------------- editores */

let crashes: () => unknown[][];
beforeEach(() => {
  crashes = watchCrashes();
});
afterEach(() => {
  vi.restoreAllMocks();
});

function Harness({
  type,
  data = {},
  onData,
}: {
  type: SectionType;
  data?: Record<string, unknown>;
  onData: (d: Record<string, unknown>) => void;
}) {
  const [section, setSection] = useState<ThemeSection>({ id: 's1', type, visible: true, data });
  return (
    <SectionPanel
      section={section}
      onBack={() => {}}
      onChange={(next) => {
        setSection(next);
        onData(next.data);
      }}
    />
  );
}

const user = () => userEvent.setup({ delay: null, pointerEventsCheck: 0 });
const last = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)![0] as Record<string, unknown>;

describe('editores', () => {
  it('carrusel: diapositiva nueva con texto, posición y opciones', async () => {
    mockApi();
    const onData = vi.fn();
    const u = user();
    renderWithProviders(<Harness type="carousel" onData={onData} />);
    await settle(2);
    await u.click(await screen.findByRole('button', { name: /Agregar diapositiva/ }));
    await u.type(screen.getByLabelText('Título (opcional)'), 'Invierno');
    await u.type(screen.getByLabelText('Texto alternativo'), 'Campera roja');
    // La posición se elige en la grilla de 3×3 (radios).
    await u.click(screen.getByRole('radio', { name: 'Abajo a la izquierda' }));
    const slide = (last(onData).slides as Record<string, unknown>[])[0]!;
    expect(slide).toMatchObject({ title: 'Invierno', alt: 'Campera roja', textPosition: 'bottom-left' });

    await u.click(screen.getByLabelText('Pasar solas'));
    expect(last(onData).autoplay).toBe(false);
    await u.selectOptions(screen.getByLabelText('Alto en celular'), 'full');
    expect(last(onData).heightMobile).toBe('full');
    // La medida recomendada sigue al alto elegido.
    await u.selectOptions(screen.getByLabelText('Alto en computadora'), 'large');
    expect(screen.getAllByText('Ideal 1920×800 px').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ideal 1080×1920 px').length).toBeGreaterThan(0);
    expect(crashes()).toEqual([]);
  });

  it('carrusel: avisa si una diapositiva con texto no oscurece la foto', async () => {
    mockApi();
    renderWithProviders(
      <Harness type="carousel" data={{ slides: [{ image: img(1), title: 'Hola' }] }} onData={() => {}} />,
    );
    expect(await screen.findByText(/el texto blanco puede no leerse/)).toBeInTheDocument();
  });

  it('hero: segundo botón, posición a la derecha y aviso de contraste', async () => {
    mockApi();
    const onData = vi.fn();
    const u = user();
    renderWithProviders(
      <Harness type="hero-video" data={{ poster: img(1), title: 'Hola' }} onData={onData} />,
    );
    await settle(2);
    await u.click(screen.getByRole('radio', { name: 'Abajo a la derecha' }));
    expect(last(onData)).toMatchObject({ align: 'right', verticalAlign: 'bottom' });
    await u.selectOptions(screen.getByLabelText(/Oscurecer el fondo/), 'none');
    expect(screen.getByText(/no se lee/)).toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText('Color del texto'), 'dark');
    expect(screen.getByLabelText(/Aclarar el fondo/)).toBeInTheDocument();
    await u.type(screen.getByLabelText('Texto del segundo botón (opcional)'), 'Contacto');
    expect(screen.getByText(/aparece cuando le elegís un link/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Link del segundo botón' })).toBeInTheDocument();
    expect(crashes()).toEqual([]);
  });

  it('banners de categorías: elegir la categoría completa nombre, link y foto', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/products', { items: [{ images: [] }, { images: [{ url: img(7) }] }], total: 2 });
    const onData = vi.fn();
    const u = user();
    renderWithProviders(
      <Harness
        type="category-banners"
        data={{ banners: [{ image: '', title: '', link: '', show: true }] }}
        onData={onData}
      />,
    );
    const select = await screen.findByLabelText('Categoría');
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBeGreaterThan(1));
    await u.selectOptions(select, within(select).getAllByRole('option')[1]!);
    await waitFor(() =>
      expect((last(onData).banners as Record<string, unknown>[])[0]).toMatchObject({
        title: 'Musculación',
        link: '/productos?category=musculacion',
        image: img(7),
      }),
    );
    // Pidió los productos de esa categoría.
    expect(
      api.calls.some((c) => c.path.startsWith('/api/v1/products?') && c.path.includes('categoryId=')),
    ).toBe(true);
    expect(crashes()).toEqual([]);
  });

  it('banners de promo: columnas, forma y medida recomendada que la sigue', async () => {
    mockApi();
    const onData = vi.fn();
    const u = user();
    renderWithProviders(
      <Harness type="promo-banners" data={{ banners: [{ image: '', title: 'A' }] }} onData={onData} />,
    );
    await settle(2);
    await u.selectOptions(screen.getByLabelText('Forma de las imágenes'), '1x1');
    await u.selectOptions(screen.getByLabelText('En computadora'), '2');
    await u.type(screen.getByLabelText('Título de la sección (opcional)'), 'Promos');
    expect(last(onData)).toMatchObject({ ratio: '1x1', columns: '2', title: 'Promos' });
    // 2 columnas de 624 px al doble = 1248, cuadrada.
    expect(screen.getByText('Ideal 1250×1250 px')).toBeInTheDocument();
    expect(crashes()).toEqual([]);
  });

  it('imagen y texto: texto claro avisa que va sobre un recuadro oscuro', async () => {
    mockApi();
    const onData = vi.fn();
    const u = user();
    renderWithProviders(<Harness type="image-text" data={{ image: img(1), title: 'T' }} onData={onData} />);
    await settle(2);
    await u.selectOptions(screen.getByLabelText('Color del texto'), 'light');
    expect(screen.getByText(/le pone un recuadro oscuro/)).toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText('Fondo del texto'), 'dark');
    expect(screen.queryByText(/le pone un recuadro oscuro/)).not.toBeInTheDocument();
    await u.selectOptions(screen.getByLabelText('Imagen en computadora'), 'right');
    await u.selectOptions(screen.getByLabelText('En celular va primero'), 'text');
    expect(last(onData)).toMatchObject({
      imagePosition: 'right',
      mobileOrder: 'text',
      textBackground: 'dark',
    });
    expect(crashes()).toEqual([]);
  });

  it('marcas: cada logo con nombre; avisa los que no tienen', async () => {
    mockApi();
    const onData = vi.fn();
    const u = user();
    renderWithProviders(
      <Harness
        type="brands"
        data={{ logos: [{ image: img(1) }, { image: img(2), name: 'Acme' }] }}
        onData={onData}
      />,
    );
    expect(await screen.findByText(/Un logo no tiene nombre/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Ítem 1', expanded: false }));
    await u.type(screen.getByLabelText('Nombre de la marca'), 'Nike');
    expect((last(onData).logos as Record<string, unknown>[])[0]).toMatchObject({ name: 'Nike' });
    expect(screen.queryByText(/no tiene nombre/)).not.toBeInTheDocument();
    await u.click(screen.getByLabelText(/En gris/));
    expect(last(onData).grayscale).toBe(true);
    expect(crashes()).toEqual([]);
  });
});
