/**
 * La lista de secciones del inicio y el selector de "Agregar sección":
 * filas con nombre propio y resumen, ojo con estado, menú ⋯ (renombrar,
 * duplicar, en qué dispositivo se ve, mover, agregar arriba/abajo, eliminar
 * con "Deshacer"), reordenar con el teclado, y el selector por grupos con
 * buscador, límites, posición y foco.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SECTIONS, type ThemeConfig, type ThemeSection } from '@tiendafy/types';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';
import { sectionSummary } from '../pages/theme-editor/sections/sectionSummary';
import {
  addBlockedReason,
  duplicateSection,
  insertSection,
  moveSection,
  removeSection,
  renameSection,
  setSectionHideOn,
} from '../pages/theme-editor/sections/sectionOps';
import { searchSectionTypes } from '../pages/theme-editor/sections/AddSectionPicker';

let crashes: () => unknown[][];
beforeEach(() => {
  crashes = watchCrashes();
  vi.stubGlobal('open', vi.fn());
});
afterEach(() => vi.restoreAllMocks());

const draft = fixture<ThemeConfig>('/api/v1/theme/draft');
const panel = () => screen.getByRole('complementary', { name: 'Opciones del diseño' });
const drafts = (api: MockApi) =>
  api.calls.filter((c) => c.method === 'PUT' && c.path === '/api/v1/theme/draft');
const saved = (api: MockApi) => drafts(api).at(-1)!.body as ThemeConfig;
const savedIds = (api: MockApi) => saved(api).sections.map((s) => s.id);
const rows = () => within(panel()).getAllByRole('button', { name: /^Editar «/ });
const row = (name: string) => within(panel()).getByRole('button', { name: `Editar «${name}»` });
const picker = () => screen.getByRole('dialog', { name: 'Agregar sección' });

async function openHome(sections?: ThemeSection[]) {
  const api = mockApi();
  api.on('POST', '/api/v1/theme/preview-token', { token: 'pt-firmado' });
  if (sections) api.on('GET', '/api/v1/theme/draft', { ...draft, sections });
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/canales/tienda-online');
  await waitFor(() => expect(panel()).toBeTruthy(), { timeout: 5000 });
  await settle(6);
  await user.click(
    within(panel())
      .getAllByRole('button')
      .find((b) => b.textContent?.trim() === 'Página de inicio')!,
  );
  await settle(1);
  return { api, user };
}

/** Abre el menú ⋯ de una fila y elige una opción. */
async function menu(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  item: string | RegExp,
  role: 'menuitem' | 'menuitemradio' = 'menuitem',
) {
  // Con dos del mismo nombre, la primera.
  await user.click(within(panel()).getAllByRole('button', { name: `Más acciones de «${name}»` })[0]!);
  const m = screen.getByRole('menu', { name: `Más acciones de «${name}»` });
  await user.click(within(m).getByRole(role, { name: item }));
}

const faq = (id: string, name?: string): ThemeSection => ({
  id,
  type: 'faq',
  visible: true,
  ...(name ? { name } : {}),
  data: {
    title: 'Preguntas',
    items: [
      { question: '¿Envían?', answer: 'Sí' },
      { question: '¿Cuotas?', answer: 'Sí' },
    ],
  },
});

/* ---------------- funciones puras ---------------- */

