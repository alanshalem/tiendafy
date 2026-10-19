/**
 * La visión general de Estadísticas pide el período elegido con sus fechas
 * (from/to), no con su cantidad de días: antes mandaba `days` y la API
 * contaba siempre hasta hoy, así que "del 1 al 31 de enero" mostraba los
 * últimos 31 días. Los clientes también responden al período: los nuevos,
 * con su variación contra el anterior.
 */
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

const OVERVIEW = '/api/v1/stats/overview';

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

describe('estadísticas: visión general', () => {
  it('pide el período elegido por fechas y muestra los clientes nuevos', async () => {
    const api = mockApi();
    api.on('GET', OVERVIEW, {
      ...fixture<Record<string, unknown>>(OVERVIEW),
      from: '2026-01-01',
      to: '2026-01-31',
      customers: 75,
      newCustomers: { current: 12, previous: 8 },
    });
    renderApp('/estadisticas?rango=Personalizado&desde=2026-01-01&hasta=2026-01-31');

    expect(await screen.findByText('Clientes nuevos', {}, { timeout: 5000 })).toBeInTheDocument();
    await settle(2);

    await waitFor(() =>
      expect(api.calls.some((c) => c.path === `${OVERVIEW}?from=2026-01-01&to=2026-01-31`)).toBe(true),
    );
    expect(api.calls.some((c) => c.path.startsWith(`${OVERVIEW}?days=`))).toBe(false);
    expect(screen.getByText('12')).toBeInTheDocument();
  });
});
