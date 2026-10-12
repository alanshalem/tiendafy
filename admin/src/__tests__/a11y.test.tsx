/**
 * Accesibilidad de cada pantalla del panel con axe-core (ver
 * test-fixtures/a11y.ts): nombres accesibles, ARIA válido, foco en lo
 * oculto. Con los datos reales de la tienda sembrada.
 */
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { ALL_PATHS } from '../App';
import { a11yViolations } from '../../../test-fixtures/a11y';
import { fixture, mockApi } from '../test/api';
import { settle } from '../test/explore';
import { renderApp } from '../test/render';

const productId = fixture<{ items: { id: string }[] }>('/api/v1/products').items[0]!.id;
const paths = ALL_PATHS.map((p) => p.replace(':id', productId));

describe('accesibilidad de cada pantalla', () => {
  it.each(paths)('%s', { timeout: 30_000 }, async (path) => {
    mockApi();
    renderApp(path);
    await settle(6);
    expect(await a11yViolations(axe)).toEqual([]);
  });
});
