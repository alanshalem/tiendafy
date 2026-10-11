/**
 * Herramientas de la prueba exploratoria ("monkey testing"): dejar correr las
 * queries, completar formularios, apretar botones (y explorar los diálogos que
 * abren) y detectar si algo reventó. Las usan el recorrido de cada pantalla y
 * el del editor de diseño.
 */
import { act, screen, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

export type User = ReturnType<typeof userEvent.setup>;

/** Deja correr las queries de React Query (varias rondas: unas disparan otras). */
export async function settle(rounds = 3) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
  }
}

/** Lo que no se aprieta: salir de la sesión dejaría el resto sin probar. */
export const SKIP = /cerrar sesi[oó]n|salir/i;

const usable = (el: HTMLElement) =>
  el.isConnected && !el.hasAttribute('disabled') && !el.hasAttribute('readonly');

/** Completa un formulario como lo haría alguien: campos, selects y casillas. */
export async function fill(user: User, root: HTMLElement) {
  const scope = within(root);
  for (const field of scope.queryAllByRole('textbox').slice(0, 20)) {
    if (usable(field)) await user.type(field, '12');
  }
  for (const field of scope.queryAllByRole('spinbutton').slice(0, 10)) {
    if (usable(field)) await user.type(field, '3');
  }
  for (const select of scope.queryAllByRole('combobox').slice(0, 10)) {
    if (!usable(select) || select.tagName !== 'SELECT') continue;
    const options = Array.from((select as HTMLSelectElement).options).filter((o) => !o.disabled);
    if (options.length > 1) await user.selectOptions(select, options[options.length - 1]!);
  }
  for (const box of scope.queryAllByRole('checkbox').slice(0, 10)) {
    if (usable(box)) await user.click(box);
  }
  await settle(1);
}

/**
 * Aprieta un botón; si abre un diálogo, lo completa y aprieta sus botones
 * (guardar, confirmar…) antes de cerrarlo con Escape.
 */
export async function press(user: User, button: HTMLElement) {
  const before = screen.queryAllByRole('dialog').length;
  await user.click(button);
  await settle(2);
  const dialogs = screen.queryAllByRole('dialog');
  if (dialogs.length > before) {
    const dialog = dialogs[dialogs.length - 1]!;
    await fill(user, dialog);
    for (const inner of within(dialog).queryAllByRole('button').slice(0, 8)) {
      if (!usable(inner) || SKIP.test(inner.textContent ?? '')) continue;
      await user.click(inner);
      await settle(2);
    }
  }
  await user.keyboard('{Escape}');
  await settle(1);
}

/**
 * Aprieta los botones de `root` (cada etiqueta hasta 3 veces: los de solo
 * ícono de una tabla comparten etiqueta y tres filas alcanzan) y después
 * completa sus campos.
 */
export async function explore(user: User, root: () => HTMLElement, maxClicks: number) {
  const times = new Map<string, number>();
  let clicks = 0;
  for (let round = 0; round < 3 && clicks < maxClicks; round++) {
    for (const button of within(root()).queryAllByRole('button')) {
      if (clicks >= maxClicks) break;
      const label = [button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent]
        .join('|')
        .trim();
      const count = times.get(label) ?? 0;
      if (count >= 3 || SKIP.test(label) || !usable(button)) continue;
      times.set(label, count + 1);
      clicks++;
      await press(user, button);
    }
  }
  await fill(user, root());
}

/**
 * Junta lo que React reporta cuando un componente revienta. Se instala en
 * beforeEach y se consulta al final de cada test.
 */
export function watchCrashes() {
  const errors: unknown[][] = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
  return () =>
    errors.filter(
      (args) =>
        // jsdom avisa que no navega (descargas, links externos): no es del panel.
        !args.some((a) => String(a).includes('Not implemented: navigation')) &&
        args.some(
          (a) => a instanceof Error || (typeof a === 'string' && /The above error occurred|Uncaught/.test(a)),
        ),
    );
}
