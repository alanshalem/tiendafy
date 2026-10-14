/**
 * Los editores de las secciones de la fase 2 (cronómetro, producto
 * destacado, pop-up, texto con formato, categorías, video, columnas y
 * collage): lo que se toca llega a los datos con la forma que espera la
 * tienda, y el registro tolera datos rotos.
 */
import {
  canAddSection,
  createSection,
  normalizeSection,
  sectionData,
  sectionProductPlan,
  type RichDoc,
  type SectionType,
  type ThemeSection,
} from '@tiendafy/types';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionPanel } from '../pages/theme-editor/sections/SectionPanel';
import { mockApi } from '../test/api';
import { settle } from '../test/explore';
import { renderWithProviders } from '../test/render';

let latest: Record<string, unknown> = {};

function Harness({ type, data = {} }: { type: SectionType; data?: Record<string, unknown> }) {
  const [section, setSection] = useState<ThemeSection>({ id: 's1', type, visible: true, data });
  return (
    <SectionPanel
      section={section}
      onBack={() => {}}
      onChange={(next) => {
        setSection(next);
        latest = next.data;
      }}
    />
  );
}

async function open(type: SectionType, data: Record<string, unknown> = {}) {
  latest = {};
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  const utils = renderWithProviders(<Harness type={type} data={data} />);
  await settle(3);
  return { user, ...utils };
}

beforeEach(() => {
  mockApi();
});
afterEach(() => vi.restoreAllMocks());

describe('ofertas con cronómetro', () => {
  it('nace con una fecha de cierre a una semana, a las 23:59 de Argentina', () => {
    const s = createSection('countdown-offer');
    const data = sectionData(s as ThemeSection & { type: 'countdown-offer' });
    const end = Date.parse(data.endsAt);
    expect(end - Date.now()).toBeGreaterThan(6 * 86_400_000);
    expect(end - Date.now()).toBeLessThan(8 * 86_400_000);
    // 23:59 de Argentina = 02:59 UTC.
    expect(data.endsAt).toMatch(/T02:59:00\.000Z$/);
  });

  it('la fecha se elige en hora argentina y se guarda en UTC', async () => {
    await open('countdown-offer');
    const input = screen.getByLabelText('Termina el');
    fireEvent.change(input, { target: { value: '2026-12-24T20:30' } });
    expect(latest.endsAt).toBe('2026-12-24T23:30:00.000Z');
    expect(screen.getByText(/Termina el jueves 24\/12 a las 20:30/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '' } });
    expect(latest.endsAt).toBe('');
  });

  it('el origen de los productos va en data.source y data.limit, y el plan lo respeta', async () => {
    const { user } = await open('countdown-offer');
    expect(screen.getByLabelText('Qué productos mostrar')).toHaveValue('on-sale');
    await user.selectOptions(screen.getByLabelText('Qué productos mostrar'), 'category');
    expect(latest.source).toEqual({ kind: 'category', categoryId: '' });
    await settle(2);
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Musculación');
    expect(latest.source).toMatchObject({ kind: 'category', categoryId: expect.any(String) });

    const limit = screen.getByLabelText('Cuántos mostrar como máximo');
    fireEvent.change(limit, { target: { value: '99' } });
    expect(latest.limit).toBe(24);

    const plan = sectionProductPlan({ type: 'countdown-offer', data: latest });
    expect(plan).toMatchObject({ source: { kind: 'category' }, limit: 24 });
    // Sin origen: los que están en oferta.
    expect(sectionProductPlan({ type: 'countdown-offer', data: {} })).toEqual({
      source: { kind: 'on-sale' },
      limit: 8,
    });
  });

  it('el mensaje de cierre solo aparece si se elige mostrarlo', async () => {
    const { user } = await open('countdown-offer');
    expect(screen.queryByLabelText('Mensaje cuando termina')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Cuando termina'), 'message');
    await user.type(screen.getByLabelText('Mensaje cuando termina'), '!');
    expect(latest.whenEnded).toBe('message');
    expect(latest.endedText).toBe('Esta oferta terminó.!');
  });

  it('tolera datos rotos', () => {
    const s = normalizeSection({
      id: 'x',
      type: 'countdown-offer',
      visible: true,
      data: { endsAt: 'pasado mañana', whenEnded: 'explotar', carousel: 'sí', title: 7 },
    })!;
    expect(s.data).toMatchObject({ endsAt: '', whenEnded: 'hide', carousel: true, title: '7' });
  });
});

