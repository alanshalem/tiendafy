/**
 * Los cimientos del editor de diseño: el editor genérico de listas de ítems
 * (renombrar, reordenar con teclado, duplicar, borrar con confirmación, tope),
 * el nombre propio y el "Diseño de la sección" de cada panel, el deshacer que
 * junta lo tipeado de corrido, que el editor no se rompa si la sección
 * abierta desaparece, el aviso de conflicto (409) y que aplicar un diseño de
 * la galería no se lleve puesto lo que el comercio ya cargó.
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeTheme, type FaqItem, type ThemeConfig, type ThemeSection } from '@tiendafy/types';
import { ItemListEditor, itemDisplayTitle } from '../pages/theme-editor/sections/ItemListEditor';
import { SectionPanel } from '../pages/theme-editor/sections/SectionPanel';
import {
  editKey,
  emptyHistory,
  recordEdit,
  redoEdit,
  undoEdit,
  UNDO_LIMIT,
} from '../pages/theme-editor/history';
import { applyPreset, presetChanges, themePresets } from '../lib/themePresets';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp, renderWithProviders } from '../test/render';

let crashes: () => unknown[][];
beforeEach(() => {
  crashes = watchCrashes();
  vi.stubGlobal('open', vi.fn());
});
afterEach(() => vi.restoreAllMocks());

const user = () => userEvent.setup({ delay: null, pointerEventsCheck: 0 });

/* ---------------- historial de deshacer ---------------- */

describe('deshacer: lo seguido en el mismo campo es un paso', () => {
  const base = normalizeTheme({});
  const css = (t: ThemeConfig, customCss: string): ThemeConfig => ({ ...t, customCss });

  it('sabe qué campo tocó cada edición', () => {
    expect(editKey(base, css(base, 'a'))).toBe('customCss');
    expect(editKey(base, { ...base, colors: { ...base.colors, primary: '0 0 0' } })).toBe('colors.primary');
    const [s0] = base.sections;
    const withTitle = {
      ...base,
      sections: base.sections.map((s) => (s === s0 ? { ...s, data: { ...s.data, title: 'x' } } : s)),
    };
    expect(editKey(base, withTitle)).toBe(`sections:${s0!.id}:data.title`);
    const renamed = { ...base, sections: base.sections.map((s) => (s === s0 ? { ...s, name: 'Mío' } : s)) };
    expect(editKey(base, renamed)).toBe(`sections:${s0!.id}:name`);
    // Lo estructural no se junta con nada.
    expect(editKey(base, { ...base, sections: base.sections.slice(1) })).toBeNull();
    expect(editKey(base, { ...base, sections: [...base.sections].reverse() })).toBeNull();
    expect(editKey(base, { ...base, customCss: 'a', seoTitle: 'b' })).toBeNull();
  });

  it('junta las ediciones seguidas (< 1 s) al mismo campo, no las separadas', () => {
    let h = emptyHistory();
    let t = base;
    for (const [i, ch] of ['a', 'ab', 'abc'].entries()) {
      const next = css(t, ch);
      h = recordEdit(h, t, next, 1000 + i * 200);
      t = next;
    }
    expect(h.past).toHaveLength(1);
    // Un rato después, otro paso.
    const later = css(t, 'abcd');
    h = recordEdit(h, t, later, 5000);
    expect(h.past).toHaveLength(2);
    // Otro campo, aunque sea enseguida, otro paso.
    const other = { ...later, seoTitle: 'x' };
    h = recordEdit(h, later, other, 5100);
    expect(h.past).toHaveLength(3);

    const u = undoEdit(h, other)!;
    expect(u.theme).toBe(later);
    const r = redoEdit(u.history, u.theme)!;
    expect(r.theme).toBe(other);
    expect(undoEdit(emptyHistory(), base)).toBeNull();
    expect(redoEdit(emptyHistory(), base)).toBeNull();
  });

  it(`guarda hasta ${UNDO_LIMIT} pasos`, () => {
    let h = emptyHistory();
    let t = base;
    for (let i = 0; i < UNDO_LIMIT + 20; i++) {
      const next = { ...t, sections: [...t.sections].reverse() };
      h = recordEdit(h, t, next, i);
      t = next;
    }
    expect(h.past).toHaveLength(UNDO_LIMIT);
  });
});

