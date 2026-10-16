/**
 * La tarjeta de pauta de Meta Ads en Rentabilidad, en cada estado: sin la
 * integración configurada, sin conectar o vencida (conectar/reconectar, con
 * su error), eligiendo la cuenta publicitaria, con gasto (ROAS real =
 * ganancia ÷ gasto, y el gasto por campaña) y desconectarla. Conectar,
 * elegir la cuenta y desconectar son de quien tiene ads.manage.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

const META = '/api/v1/meta-ads';
const status = (over: Record<string, unknown>) => ({
  configured: true,
  connected: true,
  expired: false,
  adAccountId: null,
  adAccountName: null,
  connectedAtUtc: '2026-10-01T00:00:00Z',
  ...over,
});

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function openProfitability(setup: (api: MockApi) => void) {
  const api = mockApi();
  setup(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/estadisticas/rentabilidad');
  await screen.findAllByText(/Ganancia/, {}, { timeout: 5000 });
  await settle(4);
  return { api, user };
}

describe('rentabilidad: pauta de Meta Ads', () => {
  it('sin la integración configurada en la plataforma, lo explica', async () => {
    await openProfitability((a) =>
      a.on('GET', `${META}/status`, status({ configured: false, connected: false })),
    );
    expect(screen.getByText(/la conexión con Meta todavía no está habilitada/)).toBeInTheDocument();
    expect(screen.queryByText(/MetaAds:AppId/)).toBeNull();
  });

  it('sin conectar: conectar lleva a Meta; si falla, lo dice', async () => {
    const { api, user } = await openProfitability((a) => {
      a.on('GET', `${META}/status`, status({ connected: false }));
      a.on('POST', `${META}/connect`, { detail: 'La app de Meta no está aprobada.' }, 400);
    });
    await user.click(screen.getByRole('button', { name: 'Conectar Meta Ads' }));
    expect(await screen.findByText('La app de Meta no está aprobada.')).toBeInTheDocument();
    api.on('POST', `${META}/connect`, { authUrl: 'https://www.facebook.com/dialog/oauth' });
    await user.click(screen.getByRole('button', { name: 'Conectar Meta Ads' }));
    await waitFor(() => expect(api.calls.filter((c) => c.path === `${META}/connect`)).toHaveLength(2));
  });

  it('vencida: ofrece reconectar', async () => {
    await openProfitability((a) => a.on('GET', `${META}/status`, status({ expired: true })));
    expect(screen.getByText(/La conexión con Meta venció/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconectar Meta' })).toBeInTheDocument();
  });

  it('conectada sin cuenta: elegir la cuenta publicitaria (y su error)', async () => {
    const { api, user } = await openProfitability((a) => {
      a.on('GET', `${META}/status`, status({}));
      a.on('GET', `${META}/ad-accounts`, {
        items: [
          { id: 'act_1', name: 'Tienda principal' },
          { id: 'act_2', name: '' },
        ],
      });
      a.on('POST', `${META}/ad-account`, { detail: 'Esa cuenta no tiene permisos.' }, 403);
    });
    const select = await screen.findByLabelText('Cuenta publicitaria');
    // Una cuenta sin nombre se muestra por su id.
    expect(screen.getByRole('option', { name: 'act_2' })).toBeInTheDocument();
    await user.selectOptions(select, 'act_1');
    expect(await screen.findByText('Esa cuenta no tiene permisos.')).toBeInTheDocument();
    expect(api.calls.find((c) => c.path === `${META}/ad-account`)!.body).toEqual({
      adAccountId: 'act_1',
      name: 'Tienda principal',
    });
  });

  it('con cuenta y gasto: ROAS real y gasto por campaña; sin gasto lo dice', async () => {
    const { api } = await openProfitability((a) => {
      a.on('GET', `${META}/status`, status({ adAccountId: 'act_1', adAccountName: 'Tienda principal' }));
      a.on('GET', `${META}/spend`, {
        spendTotal: 10_000_000,
        campaigns: [{ id: 'cmp-1', name: 'Hot Sale', spend: 10_000_000 }],
      });
    });
    expect(await screen.findByText(/Pauta de Meta Ads · Tienda principal/)).toBeInTheDocument();
    // Con coma decimal, como el resto de los números del panel.
    expect(await screen.findByText(/^\d+,\d{2}x$/)).toBeInTheDocument();
    expect(screen.getByText('Hot Sale')).toBeInTheDocument();
    void api;
  });

  it('sin ventas en el período: lo dice, ofrece un período más largo y la pauta igual se ve', async () => {
    const empty = {
      currency: 'ARS',
      revenue: 0,
      productCost: 0,
      mpFees: 0,
      discounts: 0,
      shippingCharged: 0,
      profit: 0,
      marginPct: 0,
      previous: { revenue: 0, profit: 0, marginPct: 0 },
      coverage: { ordersWithCost: 0, ordersTotal: 0 },
      productsTotal: 0,
      series: [],
      byProduct: [],
      byChannel: [],
      meli: null,
    };
    const api = mockApi();
    api.on('GET', '/api/v1/stats/profitability', empty);
    api.on('GET', `${META}/status`, status({ connected: false }));
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/estadisticas/rentabilidad');
    expect(await screen.findByText(/No hubo ventas en el período/)).toBeInTheDocument();
    expect(screen.queryByText(/Cargá el costo/)).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Conectar Meta Ads' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ver los últimos 90 días' }));
    await waitFor(() =>
      expect(
        api.calls.some((c) => c.path.startsWith('/api/v1/stats/profitability') && c.path.includes('from=')),
      ).toBe(true),
    );
    expect(await screen.findByText(/No hubo ventas en el período \(últimos 90 días\)/)).toBeInTheDocument();

    // Con ventas pero ninguna con costo, el pedido es cargar costos.
    api.on('GET', '/api/v1/stats/profitability', {
      ...empty,
      coverage: { ordersWithCost: 0, ordersTotal: 12 },
    });
    await user.click(screen.getByRole('button', { name: 'Ver todo este año' }));
    expect(
      await screen.findByText(/Ninguna de las 12 ventas del período tiene costo cargado/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cargá el costo de tus productos' })).toHaveAttribute(
      'href',
      '/productos/costos',
    );
    expect(screen.getByRole('button', { name: 'Conectar Meta Ads' })).toBeInTheDocument();
  });

  it('con cuenta pero sin gasto en el período', async () => {
    await openProfitability((a) => {
      a.on('GET', `${META}/status`, status({ adAccountId: 'act_1', adAccountName: null }));
      a.on('GET', `${META}/spend`, { spendTotal: 0, campaigns: [] });
    });
    expect(await screen.findByText(/Pauta de Meta Ads · act_1/)).toBeInTheDocument();
    expect(await screen.findByText('sin gasto')).toBeInTheDocument();
  });

  describe('desconectar', () => {
    const connected = status({ adAccountId: 'act_1', adAccountName: 'Tienda principal' });
    const spend = { spendTotal: 10_000_000, campaigns: [] };

    it('pide confirmación; cancelar no toca nada, confirmar borra la conexión y vuelve a "Conectar"', async () => {
      const { api, user } = await openProfitability((a) => {
        a.on('GET', `${META}/status`, connected);
        a.on('GET', `${META}/spend`, spend);
      });
      const deletes = () => api.calls.filter((c) => c.method === 'DELETE' && c.path === `${META}/connection`);

      await user.click(await screen.findByRole('button', { name: 'Desconectar' }));
      let dialog = within(await screen.findByRole('dialog'));
      expect(
        dialog.getByText(/Tus campañas y tu cuenta publicitaria en Meta no se tocan/),
      ).toBeInTheDocument();
      await user.click(dialog.getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(deletes()).toHaveLength(0);

      api.on('DELETE', `${META}/connection`, null, 204);
      api.on('GET', `${META}/status`, status({ connected: false }));
      await user.click(screen.getByRole('button', { name: 'Desconectar' }));
      dialog = within(await screen.findByRole('dialog'));
      await user.click(dialog.getByRole('button', { name: 'Desconectar' }));
      expect(await screen.findByText('Meta Ads desconectado')).toBeInTheDocument();
      expect(deletes()).toHaveLength(1);
      expect(await screen.findByRole('button', { name: 'Conectar Meta Ads' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Desconectar' })).not.toBeInTheDocument();
    });

    it('vencida o sin cuenta elegida también se puede desconectar; si falla, lo dice', async () => {
      const { api, user } = await openProfitability((a) => {
        a.on('GET', `${META}/status`, status({ expired: true }));
        a.on('DELETE', `${META}/connection`, { detail: 'No se pudo hablar con la base.' }, 500);
      });
      await user.click(await screen.findByRole('button', { name: 'Desconectar' }));
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Desconectar' }),
      );
      expect(await screen.findByText('No se pudo hablar con la base.')).toBeInTheDocument();
      // Sigue conectada (vencida): reconectar sigue a mano.
      expect(screen.getByRole('button', { name: 'Reconectar Meta' })).toBeInTheDocument();
      void api;
    });

    const withoutAds = (a: MockApi) => {
      const perms = fixture<{ role: string; permissions: string[] }>('/api/v1/me/permissions');
      a.on('GET', '/api/v1/me/permissions', {
        ...perms,
        permissions: perms.permissions.filter((p) => p !== 'ads.manage'),
      });
    };

    it('sin ads.manage ve la pauta pero no la desconecta', async () => {
      await openProfitability((a) => {
        withoutAds(a);
        a.on('GET', `${META}/status`, connected);
        a.on('GET', `${META}/spend`, spend);
      });
      expect(await screen.findByText(/Pauta de Meta Ads · Tienda principal/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Desconectar' })).not.toBeInTheDocument();
    });

    it('sin ads.manage y sin cuenta elegida: lo dice y no pide la lista de cuentas', async () => {
      const { api } = await openProfitability((a) => {
        withoutAds(a);
        a.on('GET', `${META}/status`, status({}));
      });
      expect(await screen.findByText(/Falta elegir la cuenta publicitaria/)).toBeInTheDocument();
      expect(api.calls.some((c) => c.path === `${META}/ad-accounts`)).toBe(false);
      expect(screen.queryByLabelText('Cuenta publicitaria')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Desconectar' })).not.toBeInTheDocument();
    });

    it('sin ads.manage y sin conectar, no ofrece el botón de conectar', async () => {
      await openProfitability((a) => {
        withoutAds(a);
        a.on('GET', `${META}/status`, status({ connected: false }));
      });
      expect(await screen.findByText(/le corresponde a quien maneja la publicidad/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Conectar Meta Ads' })).not.toBeInTheDocument();
    });
  });
});
