/**
 * Cada panel del editor de diseño, control por control: se abre por su nombre,
 * se despliega lo plegado, se pasa cada select por todas sus opciones (así
 * aparecen los campos que dependen de ellas), se marca y desmarca cada casilla
 * y se completan los campos. Nada puede romperse y el borrador se autoguarda.
 *
 * El recorrido general (theme-editor.test) aprieta botones, y el primero de
 * cada panel es "atrás": se iba antes de tocar los controles.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, type MockApi } from '../test/api';
import { fill, press, settle, watchCrashes, type User } from '../test/explore';
import { renderApp } from '../test/render';

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
  vi.stubGlobal('open', vi.fn());
});

afterEach(() => vi.restoreAllMocks());

const panel = () => screen.getByRole('complementary', { name: 'Opciones del diseño' });

async function openPanel(name: string) {
  const api = mockApi();
  api.on('POST', '/api/v1/theme/preview-token', { token: 'pt-firmado' });
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/canales/tienda-online');
  await waitFor(() => expect(panel()).toBeTruthy(), { timeout: 5000 });
  await settle(6);
  const entry = within(panel())
    .getAllByRole('button')
    .find((b) => b.textContent?.trim() === name);
  expect(entry, name).toBeTruthy();
  await user.click(entry!);
  await settle(2);
  return { api, user };
}

/** Despliega los bloques plegados del panel (los que arrancan cerrados). */
async function expandAll(user: User) {
  for (const toggle of within(panel()).queryAllByRole('button')) {
    if (toggle.getAttribute('aria-expanded') === 'false') await user.click(toggle);
  }
  await settle(1);
}

/** Tipea en cada campo de texto y número del panel (sin tocar casillas ni selects). */
async function typeAll(user: User) {
  await settle(1);
  for (const field of [
    ...within(panel()).queryAllByRole('textbox'),
    ...within(panel()).queryAllByRole('spinbutton'),
  ]) {
    if (field.isConnected && !field.hasAttribute('disabled')) await user.type(field, '7');
  }
}

/** Cada select por todas sus opciones, y cada casilla marcada y desmarcada. */
async function operateAll(user: User) {
  const selects = within(panel())
    .queryAllByRole('combobox')
    .filter((s): s is HTMLSelectElement => s.tagName === 'SELECT');
  for (const select of selects) {
    for (const option of Array.from(select.options)) {
      if (!select.isConnected || option.disabled) continue;
      await user.selectOptions(select, option);
    }
  }
  // Los selectores de color nativos no se tipean: se elige un color.
  for (const color of Array.from(panel().querySelectorAll<HTMLInputElement>('input[type=color]'))) {
    fireEvent.change(color, { target: { value: '#123456' } });
  }
  const toggles = [
    ...within(panel()).queryAllByRole('checkbox'),
    ...within(panel()).queryAllByRole('switch'),
  ];
  for (const box of toggles) {
    if (!box.isConnected || box.hasAttribute('disabled')) continue;
    // En los dos estados: lo que aparece al marcarla (campos dependientes)
    // también se completa. `fill` volvería a tocar las casillas: acá solo se tipea.
    await user.click(box);
    await typeAll(user);
    if (box.isConnected) await user.click(box);
    await typeAll(user);
  }
  await settle(1);
}

/**
 * Aprieta los botones del panel (subir, bajar, ocultar, agregar, estilos
 * rápidos…) salvo el de volver, que es el primero; "Restablecer" al final,
 * confirmando su diálogo. Se re-consulta en cada vuelta: los botones cambian.
 */
async function pressAll(user: User, max = 60) {
  const isReset = (b: HTMLElement) => b.textContent?.trim() === 'Restablecer';
  for (let i = 1, clicks = 0; clicks < max; i++, clicks++) {
    const button = within(panel())
      .queryAllByRole('button')
      .filter((b) => !isReset(b))[i];
    if (!button) break;
    // Los plegables ya se abrieron: apretarlos de nuevo escondería sus botones.
    if (button.hasAttribute('disabled') || button.hasAttribute('aria-expanded')) continue;
    await press(user, button);
  }
  const reset = within(panel()).queryAllByRole('button').find(isReset);
  if (!reset) return;
  await user.click(reset);
  const dialog = await screen.findByRole('dialog');
  await user.click(within(dialog).getByRole('button', { name: 'Restablecer' }));
  await settle(2);
}

const drafts = (api: MockApi) =>
  api.calls.filter((c) => c.method === 'PUT' && c.path === '/api/v1/theme/draft');

const PANELS = [
  'Logo de la tienda',
  'Colores de tu marca',
  'Tipo de letra',
  'Estilo y movimiento',
  'Encabezado',
  'Pie de página',
  'Listado de productos',
  'Detalle de producto',
  'Carrito de compras',
  'Botón de WhatsApp',
  'Contacto',
  'Tienda en construcción',
];

describe('editor de diseño: cada panel, control por control', () => {
  it.each(PANELS)('%s', { timeout: 120_000 }, async (name) => {
    const { api, user } = await openPanel(name);
    await expandAll(user);
    await fill(user, panel(), 100);
    await operateAll(user);
    await expandAll(user);
    await fill(user, panel(), 100);
    await pressAll(user);

    expect(crashes()).toEqual([]);
    // Algo de lo tocado tiene que haber llegado al borrador (salvo paneles de solo lectura).
    await settle(4);
    if (
      within(panel()).queryAllByRole('textbox').length + within(panel()).queryAllByRole('checkbox').length >
      0
    )
      await waitFor(() => expect(drafts(api).length).toBeGreaterThan(0), { timeout: 3000 });
    void screen;
  });
});