/* ---------------- editor de listas de ítems ---------------- */

function FaqList({
  initial,
  spy,
  max,
}: {
  initial: FaqItem[];
  spy: (items: FaqItem[]) => void;
  max?: number;
}) {
  const [items, setItems] = useState(initial);
  return (
    <ItemListEditor<FaqItem>
      items={items}
      onChange={(next) => {
        spy(next);
        setItems(next);
      }}
      max={max}
      addLabel="Agregar pregunta"
      listLabel="Preguntas"
      createItem={() => ({ question: '', answer: '' })}
      renderItem={(item, update) => (
        <input
          aria-label="Pregunta"
          value={item.question}
          onChange={(e) => update({ question: e.target.value })}
        />
      )}
    />
  );
}

const q = (question: string, label?: string): FaqItem => ({
  question,
  answer: 'a',
  ...(label ? { label } : {}),
});

describe('editor de listas de ítems', () => {
  it('el título es el nombre propio, el derivado o "Ítem N"', () => {
    expect(itemDisplayTitle(q('¿Envían?', 'Envíos'), 0)).toBe('Envíos');
    expect(itemDisplayTitle(q('¿Envían?'), 0)).toBe('¿Envían?');
    expect(itemDisplayTitle(q(''), 2)).toBe('Ítem 3');
  });

  it('renombrar, reordenar con el teclado, duplicar y borrar con confirmación', async () => {
    mockApi();
    const spy = vi.fn();
    const u = user();
    renderWithProviders(<FaqList initial={[q('Primera'), q('Segunda')]} spy={spy} />);
    const group = await screen.findByRole('group', { name: 'Preguntas' });

    // Reordenar con el teclado: foco en "Bajar" y Enter.
    within(group).getByRole('button', { name: 'Bajar «Primera»' }).focus();
    await u.keyboard('{Enter}');
    expect(spy.mock.lastCall![0].map((i: FaqItem) => i.question)).toEqual(['Segunda', 'Primera']);
    expect(within(group).getByRole('button', { name: 'Subir «Segunda»' })).toBeDisabled();

    // Desplegar, renombrar en el lugar (Enter guarda).
    await u.click(within(group).getByRole('button', { name: 'Primera', expanded: false }));
    await u.click(within(group).getByRole('button', { name: 'Renombrar' }));
    const name = within(group).getByRole('textbox', { name: 'Nombre del ítem' });
    await u.type(name, 'La de cambios{Enter}');
    expect(spy.mock.lastCall![0][1]).toMatchObject({ question: 'Primera', label: 'La de cambios' });
    expect(within(group).getByRole('button', { name: 'La de cambios', expanded: true })).toBeInTheDocument();

    // Escape cancela un renombre.
    await u.click(within(group).getByRole('button', { name: 'Renombrar' }));
    await u.type(within(group).getByRole('textbox', { name: 'Nombre del ítem' }), 'nada{Escape}');
    expect(spy.mock.lastCall![0][1].label).toBe('La de cambios');

    // Duplicar: la copia va abajo con "(copia)".
    await u.click(within(group).getByRole('button', { name: 'Duplicar' }));
    expect(spy.mock.lastCall![0].map((i: FaqItem) => i.label)).toEqual([
      undefined,
      'La de cambios',
      'La de cambios (copia)',
    ]);

    // Borrar pide confirmación: cancelar no borra; confirmar sí.
    const before = spy.mock.calls.length;
    await u.click(within(group).getAllByRole('button', { name: 'Eliminar' })[0]!);
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(spy.mock.calls.length).toBe(before);
    await u.click(within(group).getAllByRole('button', { name: 'Eliminar' })[0]!);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('«La de cambios»');
    await u.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(spy.mock.lastCall![0]).toHaveLength(2));

    // Plegar y desplegar.
    const toggle = within(group).getByRole('button', { name: 'La de cambios (copia)' });
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    await u.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', String(!expanded));
    expect(crashes()).toEqual([]);
  });

  it('agregar respeta el máximo y los botones se pueden tocar con el dedo', async () => {
    mockApi();
    const spy = vi.fn();
    const u = user();
    renderWithProviders(<FaqList initial={[q('Una')]} spy={spy} max={2} />);
    const group = await screen.findByRole('group', { name: 'Preguntas' });
    // La nueva aparece desplegada, lista para completar.
    await u.click(within(group).getByRole('button', { name: /Agregar pregunta/ }));
    expect(spy.mock.lastCall![0]).toHaveLength(2);
    expect(within(group).getByRole('button', { name: 'Ítem 2', expanded: true })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /Agregar pregunta/ })).toBeDisabled();
    expect(within(group).getByText('Llegaste al máximo de 2.')).toBeInTheDocument();
    for (const b of within(group).getAllByRole('button', { name: /^(Subir|Bajar|Mover) / }))
      expect(b.className).toMatch(/\bh-10\b/);
    // El arrastre también se puede empezar con teclado (la manija es un botón con instrucciones).
    expect(within(group).getAllByRole('button', { name: /^Mover «/ })[0]).toHaveAttribute(
      'aria-roledescription',
    );
  });
});

