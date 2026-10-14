/**
 * Despacho: la cola de pedidos cobrados, la lista de picking de varios
 * pedidos, el resultado de las etiquetas por pedido, y despachar
 * escaneando (lo equivocado avisa, lo completo se despacha con lo escaneado).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';
import type { DispatchOrder, LabelBatch, PickList, QueueResponse } from '../lib/fulfillment';

const A = 'aaaaaaaa-0000-0000-0000-000000000001';
const B = 'bbbbbbbb-0000-0000-0000-000000000002';

const queue: QueueResponse = {
  total: 2,
  byCarrier: { andreani: 1, retiro: 1 },
  items: [
    {
      id: A,
      number: '#AAAAAAAA',
      createdAtUtc: '2026-10-13T10:00:00Z',
      paidAtUtc: '2026-10-13T10:05:00Z',
      buyerEmail: 'ana@mail.com',
      buyerName: 'Ana Pérez',
      shippingMethodName: 'Andreani a domicilio',
      shippingAddress: 'Calle 123',
      isPickup: false,
      carrier: 'andreani',
      shipment: { carrier: 'andreani', tracking: 'AND-1', hasLabel: true },
      units: 3,
      lines: 2,
      notes: null,
    },
    {
      id: B,
      number: '#BBBBBBBB',
      createdAtUtc: '2026-10-13T11:00:00Z',
      paidAtUtc: '2026-10-13T11:00:00Z',
      buyerEmail: 'beto@mail.com',
      buyerName: null,
      shippingMethodName: 'Retiro en el local',
      shippingAddress: null,
      isPickup: true,
      carrier: 'retiro',
      shipment: null,
      units: 1,
      lines: 1,
      notes: 'Pasa el sábado',
    },
  ],
};

const pickList: PickList = {
  orders: 2,
  units: 4,
  skipped: [],
  lines: [
    {
      variantId: 'v1',
      sku: 'REM-AZ',
      productName: 'Remera',
      variantDescription: 'Azul',
      location: 'B3',
      quantity: 3,
      orders: [
        { orderId: A, number: '#AAAAAAAA', quantity: 2 },
        { orderId: B, number: '#BBBBBBBB', quantity: 1 },
      ],
    },
  ],
};

const order: DispatchOrder = {
  id: A,
  number: '#AAAAAAAA',
  status: 'PAID',
  buyerEmail: 'ana@mail.com',
  buyerName: 'Ana Pérez',
  shippingMethodName: 'Andreani a domicilio',
  shippingAddress: 'Calle 123',
  isPickup: false,
  carrier: 'andreani',
  tracking: 'AND-1',
  items: [
    {
      variantId: 'v1',
      productName: 'Remera',
      variantDescription: 'Azul',
      sku: 'REM-AZ',
      barcode: '7790001',
      location: 'B3',
      quantity: 2,
    },
    {
      variantId: 'v2',
      productName: 'Gorra',
      variantDescription: 'Única',
      sku: 'GOR',
      barcode: null,
      location: null,
      quantity: 1,
    },
  ],
};

async function open(path = '/ventas/despacho') {
  const api = mockApi();
  api.on('GET', '/api/v1/fulfillment/queue', queue);
  api.on('POST', '/api/v1/fulfillment/pick-list', pickList);
  api.on('GET', '/api/v1/fulfillment/orders/resolve', order);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  await screen.findByRole('heading', { name: 'Despacho', level: 1 });
  await settle(3);
  return { api, user };
}

describe('despacho', () => {
  it('arma la lista de picking de los pedidos elegidos', async () => {
    const { api, user } = await open();
    await user.click(screen.getByRole('checkbox', { name: 'Elegir #AAAAAAAA' }));
    await user.click(screen.getByRole('checkbox', { name: 'Elegir #BBBBBBBB' }));
    await user.click(screen.getByRole('button', { name: /Lista de picking/ }));

    const list = await screen.findByRole('region', { name: 'Lista de picking' });
    expect(list).toHaveTextContent('2 pedidos, 4 unidades');
    expect(list).toHaveTextContent('#AAAAAAAA×2, #BBBBBBBB×1');
    expect(api.calls.find((c) => c.path === '/api/v1/fulfillment/pick-list')?.body).toEqual({
      orderIds: [A, B],
    });
  });

  it('cuenta qué pasó con la etiqueta de cada pedido', async () => {
    const batch: LabelBatch = {
      ok: 0,
      missing: 1,
      fileName: null,
      pdfBase64: null,
      results: [
        {
          orderId: B,
          number: '#BBBBBBBB',
          carrier: 'retiro',
          status: 'no-soportado',
          reason: 'Es retiro en el local: no lleva etiqueta de envío.',
        },
      ],
    };
    const { api, user } = await open();
    api.on('POST', '/api/v1/fulfillment/labels', batch);
    await user.click(screen.getByRole('checkbox', { name: 'Elegir #BBBBBBBB' }));
    await user.click(screen.getByRole('button', { name: /Etiquetas/ }));
    const result = await screen.findByRole('region', { name: 'Resultado de las etiquetas' });
    expect(result).toHaveTextContent('Es retiro en el local');
  });

  it('despacha escaneando: avisa lo que no va y manda lo escaneado', async () => {
    const { api, user } = await open(`/ventas/despacho?tab=escanear&pedido=${A}`);
    expect(await screen.findByText('0/3 unidades')).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: 'Código del producto' });
    await user.type(input, 'OTRA-COSA{Enter}');
    expect(await screen.findByText(/OTRA-COSA NO va en el pedido #AAAAAAAA/)).toBeInTheDocument();

    for (const code of ['7790001', '7790001', 'GOR']) await user.type(input, `${code}{Enter}`);
    expect(await screen.findByText('Pedido completo y verificado.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Número de seguimiento' })).toHaveValue('AND-1');

    await user.click(screen.getByRole('button', { name: /Despachar/ }));
    await waitFor(() =>
      expect(api.calls.find((c) => c.path === '/api/v1/fulfillment/scan-dispatch')?.body).toEqual({
        orderId: A,
        scans: [
          { variantId: 'v1', quantity: 2 },
          { variantId: 'v2', quantity: 1 },
        ],
        tracking: 'AND-1',
      }),
    );
    expect(await screen.findByText('1 despachados · 0 con error')).toBeInTheDocument();
  });

  it('si el servidor no coincide, queda anotado el error', async () => {
    const { api, user } = await open(`/ventas/despacho?tab=escanear&pedido=${A}`);
    api.on(
      'POST',
      '/api/v1/fulfillment/scan-dispatch',
      {
        title: 'Fulfillment.ScanMismatch',
        detail: 'Lo escaneado no coincide con el pedido: faltan 1 de Remera.',
      },
      422,
    );
    const input = await screen.findByRole('textbox', { name: 'Código del producto' });
    for (const code of ['REM-AZ', 'REM-AZ', 'GOR']) await user.type(input, `${code}{Enter}`);
    await user.click(await screen.findByRole('button', { name: /Despachar/ }));
    expect(await screen.findByText('0 despachados · 1 con error')).toBeInTheDocument();
  });
});
