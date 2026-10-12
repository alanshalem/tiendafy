/**
 * Prueba exploratoria ("monkey testing") de cada pantalla: aprieta cada botón
 * visible, escribe en cada campo, abre cada modal, lo completa y lo cierra,
 * con los datos reales de la tienda sembrada. Nada puede romperse.
 *
 * Complementa el smoke de render: un modal que explota al abrirse, o un
 * formulario que revienta al tipear, no se ven si nadie los toca. Las
 * escrituras van al fetch simulado (responde 200), así que apretar "Guardar"
 * o "Eliminar" acá no tiene consecuencias.
 *
 * Cada diálogo que se abre pasa además por axe (accesibilidad): el barrido de
 * a11y.test.tsx solo ve lo que está en pantalla al entrar.
 */
import axe from 'axe-core';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_PATHS } from '../App';
import { a11yViolations } from '../../../test-fixtures/a11y';
import { fixture, mockApi } from '../test/api';
import { explore, settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

/** Tope por pantalla: con sus diálogos, alcanza para recorrer todo lo visible. */
const MAX_CLICKS = 120;

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
  vi.stubGlobal('open', vi.fn());
  vi.stubGlobal('alert', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

const productId = fixture<{ items: { id: string }[] }>('/api/v1/products').items[0]!.id;
const paths = ALL_PATHS.map((p) => p.replace(':id', productId));

describe('cada pantalla aguanta que la toquen', () => {
  it.each(paths)('%s', { timeout: 60_000 }, async (path) => {
    mockApi();
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp(path);
    await settle(6);

    const inaccessible: { opener: string; violations: unknown[] }[] = [];
    await explore(
      user,
      () => document.body,
      MAX_CLICKS,
      async (dialog, opener) => {
        const violations = await a11yViolations(axe, dialog);
        if (violations.length > 0)
          inaccessible.push({ opener: opener.textContent?.trim() ?? '', violations });
      },
    );
    await settle(2);

    expect(crashes()).toEqual([]);
    expect(inaccessible).toEqual([]);
  });
});
