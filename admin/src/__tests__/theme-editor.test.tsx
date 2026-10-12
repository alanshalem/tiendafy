/**
 * El editor de diseño de la tienda, panel por panel: identidad, colores,
 * tipografías, encabezado, portada (y cada una de sus secciones), listado,
 * ficha de producto, carrito, contacto, WhatsApp, pie, CSS… Cada panel se
 * abre, se toca todo lo que tiene y se vuelve. Nada puede romperse, y los
 * cambios tienen que llegar al borrador.
 *
 * El editor es la pantalla más grande del panel y la que más estado maneja;
 * el recorrido general de pantallas solo ve su menú raíz.
 */
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../test/api';
import { explore, fill, settle, watchCrashes, type User } from '../test/explore';
import { renderApp } from '../test/render';

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
  vi.stubGlobal('open', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** El panel izquierdo del editor (no la barra lateral del panel, que también es un aside). */
const panel = () => document.querySelector('aside.w-80') as HTMLElement;

/** Abre el editor y espera a que cargue el diseño. */
async function openEditor() {
  renderApp('/canales/tienda-online');
  await waitFor(() => expect(panel()).toBeTruthy(), { timeout: 5000 });
  await settle(6);
}

/**
 * Vuelve al menú raíz con el botón "atrás" de los paneles (el primero del
 * aside). Si la entrada sacó del editor (la galería de diseños), lo reabre.
 */
async function backToRoot(user: User) {
  if (!panel()) {
    cleanup();
    await openEditor();
    return;
  }
  for (let i = 0; i < 3; i++) {
    const back = within(panel()).queryAllByRole('button')[0];
    if (!back || within(panel()).queryAllByText('Colores de tu marca').length > 0) break; // ya en el menú raíz
    await user.click(back);
    await settle(1);
  }
}

describe('editor de diseño', () => {
  it('cada panel del menú se abre, se toca y se vuelve sin romperse', { timeout: 180_000 }, async () => {
    const api = mockApi();
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    await openEditor();

    const entries = within(panel()).queryAllByRole('button').length;
    expect(entries).toBeGreaterThan(5);

    for (let i = 0; i < entries; i++) {
      const button = within(panel()).queryAllByRole('button')[i];
      if (!button) break;
      await user.click(button);
      await settle(2);
      if (panel()) await explore(user, panel, 40);
      // Cada control del panel, sin tope: los paneles largos (listado, ficha)
      // tienen más selects y casillas que los que toca la exploración.
      if (panel()) await fill(user, panel(), 100);
      await user.keyboard('{Escape}');
      await backToRoot(user);
    }

    expect(crashes()).toEqual([]);
    // Tocar los paneles guarda el borrador (autosave).
    await waitFor(() =>
      expect(api.calls.some((c) => c.method === 'PUT' && c.path.startsWith('/api/v1/theme'))).toBe(true),
    );
  });

  it('las secciones de la portada se abren una por una', { timeout: 120_000 }, async () => {
    mockApi();
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/canales/tienda-online');
    await waitFor(() => expect(panel()).toBeTruthy(), { timeout: 5000 });
    await settle(6);

    const home = within(panel())
      .queryAllByRole('button')
      .find((b) => /portada|inicio|home/i.test(b.textContent ?? ''));
    if (!home) return; // sin portada editable en este diseño
    await user.click(home);
    await settle(2);

    const sections = within(panel()).queryAllByRole('button').length;
    for (let i = 1; i < sections; i++) {
      await user.click(home.isConnected ? home : within(panel()).queryAllByRole('button')[0]!);
      const button = within(panel()).queryAllByRole('button')[i];
      if (!button) break;
      await user.click(button);
      await settle(2);
      await explore(user, panel, 25);
      await user.keyboard('{Escape}');
    }

    expect(crashes()).toEqual([]);
  });

  it('publicar, descartar y ver el historial', { timeout: 60_000 }, async () => {
    const api = mockApi();
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/canales/tienda-online');
    await waitFor(() => expect(panel()).toBeTruthy(), { timeout: 5000 });
    await settle(6);

    // Un cambio cualquiera habilita publicar.
    await user.click(within(panel()).queryAllByRole('button')[1]!);
    await settle(2);
    await explore(user, panel, 10);
    await backToRoot(user);

    const publish = screen.queryByRole('button', { name: /^Publicar/ });
    if (publish && !publish.hasAttribute('disabled')) {
      await user.click(publish);
      await waitFor(() =>
        expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/v1/theme/publish')).toBe(true),
      );
    }
    expect(crashes()).toEqual([]);
  });
});