describe('producto destacado', () => {
  it('se elige un producto buscándolo, se cambia y se quita', async () => {
    const { user } = await open('featured-product');
    expect(screen.getByText('Si no elegís ninguno, se muestra el más vendido.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Buscar un producto'), 'banco');
    await settle(4);
    await user.click(await screen.findByRole('button', { name: /Banco plano regulable/ }));
    expect(latest.productId).toEqual(expect.any(String));
    const id = latest.productId as string;
    expect(sectionProductPlan({ type: 'featured-product', data: latest })).toEqual({
      source: { kind: 'manual', ids: [id] },
      limit: 1,
    });

    await user.click(screen.getByRole('button', { name: 'Cambiar' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Quitar el producto' }));
    expect(latest.productId).toBe('');
    // Sin elegido: el más vendido (y si no hay ventas, lo último).
    expect(sectionProductPlan({ type: 'featured-product', data: latest })).toEqual({
      source: { kind: 'best-sellers' },
      fallback: { kind: 'newest' },
      limit: 1,
    });
  });

  it('elige el lado de la foto, el botón y si va la descripción', async () => {
    const { user } = await open('featured-product');
    await user.selectOptions(screen.getByLabelText('Foto'), 'image-right');
    await user.selectOptions(screen.getByLabelText('Botón'), 'link');
    await user.click(screen.getByLabelText('Mostrar un resumen de la descripción'));
    expect(latest).toMatchObject({ layout: 'image-right', button: 'link', showDescription: false });
  });
});

describe('pop-up promocional', () => {
  it('una sola por página', () => {
    const one = [createSection('promo-popup')];
    expect(canAddSection(one, 'promo-popup')).toBe(false);
    expect(canAddSection([], 'promo-popup')).toBe(true);
  });

  it('cupón en mayúsculas, segundos y días con rango, y campos que aparecen según lo elegido', async () => {
    const { user } = await open('promo-popup', createSection('promo-popup').data);
    const coupon = screen.getByLabelText('Código de cupón (opcional)');
    await user.clear(coupon);
    await user.type(coupon, 'verano25');
    expect(latest.couponCode).toBe('VERANO25');

    fireEvent.change(screen.getByLabelText('Segundos de espera'), { target: { value: '500' } });
    expect(latest.delaySeconds).toBe(120);

    await user.selectOptions(screen.getByLabelText('Cuándo aparece'), 'exit');
    expect(screen.queryByLabelText('Segundos de espera')).not.toBeInTheDocument();
    expect(screen.getByText(/aparece solo en computadoras/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Volver a mostrarlo después de'), { target: { value: '30' } });
    expect(latest.frequencyDays).toBe(30);
    await user.selectOptions(screen.getByLabelText('Cada cuánto se muestra a la misma persona'), 'session');
    expect(screen.queryByLabelText('Volver a mostrarlo después de')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Pedir el email para el newsletter'));
    expect(latest).toMatchObject({ trigger: 'exit', frequency: 'session', newsletter: true });
  });

  it('el campo numérico deja borrar para escribir otro número', async () => {
    await open('promo-popup');
    const input = screen.getByLabelText('Segundos de espera');
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue(null);
    expect(latest.delaySeconds).toBeUndefined();
    fireEvent.change(input, { target: { value: '12' } });
    expect(latest.delaySeconds).toBe(12);
    fireEvent.blur(input);
    expect(input).toHaveValue(12);
  });
});

describe('texto con formato', () => {
  it('el editor muestra el documento guardado y escribe un árbol, no HTML', async () => {
    const { user } = await open('rich-text', createSection('rich-text').data);
    const box = await screen.findByRole('textbox', { name: 'Texto' });
    expect(box).toHaveTextContent('Contá la historia de tu marca');
    await user.click(box);
    await user.keyboard('{Control>}a{/Control}');
    await user.click(screen.getByRole('button', { name: 'Subtítulo' }));
    await settle(1);
    const body = latest.body as RichDoc;
    expect(body.type).toBe('doc');
    expect(body.content[0]).toMatchObject({ type: 'heading', attrs: { level: 3 } });
    expect(JSON.stringify(body)).not.toContain('<');
  });

  it('el link pasa por el mismo control que el resto: completa https y descarta javascript:', async () => {
    const { user } = await open('rich-text', createSection('rich-text').data);
    const box = await screen.findByRole('textbox', { name: 'Texto' });
    await user.click(box);
    await user.keyboard('{Control>}a{/Control}');
    await user.click(screen.getByRole('button', { name: 'Link' }));
    const field = await screen.findByRole('textbox', { name: /A dónde lleva/ });
    await user.clear(field);
    await user.type(field, 'javascript:alert(1){Enter}');
    await settle(1);
    expect(JSON.stringify(latest.body ?? {})).not.toContain('javascript');

    await user.click(box);
    await user.keyboard('{Control>}a{/Control}');
    await user.click(screen.getByRole('button', { name: 'Link' }));
    const again = await screen.findByRole('textbox', { name: /A dónde lleva/ });
    await user.clear(again);
    await user.type(again, 'mitienda.com/envios{Enter}');
    await settle(1);
    expect(JSON.stringify(latest.body)).toContain('"href":"https://mitienda.com/envios"');
  });

  it('la imagen elige su lugar y el link del botón aparece con el texto', async () => {
    const { user } = await open('rich-text', { image: 'https://cdn.example.com/a.jpg' });
    await user.selectOptions(screen.getByLabelText('Dónde va la imagen'), 'top');
    expect(latest.imagePosition).toBe('top');
    expect(screen.queryByText('A dónde lleva el botón')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Texto del botón (opcional)'), 'Leer más');
    expect(screen.getByText('A dónde lleva el botón')).toBeInTheDocument();
  });
});

describe('categorías principales', () => {
  it('automático pide cuántas; a mano, una lista de categorías de la tienda con nombre y foto propios', async () => {
    const { user } = await open('category-list', createSection('category-list').data);
    fireEvent.change(screen.getByLabelText('Cuántas mostrar'), { target: { value: '4' } });
    expect(latest.count).toBe(4);

    await user.selectOptions(screen.getByLabelText('Qué categorías'), 'manual');
    expect(screen.queryByLabelText('Cuántas mostrar')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Agregar categoría/ }));
    await settle(2);
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Musculación');
    const items = latest.items as { categoryId: string; title: string }[];
    expect(items).toHaveLength(1);
    expect(items[0]!.categoryId).toEqual(expect.any(String));
    expect(items[0]!.categoryId).not.toBe('');
    // El ítem se nombra con la categoría elegida.
    expect(screen.getAllByText('Musculación').length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText('Nombre a mostrar (opcional)'), 'Pesas');
    expect((latest.items as { title: string }[])[0]!.title).toBe('Pesas');
  });

  it('forma, columnas y «Ver todas»', async () => {
    const { user } = await open('category-list', createSection('category-list').data);
    await user.selectOptions(screen.getByLabelText('Cómo se muestran'), 'carousel');
    await user.selectOptions(screen.getByLabelText('Forma de la foto'), 'square');
    await user.selectOptions(screen.getByLabelText('Por fila en celular'), '3');
    fireEvent.change(screen.getByLabelText('Por fila en computadora'), { target: { value: '1' } });
    expect(latest).toMatchObject({
      layout: 'carousel',
      shape: 'square',
      columnsMobile: 3,
      columnsDesktop: 2,
    });
    await user.click(screen.getByLabelText('Botón «Ver todas»'));
    expect(latest.showAll).toBe(false);
    expect(screen.queryByLabelText('Texto del botón')).not.toBeInTheDocument();
  });

  it('tolera datos rotos', () => {
    const s = normalizeSection({
      id: 'x',
      type: 'category-list',
      visible: true,
      data: {
        mode: 'todas',
        count: 999,
        columnsDesktop: '5',
        items: [null, { categoryId: 3 }, 'x'],
        shape: 'hexágono',
      },
    })!;
    expect(s.data).toMatchObject({
      mode: 'auto',
      count: 24,
      columnsDesktop: 5,
      shape: 'circle',
      items: [{ categoryId: '3', title: '', image: '' }],
    });
  });
});

describe('video', () => {
  it('reconoce el link mientras se pega y avisa si no es de YouTube o Vimeo', async () => {
    const { user } = await open('video', createSection('video').data);
    const url = screen.getByLabelText('Link del video');
    await user.type(url, 'https://malo.com/v');
    expect(screen.getByText('Ese link no es de un video de YouTube o Vimeo.')).toBeInTheDocument();
    await user.clear(url);
    await user.type(url, 'youtu.be/dQw4w9WgXcQ');
    expect(screen.getByText(/Video de YouTube reconocido/)).toBeInTheDocument();
    expect(latest.url).toBe('youtu.be/dQw4w9WgXcQ');
  });

  it('un Short en un recuadro horizontal sugiere la proporción vertical', async () => {
    const { user } = await open('video', createSection('video').data);
    await user.type(screen.getByLabelText('Link del video'), 'https://youtube.com/shorts/dQw4w9WgXcQ');
    expect(screen.getByText(/Short de YouTube reconocido.*Es vertical/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Proporción'), '9:16');
    expect(screen.getByText(/Short de YouTube reconocido/)).not.toHaveTextContent('Es vertical');
  });

  it('con un MP4 se sube el archivo y se elige si arranca solo; la proporción para los dos', async () => {
    const { user } = await open('video', createSection('video').data);
    await user.selectOptions(screen.getByLabelText('De dónde sale el video'), 'file');
    expect(screen.queryByLabelText('Link del video')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Reproducir solo, sin sonido y en loop'));
    await user.selectOptions(screen.getByLabelText('Proporción'), '9:16');
    expect(latest).toMatchObject({ source: 'file', autoplay: false, ratio: '9:16' });
  });
});

describe('íconos con texto', () => {
  it('cada columna elige ícono, título, texto y link; columnas y celular aparte', async () => {
    const { user } = await open('icon-columns', createSection('icon-columns').data);
    await user.click(screen.getByRole('button', { name: /Agregar columna/ }));
    await settle(1);
    const icons = screen.getAllByLabelText('Ícono');
    await user.selectOptions(icons[icons.length - 1]!, 'heart');
    const titles = screen.getAllByLabelText('Título');
    await user.type(titles[titles.length - 1]!, 'Hecho a mano');
    const items = latest.items as { icon: string; title: string }[];
    expect(items).toHaveLength(4);
    expect(items[3]).toMatchObject({ icon: 'heart', title: 'Hecho a mano' });

    fireEvent.change(screen.getByLabelText('Columnas en computadora'), { target: { value: '9' } });
    expect(latest.columnsDesktop).toBe(6);
    await user.selectOptions(screen.getByLabelText('En celular'), 'swipe');
    expect(latest.mobile).toBe('swipe');
  });

  it('tolera datos rotos', () => {
    const s = normalizeSection({
      id: 'x',
      type: 'icon-columns',
      visible: true,
      data: { items: [{ icon: 'cohete', title: 'A' }, null], columnsDesktop: 0, mobile: 3 },
    })!;
    expect(s.data).toMatchObject({
      items: [{ icon: 'shipping', title: 'A', text: '', image: '', link: '' }],
      columnsDesktop: 2,
      mobile: '1',
    });
  });
});

describe('collage', () => {
  it('cada bloque elige qué muestra; el producto entra al plan de la sección', async () => {
    const { user } = await open('collage', createSection('collage').data);
    // Los bloques arrancan plegados: se abren tocando su nombre.
    await user.click(screen.getByRole('button', { name: /Más vendidos/, expanded: false }));
    await user.selectOptions(screen.getByLabelText('Qué muestra'), 'product');
    await user.type(screen.getByLabelText('Buscar un producto'), 'banco');
    await settle(4);
    await user.click(await screen.findByRole('button', { name: /Banco plano regulable/ }));
    const blocks = latest.blocks as { kind: string; productId: string }[];
    expect(blocks[1]).toMatchObject({ kind: 'product', productId: expect.any(String) });
    expect(sectionProductPlan({ type: 'collage', data: latest })).toEqual({
      source: { kind: 'manual', ids: [blocks[1]!.productId] },
      limit: 1,
    });

    await user.click(screen.getByRole('button', { name: /Ofertas/, expanded: false }));
    const kinds = screen.getAllByLabelText('Qué muestra');
    await user.selectOptions(kinds[kinds.length - 1]!, 'category');
    await settle(2);
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Musculación');
    expect((latest.blocks as { categoryId: string }[])[2]!.categoryId).not.toBe('');

    await user.selectOptions(screen.getByLabelText('El bloque grande va'), 'big-right');
    await user.selectOptions(screen.getByLabelText('En celular'), 'swipe');
    expect(latest).toMatchObject({ layout: 'big-right', mobile: 'swipe' });
  });

  it('sin bloques de producto no pide productos; tope de tres bloques', () => {
    expect(sectionProductPlan({ type: 'collage', data: createSection('collage').data })).toBeNull();
    const s = normalizeSection({
      id: 'x',
      type: 'collage',
      visible: true,
      data: { blocks: [{ kind: 'video' }, 3], layout: 'arriba' },
    })!;
    expect(s.data).toMatchObject({ layout: 'big-left', blocks: [{ kind: 'image', title: '' }] });
  });
});
