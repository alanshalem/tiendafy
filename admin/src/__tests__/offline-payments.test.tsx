/**
 * Transferencia y efectivo en el panel: registrar el pago o cancelar una venta
 * pendiente desde su detalle, y la tarjeta de Medios de pago donde se cargan
 * el descuento, la cuenta, el plazo y las cuotas que anuncia la tienda.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';

interface Order {
  id: string;
  status: string;
  buyerEmail: string;
  paymentId: string | null;
}
const base = fixture<{ items: Order[] }>('/api/v1/orders').items[0]!;
const pending = {
  ...base,
  status: 'PENDINGPAYMENT',
  paymentId: null,
  paymentProvider: 'transfer',
  paymentDueAtUtc: '2026-10-16T21:30:00Z',
  paymentMethodDiscount: { amount: 1_800_00, currency: 'ARS' },
  discount: { amount: 1_800_00, currency: 'ARS' },
};

const body = (api: MockApi, method: string, path: string) =>
  api.calls.filter((c) => c.method === method && c.path === path).at(-1)?.body;

async function openOrder(order: Record<string, unknown>) {
  const api = mockApi();
  api.on('GET', '/api/v1/orders', { items: [order], total: 1 });
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/ventas');
  await user.click(await screen.findByText(String(order.buyerEmail)));
  await settle(3);
  return { api, user };
}

describe('ventas: una venta por transferencia', () => {
  it('dice que falta el pago y hasta cuándo, y lo registra', async () => {
    const { api, user } = await openOrder(pending);
    expect(screen.getByText(/Paga por transferencia: falta registrar el pago/)).toBeInTheDocument();
    expect(screen.getByText('Descuento por transferencia')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Registrar pago/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Registrar pago' }),
    );
    await settle(2);
    expect(body(api, 'POST', `/api/v1/orders/${pending.id}/mark-paid`)).toEqual({});
  });

  it('se puede cancelar para devolver el stock', async () => {
    const { api, user } = await openOrder(pending);
    await user.click(screen.getByRole('button', { name: /Cancelar venta/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar venta' }),
    );
    await settle(2);
    expect(body(api, 'POST', `/api/v1/orders/${pending.id}/cancel`)).toEqual({});
  });

  it('una pendiente de Mercado Pago no ofrece registrar el pago a mano', async () => {
    await openOrder({ ...pending, paymentProvider: 'mercadopago', paymentMethodDiscount: null });
    expect(screen.queryByRole('button', { name: /Registrar pago/ })).toBeNull();
  });
});

describe('medios de pago: transferencia, efectivo y cuotas', () => {
  const OPTIONS = {
    configured: false,
    transferEnabled: false,
    discountPercent: 10,
    bankName: null,
    accountHolder: null,
    holderTaxId: null,
    cbu: null,
    alias: null,
    instructions: null,
    holdHours: 48,
    cashOnPickupEnabled: false,
    installmentsMax: 6,
    installmentsNote: null,
    legacyTheme: { cashDiscountPercent: 10, installments: 6, freeShippingThreshold: null },
    paywayMaxInstallments: null,
  };

  it('avisa si el diseño promete un descuento que el checkout no cobra, y guarda la cuenta', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/payments/options', OPTIONS);
    api.on('PUT', '/api/v1/admin/payments/options', (b: unknown) => ({
      ...OPTIONS,
      ...(b as object),
      configured: true,
    }));
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/configuracion/medios-de-pago');
    expect(
      await screen.findByText(/el checkout todavía no ofrece transferencia/, {}, { timeout: 5000 }),
    ).toBeTruthy();

    await user.click(screen.getByRole('switch', { name: 'Ofrecer transferencia' }));
    await user.type(screen.getByLabelText('Titular de la cuenta'), 'Mi Tienda SRL');
    await user.type(screen.getByLabelText('Alias'), 'MI.TIENDA');
    const card = screen
      .getByText('Transferencia, efectivo y cuotas')
      .closest('div.rounded-lg') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: 'Guardar' }));
    await settle(2);
    expect(body(api, 'PUT', '/api/v1/admin/payments/options')).toMatchObject({
      transferEnabled: true,
      discountPercent: 10,
      accountHolder: 'Mi Tienda SRL',
      alias: 'MI.TIENDA',
      holdHours: 48,
      installmentsMax: 6,
    });
    expect(screen.queryByText(/el checkout todavía no ofrece transferencia/)).toBeNull();
  });
});
