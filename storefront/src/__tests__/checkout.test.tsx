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
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutClient } from '../components/store/CheckoutClient';
import { cartStorageKey, couponStorageKey, type CartLine } from '../components/store/cart';
import { buyerStorageKey } from '../lib/cart-storage';
import { fixture, fixtureTenantId, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderInStore } from '../test/store';

const sdk = vi.hoisted(() => ({ initMercadoPago: vi.fn(), statusScreen: vi.fn() }));
const browser = vi.hoisted(() => ({ goTo: vi.fn() }));

// jsdom no navega: se registra adónde quiso ir el checkout.
vi.mock('@/lib/navigation', () => ({ hardNavigate: browser.goTo }));

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
  // El Status Screen Brick arma el iframe del banco con lo que recibe: acá se
  // anota con qué se lo montó.
  StatusScreen: (props: { initialization: unknown }) => {
    sdk.statusScreen(props.initialization);
    return createElement('div', null, 'Verificación del banco');
  },
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
const ORDER = '44444444-4444-4444-4444-444444444444';

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

/**
 * Una tienda con Mercado Pago conectado (o lo que el test cambie) y un carrito.
 * Sin transferencia ni efectivo, diga lo que diga la tienda exportada: los
 * tests de pago a mano los prenden con su propio /store-offers.
 */
