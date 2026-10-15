/**
 * Lo que el comprador ve de su pedido después de comprar: el resumen de la
 * página de gracias, "Seguí tu pedido" sin cuenta, el detalle y las
 * direcciones de su cuenta, y las leyendas legales (precio sin impuestos
 * nacionales y quién vende).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDashboard } from '../components/store/AccountDashboard';
import { AccountOrderDetail } from '../components/store/AccountOrderDetail';
import { CheckoutResult } from '../components/store/CheckoutResult';
import { cartStorageKey } from '../components/store/cart';
import { OrderTracker } from '../components/store/OrderTracker';
import { PriceWithoutTaxes, SellerIdentity } from '../components/store/StoreLegalInfo';
import { priceWithoutTaxes, resetStoreLegalCache, type StoreLegal } from '../lib/store-legal';
import { defaultAddress, formatAddress, type SavedAddress } from '../lib/addresses';
import type { OrderView } from '../lib/orders';
import { fixture, fixtureTenantId, mockApi, type MockApi } from '../test/api';
import { settle } from '../test/explore';
import { renderInStore } from '../test/store';

const ORDER_ID = '11111111-2222-3333-4444-555555555555';
const money = (amount: number) => ({ amount, currency: 'ARS' });

const order = (over: Partial<OrderView> = {}): OrderView => ({
  id: ORDER_ID,
  number: 1042,
  label: '#1042',
  status: 'PAID',
  isPickup: false,
  createdAtUtc: '2026-10-14T12:00:00Z',
  paidAtUtc: '2026-10-14T12:01:00Z',
  fulfilledAtUtc: null,
  currency: 'ARS',
  paymentProvider: 'mercadopago',
  subtotal: money(20_000_00),
  discount: money(0),
  shipping: money(3_500_00),
  total: money(23_500_00),
  refunded: money(0),
  shippingMethod: 'Correo Argentino',
  pickupAddress: null,
  shippingAddress: 'Corrientes 1234, CABA, CP 1414',
  buyerEmailHint: 'a**@test.local',
  items: [
    {
      variantId: 'v-1',
      productName: 'Termo de acero',
      variantDescription: 'Negro',
      quantity: 2,
      unitPrice: money(10_000_00),
      image: null,
    },
  ],
  tracking: { carrier: 'Correo Argentino', number: 'CP123456789AR', url: 'https://correo.example/CP1' },
  timeline: [
    { key: 'received', label: 'Recibimos tu pedido', atUtc: '2026-10-14T12:00:00Z', done: true },
    { key: 'paid', label: 'Pago acreditado', atUtc: '2026-10-14T12:01:00Z', done: true },
    { key: 'fulfilled', label: 'Despachado', atUtc: null, done: false },
  ],
  canRepent: true,
  invoiceAvailable: false,
  trackingToken: 'tok-123',
  ...over,
});

const me = fixture<{ name: string; email: string }>('/api/v1/shop/auth/me');
const remembered = () => localStorage.setItem(`tiendafy.shop.user.${fixtureTenantId}`, JSON.stringify(me));

let api: MockApi;
beforeEach(() => {
  api = mockApi();
  resetStoreLegalCache();
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

async function show(ui: React.ReactNode) {
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderInStore(ui);
  await settle(3);
  return user;
}

describe('página de gracias', () => {
  it('muestra el pedido con su número, productos, envío, seguimiento y qué sigue', async () => {
    api.on('GET', `/api/v1/orders/${ORDER_ID}/status`, { status: 'PAID' });
    api.on('GET', `/api/v1/orders/${ORDER_ID}/summary`, order());
    await show(<CheckoutResult tenantId={fixtureTenantId} orderId={ORDER_ID} kind="success" />);

    expect(await screen.findByRole('heading', { name: 'Pedido #1042' })).toBeInTheDocument();
    expect(screen.getByText('Termo de acero')).toBeInTheDocument();
    expect(screen.getByText(/Lo enviamos a: Corrientes 1234/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Correo Argentino · CP123456789AR/ })).toHaveAttribute(
      'href',
      'https://correo.example/CP1',
    );
    expect(screen.getByText(/te mandamos el seguimiento por email/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Seguí tu pedido' })).toHaveAttribute(
      'href',
      '/seguimiento?t=tok-123',
    );
    // El UUID ya no se le muestra al comprador.
    expect(screen.queryByText(new RegExp(ORDER_ID))).toBeNull();
  });

  it('un pago pendiente con datos para transferir los muestra; un retiro dice dónde', async () => {
    api.on('GET', `/api/v1/orders/${ORDER_ID}/status`, { status: 'PENDINGPAYMENT' });
    api.on(
      'GET',
      `/api/v1/orders/${ORDER_ID}/summary`,
      order({
        status: 'PENDINGPAYMENT',
        isPickup: true,
        pickupAddress: 'Av. Siempre Viva 742',
        tracking: null,
        paymentInstructions: { title: 'Transferí a', text: 'CBU 0000003100000000000001' },
      }),
    );
    await show(<CheckoutResult tenantId={fixtureTenantId} orderId={ORDER_ID} kind="pending" />);
    expect(await screen.findByText('CBU 0000003100000000000001')).toBeInTheDocument();
    expect(screen.getByText('Retirás en: Av. Siempre Viva 742')).toBeInTheDocument();
  });

  it('un pago rechazado no muestra pedido', async () => {
    api.on('GET', `/api/v1/orders/${ORDER_ID}/status`, { status: 'FAILED' });
    api.on('GET', `/api/v1/orders/${ORDER_ID}/summary`, order({ status: 'FAILED' }));
    await show(<CheckoutResult tenantId={fixtureTenantId} orderId={ORDER_ID} kind="failure" />);
    expect(await screen.findByRole('heading', { name: 'No se pudo completar el pago' })).toBeInTheDocument();
    expect(screen.queryByText('Pedido #1042')).toBeNull();
  });
});

describe('Seguí tu pedido', () => {
  it('con email y número muestra los pasos y el arrepentimiento con el número puesto', async () => {
    api.on('POST', '/api/v1/shop/track-order', order());
    const user = await show(<OrderTracker />);
    await user.type(screen.getByLabelText('Email de la compra'), 'ana@test.local');
    await user.type(screen.getByLabelText(/Número de pedido/), '#1042');
    await user.click(screen.getByRole('button', { name: /Buscar pedido/ }));
    await settle(2);

    const asked = api.calls.find((c) => c.path.endsWith('/shop/track-order'));
    expect(asked?.body).toEqual({ email: 'ana@test.local', number: '#1042' });
    expect(screen.getByRole('list', { name: 'Estado del pedido' })).toHaveTextContent('Pago acreditado');
    expect(screen.getByRole('link', { name: /Arrepentirme/ })).toHaveAttribute(
      'href',
      '/arrepentimiento?pedido=1042',
    );
  });

  it('datos que no coinciden: el mensaje de la API, sin decir si el email existe', async () => {
    api.on(
      'POST',
      '/api/v1/shop/track-order',
      { title: 'Order.NotFound', detail: 'No encontramos un pedido con esos datos.' },
      404,
    );
    const user = await show(<OrderTracker initialNumber="1042" />);
    expect(screen.getByLabelText(/Número de pedido/)).toHaveValue('1042');
    await user.type(screen.getByLabelText('Email de la compra'), 'otra@test.local');
    await user.click(screen.getByRole('button', { name: /Buscar pedido/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos un pedido con esos datos.');
  });

  it('con el link del mail abre solo', async () => {
    api.on('POST', '/api/v1/shop/track-order', (body: unknown) =>
      (body as { token?: string }).token === 'bueno' ? order() : undefined,
    );
    await show(<OrderTracker token="bueno" />);
    expect(await screen.findByRole('heading', { name: 'Pedido #1042' })).toBeInTheDocument();
  });

  it('link vencido', async () => {
    api.on('POST', '/api/v1/shop/track-order', { title: 'Order.NotFound' }, 404);
    await show(<OrderTracker token="viejo" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('El link venció');
    expect(screen.getByLabelText('Email de la compra')).toBeInTheDocument();
  });
});

describe('Mi cuenta', () => {
  it('sin sesión ofrece entrar, registrarse y seguir un pedido sin cuenta', async () => {
    api.on('GET', '/api/v1/shop/auth/me', { title: 'Unauthorized' }, 401);
    const user = await show(<AccountDashboard />);
    expect(screen.getByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Seguí tu pedido/ })).toHaveAttribute('href', '/seguimiento');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Creá tu cuenta');
  });

  it('si los pedidos no cargan lo dice (no "todavía no compraste") y reintenta', async () => {
    remembered();
    api.on('GET', '/api/v1/shop/orders', {}, 500);
    const user = await show(<AccountDashboard />);
    expect(screen.getByText('No pudimos cargar tus pedidos.')).toBeInTheDocument();
    expect(screen.queryByText('Todavía no hiciste ningún pedido.')).toBeNull();

    api.on('GET', '/api/v1/shop/orders', {
      items: [{ ...order(), trackingInfo: order().tracking, tracking: 'CP123456789AR' }],
    });
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await settle(2);
    expect(screen.getByText('Pedido #1042')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /CP123456789AR/ })).toHaveAttribute(
      'href',
      'https://correo.example/CP1',
    );
    expect(screen.getByRole('link', { name: /Ver detalle/ })).toHaveAttribute(
      'href',
      `/cuenta/pedidos/${ORDER_ID}`,
    );
  });

  it('direcciones: agrega, marca predeterminada y borra', async () => {
    remembered();
    api.on('GET', '/api/v1/shop/orders', { items: [] });
    const saved: SavedAddress = {
      id: 'a-1',
      label: 'Casa',
      name: 'Ana',
      lastName: 'Pérez',
      phone: null,
      doc: null,
      street: 'Corrientes',
      streetNumber: '1234',
      apartment: null,
      city: 'CABA',
      province: null,
      zip: '1414',
      isDefault: false,
    };
    api.on('GET', '/api/v1/shop/addresses/', { items: [saved] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = await show(<AccountDashboard />);

    const card = () => screen.getByText('Corrientes 1234, CABA, CP 1414').closest('li')!;
    await user.click(within(card()).getByRole('button', { name: /predeterminada/ }));
    await waitFor(() =>
      expect(
        api.calls.some((c) => c.method === 'POST' && c.path.endsWith('/shop/addresses/a-1/default')),
      ).toBe(true),
    );
    // Mientras se guarda, los botones de la fila quedan deshabilitados: se
    // borra cuando la lista vuelve.
    await waitFor(() => expect(within(card()).getByRole('button', { name: 'Borrar' })).toBeEnabled());
    await user.click(within(card()).getByRole('button', { name: 'Borrar' }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.method === 'DELETE' && c.path.endsWith('/shop/addresses/a-1'))).toBe(
        true,
      ),
    );

    await user.click(screen.getByRole('button', { name: /Agregar dirección/ }));
    await user.type(screen.getByLabelText(/Nombre de quien recibe/), 'Beto');
    await user.type(screen.getByLabelText(/^Calle/), 'Florida');
    await user.type(screen.getByLabelText(/^Número/), '10');
    await user.type(screen.getByLabelText(/^Ciudad/), 'CABA');
    await user.type(screen.getByLabelText(/Código postal/), '1005');
    await user.click(screen.getByRole('button', { name: 'Guardar dirección' }));
    await settle(2);
    const created = api.calls.find((c) => c.method === 'POST' && c.path.endsWith('/shop/addresses/'));
    expect(created?.body).toMatchObject({ name: 'Beto', street: 'Florida', zip: '1005' });
  });

  it('el detalle de un pedido: volver a comprar llena el carrito y ofrece arrepentirse', async () => {
    remembered();
    api.on('GET', `/api/v1/shop/orders/${ORDER_ID}`, order({ invoiceAvailable: true }));
    const user = await show(<AccountOrderDetail orderId={ORDER_ID} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Pedido #1042' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Descargar factura/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Arrepentirme/ })).toHaveAttribute(
      'href',
      '/arrepentimiento?pedido=1042',
    );
    await user.click(screen.getByRole('button', { name: /Volver a comprar/ }));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(cartStorageKey(fixtureTenantId)) ?? '[]')).toEqual(
        expect.arrayContaining([expect.objectContaining({ variantId: 'v-1', quantity: 2 })]),
      ),
    );
  });

  it('un pedido ajeno o inexistente no se muestra', async () => {
    remembered();
    api.on('GET', `/api/v1/shop/orders/${ORDER_ID}`, { title: 'NotFound' }, 404);
    await show(<AccountOrderDetail orderId={ORDER_ID} />);
    expect(screen.getByText('No encontramos este pedido')).toBeInTheDocument();
  });
});

describe('leyendas legales', () => {
  const legal = (over: Partial<StoreLegal> = {}): StoreLegal => ({
    legalName: 'Importadora Test S.A.',
    cuit: '30-71234567-1',
    address: 'Av. Corrientes 1234, CABA',
    dataFiscalUrl: 'https://servicios1.afip.gov.ar/qr',
    dataFiscalImageUrl: null,
    priceWithoutTaxes: { show: true, condition: 'RESPONSABLE_INSCRIPTO', divisor: 1.21 },
    ...over,
  });

  it('el precio sin impuestos nacionales sale de la regla de la tienda', () => {
    expect(priceWithoutTaxes(legal(), 12_100_00)).toBe(10_000_00);
    expect(
      priceWithoutTaxes(
        legal({ priceWithoutTaxes: { show: false, condition: 'MONOTRIBUTO', divisor: 1 } }),
        100,
      ),
    ).toBeNull();
    expect(priceWithoutTaxes(null, 100)).toBeNull();
  });

  it('se muestra debajo del precio y quién vende va en el pie, con una sola consulta', async () => {
    api.on('GET', '/api/v1/store/legal', legal());
    await show(
      <>
        <PriceWithoutTaxes amount={12_100_00} currency="ARS" />
        <PriceWithoutTaxes amount={24_200_00} currency="ARS" />
        <SellerIdentity />
      </>,
    );
    expect(screen.getAllByText(/Precio sin impuestos nacionales/)).toHaveLength(2);
    expect(screen.getByText(/Importadora Test S\.A\. · CUIT 30-71234567-1/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Data Fiscal/ })).toHaveAttribute(
      'href',
      'https://servicios1.afip.gov.ar/qr',
    );
    expect(api.calls.filter((c) => c.path.endsWith('/store/legal'))).toHaveLength(1);
  });

  it('sin datos cargados no ocupa lugar', async () => {
    // La tienda exportada ya factura (tiene razón social y CUIT): esta todavía no.
    api.on(
      'GET',
      '/api/v1/store/legal',
      legal({ legalName: null, cuit: null, address: null, dataFiscalUrl: null }),
    );
    await show(<SellerIdentity />);
    expect(screen.queryByText(/CUIT/)).toBeNull();
  });
});

describe('direcciones (helpers del checkout)', () => {
  it('arma la dirección como el checkout y elige la predeterminada', () => {
    const a = { street: 'Corrientes', streetNumber: '1234', apartment: '3B', city: 'CABA', zip: '1414' };
    expect(formatAddress(a)).toBe('Corrientes 1234, 3B, CABA, CP 1414');
    const items = [
      { id: '1', isDefault: false },
      { id: '2', isDefault: true },
    ] as SavedAddress[];
    expect(defaultAddress(items)?.id).toBe('2');
    expect(defaultAddress([])).toBeNull();
    expect(defaultAddress(null)).toBeNull();
  });
});
