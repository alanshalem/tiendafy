/**
 * El listado de Ventas: el número corto de cada venta (y abrirla con el
 * teclado), búsqueda, estado y página en la URL, error con "Reintentar"
 * distinto de "no hay ventas" y de "no coincide nada", la venta de un link
 * aunque no esté en la página, el contador "Por despachar" para quien no ve
 * estadísticas, exportar con los filtros puestos y marcar varias como
 * enviadas contando qué pasó con cada una.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle, watchCrashes } from '../test/explore';

const download = vi.hoisted(() => vi.fn());
vi.mock('../lib/download', () => ({ downloadBlob: download }));

interface Order {
  id: string;
  status: string;
  buyerEmail: string;
  paymentId: string | null;
}
const orders = fixture<{ items: Order[]; total: number }>('/api/v1/orders');
const paid = orders.items.find((o) => o.status === 'PAID')!;
const other = orders.items.find((o) => o.id !== paid.id)!;
const short = (id: string) => `#${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

let crashes: () => unknown[][];
beforeEach(() => {
  crashes = watchCrashes();
  download.mockReset();
});
afterEach(() => expect(crashes()).toEqual([]));

async function openOrders(path = '/ventas', setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  await screen.findByRole('heading', { name: 'Ventas' });
  await settle(3);
  return { api, user };
}

const listCalls = (api: MockApi) =>
  api.calls.filter(
    (c) => c.method === 'GET' && c.path.startsWith('/api/v1/orders?') && c.path.includes('limit=25'),
  );

describe('ventas: listado', () => {
  it('muestra el número corto de cada venta y la abre con el teclado', async () => {
    const { user } = await openOrders('/ventas', (a) =>
      a.on('GET', '/api/v1/orders', { items: [paid], total: 1 }),
    );
    const number = screen.getByRole('button', { name: `Venta ${short(paid.id)}: ver detalle` });
    expect(number).toHaveTextContent(short(paid.id));
    number.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: `Venta ${short(paid.id)}: ocultar detalle` })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByText(`Venta ${short(paid.id)}`)).toBeInTheDocument();
  });

  it('búsqueda, estado y página salen de la URL y van al servidor', async () => {
    const { api, user } = await openOrders('/ventas?estado=PAID&pagina=2&q=ana');
    const last = listCalls(api).at(-1)!.path;
    expect(last).toContain('status=PAID');
    expect(last).toContain('offset=25');
    expect(last).toContain('q=ana');
    expect(screen.getByRole('searchbox', { name: 'Buscar ventas' })).toHaveValue('ana');

    // Cambiar el estado vuelve a la página 1.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por estado' }), 'FULFILLED');
    await settle(2);
    const after = listCalls(api).at(-1)!.path;
    expect(after).toContain('status=FULFILLED');
    expect(after).toContain('offset=0');
  });

  it('si el listado no carga, lo dice y deja reintentar (no es "todavía no hay ventas")', async () => {
    const { api, user } = await openOrders('/ventas', (a) => a.on('GET', '/api/v1/orders', {}, 500));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las ventas');
    expect(screen.queryByText('Todavía no hay ventas.')).toBeNull();

    api.on('GET', '/api/v1/orders', { items: [paid], total: 1 });
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(paid.buyerEmail)).toBeInTheDocument();
  });

  it('sin resultados para un filtro ofrece limpiarlo; sin ventas, explica de dónde salen', async () => {
    const { api, user } = await openOrders('/ventas?q=nadie', (a) =>
      a.on('GET', '/api/v1/orders', { items: [], total: 0 }),
    );
    expect(screen.getByText('Ninguna venta coincide con la búsqueda o el filtro.')).toBeInTheDocument();
    api.on('GET', '/api/v1/orders', { items: [paid], total: 1 });
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda y filtros' }));
    expect(await screen.findByText(paid.buyerEmail)).toBeInTheDocument();
    expect(listCalls(api).at(-1)!.path).not.toContain('q=');
  });

  it('sin ninguna venta todavía', async () => {
    await openOrders('/ventas', (a) => a.on('GET', '/api/v1/orders', { items: [], total: 0 }));
    expect(screen.getByText('Todavía no hay ventas.')).toBeInTheDocument();
  });
});

describe('ventas: link a una venta (?order=)', () => {
  it('si está en la página, la abre ahí', async () => {
    await openOrders(`/ventas?order=${paid.id}`, (a) =>
      a.on('GET', '/api/v1/orders', { items: [paid], total: 1 }),
    );
    expect(
      screen.getByRole('button', { name: `Venta ${short(paid.id)}: ocultar detalle` }),
    ).toBeInTheDocument();
  });

  it('si no está en la página, la pide sola y la muestra arriba', async () => {
    const { api } = await openOrders(`/ventas?order=${paid.id}`, (a) => {
      a.on('GET', '/api/v1/orders', { items: [other], total: 80 });
      a.on('GET', `/api/v1/orders/${paid.id}`, paid);
    });
    const card = await screen.findByRole('region', { name: `Venta ${short(paid.id)}` });
    expect(within(card).getByText(/no está en esta página/)).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === `/api/v1/orders/${paid.id}`)).toBe(true);
  });

  it('si no existe, lo dice', async () => {
    await openOrders('/ventas?order=00000000-0000-0000-0000-000000000000', (a) => {
      a.on('GET', '/api/v1/orders', { items: [other], total: 1 });
      a.on('GET', '/api/v1/orders/00000000-0000-0000-0000-000000000000', {}, 404);
    });
    expect(await screen.findByText(/No encontramos la venta del link/)).toBeInTheDocument();
  });
});

describe('ventas: métricas', () => {
  it('"Por despachar" se ve aunque el rol no tenga estadísticas, y filtra', async () => {
    const perms = fixture<{ role: string; permissions: string[] }>('/api/v1/me/permissions');
    const { api, user } = await openOrders('/ventas', (a) =>
      a.on('GET', '/api/v1/me/permissions', {
        ...perms,
        permissions: perms.permissions.filter((p) => p !== 'stats.read'),
      }),
    );
    expect(api.calls.some((c) => c.path.startsWith('/api/v1/stats/sales'))).toBe(false);
    expect(screen.queryByText(/Facturado/)).toBeNull();
    await user.click(screen.getByRole('button', { name: /Por despachar/ }));
    await settle(2);
    expect(listCalls(api).at(-1)!.path).toContain('status=PAID');
  });
});

describe('ventas: exportar', () => {
  it('baja el CSV con la búsqueda y el estado puestos', async () => {
    const { api, user } = await openOrders('/ventas?estado=PAID&q=ana', (a) =>
      a.on('GET', '/api/v1/orders/export', 'csv'),
    );
    await user.click(screen.getByRole('button', { name: /Exportar/ }));
    await waitFor(() => expect(download).toHaveBeenCalled());
    const call = api.calls.find((c) => c.path.startsWith('/api/v1/orders/export'))!;
    expect(call.path).toContain('status=PAID');
    expect(call.path).toContain('q=ana');
    expect(call.path).not.toContain('offset');
  });

  it('si falla, lo dice', async () => {
    const { user } = await openOrders('/ventas', (a) => a.on('GET', '/api/v1/orders/export', {}, 500));
    await user.click(screen.getByRole('button', { name: /Exportar/ }));
    expect(await screen.findByText(/No se pudo exportar/)).toBeInTheDocument();
    expect(download).not.toHaveBeenCalled();
  });
});

describe('ventas: marcar enviadas en lote', () => {
  it('manda las elegidas y cuenta qué pasó, con el motivo de las que no salieron', async () => {
    const { api, user } = await openOrders('/ventas', (a) => {
      a.on('GET', '/api/v1/orders', { items: [paid, other], total: 2 });
      a.on('POST', '/api/v1/orders/bulk/fulfill', {
        fulfilled: 1,
        skipped: 0,
        failed: 1,
        results: [
          { id: paid.id, number: short(paid.id), result: 'fulfilled', reason: null },
          { id: other.id, number: short(other.id), result: 'failed', reason: 'Todavía no está cobrada.' },
        ],
      });
    });
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar todas las ventas de la página' }));
    expect(screen.getByText('2 seleccionadas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Marcar como enviadas/ }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Marcar enviadas' }));
    await settle(2);

    const post = api.calls.find((c) => c.method === 'POST' && c.path === '/api/v1/orders/bulk/fulfill')!;
    expect(post.body).toEqual({ ids: [paid.id, other.id] });
    const summary = screen
      .getAllByRole('status')
      .find((s) => s.textContent?.includes('marcada como enviada'))!;
    expect(summary).toHaveTextContent('1 marcada como enviada · 1 no se pudo marcar');
    expect(summary).toHaveTextContent(`${short(other.id)}: Todavía no está cobrada.`);
    // La que salió deja de estar elegida; la que falló queda.
    expect(screen.getByText('1 seleccionada')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: `Seleccionar la venta ${short(other.id)}` })).toBeChecked();

    await user.click(within(summary).getByRole('button', { name: 'Cerrar el resumen' }));
    expect(screen.queryByRole('button', { name: 'Cerrar el resumen' })).toBeNull();
  });

  it('cancelar la confirmación no manda nada; un error lo avisa', async () => {
    const { api, user } = await openOrders('/ventas', (a) => {
      a.on('GET', '/api/v1/orders', { items: [paid], total: 1 });
      a.on('POST', '/api/v1/orders/bulk/fulfill', { title: 'x', detail: 'Se cayó.' }, 500);
    });
    await user.click(screen.getByRole('checkbox', { name: `Seleccionar la venta ${short(paid.id)}` }));
    await user.click(screen.getByRole('button', { name: /Marcar como enviadas/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(api.calls.some((c) => c.path === '/api/v1/orders/bulk/fulfill')).toBe(false);

    await user.click(screen.getByRole('button', { name: /Marcar como enviadas/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Marcar enviadas' }),
    );
    expect(await screen.findByText(/Se cayó|No se pudieron marcar/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Deseleccionar/ }));
    expect(screen.queryByText('1 seleccionada')).toBeNull();
  });

  it('sin permiso de despachar no hay selección', async () => {
    const perms = fixture<{ role: string; permissions: string[] }>('/api/v1/me/permissions');
    await openOrders('/ventas', (a) => {
      a.on('GET', '/api/v1/orders', { items: [paid], total: 1 });
      a.on('GET', '/api/v1/me/permissions', {
        ...perms,
        permissions: perms.permissions.filter((p) => p !== 'orders.fulfill'),
      });
    });
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
