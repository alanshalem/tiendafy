/**
 * El resto de los listados que pasaron a guardar filtros y página en la URL:
 * lo que trae la URL llega a la API, y un link a una lista de precios abre
 * esa lista (o avisa si ya no existe).
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

async function open(path: string, setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  await settle(5);
  return { api, user };
}

const lastCall = (api: MockApi, prefix: string) =>
  api.calls.filter((c) => c.method === 'GET' && c.path.startsWith(prefix)).at(-1)?.path ?? '';

describe('listados con la URL', () => {
  it('rentabilidad: período personalizado y página', async () => {
    const { api } = await open(
      '/estadisticas/rentabilidad?rango=Personalizado&desde=2026-01-01&hasta=2026-01-31&pagina=2',
    );
    const call = lastCall(api, '/api/v1/stats/profitability');
    expect(call).toContain('from=2026-01-01');
    expect(call).toContain('to=2026-01-31');
    expect(call).toContain('offset=20');
  });

  it('cupones: un período predefinido se guarda por nombre', async () => {
    const { api, user } = await open('/estadisticas/cupones');
    const before = lastCall(api, '/api/v1/stats/coupons');
    await user.selectOptions(screen.getAllByRole('combobox')[0]!, 'Hoy');
    await settle(2);
    const today = lastCall(api, '/api/v1/stats/coupons');
    expect(today).not.toBe(before);
    const day = /from=([\d-]+)&to=([\d-]+)/.exec(today)!;
    expect(day[1]).toBe(day[2]);
  });

  it('carritos abandonados: la página de la URL', async () => {
    const carts = await open('/ventas/carritos?pagina=3');
    expect(lastCall(carts.api, '/api/v1/stats/abandoned-carts')).toContain('offset=50');
  });

  it('mensajes: pestaña y página desde la URL', async () => {
    const { api } = await open('/mensajes?filtro=repentance&pagina=2');
    expect(lastCall(api, '/api/v1/contact/messages')).toContain('offset=25');
    expect(screen.getByRole('searchbox', { name: 'Buscar mensajes' })).toBeInTheDocument();
  });

  it('tesorería: la cuenta filtrada viaja a la API', async () => {
    const account = fixture<{ items: { id: string }[] }>('/api/v1/finance/accounts').items[0]!;
    const { api } = await open(`/tesoreria?cuenta=${account.id}`);
    expect(lastCall(api, '/api/v1/finance/movements')).toContain(`accountId=${account.id}`);
  });

  it('costos: "sin costo" y búsqueda desde la URL', async () => {
    const { api } = await open('/productos/costos?sinCosto=1&q=barra');
    const call = lastCall(api, '/api/v1/products?');
    expect(call).toContain('missingCost=true');
    expect(call).toContain('q=barra');
  });

  it('inventario: recorte de stock desde la URL', async () => {
    const { api } = await open('/productos/inventario?stock=out');
    expect(lastCall(api, '/api/v1/products?')).toContain('stock=out');
  });

  it('marketing: la página de campañas desde la URL', async () => {
    const { api } = await open('/marketing?pagina=2');
    expect(lastCall(api, '/api/v1/admin/campaigns')).toContain('offset=25');
  });

  it('cupones: búsqueda y página desde la URL; buscar va a la base y vuelve a la página 1', async () => {
    const { api, user } = await open('/descuentos?q=ver&pagina=2');
    let call = lastCall(api, '/api/v1/coupons?');
    expect(call).toContain('q=ver');
    expect(call).toContain('offset=25');
    const box = screen.getByRole('searchbox', { name: 'Buscar cupón por código' });
    expect(box).toHaveValue('ver');

    // Sin resultados, el buscador sigue a la vista (antes desaparecía con la tabla).
    api.on('GET', '/api/v1/coupons', { items: [], total: 0 });
    await user.type(box, 'ano');
    // La búsqueda espera a que se deje de tipear.
    await waitFor(() => expect(lastCall(api, '/api/v1/coupons?')).toContain('q=verano'), { timeout: 3000 });
    call = lastCall(api, '/api/v1/coupons?');
    expect(call).toContain('offset=0');
    expect(await screen.findByText('Ningún cupón coincide con la búsqueda.')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Buscar cupón por código' })).toBeInTheDocument();
  });

  it('mercado libre: la página de ventas tiene su propio parámetro', async () => {
    const { api } = await open('/mercadolibre?tab=ventas&pagina-ventas=3&pagina=7');
    expect(lastCall(api, '/api/v1/admin/meli/orders')).toContain('offset=50');
  });

  it('mercado libre: el filtro de preguntas desde la URL', async () => {
    const { api, user } = await open('/mercadolibre?tab=preguntas&preguntas=todas');
    expect(lastCall(api, '/api/v1/admin/meli/questions')).toBe('/api/v1/admin/meli/questions');
    await user.click(screen.getByRole('button', { name: 'Sin responder' }));
    await settle(2);
    expect(lastCall(api, '/api/v1/admin/meli/questions')).toContain('status=UNANSWERED');
  });
});

describe('listas de precios', () => {
  const list = fixture<{ items: { id: string; name: string }[] }>('/api/v1/price-lists').items[0]!;

  it('un link abre los precios de esa lista, con su búsqueda', async () => {
    const { api } = await open(`/productos/listas-de-precios?lista=${list.id}&q=barra`);
    expect(lastCall(api, `/api/v1/price-lists/${list.id}/prices`)).toContain('q=barra');
    expect(screen.getByRole('searchbox', { name: 'Buscar en la lista' })).toHaveValue('barra');
  });

  it('si la lista ya no existe, lo dice y deja volver', async () => {
    const { user } = await open('/productos/listas-de-precios?lista=00000000-0000-0000-0000-000000000000');
    expect(screen.getByText(/no existe o ya se borró/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver las listas' }));
    expect(await screen.findByRole('heading', { name: 'Listas de precios' })).toBeInTheDocument();
  });
});