/* ---------------- panel de una sección ---------------- */

function SectionHarness({ initial, spy }: { initial: ThemeSection; spy: (s: ThemeSection) => void }) {
  const [section, setSection] = useState(initial);
  return (
    <SectionPanel
      section={section}
      onBack={() => {}}
      onChange={(next) => {
        spy(next);
        setSection(next);
      }}
    />
  );
}

describe('panel de una sección', () => {
  it('nombre propio y "Diseño de la sección" en cualquier tipo', async () => {
    mockApi();
    const spy = vi.fn();
    const u = user();
    renderWithProviders(
      <SectionHarness
        initial={{ id: 'i1', type: 'institutional', visible: true, data: { title: 'Hola' } }}
        spy={spy}
      />,
    );
    const nameField = await screen.findByRole('textbox', { name: 'Nombre de la sección' });
    expect(nameField).toHaveAttribute('placeholder', 'Mensaje institucional');
    await u.type(nameField, 'Quiénes somos');
    expect(spy.mock.lastCall![0]).toMatchObject({ name: 'Quiénes somos', data: { title: 'Hola' } });
    // El encabezado del panel muestra el nombre propio.
    expect(screen.getByRole('button', { name: /Quiénes somos/ })).toBeInTheDocument();
    await u.clear(nameField);
    expect('name' in spy.mock.lastCall![0]).toBe(false);

    await u.click(screen.getByRole('button', { name: 'Diseño de la sección', expanded: false }));
    await u.selectOptions(screen.getByRole('combobox', { name: 'Mostrar en' }), 'Solo en celulares');
    expect(spy.mock.lastCall![0].hideOn).toBe('desktop');
    await u.selectOptions(screen.getByRole('combobox', { name: 'Mostrar en' }), 'Solo en computadoras');
    expect(spy.mock.lastCall![0].hideOn).toBe('mobile');
    await u.selectOptions(screen.getByRole('combobox', { name: 'Fondo' }), 'Otro color');
    expect(spy.mock.lastCall![0].style).toEqual({ background: 'custom', backgroundColor: '245 245 245' });
    expect(screen.getByLabelText('Color del fondo')).toBeInTheDocument();
    await u.selectOptions(screen.getByRole('combobox', { name: 'Espacio arriba' }), 'Grande');
    await u.selectOptions(
      screen.getByRole('combobox', { name: 'Alineación de los títulos' }),
      'A la izquierda',
    );
    expect(spy.mock.lastCall![0].style).toMatchObject({ paddingTop: 'lg', align: 'left' });
    // Volver todo a "como viene" deja la sección sin estilo.
    await u.selectOptions(screen.getByRole('combobox', { name: 'Fondo' }), 'Sin fondo');
    await u.selectOptions(screen.getByRole('combobox', { name: 'Espacio arriba' }), 'Normal');
    await u.selectOptions(screen.getByRole('combobox', { name: 'Alineación de los títulos' }), 'Como viene');
    await u.selectOptions(screen.getByRole('combobox', { name: 'Mostrar en' }), 'Celulares y computadoras');
    expect(spy.mock.lastCall![0].style).toBeUndefined();
    expect(spy.mock.lastCall![0].hideOn).toBeUndefined();
  });

  it('una sección de un tipo que este editor no conoce no lo rompe', async () => {
    mockApi();
    renderWithProviders(
      <SectionHarness
        initial={{ id: 'x', type: 'video-360' as never, visible: true, data: {} }}
        spy={vi.fn()}
      />,
    );
    expect(await screen.findByText(/versión más nueva del editor/)).toBeInTheDocument();
    expect(crashes()).toEqual([]);
  });
});

