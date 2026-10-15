/**
 * El listado de Ventas: el número de cada venta en la tienda (y abrirla con
 * el teclado), búsqueda, estado y página en la URL, error con "Reintentar"
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
import { orderLabel } from '../lib/orderNumber';

const download = vi.hoisted(() => vi.fn());
vi.mock('../lib/download', () => ({ downloadBlob: download }));

interface Order {
  id: string;
  status: string;
  buyerEmail: string;
  paymentId: string | null;
  number: number | null;
}
// Cómo se nombra cada venta (orderLabel: su número en la tienda) sale de la
// venta exportada, nunca escrito a mano: cambia al regenerar las fixtures.
const orders = fixture<{ items: Order[]; total: number }>('/api/v1/orders');
const paid = orders.items.find((o) => o.status === 'PAID')!;
const other = orders.items.find((o) => o.id !== paid.id)!;

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
  it('muestra el número de cada venta en la tienda y la abre con el teclado', async () => {
    const { user } = await openOrders('/ventas', (a) =>
      a.on('GET', '/api/v1/orders', { items: [paid], total: 1 }),
    );
    // El correlativo de la tienda (#1042), no el principio del id.
    expect(orderLabel(paid)).toBe(`#${paid.number}`);
    const number = screen.getByRole('button', { name: `Venta ${orderLabel(paid)}: ver detalle` });
    expect(number).toHaveTextContent(orderLabel(paid));
    number.focus();
    await user.keyboard('{Enter}');
    expect(
      screen.getByRole('button', { name: `Venta ${orderLabel(paid)}: ocultar detalle` }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(`Venta ${orderLabel(paid)}`)).toBeInTheDocument();
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
      screen.getByRole('button', { name: `Venta ${orderLabel(paid)}: ocultar detalle` }),
    ).toBeInTheDocument();
  });

  it('si no está en la página, la pide sola y la muestra arriba', async () => {
    const { api } = await openOrders(`/ventas?order=${paid.id}`, (a) => {
      a.on('GET', '/api/v1/orders', { items: [other], total: 80 });
      a.on('GET', `/api/v1/orders/${paid.id}`, paid);
    });
    const card = await screen.findByRole('region', { name: `Venta ${orderLabel(paid)}` });
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
          { id: paid.id, number: orderLabel(paid), result: 'fulfilled', reason: null },
          { id: other.id, number: orderLabel(other), result: 'failed', reason: 'Todavía no está cobrada.' },
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
    expect(summary).toHaveTextContent(`${orderLabel(other)}: Todavía no está cobrada.`);
    // La que salió deja de estar elegida; la que falló queda.
    expect(screen.getByText('1 seleccionada')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: `Seleccionar la venta ${orderLabel(other)}` })).toBeChecked();

    await user.click(within(summary).getByRole('button', { name: 'Cerrar el resumen' }));
    expect(screen.queryByRole('button', { name: 'Cerrar el resumen' })).toBeNull();
  });

  it('cancelar la confirmación no manda nada; un error lo avisa', async () => {
    const { api, user } = await openOrders('/ventas', (a) => {
      a.on('GET', '/api/v1/orders', { items: [paid], total: 1 });
      a.on('POST', '/api/v1/orders/bulk/fulfill', { title: 'x', detail: 'Se cayó.' }, 500);
    });
    await user.click(screen.getByRole('checkbox', { name: `Seleccionar la venta ${orderLabel(paid)}` }));
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

  it('sin permiso de despachar se elige igual (para exportar), pero no se marca ni se imprimen etiquetas ni remitos', async () => {
    const perms = fixture<{ role: string; permissions: string[] }>('/api/v1/me/permissions');
    const { user } = await openOrders('/ventas', (a) => {
      a.on('GET', '/api/v1/orders', { items: [paid], total: 1 });
      a.on('GET', '/api/v1/me/permissions', {
        ...perms,
        permissions: perms.permissions.filter((p) => p !== 'orders.fulfill'),
      });
    });
    await user.click(screen.getByRole('checkbox', { name: `Seleccionar la venta ${orderLabel(paid)}` }));
    expect(screen.queryByRole('button', { name: /Marcar como enviadas/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Etiquetas/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remitos/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Exportar/ })).toHaveLength(2); // el del listado y el de la selección
  });
});

describe('ventas: filtros', () => {
  it('fechas, canal, envío y cobro salen de la URL y van al servidor', async () => {
    const { api, user } = await openOrders(
      '/ventas?desde=2026-10-01&hasta=2026-10-14&canal=manual&envio=por-despachar&cobro=transfer',
    );
    const last = listCalls(api).at(-1)!.path;
    expect(last).toContain('from=2026-10-01');
    expect(last).toContain('to=2026-10-14');
    expect(last).toContain('channel=manual');
    expect(last).toContain('shipping=por-despachar');
    expect(last).toContain('payment=transfer');
    expect(screen.getByRole('combobox', { name: 'Filtrar por canal' })).toHaveValue('manual');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por cobro' }), 'cash');
    await settle(2);
    expect(listCalls(api).at(-1)!.path).toContain('payment=cash');
  });

  it('la tabla tiene la columna de envío', async () => {
    await openOrders('/ventas', (a) =>
      a.on('GET', '/api/v1/orders', { items: [{ ...paid, shippingStatus: 'por-despachar' }], total: 1 }),
    );
    expect(screen.getByRole('columnheader', { name: 'Envío' })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Por despachar')).toBeInTheDocument();
  });
});

describe('ventas: más acciones en lote', () => {
  async function selectBoth(setup?: (api: MockApi) => void) {
    const ctx = await openOrders('/ventas', (a) => {
      a.on('GET', '/api/v1/orders', { items: [paid, other], total: 2 });
      setup?.(a);
    });
    await ctx.user.click(screen.getByRole('checkbox', { name: 'Seleccionar todas las ventas de la página' }));
    return ctx;
  }

  it('exporta solo las elegidas', async () => {
    const { api, user } = await selectBoth((a) => a.on('GET', '/api/v1/orders/export', 'csv'));
    const bar = screen.getByText('2 seleccionadas').parentElement!;
    await user.click(within(bar).getByRole('button', { name: /Exportar/ }));
    await waitFor(() => expect(download).toHaveBeenCalled());
    const call = api.calls.find((c) => c.path.startsWith('/api/v1/orders/export'))!;
    expect(call.path).toBe(`/api/v1/orders/export?ids=${paid.id},${other.id}`);
  });

  it('factura de a una las cobradas y cuenta qué pasó con cada una', async () => {
    const { api, user } = await selectBoth((a) => {
      // Las dos cobradas: una sale y ARCA rechaza la otra.
      a.on('GET', '/api/v1/orders', { items: [paid, { ...other, status: 'PAID' }], total: 2 });
      a.on('GET', '/api/v1/fiscal/readiness', { ready: true });
      a.on('POST', `/api/v1/orders/${paid.id}/invoice`, { authorized: true, cae: '1' });
      a.on('POST', `/api/v1/orders/${other.id}/invoice`, {
        authorized: false,
        cae: null,
        errors: [{ code: '10015', message: 'Doc inválido' }],
      });
    });
    await user.click(screen.getByRole('button', { name: /^Facturar$/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Facturar' }));
    await settle(3);
    const posts = api.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/invoice'));
    expect(posts.map((p) => p.path)).toEqual([paid, other].map((o) => `/api/v1/orders/${o.id}/invoice`));
    const report = screen.getAllByRole('status').find((s) => /facturada/.test(s.textContent ?? ''))!;
    expect(report).toHaveTextContent('1 facturada');
    // Nombrada como en la tabla (#1042), no con el id corto.
    expect(report).toHaveTextContent(`${orderLabel(other)}: ARCA la rechazó: Doc inválido`);
  });

  it('etiquetas: un solo PDF de Despacho, y avisa cuáles no tienen envío', async () => {
    const { api, user } = await selectBoth((a) =>
      a.on('POST', '/api/v1/fulfillment/labels', {
        results: [
          { orderId: paid.id, number: orderLabel(paid), carrier: 'zipnova', status: 'ok', reason: null },
          { orderId: other.id, number: orderLabel(other), carrier: null, status: 'sin-envio', reason: null },
        ],
        ok: 1,
        missing: 1,
        fileName: 'etiquetas.pdf',
        pdfBase64: btoa('%PDF-1.4'),
      }),
    );
    await user.click(screen.getByRole('button', { name: /Etiquetas/ }));
    await settle(3);
    expect(api.calls.find((c) => c.path === '/api/v1/fulfillment/labels')!.body).toEqual({
      orderIds: [paid.id, other.id],
    });
    expect(download).toHaveBeenCalledTimes(1);
    const report = screen.getAllByRole('status').find((s) => s.textContent?.includes('etiqueta'))!;
    expect(report).toHaveTextContent(`${orderLabel(other)}: No tiene un envío generado`);
  });

  it('remitos: el PDF de Despacho con las elegidas', async () => {
    const { api, user } = await selectBoth((a) => a.on('POST', '/api/v1/fulfillment/packing-slips', 'pdf'));
    await user.click(screen.getByRole('button', { name: /Remitos/ }));
    await waitFor(() => expect(download).toHaveBeenCalled());
    expect(api.calls.find((c) => c.path === '/api/v1/fulfillment/packing-slips')!.body).toEqual({
      orderIds: [paid.id, other.id],
    });
  });

  it('sin la facturación lista, en vez de "Facturar" lleva a configurarla', async () => {
    await selectBoth((a) => a.on('GET', '/api/v1/fiscal/readiness', { ready: false }));
    // Primero que llegue la respuesta de /fiscal/readiness (en CI tardaba más
    // que el resto y el botón todavía estaba): recién ahí no tiene que haber "Facturar".
    expect(await screen.findByRole('link', { name: /Configurá la facturación/ })).toHaveAttribute(
      'href',
      '/configuracion/facturacion',
    );
    expect(screen.queryByRole('button', { name: /^Facturar$/ })).toBeNull();
  });
});

describe('ventas: en el celular', () => {
  it('cada venta es una tarjeta con total, estado y la acción principal', async () => {
    const mm = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('max-width'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    await openOrders('/ventas', (a) => a.on('GET', '/api/v1/orders', { items: [paid], total: 1 }));
    expect(screen.queryByRole('table')).toBeNull();
    const card = screen.getByRole('article', { name: `Venta ${orderLabel(paid)}` });
    expect(within(card).getByText('Pagada')).toBeInTheDocument();
    expect(
      within(card).getByRole('button', { name: /Marcar enviada|Lista para retirar/ }),
    ).toBeInTheDocument();
    mm.mockRestore();
  });
});
