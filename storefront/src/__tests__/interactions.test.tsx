/**
 * Prueba exploratoria ("monkey testing") de cada página de la tienda: aprieta
 * cada botón visible (agregar al carrito, filtros, variantes, pasos del
 * checkout…), escribe en cada campo, abre cada diálogo y lo cierra, con los
 * datos reales de la tienda sembrada. Nada puede romperse.
 *
 * Las escrituras van al fetch simulado, así que comprar o enviar un formulario
 * acá no tiene consecuencias.
 */
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../test/api';
import { explore, settle, watchCrashes } from '../test/explore';
import { PAGES } from '../test/pages';
import { renderPage } from '../test/server';

/** Tope por página: la tienda tiene menos controles que el panel. */
const MAX_CLICKS = 80;

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
  vi.stubGlobal('open', vi.fn());
  vi.stubGlobal('alert', vi.fn());
});

afterEach(() => vi.restoreAllMocks());

describe('cada página aguanta que la toquen', () => {
  it.each(Object.entries(PAGES))('%s', { timeout: 60_000 }, async (_, { url, params, load }) => {
    mockApi();
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    await renderPage((await load()).default as never, url, params);
    await settle(4);

    await explore(user, () => document.body, MAX_CLICKS);
    await settle(2);

    expect(crashes()).toEqual([]);
  });
});