/* ---------------- el editor entero ---------------- */

const panel = () => screen.getByRole('complementary', { name: 'Opciones del diseño' });
const drafts = (api: MockApi) =>
  api.calls.filter((c) => c.method === 'PUT' && c.path === '/api/v1/theme/draft');

async function openEditor(setup?: (api: MockApi) => void) {
  const api = mockApi();
  api.on('POST', '/api/v1/theme/preview-token', { token: 'pt-firmado' });
  setup?.(api);
  const u = user();
  renderApp('/canales/tienda-online');
  await waitFor(() => expect(panel()).toBeTruthy(), { timeout: 5000 });
  await settle(6);
  return { api, user: u };
}

async function openHome(u: ReturnType<typeof user>) {
  await u.click(
    within(panel())
      .getAllByRole('button')
      .find((b) => b.textContent?.trim() === 'Página de inicio')!,
  );
  await settle(1);
}

describe('editor: la sección abierta desaparece', () => {
  it('deshacer hasta antes de agregarla vuelve a la lista (no rompe)', async () => {
    const { api, user: u } = await openEditor();
    await openHome(u);
    const before = within(panel()).getAllByRole('button', { name: /^Editar «/ }).length;
    await u.click(within(panel()).getByRole('button', { name: 'Agregar sección' }));
    await u.click(
      within(
        within(screen.getByRole('dialog', { name: 'Agregar sección' })).getByRole('group', {
          name: 'Contenido',
        }),
      ).getByRole('button', { name: /^Preguntas frecuentes/ }),
    );
    // Se abre sola, y recién agregada ya trae contenido de ejemplo.
    expect(
      await within(panel()).findByRole('button', { name: '¿Hacen envíos a todo el país?' }),
    ).toBeInTheDocument();
    (document.activeElement as HTMLElement | null)?.blur();

    await u.keyboard('{Control>}z{/Control}');
    await waitFor(() =>
      expect(within(panel()).getAllByRole('button', { name: /^Editar «/ })).toHaveLength(before),
    );
    await waitFor(() => expect((drafts(api).at(-1)?.body as ThemeConfig).sections).toHaveLength(before));
    expect(crashes()).toEqual([]);
  });

  it('descartar con el panel de una sección nueva abierto vuelve a la lista', async () => {
    const { user: u } = await openEditor();
    await openHome(u);
    await u.click(within(panel()).getByRole('button', { name: 'Agregar sección' }));
    await u.click(
      within(screen.getByRole('dialog', { name: 'Agregar sección' })).getByRole('button', {
        name: /^Mensaje institucional/,
      }),
    );
    expect(await within(panel()).findByRole('textbox', { name: 'Nombre de la sección' })).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: /^Descartar$/ }));
    await u.click(
      within(await screen.findByRole('dialog', { name: 'Descartar cambios' })).getByRole('button', {
        name: 'Descartar',
      }),
    );
    expect(await screen.findByText('Cambios descartados')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(panel()).queryByRole('textbox', { name: 'Nombre de la sección' }),
      ).not.toBeInTheDocument(),
    );
    expect(within(panel()).getAllByRole('button', { name: /^Editar «/ }).length).toBeGreaterThan(0);
    expect(crashes()).toEqual([]);
  });
});