describe('lista de secciones: operaciones', () => {
  const base = { ...draft, sections: [faq('a', 'Envíos'), faq('b')] } as ThemeConfig;

  it('insertar, quitar, mover, renombrar y en qué dispositivo se ve', () => {
    const extra = faq('c');
    expect(insertSection(extra, 1)(base).sections.map((s) => s.id)).toEqual(['a', 'c', 'b']);
    expect(insertSection(extra, 99)(base).sections.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    // Repetir el id no duplica (deshacer dos veces el mismo borrado).
    expect(insertSection(faq('a'), 0)(base)).toBe(base);
    expect(removeSection('a')(base).sections.map((s) => s.id)).toEqual(['b']);
    expect(removeSection('zzz')(base)).toBe(base);
    expect(moveSection(0, 1)(base).sections.map((s) => s.id)).toEqual(['b', 'a']);
    expect(renameSection('b', '  Cuotas  ')(base).sections[1]!.name).toBe('Cuotas');
    expect('name' in renameSection('a', '   ')(base).sections[0]!).toBe(false);
    expect(setSectionHideOn('a', 'mobile')(base).sections[0]!.hideOn).toBe('mobile');
    expect('hideOn' in setSectionHideOn('a', undefined)(base).sections[0]!).toBe(false);
  });

  it('duplicar: copia abajo, id nuevo, "(copia)"; no si va una sola o se llegó al tope', () => {
    const dup = duplicateSection(base.sections, 'a')!;
    expect(dup.at).toBe(1);
    expect(dup.copy.id).not.toBe('a');
    expect(dup.copy.name).toBe('Envíos (copia)');
    expect(dup.copy.data).toEqual(base.sections[0]!.data);
    expect(dup.copy.data).not.toBe(base.sections[0]!.data);
    expect(duplicateSection(base.sections, 'b')!.copy.name).toBe('Preguntas frecuentes (copia)');

    const news: ThemeSection = { id: 'n', type: 'newsletter', visible: true, data: {} };
    expect(duplicateSection([news], 'n')).toBeNull();
    expect(addBlockedReason([news], 'newsletter')).toMatch(/va una sola/);
    const full = Array.from({ length: MAX_SECTIONS }, (_, i) => faq(`f${i}`));
    expect(duplicateSection(full, 'f0')).toBeNull();
    expect(addBlockedReason(full, 'faq')).toMatch(`máximo de ${MAX_SECTIONS}`);
    expect(addBlockedReason(base.sections, 'faq')).toBeNull();
  });

  it('el resumen dice qué tiene adentro', () => {
    expect(sectionSummary(faq('a'))).toBe('2 ítems: ¿Envían?, ¿Cuotas?');
    expect(sectionSummary({ ...faq('a'), visible: false, hideOn: 'mobile' })).toBe(
      'Oculta · Oculta en celular · 2 ítems: ¿Envían?, ¿Cuotas?',
    );
    expect(sectionSummary({ ...faq('a'), hideOn: 'desktop', data: { items: [] } })).toBe(
      'Solo en celular · Sin ítems todavía',
    );
    expect(
      sectionSummary({ id: 'c', type: 'carousel', visible: true, data: { images: ['/a.jpg', '/b.jpg'] } }),
    ).toBe('2 imágenes');
    expect(sectionSummary({ id: 'c', type: 'carousel', visible: true, data: {} })).toBe(
      'Sin imágenes todavía',
    );
    expect(
      sectionSummary({ id: 'p', type: 'featured', visible: true, data: { productIds: ['1', '2'] } }),
    ).toBe('2 productos elegidos a mano');
    expect(sectionSummary({ id: 'p', type: 'featured', visible: true, data: {} })).toBe('Lo más vendido');
    expect(
      sectionSummary({
        id: 'p',
        type: 'sale-products',
        visible: true,
        data: { source: { kind: 'brand', brand: 'Acme' } },
      }),
    ).toBe('De la marca Acme');
    expect(
      sectionSummary({ id: 'i', type: 'institutional', visible: true, data: { title: 'Quiénes somos' } }),
    ).toBe('Quiénes somos');
    // Un tipo que este editor no conoce: se adivina por la forma.
    expect(
      sectionSummary({
        id: 'x',
        type: 'video-360' as never,
        visible: true,
        data: { slides: [{ title: 'Uno' }] },
      }),
    ).toBe('1 ítem: Uno');
  });

  it('el buscador del selector busca por nombre, palabras clave y descripción, sin tildes', () => {
    expect(searchSectionTypes('').length).toBeGreaterThan(10);
    expect(searchSectionTypes('preguntas').map((d) => d.type)).toEqual(['faq']);
    expect(searchSectionTypes('SLIDER').map((d) => d.type)).toContain('carousel');
    expect(searchSectionTypes('opiniones clientes').map((d) => d.type)).toEqual(['testimonials']);
    expect(searchSectionTypes('zzz')).toEqual([]);
  });
});

/* ---------------- las filas ---------------- */

describe('lista de secciones: filas', () => {
  it('nombre propio con resumen; dos del mismo tipo se distinguen', async () => {
    await openHome([faq('a', 'Envíos'), faq('b')]);
    expect(rows()).toHaveLength(2);
    expect(row('Envíos')).toHaveAccessibleDescription('2 ítems: ¿Envían?, ¿Cuotas?');
    expect(row('Preguntas frecuentes')).toBeInTheDocument();
    // Todo lo tocable de la fila mide 40 px o más.
    const r = row('Envíos').parentElement!;
    for (const b of within(r).getAllByRole('button')) expect(b.className).toMatch(/\b(h-10|min-h-12)\b/);
  });

  it('tocar la fila abre su panel', async () => {
    const { user } = await openHome([faq('a', 'Envíos')]);
    await user.click(row('Envíos'));
    expect(await within(panel()).findByRole('textbox', { name: 'Nombre de la sección' })).toHaveValue(
      'Envíos',
    );
  });

  it('el ojo dice su estado y oculta sin borrar', async () => {
    const { api, user } = await openHome([faq('a', 'Envíos')]);
    const eye = within(panel()).getByRole('button', { name: 'Mostrar «Envíos» en la tienda' });
    expect(eye).toHaveAttribute('aria-pressed', 'true');
    await user.click(eye);
    expect(eye).toHaveAttribute('aria-pressed', 'false');
    expect(row('Envíos')).toHaveAccessibleDescription(/^Oculta · /);
    await waitFor(() => expect(saved(api).sections[0]!.visible).toBe(false), { timeout: 3000 });
  });

  it('cambiar nombre en el lugar: Enter guarda, Escape cancela', async () => {
    const { api, user } = await openHome([faq('a'), faq('b')]);
    await menu(user, 'Preguntas frecuentes', 'Cambiar nombre');
    // Las dos se llaman igual: se renombra la primera.
    const input = within(panel()).getByRole('textbox', { name: 'Nombre de la sección' });
    expect(input).toHaveFocus();
    await user.type(input, 'Envíos{Enter}');
    await waitFor(() => expect(row('Envíos')).toHaveFocus());
    await waitFor(() => expect(saved(api).sections[0]!.name).toBe('Envíos'), { timeout: 3000 });

    await menu(user, 'Envíos', 'Cambiar nombre');
    await user.type(within(panel()).getByRole('textbox', { name: 'Nombre de la sección' }), 'otra{Escape}');
    expect(row('Envíos')).toBeInTheDocument();
  });

  it('duplicar deja la copia abajo con "(copia)"; lo que va uno solo no se duplica', async () => {
    const news: ThemeSection = { id: 'n', type: 'newsletter', visible: true, data: { title: 'Novedades' } };
    const { api, user } = await openHome([faq('a', 'Envíos'), news]);
    await menu(user, 'Envíos', 'Duplicar');
    expect(rows().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Editar «Envíos»',
      'Editar «Envíos (copia)»',
      'Editar «Newsletter»',
    ]);
    await waitFor(() => expect(row('Envíos (copia)')).toHaveFocus());
    await waitFor(() => expect(saved(api).sections).toHaveLength(3), { timeout: 3000 });
    expect(saved(api).sections[1]).toMatchObject({ type: 'faq', name: 'Envíos (copia)' });

    await user.click(within(panel()).getByRole('button', { name: 'Más acciones de «Newsletter»' }));
    const dup = within(screen.getByRole('menu')).getByRole('menuitem', { name: /Duplicar/ });
    expect(dup).toHaveAttribute('aria-disabled', 'true');
    expect(dup).toHaveTextContent('va una sola');
    await user.click(dup);
    expect(rows()).toHaveLength(3);
  });

  it('"Mostrar en": todos, solo celular o solo computadora', async () => {
    const { api, user } = await openHome([faq('a', 'Envíos')]);
    await user.click(within(panel()).getByRole('button', { name: 'Más acciones de «Envíos»' }));
    expect(screen.getByRole('menuitemradio', { name: 'Celulares y computadoras' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByRole('menuitemradio', { name: 'Solo en celulares' }));
    await waitFor(() => expect(saved(api).sections[0]!.hideOn).toBe('desktop'), { timeout: 3000 });
    expect(row('Envíos')).toHaveAccessibleDescription(/Solo en celular/);

    await menu(user, 'Envíos', 'Solo en computadoras', 'menuitemradio');
    await waitFor(() => expect(saved(api).sections[0]!.hideOn).toBe('mobile'), { timeout: 3000 });
    expect(row('Envíos')).toHaveAccessibleDescription(/Oculta en celular/);
    await menu(user, 'Envíos', 'Celulares y computadoras', 'menuitemradio');
    await waitFor(() => expect('hideOn' in saved(api).sections[0]!).toBe(false), { timeout: 3000 });
  });

  it('el menú se maneja con el teclado y mueve la sección', async () => {
    const { api, user } = await openHome([faq('a', 'Uno'), faq('b', 'Dos'), faq('c', 'Tres')]);
    const trigger = within(panel()).getByRole('button', { name: 'Más acciones de «Uno»' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const m = screen.getByRole('menu');
    // El foco entra al menú, en el primer ítem.
    expect(within(m).getByRole('menuitem', { name: 'Cambiar nombre' })).toHaveFocus();
    expect(within(m).getByRole('menuitem', { name: 'Mover arriba' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{End}{ArrowUp}');
    expect(within(m).getByRole('menuitem', { name: 'Mover abajo' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await waitFor(() => expect(savedIds(api)).toEqual(['b', 'a', 'c']), { timeout: 3000 });

    // Escape cierra y devuelve el foco al botón.
    const again = within(panel()).getByRole('button', { name: 'Más acciones de «Uno»' });
    again.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(again).toHaveFocus();
  });

  it('reordenar arrastrando con el teclado (manija + Espacio + flechas)', async () => {
    // jsdom no tiene layout: cada fila mide 56 px, una debajo de la otra.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const item = this.closest('[data-sortable-id]');
      if (!item) return new DOMRect(0, 0, 300, 56);
      const i = Array.from(item.parentElement!.children).indexOf(item);
      return new DOMRect(0, i * 64, 300, 56);
    });
    const { api, user } = await openHome([faq('a', 'Uno'), faq('b', 'Dos'), faq('c', 'Tres')]);
    const handle = within(panel()).getByRole('button', { name: 'Mover «Uno»' });
    handle.focus();
    await user.keyboard(' ');
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    await user.keyboard('{ArrowDown}');
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    await user.keyboard(' ');
    await waitFor(() => expect(savedIds(api)).toEqual(['b', 'a', 'c']), { timeout: 3000 });
    expect(crashes()).toEqual([]);
  });

  it('eliminar es inmediato y "Deshacer" la vuelve a su lugar', async () => {
    const { api, user } = await openHome([faq('a', 'Uno'), faq('b', 'Dos'), faq('c', 'Tres')]);
    await menu(user, 'Dos', 'Eliminar');
    expect(rows()).toHaveLength(2);
    // El foco pasa a la fila que quedó en su lugar.
    await waitFor(() => expect(row('Tres')).toHaveFocus());
    const notice = screen.getByText('Eliminaste «Dos».').closest<HTMLElement>('[role=status]')!;
    await waitFor(() => expect(savedIds(api)).toEqual(['a', 'c']), { timeout: 3000 });

    // Otra cosa en el medio: deshacer igual la devuelve a su posición.
    await user.click(within(panel()).getByRole('button', { name: 'Mostrar «Tres» en la tienda' }));
    await user.click(within(notice).getByRole('button', { name: 'Deshacer' }));
    await waitFor(() => expect(savedIds(api)).toEqual(['a', 'b', 'c']), { timeout: 3000 });
    expect(saved(api).sections[2]!.visible).toBe(false);
    expect(screen.queryByText('Eliminaste «Dos».')).not.toBeInTheDocument();
  });

  it('el aviso de "Deshacer" se va solo', async () => {
    const { user } = await openHome([faq('a', 'Uno'), faq('b', 'Dos')]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await menu(user, 'Uno', 'Eliminar');
      expect(screen.getByText('Eliminaste «Uno».')).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(8100);
      });
      expect(screen.queryByText('Eliminaste «Uno».')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('el inicio vacío explica y ofrece agregar o una plantilla', async () => {
    const { user } = await openHome([]);
    expect(within(panel()).getByText('Tu página de inicio está vacía')).toBeInTheDocument();
    await user.click(within(panel()).getByRole('button', { name: 'Agregar sección' }));
    expect(picker()).toHaveTextContent('Va a ser la primera sección de tu inicio.');
    await user.click(within(picker()).getByRole('button', { name: /^Mensaje institucional/ }));
    expect(await within(panel()).findByRole('textbox', { name: 'Nombre de la sección' })).toBeInTheDocument();
  });
});

/* ---------------- agregar sección ---------------- */

describe('agregar sección', () => {
  it('por grupos, con maqueta y descripción; lo que va uno solo, apagado con el motivo', async () => {
    const { user } = await openHome();
    const add = within(panel()).getByRole('button', { name: 'Agregar sección' });
    await user.click(add);
    const dialog = picker();
    expect(dialog).toHaveTextContent('Va al final del inicio.');
    // El foco arranca en el buscador.
    expect(within(dialog).getByRole('searchbox', { name: 'Buscar un tipo de sección' })).toHaveFocus();
    for (const g of ['Imágenes', 'Productos', 'Contenido', 'Confianza', 'Contacto'])
      expect(within(dialog).getByRole('group', { name: g })).toBeInTheDocument();
    const faqOption = within(dialog).getByRole('button', { name: /^Preguntas frecuentes/ });
    expect(faqOption).toHaveTextContent('Preguntas y respuestas desplegables');
    // El inicio ya tiene un newsletter: va uno solo.
    const news = within(dialog).getByRole('button', { name: /^Newsletter/ });
    expect(news).toHaveAttribute('aria-disabled', 'true');
    expect(news).toHaveTextContent('Ya está en tu inicio: va una sola.');
    await user.click(news);
    expect(picker()).toBeInTheDocument();

    // Escape cierra y el foco vuelve al botón que lo abrió.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Agregar sección' })).not.toBeInTheDocument();
    expect(add).toHaveFocus();
  });

  it('buscar filtra; Enter agrega el primero, al final, y abre su panel', async () => {
    const { api, user } = await openHome();
    const before = rows().length;
    await user.click(within(panel()).getByRole('button', { name: 'Agregar sección' }));
    const search = within(picker()).getByRole('searchbox');
    await user.type(search, 'zzz');
    expect(picker()).toHaveTextContent('Ninguna sección con «zzz»');
    await user.clear(search);
    await user.type(search, 'preguntas');
    expect(within(picker()).getAllByRole('button', { name: /^(?!Cerrar)/ })).toHaveLength(1);
    // Flechas: del buscador a la opción.
    await user.keyboard('{ArrowDown}');
    expect(within(picker()).getByRole('button', { name: /^Preguntas frecuentes/ })).toHaveFocus();
    await user.keyboard('{ArrowUp}{Enter}');

    expect(screen.queryByRole('dialog', { name: 'Agregar sección' })).not.toBeInTheDocument();
    // Se abrió el panel de la nueva, con su contenido de ejemplo, y el foco está ahí.
    expect(
      await within(panel()).findByRole('button', { name: '¿Hacen envíos a todo el país?' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(panel().contains(document.activeElement)).toBe(true));
    await waitFor(() => expect(saved(api).sections).toHaveLength(before + 1), { timeout: 3000 });
    expect(saved(api).sections.at(-1)!.type).toBe('faq');
  });

  it('desde el menú ⋯ y desde el "+" entre filas, se agrega en esa posición', async () => {
    const { api, user } = await openHome([faq('a', 'Uno'), faq('b', 'Dos')]);
    await menu(user, 'Uno', 'Agregar sección abajo');
    expect(picker()).toHaveTextContent('Va entre «Uno» y «Dos».');
    await user.click(within(picker()).getByRole('button', { name: /^Mensaje institucional/ }));
    await waitFor(
      () => expect(saved(api).sections.map((s) => s.type)).toEqual(['faq', 'institutional', 'faq']),
      {
        timeout: 3000,
      },
    );

    // Volver a la lista y usar el "+" antes de la primera.
    await user.click(within(panel()).getAllByRole('button')[0]!);
    await user.click(within(panel()).getByRole('button', { name: 'Agregar una sección antes de «Uno»' }));
    expect(picker()).toHaveTextContent('Va arriba de todo, antes de «Uno».');
    await user.click(within(picker()).getByRole('button', { name: /^Testimonios de clientes/ }));
    await waitFor(() => expect(saved(api).sections[0]!.type).toBe('testimonials'), { timeout: 3000 });
    expect(saved(api).sections).toHaveLength(4);
    expect(crashes()).toEqual([]);
  });

  it(`con ${MAX_SECTIONS} secciones no se agregan más (y se dice por qué)`, async () => {
    const full = Array.from({ length: MAX_SECTIONS }, (_, i) => faq(`f${i}`, `Sección ${i + 1}`));
    const { user } = await openHome(full);
    expect(within(panel()).getByRole('button', { name: 'Agregar sección' })).toBeDisabled();
    expect(within(panel()).getByText(/Llegaste al máximo de 40 secciones/)).toBeInTheDocument();
    expect(
      within(panel()).queryByRole('button', { name: /^Agregar una sección antes/ }),
    ).not.toBeInTheDocument();
    await user.click(within(panel()).getByRole('button', { name: 'Más acciones de «Sección 1»' }));
    expect(screen.getByRole('menuitem', { name: 'Agregar sección abajo' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('menuitem', { name: /Duplicar/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('cerrar con la X o tocando afuera', async () => {
    const { user } = await openHome();
    await user.click(within(panel()).getByRole('button', { name: 'Agregar sección' }));
    await user.click(within(picker()).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog', { name: 'Agregar sección' })).not.toBeInTheDocument();
    await user.click(within(panel()).getByRole('button', { name: 'Agregar sección' }));
    fireEvent.click(picker().previousElementSibling!);
    expect(screen.queryByRole('dialog', { name: 'Agregar sección' })).not.toBeInTheDocument();
  });
});
