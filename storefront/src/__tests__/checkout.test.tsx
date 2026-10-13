/**
 * El checkout de punta a punta, como lo recorre un comprador: carrito guardado,
 * paso de entrega (contacto, envío propio o cotizado con Correo, Zipnova o
 * Andreani, datos del destinatario), paso de pago (Mercado Pago Pro, el Brick
 * on-site o Payway) y el cupón. Se verifica lo que viaja a la API — eso es lo
 * que cobra — y lo que ve el comprador cuando algo falla.
 *
 * Los SDKs de pago (el Brick de Mercado Pago y el formulario de Payway, que
 * tokenizan la tarjeta contra sus servidores) se reemplazan por un botón que
 * entrega lo mismo que ellos: acá se prueba qué hace el checkout con el token.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutClient } from '../components/store/CheckoutClient';
import { cartStorageKey, couponStorageKey, type CartLine } from '../components/store/cart';
import { fixture, fixtureTenantId, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderInStore } from '../test/store';

const sdk = vi.hoisted(() => ({ initMercadoPago: vi.fn() }));

vi.mock('@mercadopago/sdk-react', () => ({
  initMercadoPago: sdk.initMercadoPago,
  Payment: ({ onSubmit, onError }: { onSubmit: (d: unknown) => Promise<void>; onError: () => void }) =>
    createElement(
      'div',
      null,
      createElement(
        'button',
        {
          onClick: () =>
            onSubmit({
              formData: {
                token: 'tok-mp',
                payment_method_id: 'visa',
                installments: 3,
                issuer_id: '310',
                payer: { email: 'brick@example.com', identification: { type: 'DNI', number: '30123456' } },
              },
            }).catch(() => undefined),
        },
        'Pagar con el Brick',
      ),
      createElement('button', { onClick: onError }, 'Romper el Brick'),
    ),
}));

vi.mock('../components/store/PaywayCardForm', () => ({
  PaywayCardForm: ({ onToken, amountLabel }: { onToken: (t: unknown) => void; amountLabel: string }) =>
    createElement(
      'button',
      {
        onClick: () =>
          onToken({
            token: 'tok-pw',
            bin: '450799',
            lastFour: '4905',
            brand: 'visa',
            isDebit: false,
            installments: 6,
          }),
      },
      `Pagar ${amountLabel} con Payway`,
    ),
}));

const pickup = fixture<{ items: { id: string; name: string }[] }>('/api/v1/shipping/methods').items[0]!;
const settings = fixture<Record<string, unknown>>('/api/v1/checkout-settings');

const LINE: CartLine = {
  variantId: '11111111-1111-1111-1111-111111111111',
  productName: 'Taladro',
  variantLabel: 'Rojo',
  priceAmount: 150_000,
  currency: 'ARS',
  image: 'https://cdn.example.com/t.jpg',
  quantity: 2,
};
const SESSION = '22222222-2222-2222-2222-222222222222';

const DELIVERY = {
  id: '33333333-3333-3333-3333-333333333333',
  name: 'Envío en moto',
  kind: 'DELIVERY',
  price: { amount: 5_000, currency: 'ARS' },
  description: 'En el día',
  pickupAddress: null,
};

type Store = {
  mp?: object;
  payway?: object;
  methods?: object;
  settings?: object;
  cart?: CartLine[];
  coupon?: object;
};

let api: MockApi;
let crashes: () => unknown[][];

/** Una tienda con Mercado Pago conectado (o lo que el test cambie) y un carrito. */
function store(opts: Store = {}) {
  api = mockApi();
  api.on(
    'GET',
    '/api/v1/payments/mercadopago/public-config',
    opts.mp ?? { connected: true, checkoutMode: 'PRO' },
  );
  if (opts.payway) api.on('GET', '/api/v1/payments/payway/public-config', opts.payway);
  if (opts.methods) api.on('GET', '/api/v1/shipping/methods', opts.methods);
  if (opts.settings) api.on('GET', '/api/v1/checkout-settings', { ...settings, ...opts.settings });
  api.on('POST', '/api/v1/checkout', { id: SESSION });
  localStorage.setItem(cartStorageKey(fixtureTenantId), JSON.stringify(opts.cart ?? [LINE]));
  if (opts.coupon) localStorage.setItem(couponStorageKey(fixtureTenantId), JSON.stringify(opts.coupon));
}

