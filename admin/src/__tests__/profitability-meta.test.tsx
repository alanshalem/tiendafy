/**
 * La tarjeta de pauta de Meta Ads en Rentabilidad, en cada estado: sin la
 * integración configurada, sin conectar o vencida (conectar/reconectar, con
 * su error), eligiendo la cuenta publicitaria y con gasto (ROAS real =
 * ganancia ÷ gasto, y el gasto por campaña).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, type MockApi } from '../test/api';
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
    expect(screen.getByText(/la integración no está configurada en la plataforma/)).toBeInTheDocument();
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
    expect(await screen.findByText(/\d+\.\d{2}x/)).toBeInTheDocument();
    expect(screen.getByText('Hot Sale')).toBeInTheDocument();
    void api;
  });

  it('con cuenta pero sin gasto en el período', async () => {
    await openProfitability((a) => {
      a.on('GET', `${META}/status`, status({ adAccountId: 'act_1', adAccountName: null }));
      a.on('GET', `${META}/spend`, { spendTotal: 0, campaigns: [] });
    });
    expect(await screen.findByText(/Pauta de Meta Ads · act_1/)).toBeInTheDocument();
    expect(await screen.findByText('sin gasto')).toBeInTheDocument();
  });
});