function store(opts: Store = {}) {
  api = mockApi();
  const mp = opts.mp ?? { connected: true, checkoutMode: 'PRO' };
  api.on('GET', '/api/v1/payments/mercadopago/public-config', mp);
  api.on('GET', '/api/v1/store-offers', {
    configured: true,
    transfer: { enabled: false, discountPercent: 0, holdHours: 48 },
    cashOnPickup: { enabled: false },
    installments: { max: 0, note: null },
    freeShipping: null,
    // Como lo calcula el servidor: sin pago a mano, se compra si hay pasarela.
    canCheckout: Boolean((mp as { connected?: boolean }).connected) || Boolean(opts.payway),
  });
  if (opts.payway) api.on('GET', '/api/v1/payments/payway/public-config', opts.payway);
  if (opts.methods) api.on('GET', '/api/v1/shipping/methods', opts.methods);
  if (opts.settings) api.on('GET', '/api/v1/checkout-settings', { ...settings, ...opts.settings });
  api.on('POST', '/api/v1/checkout', { id: SESSION });
  // Lo del carrito sigue a la venta al mismo precio: las variantes de LINE no
  // son las de la tienda exportada, y sin esto el repreciado las daría por
  // dadas de baja. Los tests de precios y stock lo pisan después.
  const cart = opts.cart ?? [LINE];
  api.on('GET', '/api/v1/products/variants', {
    items: cart.map((l) => ({
      variantId: l.variantId,
      price: { amount: l.priceAmount, currency: l.currency },
      available: 99,
    })),
  });
  localStorage.setItem(cartStorageKey(fixtureTenantId), JSON.stringify(cart));
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

/** El resumen del pedido (al costado en la compu, plegado arriba en el celular). */
const summary = () => screen.getByRole('complementary', { name: 'Resumen del pedido' });

/** Los campos se buscan por su etiqueta, como los encuentra un lector de pantalla. */
const field = (label: string | RegExp) => screen.getByLabelText(label);
const posted = (suffix: string) =>
  api.calls
    .filter((c) => c.method === 'POST' && c.path.endsWith(suffix))
    .map((c) => c.body as Record<string, unknown>);

const PAYWAY_CONFIG = {
  enabled: true,
  publicKey: 'pk',
  baseUrl: 'https://pw',
  siteId: '1',
  installmentOptions: [1],
};

/** Completa el paso de entrega con retiro en el local y pasa al pago. */
async function deliverAndContinue(user: ReturnType<typeof userEvent.setup>) {
  // clear: el comprador puede venir con datos guardados de antes.
  const fill = async (label: string | RegExp, value: string) => {
    await user.clear(field(label));
    await user.type(field(label), value);
  };
  await fill('E-mail', 'ana@example.com');
  await user.click(screen.getByRole('radio', { name: new RegExp(pickup.name) }));
  await fill('Nombre', 'Ana');
  await fill('Apellido', 'García');
  await fill(/^Teléfono/, '1155554444');
  await user.click(screen.getByRole('button', { name: 'Continuar para el pago' }));
  await settle(1);
}

beforeEach(() => {
  crashes = watchCrashes();
  sdk.initMercadoPago.mockClear();
  browser.goTo.mockClear();
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

  it('si la configuración del comercio o Payway no responden, sigue con lo de fábrica y Mercado Pago', async () => {
    store();
    offline('/checkout-settings');
    offline('/payway/public-config');
    const user = await open();
    await deliverAndContinue(user);
    expect(screen.getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeInTheDocument();
  });

  it.each([
    [
      'la configuración de pagos',
      '/api/v1/payments/mercadopago/public-config',
      { connected: true, checkoutMode: 'PRO' },
    ],
    ['los envíos', '/api/v1/shipping/methods', fixture('/api/v1/shipping/methods')],
  ])('si %s da error, lo dice (no "sin pagos" ni "sin envío") y deja reintentar', async (_, path, ok) => {
    store();
    api.on('GET', path, { title: 'boom' }, 500);
    const user = await open();
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el checkout');
    expect(screen.queryByText(/todavía no tiene los pagos habilitados/)).not.toBeInTheDocument();

    api.on('GET', path, ok);
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await settle(3);
    expect(screen.getByRole('button', { name: 'Continuar para el pago' })).toBeInTheDocument();
  });

  it('cada pedido inicial lleva un tope de espera (el spinner no gira para siempre)', async () => {
    store();
    await open();
    const initial = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => /public-config|shipping\/methods|checkout-settings/.test(String(url)));
    expect(initial.length).toBe(4);
    for (const [, init] of initial) expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });
});

describe('checkout: precios y stock de hoy', () => {
  const current = (amount: number, available = 10) => ({
    items: [{ variantId: LINE.variantId, price: { amount, currency: 'ARS' }, available }],
  });

  it('si el precio cambió desde que se agregó, lo avisa y cobra con el nuevo', async () => {
    store({
      payway: { enabled: true, publicKey: 'pk', baseUrl: 'https://pw', siteId: '1', installmentOptions: [1] },
    });
    api.on('GET', '/api/v1/products/variants', current(180_000));
    const user = await open();
    expect(screen.getByRole('status')).toHaveTextContent(
      /El precio de Taladro cambió de .*1\.500.* a .*1\.800/,
    );
    // El total y el formulario de pago se arman con el precio nuevo.
    expect(JSON.parse(localStorage.getItem(cartStorageKey(fixtureTenantId))!)[0].priceAmount).toBe(180_000);
    await deliverAndContinue(user);
    await user.click(screen.getByRole('button', { name: 'Tarjeta de crédito o débito' }));
    expect(screen.getByRole('button', { name: /Pagar .*3\.600.* con Payway/ })).toBeInTheDocument();
  });

  it('una línea sin stock bloquea el pago hasta quitarla', async () => {
    store({
      cart: [LINE, { ...LINE, variantId: '55555555-5555-5555-5555-555555555555', productName: 'Mecha' }],
    });
    api.on('GET', '/api/v1/products/variants', current(150_000, 1)); // Mecha ya no se vende; quedan 1 de 2
    const user = await open();
    expect(screen.getByRole('alert')).toHaveTextContent(/ya no están disponibles/);
    expect(screen.getByText('Ya no está a la venta. Quitalo para seguir.')).toBeInTheDocument();
    expect(screen.getByText('Queda 1 sola unidad. Bajá la cantidad para seguir.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar para el pago' })).toBeDisabled();

    await user.click(screen.getAllByRole('button', { name: 'Quitar' })[1]!);
    expect(screen.getByRole('button', { name: 'Continuar para el pago' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(screen.getByText('Tu carrito está vacío.')).toBeInTheDocument();
  });

  it('si no se puede verificar, sigue con lo guardado (el cobro usa igual el precio vigente)', async () => {
    store();
    offline('/products/variants');
    const user = await open();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await deliverAndContinue(user);
    expect(screen.getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeInTheDocument();
  });
});

describe('checkout: paso de entrega', () => {
  it('marca cada dato al lado de su campo, enfoca el primero y Enter avanza', async () => {
    store({ methods: { items: [DELIVERY] }, settings: { requireDocument: true } });
    const user = await open();
    const go = () => user.click(screen.getByRole('button', { name: 'Continuar para el pago' }));
    const wrong = (label: string | RegExp, message: string) => {
      expect(field(label)).toHaveAttribute('aria-invalid', 'true');
      expect(field(label)).toHaveAccessibleDescription(message);
    };

    await go();
    // El envío no es un campo: va en el aviso general.
    expect(screen.getByRole('alert')).toHaveTextContent('Elegí cómo querés recibir tu compra.');
    wrong('E-mail', 'Ingresá un email válido.');
    wrong('Nombre', 'Completá tu nombre.');
    wrong('Apellido', 'Completá tu apellido.');
    wrong('Teléfono', 'Completá tu teléfono.');
    wrong(/DNI/, 'Completá tu DNI o CUIT para poder facturarte.');
    expect(field('E-mail')).toHaveFocus();

    // Corregir un campo le saca la marca en el momento.
    await user.type(field('E-mail'), 'ana@example.com');
    expect(field('E-mail')).not.toHaveAttribute('aria-invalid');
    await user.click(screen.getByRole('radio', { name: /Envío en moto/ }));
    await user.type(field('Nombre'), 'Ana');
    await user.type(field('Apellido'), 'García');
    await user.type(field('Teléfono'), '1155554444');
    await user.type(field(/DNI/), '30123456');
    await go();
    expect(screen.getByRole('alert')).toHaveTextContent('Revisá los datos marcados.');
    wrong('Calle', 'Completá la calle.');
    wrong('Número', 'Completá el número.');
    wrong('Ciudad', 'Completá la ciudad.');
    wrong('Código Postal', 'Completá el código postal.');
    expect(field('Calle')).toHaveFocus();

    await user.type(field('Calle'), 'Corrientes');
    await user.type(field('Número'), '1234');
    await user.type(field('Departamento (opcional)'), '3B');
    await user.type(field('Ciudad'), 'CABA');
    await user.type(field('Código Postal'), '1043{Enter}');

    // En el pago: la entrega elegida, el costo y el total con envío.
    expect(screen.getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeInTheDocument();
    expect(screen.getByText(/Corrientes 1234, 3B, CABA, CP 1043/)).toBeInTheDocument();
    expect(screen.getByText('Costo de envío')).toBeInTheDocument();

    // Volver a la entrega conserva lo cargado.
    await user.click(screen.getAllByRole('button', { name: /Cambiar|Editar|Entrega/ })[0]!);
    expect(field('E-mail')).toHaveValue('ana@example.com');
  });

  it('los campos piden el teclado y el autocompletado que corresponden', async () => {
    store({ methods: { items: [DELIVERY] } });
    const user = await open();
    await user.click(screen.getByRole('radio', { name: /Envío en moto/ }));
    const attrs = (label: string | RegExp) => {
      const el = field(label);
      return [
        el.getAttribute('type') ?? 'text',
        el.getAttribute('autocomplete'),
        el.getAttribute('inputmode'),
      ];
    };
    expect(attrs('E-mail')).toEqual(['email', 'email', 'email']);
    expect(attrs('Nombre')).toEqual(['text', 'given-name', null]);
    expect(attrs('Apellido')).toEqual(['text', 'family-name', null]);
    expect(attrs('Teléfono')).toEqual(['tel', 'tel', 'tel']);
    expect(attrs('Calle')).toEqual(['text', 'address-line1', null]);
    expect(attrs('Número')).toEqual(['text', 'off', 'numeric']);
    expect(attrs('Departamento (opcional)')).toEqual(['text', 'address-line2', null]);
    expect(attrs('Ciudad')).toEqual(['text', 'address-level2', null]);
    expect(attrs('Código Postal')).toEqual(['text', 'postal-code', 'numeric']);
  });

  it('lo escrito sobrevive a una recarga (no los datos de pago) y se borra al comprar', async () => {
    store();
    let user = await open();
    await user.type(field('E-mail'), 'ana@example.com');
    await user.type(field('Nombre'), 'Ana');
    cleanup();

    // Recarga (o vuelta de un rechazo de Mercado Pago): sigue ahí.
    user = await open();
    expect(field('E-mail')).toHaveValue('ana@example.com');
    expect(field('Nombre')).toHaveValue('Ana');
    expect(JSON.parse(sessionStorage.getItem(buyerStorageKey(fixtureTenantId))!)).toMatchObject({
      email: 'ana@example.com',
      name: 'Ana',
    });

    // Comprado con Payway: se va con el carrito.
    store({ payway: PAYWAY_CONFIG });
    api.on('POST', `/api/v1/checkout/${SESSION}/pay-payway`, { orderId: ORDER, status: 'APPROVED' });
    cleanup();
    user = await open();
    await deliverAndContinue(user);
    await user.click(screen.getByRole('button', { name: 'Tarjeta de crédito o débito' }));
    await user.click(screen.getByRole('button', { name: /con Payway/ }));
    await settle(3);
    expect(sessionStorage.getItem(buyerStorageKey(fixtureTenantId))).toBeNull();
  });
});

describe('checkout: pago', () => {
  it('Mercado Pago Pro reserva el stock, manda todo lo cargado y redirige al link de pago', async () => {
    store();
    sessionStorage.setItem('tiendafy.utm', 'instagram');
    api.on('POST', `/api/v1/checkout/${SESSION}/pay`, {
      orderId: ORDER,
      initPoint: 'https://mp.example.com/pay/1',
    });
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
      // Sin tildar "Quiero recibir novedades": sin consentimiento.
      acceptsMarketing: false,
    });
    expect(posted('/pay')[0]).toMatchObject({ couponCode: null, utmSource: 'instagram' });
    // La venta queda anotada con el id de la ORDEN: es el que vuelve en ?order=.
    expect(JSON.parse(sessionStorage.getItem('tiendafy.purchase')!)).toEqual({
      orderId: ORDER,
      value: 3000,
      currency: 'ARS',
    });
    expect(browser.goTo).toHaveBeenCalledWith('https://mp.example.com/pay/1');
    // Se fue a pagar: el carrito sigue hasta que la compra se confirme.
    expect(localStorage.getItem(cartStorageKey(fixtureTenantId))).not.toBeNull();
  });

  it('"Quiero recibir novedades" arranca sin tildar y, tildado, viaja con la compra', async () => {
    store();
    api.on('POST', `/api/v1/checkout/${SESSION}/pay`, {
      orderId: ORDER,
      initPoint: 'https://mp.example.com/pay/1',
    });
    const user = await open();
    const consent = screen.getByRole('checkbox', { name: /Quiero recibir novedades/ });
    expect(consent).not.toBeChecked();
    await user.click(consent);
    await deliverAndContinue(user);
    await user.click(screen.getByRole('button', { name: 'Pagar con Mercado Pago' }));
    await settle(3);
    expect(posted('/submit')[0]).toMatchObject({ acceptsMarketing: true });
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

  it('el Brick on-site cobra con el token y, aprobado, cierra la compra y va a "listo"', async () => {
    store({
      mp: { connected: true, checkoutMode: 'API', publicKey: 'APP_USR-pub' },
      coupon: { code: 'HOLA', discount: 0, freeShipping: false },
    });
    api.on('POST', '/api/v1/coupons/validate', { valid: true, code: 'HOLA', discountAmount: 0 });
    api.on('POST', `/api/v1/checkout/${SESSION}/pay-onsite`, {
      orderId: ORDER,
      status: 'approved',
      challenge: null,
    });
    sdk.statusScreen.mockClear();
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
    expect(browser.goTo).toHaveBeenCalledWith(`/checkout/success?order=${ORDER}`);
    // Sin desafío del banco no hay verificación que mostrar.
    expect(sdk.statusScreen).not.toHaveBeenCalled();
    expect(localStorage.getItem(cartStorageKey(fixtureTenantId))).toBeNull();
    expect(localStorage.getItem(couponStorageKey(fixtureTenantId))).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('tiendafy.purchase')!)).toMatchObject({ orderId: ORDER });
  });

  it.each([
    ['in_process', 'va a "pendiente"', `/checkout/pending?order=${ORDER}`],
    ['rejected', 'lo dice ahí mismo', null],
  ])('el Brick %s: %s y no vacía el carrito', async (status, _, goes) => {
    store({ mp: { connected: true, checkoutMode: 'API', publicKey: 'APP_USR-pub' } });
    api.on('POST', `/api/v1/checkout/${SESSION}/pay-onsite`, { orderId: ORDER, status });
    const user = await open();
    await deliverAndContinue(user);
    await user.click(screen.getByRole('button', { name: 'Pagar con el Brick' }));
    await settle(3);
    if (goes) expect(browser.goTo).toHaveBeenCalledWith(goes);
    else expect(screen.getAllByText(/rechaz|no se pudo|fall/i).length).toBeGreaterThan(0);
    expect(localStorage.getItem(cartStorageKey(fixtureTenantId))).not.toBeNull();
  });

  it('el Brick con desafío del banco (3DS): lo muestra ahí mismo y, al terminar, va a la pantalla de resultado', async () => {
    store({ mp: { connected: true, checkoutMode: 'API', publicKey: 'APP_USR-pub' } });
    api.on('POST', `/api/v1/checkout/${SESSION}/pay-onsite`, {
      orderId: ORDER,
      status: 'pending',
      statusDetail: 'pending_challenge',
      challenge: {
        paymentId: '52044997115',
        externalResourceUrl: 'https://acs-public.tp.mastercard.com/api/v1/browser_Challenges',
        creq: 'eyJjcmVxIjoxfQ',
      },
    });
    sdk.statusScreen.mockClear();
    const user = await open();
    await deliverAndContinue(user);
    await user.click(screen.getByRole('button', { name: 'Pagar con el Brick' }));
    await settle(3);

    // Sin jerga: el comprador ve qué le pide su banco, no "3DS" ni "challenge".
    expect(screen.getByRole('heading', { name: 'Confirmá el pago con tu banco' })).toBeInTheDocument();
    expect(screen.queryByText(/3DS|challenge/i)).not.toBeInTheDocument();
    expect(sdk.statusScreen).toHaveBeenLastCalledWith({
      paymentId: '52044997115',
      additionalInfo: {
        externalResourceURL: 'https://acs-public.tp.mastercard.com/api/v1/browser_Challenges',
        creq: 'eyJjcmVxIjoxfQ',
      },
    });
    // Todavía no se cobró: ni pantalla de resultado ni carrito vacío.
    expect(browser.goTo).not.toHaveBeenCalled();
    expect(localStorage.getItem(cartStorageKey(fixtureTenantId))).not.toBeNull();
    expect(JSON.parse(sessionStorage.getItem('tiendafy.purchase')!)).toMatchObject({ orderId: ORDER });

    // El iframe del banco avisa que terminó (el evento que documenta Mercado Pago).
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { status: 'COMPLETE' } }));
    });
    expect(browser.goTo).toHaveBeenCalledWith(`/checkout/pending?order=${ORDER}`);
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
    ['APPROVED', 'success', true],
    ['REVIEW', 'pending', false],
  ])('Payway cobra con el token de la tarjeta (%s)', async (status, page, emptied) => {
    store({ payway: PAYWAY });
    api.on('POST', `/api/v1/checkout/${SESSION}/pay-payway`, { orderId: ORDER, status });
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
    expect(browser.goTo).toHaveBeenCalledWith(`/checkout/${page}?order=${ORDER}`);
    expect(localStorage.getItem(cartStorageKey(fixtureTenantId)) === null).toBe(emptied);
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
    await user.selectOptions(screen.getByLabelText('Provincia para cotizar'), 'Buenos Aires');
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
    expect(field('Ciudad')).toHaveValue('CABA');

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
    expect(screen.queryByLabelText('Calle')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Andreani a domicilio/ }));
    expect(field('Calle')).toBeInTheDocument();
  });

  it('solo con Andreani: lo nombra, no deja seguir sin cotizar y el envío aparece en los resúmenes', async () => {
    store({ methods: { items: [], andreani: { enabled: true } } });
    api.on('POST', '/api/v1/shipping/andreani/quote', {
      options: [{ token: 'a-dom', name: 'Andreani a domicilio', price: money(7_000), toBranch: false }],
    });
    const user = await open();
    expect(screen.getByText('Andreani cotiza al instante para tu dirección.')).toBeInTheDocument();

    await user.type(field('E-mail'), 'ana@example.com');
    await user.type(field('Nombre'), 'Ana');
    await user.type(field('Apellido'), 'García');
    await user.type(field(/^Teléfono/), '1155554444');
    // Sin tocar "Calcular" antes se podía pagar sin envío.
    await user.click(screen.getByRole('button', { name: 'Continuar para el pago' }));
    expect(
      screen.getByText('Ingresá tu código postal y tocá «Calcular» para elegir el envío.'),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Código postal para cotizar'), '5000{Enter}');
    await settle(2);
    await user.click(screen.getByRole('button', { name: 'Continuar para el pago' }));
    expect(screen.getByText('Elegí cómo querés recibir tu compra.')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Andreani a domicilio/ }));
    await user.type(field('Calle'), 'Colón');
    await user.type(field('Número'), '100');
    await user.type(field('Ciudad'), 'Córdoba');
    await user.click(screen.getByRole('button', { name: 'Continuar para el pago' }));

    // Los dos resúmenes muestran el envío que ya está sumado al total.
    expect(screen.getByText('Andreani a domicilio')).toBeInTheDocument();
    expect(screen.getByText('Costo de envío')).toBeInTheDocument();
    // $3.000 + $70 de envío, en el resumen y en la barra plegada del celular.
    expect(within(summary()).getByText(/3\.070/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ver resumen.*3\.070/ })).toBeInTheDocument();
  });

  it('sin tarifas o con error, cada carrier lo dice por su cuenta', async () => {
    store({ methods: ALL_CARRIERS });
    api.on('POST', '/api/v1/shipping/correo/quote', { options: [] });
    api.on('POST', '/api/v1/shipping/zipnova/quote', { options: [], error: 'Zipnova caído.' });
    api.on('POST', '/api/v1/shipping/andreani/quote', { detail: 'Andreani no responde.' }, 502);
    const user = await open();
    await user.type(screen.getByLabelText('Código postal para cotizar'), '9410');
    await user.type(screen.getByLabelText('Ciudad para cotizar'), 'Ushuaia');
    await user.selectOptions(screen.getByLabelText('Provincia para cotizar'), 'Tierra del Fuego');
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

/** Lo que responde /store-offers en una tienda con transferencia (10%) y efectivo al retirar. */
const OFFERS = {
  configured: true,
  transfer: { enabled: true, discountPercent: 10, holdHours: 48 },
  cashOnPickup: { enabled: true },
  installments: { max: 6, note: null },
  freeShipping: null,
  canCheckout: true,
};

describe('checkout: transferencia y efectivo', () => {
  it('con transferencia muestra el descuento, crea el pedido sin tarjeta y lleva a cómo pagar', async () => {
    store();
    api.on('GET', '/api/v1/store-offers', OFFERS);
    api.on('POST', `/api/v1/checkout/${SESSION}/pay-offline`, { orderId: ORDER, method: 'transfer' });
    const user = await open();
    await deliverAndContinue(user);

    // Mercado Pago, transferencia y (por retirar en el local) efectivo.
    for (const name of ['Mercado Pago', 'Transferencia', 'Efectivo al retirar'])
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByText(/10% de descuento pagando con transferencia o en efectivo/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Transferencia' }));
    // 2 × $1.500 = $3.000 → 10% = $300 → total $2.700 (el retiro no cuesta).
    expect(within(summary()).getByText('Descuento por transferencia (10%)')).toBeInTheDocument();
    expect(within(summary()).getByText(/2\.700/)).toBeInTheDocument();
    expect(screen.getByText(/Te guardamos los productos 48 horas/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));
    await settle(2);
    // El total no viaja: lo calcula el servidor.
    const [body] = posted('/pay-offline');
    expect(body).toMatchObject({ method: 'transfer' });
    expect(body).not.toHaveProperty('total');
    expect(browser.goTo).toHaveBeenCalledWith(`/checkout/pending?order=${ORDER}`);
    // El pedido ya está hecho: el carrito se vacía.
    expect(localStorage.getItem(cartStorageKey(fixtureTenantId))).toBeNull();
  });

  it('el efectivo es solo para retirar en el local', async () => {
    store({ methods: { ...fixture('/api/v1/shipping/methods'), items: [DELIVERY] } });
    api.on('GET', '/api/v1/store-offers', OFFERS);
    const user = await open();
    await user.type(field('E-mail'), 'ana@example.com');
    await user.click(screen.getByRole('radio', { name: /Envío en moto/ }));
    await user.type(field('Nombre'), 'Ana');
    await user.type(field('Apellido'), 'García');
    await user.type(field(/^Teléfono/), '1155554444');
    await user.type(field('Calle'), 'Corrientes');
    await user.type(field('Número'), '1234');
    await user.type(field('Ciudad'), 'CABA');
    await user.type(field('Código Postal'), '1043');
    await user.click(screen.getByRole('button', { name: 'Continuar para el pago' }));
    await settle(1);
    expect(screen.getByRole('button', { name: 'Transferencia' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Efectivo al retirar' })).not.toBeInTheDocument();
  });

  it('un error de las ofertas no rompe el checkout: se sigue con Mercado Pago', async () => {
    store();
    api.on('GET', '/api/v1/store-offers', { title: 'boom' }, 500);
    const user = await open();
    await deliverAndContinue(user);
    expect(screen.getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Transferencia' })).not.toBeInTheDocument();
    // Qué se puede usar en Mercado Pago, y los legales junto al botón.
    expect(screen.getByText(/Rapipago y Pago Fácil/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Términos y condiciones' })).toHaveAttribute('href', '/terminos');
    expect(screen.getByRole('link', { name: 'Botón de arrepentimiento' })).toHaveAttribute(
      'href',
      '/arrepentimiento',
    );
  });

  it('solo con transferencia (sin Mercado Pago) se puede comprar igual', async () => {
    store({ mp: { connected: false, checkoutMode: 'PRO' } });
    api.on('GET', '/api/v1/store-offers', { ...OFFERS, cashOnPickup: { enabled: false } });
    const user = await open();
    expect(screen.queryByText(/todavía no tiene los pagos habilitados/)).not.toBeInTheDocument();
    await deliverAndContinue(user);
    // Un solo medio: sin botones para elegir, directo a confirmar.
    expect(screen.queryByRole('button', { name: 'Transferencia' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar pedido' })).toBeInTheDocument();
  });

  it('sin ningún medio de pago ofrece comprar por WhatsApp', async () => {
    store({ mp: { connected: false, checkoutMode: 'PRO' } });
    api.on('GET', '/api/v1/store-offers', {
      ...OFFERS,
      transfer: { enabled: false, discountPercent: 0, holdHours: 48 },
      cashOnPickup: { enabled: false },
      canCheckout: false,
    });
    renderInStore(<CheckoutClient tenantId={fixtureTenantId} contact={{ whatsapp: '+54 9 11 5555-4444' }} />);
    await settle(4);
    expect(screen.getByRole('heading', { level: 1, name: 'Comprá escribiéndonos' })).toBeInTheDocument();
    const wa = screen.getByRole('link', { name: /Comprar por WhatsApp/ });
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/5491155554444\?text=.*Taladro/);
  });
});

describe('checkout: envío gratis desde un monto', () => {
  it('el medio dice desde cuánto es gratis y, al llegar, no se cobra', async () => {
    const cheapFrom = { ...DELIVERY, freeAbove: { amount: 200_000, currency: 'ARS' } };
    store({ methods: { ...fixture('/api/v1/shipping/methods'), items: [cheapFrom] } });
    const user = await open();
    // Subtotal $3.000 ≥ $2.000: sin cargo.
    expect(screen.getByText(/Sin cargo: tu compra supera/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Envío en moto/ }));
    expect(within(summary()).getByText(/sin cargo por el monto/)).toBeInTheDocument();
    expect(within(summary()).getByText('Gratis')).toBeInTheDocument();
  });

  it('debajo del monto se cobra y avisa desde cuánto sería gratis', async () => {
    const farFrom = { ...DELIVERY, freeAbove: { amount: 1_000_000, currency: 'ARS' } };
    store({ methods: { ...fixture('/api/v1/shipping/methods'), items: [farFrom] } });
    const user = await open();
    expect(screen.getByText(/Sin cargo desde/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Envío en moto/ }));
    expect(within(summary()).queryByText('Gratis')).not.toBeInTheDocument();
  });
});

describe('checkout: comprador con sesión', () => {
  it('arranca con su email y su dirección guardada, sin pisar lo que ya escribió', async () => {
    store({ methods: { ...fixture('/api/v1/shipping/methods'), items: [DELIVERY] } });
    localStorage.setItem(
      `tiendafy.shop.user.${fixtureTenantId}`,
      JSON.stringify({ id: 'c1', name: 'Ana García', email: 'ana@example.com' }),
    );
    sessionStorage.setItem(buyerStorageKey(fixtureTenantId), JSON.stringify({ phone: '1100000000' }));
    api.on('GET', '/api/v1/shop/auth/me', { id: 'c1', name: 'Ana García', email: 'ana@example.com' });
    api.on('GET', '/api/v1/shop/addresses/', {
      items: [
        {
          id: 'a1',
          label: 'Casa',
          name: 'Ana',
          lastName: 'García',
          phone: '1155554444',
          doc: '30111222',
          street: 'Corrientes',
          streetNumber: '1234',
          apartment: '3B',
          city: 'CABA',
          province: 'C',
          zip: '1043',
          isDefault: true,
        },
      ],
    });
    const user = await open();
    await user.click(screen.getByRole('radio', { name: /Envío en moto/ }));
    expect(field('E-mail')).toHaveValue('ana@example.com');
    expect(field('Nombre')).toHaveValue('Ana');
    expect(field('Calle')).toHaveValue('Corrientes');
    expect(field('Código Postal')).toHaveValue('1043');
    // Lo que ya había escrito en esta pestaña manda.
    expect(field(/^Teléfono/)).toHaveValue('1100000000');
    // Y el teléfono dice cómo escribirlo.
    expect(field(/^Teléfono/)).toHaveAccessibleDescription(/código de área/);
  });
});
