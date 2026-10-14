/**
 * La agenda de clientes como listado: la búsqueda y la página salen de la URL
 * (recargar o volver no las pierde) y "Exportar" baja la planilla con la
 * búsqueda puesta.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

const download = vi.hoisted(() => vi.fn());
vi.mock('../lib/download', () => ({ downloadBlob: download }));

let crashes: () => unknown[][];
beforeEach(() => {
  crashes = watchCrashes();
  download.mockReset();
});
afterEach(() => expect(crashes()).toEqual([]));

async function open(path: string, setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  await screen.findByRole('heading', { name: 'Clientes' });
  await settle(3);
  return { api, user };
}

describe('clientes: listado', () => {
  it('la búsqueda y la página vienen de la URL', async () => {
    const { api } = await open('/clientes?q=julieta&pagina=3');
    expect(screen.getByRole('searchbox', { name: 'Buscar clientes' })).toHaveValue('julieta');
    const list = api.calls.filter((c) => c.path.startsWith('/api/v1/customers?')).at(-1)!.path;
    expect(list).toContain('q=julieta');
    expect(list).toContain('offset=50');
  });

  it('exporta la agenda con la búsqueda puesta', async () => {
    const { api, user } = await open('/clientes?q=norte', (a) =>
      a.on('GET', '/api/v1/customers/export', 'csv'),
    );
    await user.click(screen.getByRole('button', { name: /Exportar/ }));
    await waitFor(() => expect(download).toHaveBeenCalled());
    expect(api.calls.some((c) => c.path === '/api/v1/customers/export?q=norte')).toBe(true);
  });

  it('si exportar falla, lo dice', async () => {
    const { user } = await open('/clientes', (a) => a.on('GET', '/api/v1/customers/export', {}, 500));
    await user.click(screen.getByRole('button', { name: /Exportar/ }));
    expect(await screen.findByText(/No se pudo exportar/)).toBeInTheDocument();
  });
});
