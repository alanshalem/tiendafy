/**
 * Stock bajo: la lista con el pedido sugerido, la orden de compra que sale
 * armada, silenciar un producto, la baja personal de los emails y la
 * configuración de la tienda.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';
import type { LowStockResponse, StockAlertSettings } from '../lib/stockAlerts';

const low: LowStockResponse = {
  mode: 'inmediato',
  total: 2,
  items: [
    {
      variantId: 'v-filtro',
      productId: 'p1',
      product: 'Filtro de aceite',
      variant: 'Única',
      sku: 'FIL-1',
      available: 4,
      coverageDays: 12,
      unitsPerDay: 0.33,
      suggestedQty: 26,
      reorderPoint: 30,
      reason: 'reposicion',
      minUnits: null,
      crossedAtUtc: '2026-10-14T09:00:00Z',
      notifiedAtUtc: '2026-10-14T09:05:00Z',
    },
    {
      variantId: 'v-cadena',
      productId: 'p2',
      product: 'Cadena',
      variant: '428H',
      sku: 'CAD-428',
      available: 0,
      coverageDays: null,
      unitsPerDay: null,
      suggestedQty: 10,
      reorderPoint: null,
      reason: 'minimo',
      minUnits: 5,
      crossedAtUtc: null,
      notifiedAtUtc: null,
    },
  ],
};

const settings: StockAlertSettings = {
  mode: 'inmediato',
  digestHour: 9,
  lastDigestAtUtc: null,
  recipients: [{ userId: 'u1', name: 'Dueño', email: 'd@x.com', optedOut: false }],
  me: { receives: true, eligible: true, optedOut: false },
};

async function open(path: string) {
  const api = mockApi();
  api.on('GET', '/api/v1/stock-alerts', low);
  api.on('GET', '/api/v1/stock-alerts/count', { count: 2 });
  api.on('GET', '/api/v1/stock-alerts/settings', settings);
  api.on('GET', '/api/v1/stock-alerts/rules', {
    items: [
      {
        variantId: 'v-cadena',
        product: 'Cadena',
        variant: '428H',
        sku: 'CAD-428',
        minUnits: 5,
        muted: false,
      },
    ],
  });
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  await settle(4);
  return { api, user };
}

describe('stock bajo', () => {
  it('lista lo bajo con el motivo y el pedido sugerido', async () => {
    await open('/productos/stock-bajo');
    expect(await screen.findByRole('heading', { name: 'Stock bajo', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Alcanza 12 días')).toBeInTheDocument();
    expect(screen.getByText('Bajo el mínimo (5)')).toBeInTheDocument();
    expect(screen.getByText('26 u')).toBeInTheDocument();
    expect(await screen.findByLabelText('2 con stock bajo')).toBeInTheDocument(); // el contador del menú
  });

  it('arma la orden de compra con lo sugerido', async () => {
    const { user } = await open('/productos/stock-bajo');
    await user.click(await screen.findByRole('checkbox', { name: 'Elegir Cadena · 428H' }));
    await user.click(screen.getByRole('button', { name: /Armar orden de compra \(1\)/ }));
    // Compras abre la orden nueva con la cadena cargada y su cantidad.
    expect(await screen.findByRole('spinbutton', { name: 'Cantidad de Cadena · 428H' })).toHaveValue(10);
  });

  it('silenciar un producto y darse de baja de los emails', async () => {
    const { api, user } = await open('/productos/stock-bajo');
    await user.click((await screen.findAllByRole('button', { name: /Silenciar/ }))[0]!);
    await waitFor(() =>
      expect(
        api.calls.find((c) => c.method === 'PUT' && c.path === '/api/v1/stock-alerts/rules/v-filtro')?.body,
      ).toEqual({ minUnits: null, muted: true }),
    );

    await user.click(screen.getByRole('switch', { name: /Recibir estos avisos por email/ }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.path === '/api/v1/stock-alerts/settings/me')?.body).toEqual({
        optOut: true,
      }),
    );
  });

  it('la tienda elige el resumen diario y la hora', async () => {
    const { api, user } = await open('/configuracion/alertas-de-stock');
    expect(await screen.findByRole('heading', { name: 'Alertas de stock', level: 1 })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Un resumen por día/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Hora del resumen' }), '18');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(
        api.calls.find((c) => c.method === 'PUT' && c.path === '/api/v1/stock-alerts/settings')?.body,
      ).toEqual({
        mode: 'diario',
        digestHour: 18,
      }),
    );
  });
});
