/**
 * Prueba exploratoria ("monkey testing") de cada pantalla: aprieta cada botón
 * visible, escribe en cada campo, abre cada modal, lo completa y lo cierra,
 * con los datos reales de la tienda sembrada. Nada puede romperse.
 *
 * Complementa el smoke de render: un modal que explota al abrirse, o un
 * formulario que revienta al tipear, no se ven si nadie los toca. Las
 * escrituras van al fetch simulado (responde 200), así que apretar "Guardar"
 * o "Eliminar" acá no tiene consecuencias.
 */
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_PATHS } from '../App';
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

    await explore(user, () => document.body, MAX_CLICKS);
    await settle(2);

    expect(crashes()).toEqual([]);
  });
});
