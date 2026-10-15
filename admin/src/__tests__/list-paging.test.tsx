/**
 * Listados que antes venían enteros (o cortados sin aviso) y ahora van de a
 * una página: el panel pide limit/offset, muestra cuántos hay en total y el
 * paginador pide la página siguiente al servidor.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function open(path: string, setup: (api: MockApi) => void) {
  const api = mockApi();
  setup(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  await settle(4);
  return { api, user };
}

const asked = (api: MockApi, path: string, ...parts: string[]) =>
  api.calls.some(
    (c) => c.method === 'GET' && c.path.startsWith(`${path}?`) && parts.every((p) => c.path.includes(p)),
  );

describe('listados paginados', () => {
  it('Mercado Libre: las publicaciones van de a 25 y la página 2 se le pide al servidor', async () => {
    const item = fixture<{ items: Record<string, unknown>[] }>('/api/v1/admin/meli/items').items[0]!;
    const page = Array.from({ length: 25 }, (_, i) => ({
      ...item,
      id: `MLA${i}`,
      title: `Publicación ${i}`,
    }));
    const { api, user } = await open('/mercadolibre?tab=publicaciones', (a) =>
      a.on('GET', '/api/v1/admin/meli/items', { items: page, total: 60 }),
    );
    expect(await screen.findByText('1–25 de 60 publicaciones')).toBeInTheDocument();
    expect(asked(api, '/api/v1/admin/meli/items', 'limit=25', 'offset=0')).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(asked(api, '/api/v1/admin/meli/items', 'offset=25')).toBe(true));
  });

  it('cuentas corrientes: las cifras de arriba son de todos los saldos, no de la página', async () => {
    const row = fixture<{ items: Record<string, unknown>[] }>('/api/v1/finance/balances').items[0]!;
    const { api, user } = await open('/cuentas-corrientes', (a) =>
      a.on('GET', '/api/v1/finance/balances', {
        items: [{ ...row, balanceMinor: 1_000_00, currency: 'ARS' }],
        total: 30,
        totalMinor: 7_000_00,
        positiveMinor: 9_000_00,
        negativeMinor: -2_000_00,
      }),
    );
    expect(await screen.findByText('1–25 de 30 contactos')).toBeInTheDocument();
    // "Nos deben" suma todos los saldos a favor (9.000), no el de la fila a la vista (1.000).
    expect(screen.getByText(/9\.000/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(asked(api, '/api/v1/finance/balances', 'offset=25')).toBe(true));
  });

  it('mis tiendas: la búsqueda va al servidor', async () => {
    const tenant = fixture<{ items: Record<string, unknown>[] }>('/api/v1/tenants').items[0]!;
    const { api, user } = await open('/tenants', (a) =>
      a.on('GET', '/api/v1/tenants', { items: [tenant], total: 1, canCreate: true, manageable: [] }),
    );
    await user.type(await screen.findByLabelText('Buscar tienda por nombre'), 'deportes');
    await waitFor(() => expect(asked(api, '/api/v1/tenants', 'q=deportes', 'limit=25')).toBe(true));
  });
});
