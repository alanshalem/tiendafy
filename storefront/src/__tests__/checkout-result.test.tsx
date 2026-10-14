/**
 * La pantalla a la que vuelve el comprador después de pagar: manda el estado
 * real de la orden (no lo que diga la URL del redirect), sigue preguntando
 * mientras el pago se confirma —hasta ocho veces— y muestra el mensaje propio
 * del comercio salvo cuando el pago no salió.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutResult } from '@/components/store/CheckoutResult';
import { cartStorageKey, couponStorageKey, useCart } from '@/components/store/cart';
import { buyerStorageKey } from '@/lib/cart-storage';
import { fixture, fixtureTenantId, mockApi, type MockApi } from '../test/api';
import { renderInStore } from '../test/store';

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

describe('resultado del checkout: el carrito después de comprar', () => {
  const LINE = {
    variantId: 'v-1',
    productName: 'Taladro',
    variantLabel: 'Única',
    priceAmount: 100_00,
    currency: 'ARS',
    image: null,
    quantity: 3,
  };

  /** Como el ícono del header: lo que dice el carrito montado en la página. */
  function Badge() {
    const { count } = useCart();
    return <span data-testid="badge">{count}</span>;
  }

  function seedCart() {
    localStorage.setItem(cartStorageKey(fixtureTenantId), JSON.stringify([LINE]));
    localStorage.setItem(couponStorageKey(fixtureTenantId), JSON.stringify({ code: 'HOLA', discount: 1 }));
    sessionStorage.setItem(buyerStorageKey(fixtureTenantId), JSON.stringify({ email: 'ana@example.com' }));
  }

  const showInStore = (kind: 'success' | 'failure' | 'pending', orderId: string | null = ORDER) =>
    renderInStore(
      <>
        <Badge />
        <CheckoutResult tenantId={fixtureTenantId} orderId={orderId ?? undefined} kind={kind} />
      </>,
    );

  it('compra confirmada: vacía carrito, cupón y datos del comprador, y el ícono pasa a 0', async () => {
    seedCart();
    api.on('GET', STATUS, { status: 'PAID' });
    showInStore('success');
    expect(await screen.findByRole('heading', { name: '¡Pago aprobado!' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('0'));
    expect(localStorage.getItem(cartStorageKey(fixtureTenantId))).toBeNull();
    expect(localStorage.getItem(couponStorageKey(fixtureTenantId))).toBeNull();
    expect(sessionStorage.getItem(buyerStorageKey(fixtureTenantId))).toBeNull();
  });

  it('una sola vez por orden: volver a "listo" después no borra el carrito nuevo', async () => {
    seedCart();
    api.on('GET', STATUS, { status: 'PAID' });
    const first = showInStore('success');
    await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('0'));
    first.unmount();

    // Días después arma otro carrito y vuelve con "atrás" a la misma pantalla.
    seedCart();
    showInStore('success');
    expect(await screen.findByRole('heading', { name: '¡Pago aprobado!' })).toBeInTheDocument();
    await act(async () => {});
    expect(screen.getByTestId('badge')).toHaveTextContent('3');
  });

  it.each([
    ['pendiente', 'PENDINGPAYMENT', 'pending'],
    ['rechazada', 'FAILED', 'success'],
  ] as const)('compra %s: el carrito queda para reintentar', async (_, status, kind) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    seedCart();
    api.on('GET', STATUS, { status });
    showInStore(kind);
    for (let i = 0; i < 8; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
    }
    expect(screen.getByTestId('badge')).toHaveTextContent('3');
    expect(localStorage.getItem(cartStorageKey(fixtureTenantId))).not.toBeNull();
  });

  it('sin id de orden no hay compra que confirmar: no toca el carrito', async () => {
    seedCart();
    showInStore('success', null);
    expect(screen.getByRole('heading', { name: '¡Pago aprobado!' })).toBeInTheDocument();
    await act(async () => {});
    expect(screen.getByTestId('badge')).toHaveTextContent('3');
  });
});