describe('editor de diseño: la página de inicio', () => {
  type Saved = { sections: { id: string; type: string; visible: boolean }[] };
  const last = (api: MockApi) => drafts(api).at(-1)!.body as Saved;
  const rows = () => within(panel()).getAllByRole('button', { name: /^Editar «/ });
  const picker = () => screen.getByRole('dialog', { name: 'Agregar sección' });
  /** Elige una opción del menú ⋯ de la fila `i`. */
  async function rowAction(user: User, i: number, item: string) {
    await user.click(within(panel()).getAllByRole('button', { name: /^Más acciones de «/ })[i]!);
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: item }));
  }

  it('mover, ocultar y quitar secciones', { timeout: 60_000 }, async () => {
    const { api, user } = await openPanel('Página de inicio');
    const before = rows().length;
    expect(before).toBeGreaterThan(1);
    const first = rows()[0]!.getAttribute('aria-label');

    await rowAction(user, 0, 'Mover abajo');
    expect(rows()[1]).toHaveAttribute('aria-label', first);
    await rowAction(user, 1, 'Mover arriba');
    expect(rows()[0]).toHaveAttribute('aria-label', first);
    await user.click(within(panel()).getAllByRole('button', { name: /^Mostrar «.*» en la tienda$/ })[0]!);
    await waitFor(() => expect(last(api).sections[0]!.visible).toBe(false), { timeout: 3000 });

    await rowAction(user, 0, 'Eliminar');
    await waitFor(() => expect(last(api).sections).toHaveLength(before - 1), { timeout: 3000 });
    expect(crashes()).toEqual([]);
  });

  it('agregar cada tipo de sección (los de uno por página, una sola vez)', { timeout: 60_000 }, async () => {
    const { api, user } = await openPanel('Página de inicio');
    const before = rows().length;
    const options = () =>
      within(picker())
        .getAllByRole('group')
        .flatMap((g) => within(g).getAllByRole('button'));
    const nameOf = (b: HTMLElement) => b.querySelector('span > span')!.textContent!;
    await user.click(within(panel()).getByRole('button', { name: 'Agregar sección' }));
    // El selector va por grupos y cada tipo dice para qué sirve.
    expect(within(picker()).getByRole('group', { name: 'Productos' })).toBeInTheDocument();
    const names = options()
      .filter((b) => !b.hasAttribute('aria-disabled'))
      .map(nameOf);
    expect(names.length).toBeGreaterThan(10);
    await user.click(within(picker()).getByRole('button', { name: 'Cerrar' }));

    for (const name of names) {
      // Cada una abre su panel: se vuelve a la lista para agregar la siguiente.
      if (!within(panel()).queryByRole('button', { name: 'Agregar sección' }))
        await user.click(within(panel()).getAllByRole('button')[0]!);
      await user.click(within(panel()).getByRole('button', { name: 'Agregar sección' }));
      await user.click(options().find((b) => nameOf(b) === name)!);
    }
    await waitFor(() => expect(last(api).sections).toHaveLength(before + names.length), { timeout: 3000 });

    // Un segundo hero no entra: va uno solo por página.
    await user.click(within(panel()).getAllByRole('button')[0]!);
    await user.click(within(panel()).getByRole('button', { name: 'Agregar sección' }));
    const hero = options().find((b) => b.textContent!.startsWith('Hero con video'))!;
    expect(hero).toHaveAttribute('aria-disabled', 'true');
    expect(hero).toHaveTextContent('va una sola');
    expect(crashes()).toEqual([]);
  });

  it('una plantilla reemplaza las secciones (con confirmación)', { timeout: 60_000 }, async () => {
    const { api, user } = await openPanel('Página de inicio');
    await user.click(within(panel()).getByRole('button', { name: 'Usar una plantilla de inicio' }));
    await user.click(within(panel()).getByRole('button', { name: 'Cerrar' }));
    await user.click(within(panel()).getByRole('button', { name: 'Usar una plantilla de inicio' }));
    const templates = within(panel())
      .getAllByRole('button')
      .filter((b) => /\d+ secciones/.test(b.textContent ?? ''));
    expect(templates.length).toBeGreaterThan(1);
    const count = Number(/(\d+) secciones/.exec(templates[0]!.textContent!)![1]);

    // Cancelar no toca nada; confirmar la aplica y cierra la lista.
    await user.click(templates[0]!);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    await settle(2);
    expect(drafts(api)).toHaveLength(0);
    await user.click(templates[0]!);
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Usar plantilla' }),
    );
    await waitFor(() => expect(last(api).sections).toHaveLength(count), { timeout: 3000 });
    expect(within(panel()).getByRole('button', { name: 'Usar una plantilla de inicio' })).toBeInTheDocument();

    // Con la portada vacía, la plantilla se aplica sin preguntar.
    while (within(panel()).queryAllByRole('button', { name: /^Más acciones de «/ }).length > 0)
      await rowAction(user, 0, 'Eliminar');
    expect(await within(panel()).findByText(/Tu página de inicio está vacía/)).toBeInTheDocument();
    await user.click(within(panel()).getByRole('button', { name: 'Usar una plantilla' }));
    const again = within(panel())
      .getAllByRole('button')
      .filter((b) => /\d+ secciones/.test(b.textContent ?? ''));
    await user.click(again.at(-1)!);
    await waitFor(() => expect(last(api).sections.length).toBeGreaterThan(0), { timeout: 3000 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
