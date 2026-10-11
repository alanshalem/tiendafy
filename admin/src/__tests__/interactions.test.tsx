/**
 * Prueba exploratoria ("monkey testing") de cada pantalla: aprieta cada botón
 * visible, escribe en cada campo, abre cada modal y lo cierra, con los datos
 * reales de la tienda sembrada. Nada puede romperse.
 *
 * Complementa el smoke de render: un modal que explota al abrirse, o un
 * formulario que revienta al tipear, no se ven si nadie los toca. Las
 * escrituras van al fetch simulado (responde 200), así que apretar "Guardar"
 * o "Eliminar" acá no tiene consecuencias.
 */
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_PATHS } from '../App';
import { fixture, mockApi } from '../test/api';
import { renderApp } from '../test/render';

async function settle(rounds = 3) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
  }
}

const errors: unknown[][] = [];

beforeEach(() => {
  errors.length = 0;
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
  vi.stubGlobal('open', vi.fn());
  vi.stubGlobal('alert', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderCrashes() {
  return errors.filter(
    (args) =>
      // jsdom avisa que no navega (descargas, links externos): no es un error del panel.
      !args.some((a) => String(a).includes('Not implemented: navigation')) &&
      args.some(
        (a) => a instanceof Error || (typeof a === 'string' && /The above error occurred|Uncaught/.test(a)),
      ),
  );
}

/** Lo que no se aprieta: salir de la sesión dejaría el resto de la pantalla sin probar. */
const SKIP = /cerrar sesi[oó]n|salir/i;
/** Tope por pantalla: las tablas largas repiten los mismos botones por fila. */
const MAX_CLICKS = 120;

const productId = fixture<{ items: { id: string }[] }>('/api/v1/products').items[0]!.id;
const paths = ALL_PATHS.map((p) => p.replace(':id', productId));

type User = ReturnType<typeof userEvent.setup>;

/** Completa un formulario como lo haría alguien: campos, selects y casillas. */
async function fill(user: User, root: HTMLElement) {
  const scope = within(root);
  for (const field of scope.queryAllByRole('textbox').slice(0, 20)) {
    if (!field.isConnected || field.hasAttribute('disabled') || field.hasAttribute('readonly')) continue;
    await user.type(field, '12');
  }
  for (const field of scope.queryAllByRole('spinbutton').slice(0, 10)) {
    if (!field.isConnected || field.hasAttribute('disabled')) continue;
    await user.type(field, '3');
  }
  for (const select of scope.queryAllByRole('combobox').slice(0, 10)) {
    if (!select.isConnected || select.hasAttribute('disabled') || select.tagName !== 'SELECT') continue;
    const options = Array.from((select as HTMLSelectElement).options).filter((o) => !o.disabled);
    if (options.length > 1) await user.selectOptions(select, options[options.length - 1]!);
  }
  for (const box of scope.queryAllByRole('checkbox').slice(0, 10)) {
    if (!box.isConnected || box.hasAttribute('disabled')) continue;
    await user.click(box);
  }
  await settle(1);
}

/**
 * Aprieta un botón; si abre un diálogo, lo completa y aprieta sus botones
 * (guardar, confirmar…) antes de cerrarlo con Escape.
 */
async function press(user: User, button: HTMLElement) {
  const before = screen.queryAllByRole('dialog').length;
  await user.click(button);
  await settle(2);
  const dialogs = screen.queryAllByRole('dialog');
  if (dialogs.length > before) {
    const dialog = dialogs[dialogs.length - 1]!;
    await fill(user, dialog);
    for (const inner of within(dialog).queryAllByRole('button').slice(0, 8)) {
      if (!inner.isConnected || inner.hasAttribute('disabled') || SKIP.test(inner.textContent ?? ''))
        continue;
      await user.click(inner);
      await settle(2);
    }
  }
  await user.keyboard('{Escape}');
  await settle(1);
}

describe('cada pantalla aguanta que la toquen', () => {
  // Hasta 120 clics con sus diálogos por pantalla: lleva más que el default.
  it.each(paths)('%s', { timeout: 60_000 }, async (path) => {
    mockApi();
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp(path);
    await settle(6);

    // Cada etiqueta se aprieta hasta 3 veces: los botones de solo ícono de una
    // tabla (editar, borrar) comparten etiqueta, y probar tres filas alcanza.
    const times = new Map<string, number>();
    let clicks = 0;
    for (let round = 0; round < 3 && clicks < MAX_CLICKS; round++) {
      for (const button of screen.queryAllByRole('button')) {
        if (clicks >= MAX_CLICKS) break;
        const label =
          `${button.getAttribute('aria-label') ?? ''}|${button.getAttribute('title') ?? ''}|${button.textContent ?? ''}`.trim();
        const count = times.get(label) ?? 0;
        if (count >= 3 || SKIP.test(label) || !button.isConnected || button.hasAttribute('disabled'))
          continue;
        times.set(label, count + 1);
        clicks++;
        await press(user, button);
      }
    }

    await fill(user, document.body);
    await settle(2);

    expect(renderCrashes()).toEqual([]);
  });
});
