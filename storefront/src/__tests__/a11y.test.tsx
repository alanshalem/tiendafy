/**
 * Accesibilidad de cada página de la tienda con axe-core (ver
 * test-fixtures/a11y.ts): nombres accesibles, ARIA válido, foco en lo
 * oculto. Con los datos reales de la tienda sembrada.
 */
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { a11yViolations } from '../../../test-fixtures/a11y';
import { mockApi } from '../test/api';
import { settle } from '../test/explore';
import { PAGES } from '../test/pages';
import { renderPage } from '../test/server';

describe('accesibilidad de cada página', () => {
  it.each(Object.entries(PAGES))('%s', { timeout: 30_000 }, async (_, { url, params, load }) => {
    mockApi();
    await renderPage((await load()).default as never, url, params);
    await settle(4);
    expect(await a11yViolations(axe)).toEqual([]);
  });
});