describe('editor: el borrador cambió en otra pestaña (409)', () => {
  const draft = fixture<Record<string, unknown>>('/api/v1/theme/draft');

  async function conflictEditor() {
    const conflict = {
      title: 'Theme.DraftConflict',
      detail: 'El diseño cambió en otra pestaña o lo editó otra persona.',
    };
    const ctx = await openEditor((a) => {
      a.on('GET', '/api/v1/theme/draft', { ...draft, draftVersion: 3 });
      a.on('PUT', '/api/v1/theme/draft', conflict, 409);
    });
    await ctx.user.click(within(panel()).getByText('Edición avanzada de CSS'));
    await ctx.user.type(within(panel()).getByRole('textbox'), '/* mío */');
    const banner = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(banner).toHaveTextContent('El diseño cambió en otra pestaña o lo editó otra persona.');
    // Se mandó con la versión que se había leído.
    expect(drafts(ctx.api)[0]!.body).toMatchObject({ draftVersion: 3 });
    return { ...ctx, banner };
  }

  it('"Guardar el mío igual" vuelve a leer la versión y guarda encima', async () => {
    const { api, user: u, banner } = await conflictEditor();
    // Mientras no se elige, el autoguardado no insiste.
    const tries = drafts(api).length;
    await act(async () => new Promise((r) => setTimeout(r, 900)));
    expect(drafts(api)).toHaveLength(tries);

    api.on('GET', '/api/v1/theme/draft', { ...draft, draftVersion: 7 });
    api.on('PUT', '/api/v1/theme/draft', { draftVersion: 8 });
    await u.click(within(banner).getByRole('button', { name: 'Guardar el mío igual' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(drafts(api).at(-1)!.body).toMatchObject({ draftVersion: 7, customCss: '/* mío */' });
    expect(screen.getByText('Guardado')).toBeInTheDocument();
  });

  it('"Recargar el último" trae lo del servidor (y lo propio queda en el deshacer)', async () => {
    const { api, user: u, banner } = await conflictEditor();
    api.on('GET', '/api/v1/theme/draft', {
      ...draft,
      customCss: '/* de la otra pestaña */',
      draftVersion: 9,
    });
    api.on('PUT', '/api/v1/theme/draft', { draftVersion: 10 });
    await u.click(within(banner).getByRole('button', { name: 'Recargar el último' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(within(panel()).getByRole('textbox')).toHaveValue('/* de la otra pestaña */');

    // Ctrl+Z devuelve lo propio, y se guarda con la versión nueva.
    (document.activeElement as HTMLElement | null)?.blur();
    await u.keyboard('{Control>}z{/Control}');
    await waitFor(
      () => expect(drafts(api).at(-1)!.body).toMatchObject({ draftVersion: 9, customCss: '/* mío */' }),
      {
        timeout: 3000,
      },
    );
  });

  it('publicar desde una pestaña vieja muestra el aviso (no un error suelto)', async () => {
    const { user: u } = await openEditor((a) => {
      a.on(
        'POST',
        '/api/v1/theme/publish',
        { detail: 'El diseño cambió en otra pestaña o lo editó otra persona.' },
        409,
      );
    });
    await u.click(within(panel()).getByText('Edición avanzada de CSS'));
    await u.type(within(panel()).getByRole('textbox'), 'x');
    await u.click(screen.getByRole('button', { name: 'Publicar cambios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('cambió en otra pestaña');
    expect(screen.queryByText('Error al publicar')).not.toBeInTheDocument();
  });
});

describe('editor: el servidor rechaza el borrador', () => {
  it('dice por qué (la sección y el campo), no solo "no se guardó"', async () => {
    const detail =
      'La sección 3 («Mensaje institucional»): el título tiene 201 caracteres y el máximo es 200.';
    const { user: u } = await openEditor((a) => {
      a.on('PUT', '/api/v1/theme/draft', { title: 'Theme.InvalidSection', detail }, 400);
    });
    await u.click(within(panel()).getByText('Edición avanzada de CSS'));
    await u.type(within(panel()).getByRole('textbox'), 'x');
    expect(await screen.findByText(detail, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /No se guardó — Reintentar/ })).toHaveAttribute(
      'title',
      detail,
    );
  });
});

/* ---------------- galería de diseños ---------------- */

describe('galería: usar un diseño no se lleva puesto lo cargado', () => {
  const current = normalizeTheme({
    footer: { ...normalizeTheme({}).footer, text: 'Pie propio', instagram: 'https://instagram.com/mitienda' },
    contact: { showForm: true, address: 'Av. Siempreviva 742', phone: '', email: 'hola@x.com', whatsapp: '' },
    cart: { ...normalizeTheme({}).cart, notice: 'Envíos los martes' },
    customCss: '.x{color:red}',
    whatsappButton: {
      ...normalizeTheme({}).whatsappButton,
      enabled: true,
      phone: '5491100000000',
      message: 'Hola',
    },
    header: { ...normalizeTheme({}).header, menu: [{ id: 'contact', visible: false }] },
    seoTitle: 'Mi SEO',
    logo: '/mi-logo.png',
  });

  it('cambia solo el diseño y lo que el preset trae', () => {
    const generic = themePresets.find((p) => !p.logo && !p.seo && !p.comingSoon)!;
    const next = applyPreset(current, generic);
    for (const key of [
      'footer',
      'contact',
      'cart',
      'productList',
      'productDetail',
      'whatsappButton',
      'customCss',
      'comingSoon',
      'seoTitle',
      'logo',
      'favicon',
    ] as const)
      expect(next[key], key).toEqual(current[key]);
    expect(next.header.menu).toEqual(current.header.menu);
    expect(next.colors.primary).toBe(generic.tokens.colorPrimary);
    expect(next.sections.length).toBe(generic.sections.length);
    expect(presetChanges(generic)).not.toContain('logo');

    // Una marca trae logo y SEO: esos sí cambian, y la confirmación lo dice.
    const brand = themePresets.find((p) => p.id === 'puente-oriente')!;
    const branded = applyPreset(current, brand);
    expect(branded.logo).toBe(brand.logo);
    expect(branded.footer).toEqual(current.footer);
    expect(presetChanges(brand)).toEqual(
      expect.arrayContaining(['logo', 'favicon', 'título y descripción para Google']),
    );
  });

  it('"Usar este diseño" lee el borrador, mezcla y guarda con su versión', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/theme/draft', { ...current, draftVersion: 4 });
    const u = user();
    renderApp('/canales/tienda-online/disenios');
    const buttons = await screen.findAllByRole('button', { name: 'Usar este diseño' }, { timeout: 5000 });
    await u.click(buttons[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Usar este diseño' });
    expect(dialog).toHaveTextContent(/cambia en tu borrador: colores, tipografía/);
    expect(dialog).toHaveTextContent(
      /pie de página, contacto, carrito, listado, WhatsApp y CSS propio\) queda como está/,
    );
    await u.click(within(dialog).getByRole('button', { name: 'Aplicar al borrador' }));
    await waitFor(() => expect(drafts(api)).toHaveLength(1));
    const body = drafts(api)[0]!.body as ThemeConfig & { draftVersion: number };
    expect(body.draftVersion).toBe(4);
    expect(body.footer.text).toBe('Pie propio');
    expect(body.customCss).toBe('.x{color:red}');
    expect(body.contact.address).toBe('Av. Siempreviva 742');
  });
});