async function open() {
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderInStore(<CheckoutClient tenantId={fixtureTenantId} />);
  await settle(4);
  return user;
}

/** Sin red para las rutas que contengan `part` (fetch rechaza, como offline). */
function offline(part: string) {
  const online = api.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes(part) ? Promise.reject(new TypeError('Failed to fetch')) : online(input, init),
    ),
  );
}

const field = (placeholder: string | RegExp) => screen.getByPlaceholderText(placeholder);
const posted = (suffix: string) =>
  api.calls
    .filter((c) => c.method === 'POST' && c.path.endsWith(suffix))
    .map((c) => c.body as Record<string, unknown>);

/** Completa el paso de entrega con retiro en el local y pasa al pago. */
async function deliverAndContinue(user: ReturnType<typeof userEvent.setup>) {
  await user.type(field('E-mail'), 'ana@example.com');
  await user.click(screen.getByRole('radio', { name: new RegExp(pickup.name) }));
  await user.type(field('Nombre'), 'Ana');
  await user.type(field('Apellido'), 'García');
  await user.type(field(/^Teléfono/), '1155554444');
  await user.click(screen.getByRole('button', { name: 'Continuar para el pago' }));
  await settle(1);
}

beforeEach(() => {
  crashes = watchCrashes();
  sdk.initMercadoPago.mockClear();
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

describe('checkout: antes de empezar', () => {
  it('con el carrito vacío lo dice y ofrece volver', async () => {
    store({ cart: [] });
    await open();
    expect(screen.getByText('Tu carrito está vacío.')).toBeInTheDocument();
  });

  it('sin Mercado Pago conectado no deja comprar', async () => {
    store({ mp: { connected: false, checkoutMode: 'PRO' } });
    await open();
    expect(screen.getByText(/todavía no tiene los pagos habilitados/)).toBeInTheDocument();
  });

  it('si la configuración de pagos no responde, sigue con Mercado Pago Pro', async () => {
    store();
    offline('public-config');
    offline('/checkout-settings');
    const user = await open();
    await deliverAndContinue(user);
    expect(screen.getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeInTheDocument();
  });
});

describe('checkout: paso de entrega', () => {
  it('valida cada dato en orden antes de pasar al pago', async () => {
    store({ methods: { items: [DELIVERY] }, settings: { requireDocument: true } });
    const user = await open();
    const go = () => user.click(screen.getByRole('button', { name: 'Continuar para el pago' }));
    const says = (text: string) => expect(screen.getByText(text)).toBeInTheDocument();

    await go();
    says('Ingresá un email válido.');
    await user.type(field('E-mail'), 'ana@example.com');
    await go();
    says('Elegí cómo querés recibir tu compra.');
    await user.click(screen.getByRole('radio', { name: /Envío en moto/ }));
    await go();
    says('Completá nombre y apellido.');
    await user.type(field('Nombre'), 'Ana');
    await user.type(field('Apellido'), 'García');
    await go();
    says('Completá tu teléfono.');
    await user.type(field('Teléfono'), '1155554444');
    await go();
    says('Completá tu DNI o CUIT para poder facturarte.');
    await user.type(field(/DNI/), '30123456');
    await go();
    says('Completá la dirección de entrega (calle, número, ciudad y código postal).');
    await user.type(field('Calle'), 'Corrientes');
    await user.type(field('Número'), '1234');
    await user.type(field('Departamento (opcional)'), '3B');
    await user.type(field('Ciudad'), 'CABA');
    await user.type(field('Código Postal'), '1043');
    await go();

    // En el pago: la entrega elegida, el costo y el total con envío.
    expect(screen.getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeInTheDocument();
    expect(screen.getByText(/Corrientes 1234, 3B, CABA, CP 1043/)).toBeInTheDocument();
    expect(screen.getByText('Costo de envío')).toBeInTheDocument();

    // Volver a la entrega conserva lo cargado.
    await user.click(screen.getAllByRole('button', { name: /Cambiar|Editar|Entrega/ })[0]!);
    expect(field('E-mail')).toHaveValue('ana@example.com');
  });
});

describe('checkout: pago', () => {
  it('Mercado Pago Pro reserva el stock, manda todo lo cargado y redirige al link de pago', async () => {
    store();
    sessionStorage.setItem('tiendafy.utm', 'instagram');
    api.on('POST', `/api/v1/checkout/${SESSION}/pay`, { initPoint: 'https://mp.example.com/pay/1' });
    const user = await open();
    await deliverAndContinue(user);

    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    await user.type(field(settings.customerNoteLabel as string), 'Timbre roto');
    await user.click(screen.getByRole('button', { name: 'Pagar con Mercado Pago' }));
    await settle(3);

    expect(posted('/api/v1/checkout/')).toEqual([{ lines: [{ variantId: LINE.variantId, quantity: 2 }] }]);
    expect(posted('/submit')[0]).toMatchObject({
      email: 'ana@example.com',
      name: 'Ana',
      lastName: 'García',
      phone: '1155554444',
      docNumber: null,
      notes: 'Timbre roto',
      shippingMethodId: pickup.id,
      address: null,
      shippingQuoteToken: null,
    });
    expect(posted('/pay')[0]).toMatchObject({ couponCode: null, utmSource: 'instagram' });
    expect(JSON.parse(sessionStorage.getItem('tiendafy.purchase')!)).toEqual({
      orderId: SESSION,
      value: 3000,
      currency: 'ARS',
    });
  });

  it('si no hay stock, lo dice y deja reintentar', async () => {
    store();
    api.on('POST', `/api/v1/checkout/${SESSION}/submit`, { detail: 'Sin stock de Taladro.' }, 409);
    const user = await open();
    await deliverAndContinue(user);
    await user.click(screen.getByRole('button', { name: 'Pagar con Mercado Pago' }));
    await settle(2);
    expect(screen.getByText('Sin stock de Taladro.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeEnabled();
  });

  it.each([
    ['no se pudo iniciar', 'POST', '/api/v1/checkout', {}, 500, 'No se pudo iniciar el checkout.'],
    [
      'Mercado Pago no da link',
      'POST',
      `/api/v1/checkout/${SESSION}/pay`,
      {},
      200,
      'Mercado Pago no devolvió el link de pago.',
    ],
    [
      'el cobro falla sin detalle',
      'POST',
      `/api/v1/checkout/${SESSION}/pay`,
      'x',
      502,
      'No se pudo iniciar el pago.',
    ],
  ])('error: %s', async (_, method, path, body, status, message) => {
    store();
    api.on(method, path, body, status);
    const user = await open();
    await deliverAndContinue(user);
    await user.click(screen.getByRole('button', { name: 'Pagar con Mercado Pago' }));
    await settle(2);
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it.each([
    ['approved', /confirm|aprob|gracias|listo/i],
    ['rejected', /rechaz|no se pudo|fall/i],
    ['in_process', /pendiente|proceso|revis/i],
  ])('el Brick on-site cobra y muestra el resultado (%s)', async (status, shows) => {
    store({ mp: { connected: true, checkoutMode: 'API', publicKey: 'APP_USR-pub' } });
    api.on('POST', `/api/v1/checkout/${SESSION}/pay-onsite`, { status });
    const user = await open();
    expect(sdk.initMercadoPago).toHaveBeenCalledWith('APP_USR-pub', { locale: 'es-AR' });
    await deliverAndContinue(user);
    await user.click(screen.getByRole('button', { name: 'Pagar con el Brick' }));
    await settle(3);

    expect(posted('/submit')[0]).toMatchObject({ email: 'brick@example.com' });
    expect(posted('/pay-onsite')[0]).toMatchObject({
      token: 'tok-mp',
      paymentMethodId: 'visa',
      installments: 3,
      issuerId: '310',
      payerDocType: 'DNI',
      payerDocNumber: '30123456',
    });
    expect(screen.getAllByText(shows).length).toBeGreaterThan(0);
  });

  it('el Brick: un rechazo del backend y un error del formulario se muestran', async () => {
    store({ mp: { connected: true, checkoutMode: 'API', publicKey: 'APP_USR-pub' } });
    api.on('POST', `/api/v1/checkout/${SESSION}/pay-onsite`, { detail: 'Fondos insuficientes.' }, 402);
    const user = await open();
    await deliverAndContinue(user);
    await user.click(screen.getByRole('button', { name: 'Pagar con el Brick' }));
    await settle(3);
    expect(screen.getByText('Fondos insuficientes.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Romper el Brick' }));
    expect(screen.getByText('Hubo un problema con el formulario de pago.')).toBeInTheDocument();
  });

  const PAYWAY = {
    enabled: true,
    publicKey: 'pk',
    baseUrl: 'https://pw',
    siteId: '1',
    installmentOptions: [1, 6],
  };

  it.each([
    ['APPROVED', undefined, /confirm|aprob|gracias|listo/i],
    ['REVIEW', undefined, /pendiente|proceso|revis/i],
  ])('Payway cobra con el token de la tarjeta (%s)', async (status, _msg, shows) => {
    store({ payway: PAYWAY });
    api.on('POST', `/api/v1/checkout/${SESSION}/pay-payway`, { status });
    const user = await open();
    await deliverAndContinue(user);
    await user.click(screen.getByRole('button', { name: 'Tarjeta de crédito o débito' }));
    await user.click(screen.getByRole('button', { name: /con Payway/ }));
    await settle(3);
    expect(posted('/pay-payway')[0]).toMatchObject({
      token: 'tok-pw',
      bin: '450799',
      cardLastFour: '4905',
      cardBrand: 'visa',
      isDebit: false,
      installments: 6,
    });
    expect(screen.getAllByText(shows).length).toBeGreaterThan(0);
  });

  it('Payway: un rechazo muestra el motivo y deja probar con otra tarjeta', async () => {
    store({ payway: PAYWAY });
    api.on('POST', `/api/v1/checkout/${SESSION}/pay-payway`, {
      status: 'DECLINED',
      message: 'Tarjeta vencida.',
    });
    const user = await open();
    await deliverAndContinue(user);
    await user.click(screen.getByRole('button', { name: 'Tarjeta de crédito o débito' }));
    await user.click(screen.getByRole('button', { name: /con Payway/ }));
    await settle(2);
    expect(screen.getByText('Tarjeta vencida.')).toBeInTheDocument();

    api.on('POST', `/api/v1/checkout/${SESSION}/pay-payway`, {}, 500);
    await user.click(screen.getByRole('button', { name: /con Payway/ }));
    await settle(2);
    expect(screen.getByText('No se pudo procesar el pago.')).toBeInTheDocument();

    // Volver a Mercado Pago.
    await user.click(screen.getByRole('button', { name: 'Mercado Pago' }));
    expect(screen.getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeInTheDocument();
  });
});

describe('checkout: cupón', () => {
  it('el del carrito se revalida con el subtotal real y viaja al cobro', async () => {
    store({ coupon: { code: 'HOLA', discount: 1, freeShipping: false } });
    api.on('POST', '/api/v1/coupons/validate', { valid: true, code: 'HOLA', discountAmount: 30_000 });
    api.on('POST', `/api/v1/checkout/${SESSION}/pay`, { initPoint: 'https://mp.example.com/pay/1' });
    const user = await open();
    expect(posted('/coupons/validate')[0]).toEqual({ code: 'HOLA', subtotal: 300_000 });
    expect(screen.getByText('Descuento (HOLA)')).toBeInTheDocument();
    await deliverAndContinue(user);
    await user.click(screen.getByRole('button', { name: 'Pagar con Mercado Pago' }));
    await settle(2);
    expect(posted('/pay')[0]).toMatchObject({ couponCode: 'HOLA' });
  });

  it('uno vencido se cae al revalidar; uno nuevo se aplica; envío gratis pone el envío en cero', async () => {
    store({ coupon: { code: 'VIEJO', discount: 1, freeShipping: false }, methods: { items: [DELIVERY] } });
    api.on('POST', '/api/v1/coupons/validate', (body: unknown) =>
      (body as { code: string }).code === 'GRATIS'
        ? { valid: true, code: 'GRATIS', discountAmount: 0, freeShipping: true }
        : { valid: false, error: 'El cupón venció.' },
    );
    const user = await open();
    expect(screen.getByText('El cupón venció.')).toBeInTheDocument();
    expect(localStorage.getItem(couponStorageKey(fixtureTenantId))).toBeNull();

    await user.click(screen.getByRole('button', { name: /Aplicar/ })); // vacío: no hace nada
    await user.type(field('Cupón de descuento'), 'gratis');
    await user.click(screen.getByRole('button', { name: /Aplicar/ }));
    await settle(1);
    await user.click(screen.getByRole('radio', { name: /Envío en moto/ }));
    expect(screen.getByText(/gratis con GRATIS/)).toBeInTheDocument();
    expect(screen.getByText('Gratis')).toBeInTheDocument();
  });

  it('un cupón rechazado sin motivo o sin red, lo dice', async () => {
    store();
    api.on('POST', '/api/v1/coupons/validate', {});
    const user = await open();
    await user.type(field('Cupón de descuento'), 'X');
    await user.click(screen.getByRole('button', { name: /Aplicar/ }));
    await settle(1);
    expect(screen.getByText('Cupón inválido.')).toBeInTheDocument();

    offline('/coupons/validate');
    await user.click(screen.getByRole('button', { name: /Aplicar/ }));
    await settle(1);
    expect(screen.getByText('No se pudo validar el cupón.')).toBeInTheDocument();
  });
});

describe('checkout: envío cotizado', () => {
  const ALL_CARRIERS = {
    items: [],
    correoArgentino: { enabled: true, agency: true },
    zipnova: { enabled: true },
    andreani: { enabled: true },
  };
  const money = (amount: number) => ({ amount, currency: 'ARS' });

  function quoters() {
    store({ methods: ALL_CARRIERS });
    api.on('POST', '/api/v1/shipping/correo/quote', {
      options: [
        {
          token: 'c-dom',
          kind: 'D',
          name: 'Correo a domicilio',
          price: money(9_000),
          etaMin: '2',
          etaMax: '4',
        },
        {
          token: 'c-suc',
          kind: 'S',
          name: 'Correo a sucursal',
          price: money(6_000),
          etaMin: null,
          etaMax: null,
        },
      ],
    });
    api.on('POST', '/api/v1/shipping/zipnova/quote', {
      options: [{ token: 'z-1', name: 'Zipnova OCA', price: money(8_000), estimatedDelivery: '2026-10-20' }],
    });
    api.on('POST', '/api/v1/shipping/andreani/quote', {
      options: [
        { token: 'a-dom', name: 'Andreani a domicilio', price: money(7_000), toBranch: false },
        { token: 'a-suc', name: 'Andreani a sucursal', price: money(5_000), toBranch: true },
      ],
    });
    api.on('GET', '/api/v1/shipping/correo/agencies', {
      items: [{ code: 'AG1', name: 'Sucursal Centro', address: 'Florida 1' }],
    });
  }

  it('cotiza con todos los carriers, valida el código postal y la sucursal de retiro', async () => {
    quoters();
    const user = await open();
    const quote = () => user.click(screen.getByRole('button', { name: /Calcular/ }));

    await user.type(screen.getByLabelText('Código postal para cotizar'), '12');
    await quote();
    expect(screen.getByText('Ingresá un código postal de 4 dígitos.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Código postal para cotizar'));
    await user.type(screen.getByLabelText('Código postal para cotizar'), '1043');
    await quote();
    await settle(2);
    expect(screen.getByText('Completá ciudad y provincia para cotizar con Zipnova.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Ciudad para cotizar'), 'CABA');
    await user.type(screen.getByLabelText('Provincia para cotizar'), 'Buenos Aires');
    await quote();
    await settle(2);
    expect(posted('/zipnova/quote')[0]).toMatchObject({
      postalCode: '1043',
      city: 'CABA',
      state: 'Buenos Aires',
      units: 2,
      items: [{ variantId: LINE.variantId, quantity: 2 }],
      declaredValue: 3000,
    });
    // El detalle del carrito viaja para que cada correo cotice con el peso de cada variante.
    expect(posted('/andreani/quote').at(-1)).toEqual({
      postalCode: '1043',
      units: 2,
      items: [{ variantId: LINE.variantId, quantity: 2 }],
      declaredValue: 3000,
    });
    for (const name of [
      'Correo a domicilio',
      'Correo a sucursal',
      'Zipnova OCA',
      'Andreani a domicilio',
      'Andreani a sucursal',
    ])
      expect(screen.getByRole('radio', { name: new RegExp(name) })).toBeInTheDocument();
    // El CP y la ciudad de la cotización completan la dirección.
    await user.click(screen.getByRole('radio', { name: /Correo a domicilio/ }));
    expect(field('Código Postal')).toHaveValue('1043');
    expect(screen.getAllByPlaceholderText('Ciudad').at(-1)).toHaveValue('CABA');

    // Retiro en sucursal de Correo: hay que elegir la sucursal.
    await user.click(screen.getByRole('radio', { name: /Correo a sucursal/ }));
    await user.type(field('E-mail'), 'ana@example.com');
    await user.type(field('Nombre'), 'Ana');
    await user.type(field('Apellido'), 'García');
    await user.type(field(/^Teléfono/), '11');
    await user.click(screen.getByRole('button', { name: 'Continuar para el pago' }));
    expect(screen.getByText('Elegí la sucursal de Correo donde querés retirar.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Provincia'), 'C');
    await settle(2);
    expect(api.calls.some((c) => c.path.includes('/correo/agencies?province=C'))).toBe(true);
    await user.selectOptions(screen.getByLabelText('Sucursal'), 'AG1');

    api.on('POST', `/api/v1/checkout/${SESSION}/pay`, { initPoint: 'https://mp.example.com/pay/1' });
    await user.click(screen.getByRole('button', { name: 'Continuar para el pago' }));
    await user.click(screen.getByRole('button', { name: 'Pagar con Mercado Pago' }));
    await settle(3);
    expect(posted('/submit')[0]).toMatchObject({
      shippingMethodId: null,
      shippingQuoteToken: 'c-suc',
      correoAgency: 'AG1',
      address: null,
    });
  });

  it('Andreani a sucursal no pide dirección; a domicilio sí', async () => {
    quoters();
    store({ methods: { items: [], andreani: { enabled: true } } });
    api.on('POST', '/api/v1/shipping/andreani/quote', {
      options: [
        { token: 'a-dom', name: 'Andreani a domicilio', price: money(7_000), toBranch: false },
        { token: 'a-suc', name: 'Andreani a sucursal', price: money(5_000), toBranch: true },
      ],
    });
    const user = await open();
    await user.type(screen.getByLabelText('Código postal para cotizar'), '5000');
    await user.click(screen.getByRole('button', { name: /Calcular/ }));
    await settle(2);
    await user.click(screen.getByRole('radio', { name: /Andreani a sucursal/ }));
    expect(screen.queryByPlaceholderText('Calle')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Andreani a domicilio/ }));
    expect(field('Calle')).toBeInTheDocument();
  });

  it('sin tarifas o con error, cada carrier lo dice por su cuenta', async () => {
    store({ methods: ALL_CARRIERS });
    api.on('POST', '/api/v1/shipping/correo/quote', { options: [] });
    api.on('POST', '/api/v1/shipping/zipnova/quote', { options: [], error: 'Zipnova caído.' });
    api.on('POST', '/api/v1/shipping/andreani/quote', { detail: 'Andreani no responde.' }, 502);
    const user = await open();
    await user.type(screen.getByLabelText('Código postal para cotizar'), '9410');
    await user.type(screen.getByLabelText('Ciudad para cotizar'), 'Ushuaia');
    await user.type(screen.getByLabelText('Provincia para cotizar'), 'TDF');
    await user.click(screen.getByRole('button', { name: /Calcular/ }));
    await settle(2);
    expect(screen.getByText('Correo Argentino no tiene tarifas para ese código postal.')).toBeInTheDocument();
    expect(screen.getByText('Zipnova caído.')).toBeInTheDocument();
    expect(screen.getByText('Andreani no responde.')).toBeInTheDocument();

    api.on('POST', '/api/v1/shipping/correo/quote', { options: [], error: 'CP inexistente.' });
    api.on('POST', '/api/v1/shipping/zipnova/quote', { options: [] });
    api.on('POST', '/api/v1/shipping/andreani/quote', { options: [] });
    await user.click(screen.getByRole('button', { name: /Calcular/ }));
    await settle(2);
    await waitFor(() => expect(screen.getByText('CP inexistente.')).toBeInTheDocument());
    expect(screen.getByText('Zipnova no tiene opciones para ese destino.')).toBeInTheDocument();
    expect(screen.getByText('Andreani no tiene tarifas para ese código postal.')).toBeInTheDocument();

    api.on('POST', '/api/v1/shipping/correo/quote', 'x', 500);
    api.on('POST', '/api/v1/shipping/zipnova/quote', 'x', 500);
    await user.click(screen.getByRole('button', { name: /Calcular/ }));
    await settle(2);
    expect(screen.getAllByText('No se pudo cotizar.').length).toBeGreaterThan(0);
  });
});
