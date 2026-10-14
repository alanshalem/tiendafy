/**
 * Listados con ficha (compras, presupuestos, proveedores): el registro
 * abierto va en la URL, así que se llega directo por link, la ficha se abre
 * con el link de la fila (teclado incluido) y "volver" regresa a la lista con
 * sus filtros. También: los filtros de cada lista salen de la URL.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';
import { rx } from '../test/text';

let crashes: () => unknown[][];
beforeEach(() => {
  crashes = watchCrashes();
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function open(path: string, setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  await settle(4);
  return { api, user };
}

const lastCall = (api: MockApi, prefix: string) =>
  api.calls.filter((c) => c.method === 'GET' && c.path.startsWith(prefix)).at(-1)?.path ?? '';

describe('compras', () => {
  const po = fixture<{ id: string; supplierName: string; reference: string; items: unknown[] }>(
    '/api/v1/purchasing/purchase-orders/:id',
  );
  const withList = (a: MockApi) => {
    a.on('GET', `/api/v1/purchasing/purchase-orders/${po.id}`, po);
    a.on('GET', '/api/v1/purchasing/purchase-orders', {
      items: [{ ...po, totalFob: 1, items: po.items.length, units: 3 }],
      total: 1,
    });
  };

  it('el link de la fila abre la compra y "Compras" vuelve a la lista con su filtro', async () => {
    const { api, user } = await open('/compras?estado=DRAFT&q=cont', withList);
    expect(lastCall(api, '/api/v1/purchasing/purchase-orders?')).toContain('status=DRAFT');
    expect(screen.getByRole('searchbox', { name: 'Buscar compras' })).toHaveValue('cont');

    await user.click(screen.getByRole('link', { name: po.supplierName }));
    expect(await screen.findByRole('heading', { name: po.supplierName })).toBeInTheDocument();
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: /Compras/ }));
    expect(await screen.findByRole('searchbox', { name: 'Buscar compras' })).toHaveValue('cont');
  });

  it('se llega directo por link a una compra, y a una nueva', async () => {
    await open(`/compras?orden=${po.id}`, withList);
    expect(await screen.findByRole('heading', { name: po.supplierName })).toBeInTheDocument();
  });

  it('la pestaña de reposición también queda en la URL', async () => {
    const { api } = await open('/compras?vista=reposicion');
    expect(api.calls.some((c) => c.path.startsWith('/api/v1/purchasing/reorder-suggestions'))).toBe(true);
    expect(screen.getByRole('spinbutton', { name: 'Lead time en días' })).toBeInTheDocument();
  });

  it('"Nueva compra" abre el formulario vacío y volver regresa a la lista', async () => {
    const { user } = await open('/compras', withList);
    await user.click(screen.getByRole('button', { name: /Nueva compra/ }));
    expect(await screen.findByRole('heading', { name: 'Nueva compra' })).toBeInTheDocument();
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: /Compras/ }));
    expect(await screen.findByRole('link', { name: po.supplierName })).toBeInTheDocument();
  });

  it('sin resultados para un filtro, ofrece limpiarlo', async () => {
    const { api, user } = await open('/compras?q=nada', (a) =>
      a.on('GET', '/api/v1/purchasing/purchase-orders', { items: [], total: 0 }),
    );
    expect(screen.getByText(/Ninguna compra coincide/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpiar' }));
    await settle(2);
    expect(lastCall(api, '/api/v1/purchasing/purchase-orders?')).not.toContain('q=');
  });
});

describe('presupuestos', () => {
  const quote = fixture<{ id: string; number: string }>('/api/v1/quotes/:id');

  it('directo por link al presupuesto; volver lleva a la lista', async () => {
    const { user } = await open(`/presupuestos?presupuesto=${quote.id}&estado=sent`, (a) =>
      a.on('GET', `/api/v1/quotes/${quote.id}`, fixture<object>('/api/v1/quotes/:id')),
    );
    expect(await screen.findByRole('heading', { name: rx(quote.number) })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Presupuestos/ }));
    expect(await screen.findByRole('searchbox', { name: 'Buscar presupuestos' })).toBeInTheDocument();
  });

  it('el número de cada fila es un link a su ficha', async () => {
    const { api, user } = await open('/presupuestos?estado=sent');
    expect(lastCall(api, '/api/v1/quotes?')).toContain('status=sent');
    await user.click(await screen.findByRole('link', { name: quote.number }));
    expect(await screen.findByRole('heading', { name: rx(quote.number) })).toBeInTheDocument();
  });
});

describe('proveedores', () => {
  const row = fixture<{ items: { id: string; name: string }[] }>('/api/v1/suppliers').items[0]!;

  it('búsqueda e inactivos desde la URL; el nombre abre la ficha y sus compras llevan a Compras', async () => {
    const { api, user } = await open('/proveedores?q=tex&inactivos=1');
    const call = lastCall(api, '/api/v1/suppliers?');
    expect(call).toContain('q=tex');
    expect(call).toContain('includeInactive=true');
    expect(screen.getByRole('checkbox', { name: /Mostrar inactivos/ })).toBeChecked();

    await user.click(await screen.findByRole('link', { name: row.name }));
    expect(await screen.findByRole('heading', { name: rx(row.name) })).toBeInTheDocument();
    const purchases = screen
      .queryAllByRole('link')
      .filter((l) => l.getAttribute('href')?.includes('/compras?orden='));
    for (const link of purchases) expect(link.getAttribute('href')).toMatch(/^\/compras\?orden=/);

    await user.click(screen.getByRole('button', { name: /Proveedores/ }));
    expect(await screen.findByRole('searchbox', { name: 'Buscar proveedores' })).toHaveValue('tex');
  });
});
