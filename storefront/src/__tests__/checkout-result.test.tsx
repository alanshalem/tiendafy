/**
 * La pantalla a la que vuelve el comprador después de pagar: manda el estado
 * real de la orden (no lo que diga la URL del redirect), sigue preguntando
 * mientras el pago se confirma —hasta ocho veces— y muestra el mensaje propio
 * del comercio salvo cuando el pago no salió.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutResult } from '@/components/store/CheckoutResult';
import { fixture, fixtureTenantId, mockApi, type MockApi } from '../test/api';

const ORDER = '11111111-2222-3333-4444-555555555555';
const STATUS = `/api/v1/orders/${ORDER}/status`;
const ownMessage = 'Despachamos en 24 h hábiles. Dudas: WhatsApp 11 5555-4444.';

let api: MockApi;
beforeEach(() => {
  api = mockApi();
  api.on('GET', '/api/v1/checkout-settings', {
    ...fixture<object>('/api/v1/checkout-settings'),
    orderMessageEnabled: true,
    orderMessageText: `  ${ownMessage}  `,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** `null` = volvió sin id de orden. */
const show = (kind: 'success' | 'failure' | 'pending', orderId: string | null = ORDER) =>
  render(<CheckoutResult tenantId={fixtureTenantId} orderId={orderId ?? undefined} kind={kind} />);

describe('resultado del checkout', () => {
  it('pago aprobado: lo confirma y muestra el mensaje del comercio', async () => {
    api.on('GET', STATUS, { status: 'PAID' });
    show('pending'); // el redirect decía "pendiente", pero la orden ya está pagada
    expect(await screen.findByRole('heading', { name: '¡Pago aprobado!' })).toBeInTheDocument();
    expect(await screen.findByText(ownMessage)).toBeInTheDocument();
  });

  it('pago rechazado: lo dice y no muestra el mensaje del pedido', async () => {
    api.on('GET', STATUS, { status: 'FAILED' });
    show('success');
    expect(await screen.findByRole('heading', { name: 'No se pudo completar el pago' })).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByText(ownMessage)).not.toBeInTheDocument();
  });

  it('pendiente: sigue preguntando hasta ocho veces y después lo deja pendiente', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    api.on('GET', STATUS, () => {
      calls += 1;
      if (calls === 2) throw new Error('corte de red'); // un corte en el medio no frena el sondeo
      return { status: 'PENDINGPAYMENT' };
    });
    show('pending');
    expect(screen.getByRole('heading', { name: 'Confirmando tu pago…' })).toBeInTheDocument();
    for (let i = 0; i < 8; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
    }
    expect(await screen.findByRole('heading', { name: 'Pago pendiente' })).toBeInTheDocument();
    expect(calls).toBe(8);
  });

  it('sin orden (volvió sin id) usa lo que dice el redirect, sin preguntar', async () => {
    show('failure', null);
    expect(screen.getByRole('heading', { name: 'No se pudo completar el pago' })).toBeInTheDocument();
    await waitFor(() => expect(api.calls.some((c) => c.path.includes('/status'))).toBe(false));
  });

  it('sin mensaje propio activado (o si no carga), no muestra nada extra', async () => {
    api.on('GET', '/api/v1/checkout-settings', {}, 500);
    api.on('GET', STATUS, { status: 'PAID' });
    show('success');
    expect(await screen.findByRole('heading', { name: '¡Pago aprobado!' })).toBeInTheDocument();
    expect(screen.queryByText(ownMessage)).not.toBeInTheDocument();
  });
});
