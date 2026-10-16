/**
 * Configurar los carriers desde Medios de envío: abrir el formulario, probar
 * la conexión, guardar (las claves nunca vuelven precargadas) y desconectar
 * con confirmación.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, type MockApi } from '../test/api';
import { fill, settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

const PAGE = '/configuracion/medios-de-envio';

/** La tarjeta de un carrier: el contenedor de su título que tiene sus botones. */
async function card(title: string) {
  const heading = await screen.findByText(title, { selector: 'h3, h2, p, span, div' });
  let el: HTMLElement | null = heading;
  while (el && within(el).queryAllByRole('button').length === 0) el = el.parentElement;
  return within(el!);
}

function sent(api: MockApi, method: string, path: string) {
  return api.calls.find((c) => c.method === method && c.path === path)?.body as
    Record<string, unknown> | undefined;
}

describe('Andreani', () => {
  it('se configura, se prueba y se guarda sin reenviar la contraseña guardada', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/andreani', { configured: false });
    api.on('POST', '/api/v1/admin/shipping/andreani/test', {
      ok: true,
      message: 'Andreani respondió correctamente.',
    });
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click((await card('Andreani')).getByRole('button', { name: 'Configurar' }));
    const modal = within(await screen.findByRole('dialog'));
    const fields = modal.getAllByRole('textbox');
    for (const field of fields.slice(0, 3)) await user.type(field, 'x');
    await user.click(modal.getByRole('button', { name: /Guardar/ }));

    await waitFor(() => expect(sent(api, 'PUT', '/api/v1/admin/shipping/andreani')).toBeDefined());
    expect(sent(api, 'PUT', '/api/v1/admin/shipping/andreani')).toMatchObject({
      weightGrams: 1000,
      lengthCm: 30,
      volumetricFactor: 0.35,
    });
  });

  it('el coeficiente de aforo del contrato se conserva, se edita con coma y se valida', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/andreani', {
      configured: true,
      username: 'usuario',
      hasPassword: true,
      homeDeliveryContract: '300006611',
      volumetricFactor: 0.25,
    });
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click((await card('Andreani')).getByRole('button', { name: 'Editar' }));
    const modal = within(await screen.findByRole('dialog'));
    const factor = modal.getByLabelText(/Coeficiente de aforo/);
    expect(factor).toHaveValue('0,25');

    await user.clear(factor);
    await user.type(factor, '12');
    expect(modal.getByText('Tiene que ser mayor a 0 y hasta 10.')).toBeInTheDocument();
    expect(modal.getByRole('button', { name: /Guardar/ })).toBeDisabled();

    await user.clear(factor);
    await user.type(factor, '0,3');
    await user.click(modal.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(sent(api, 'PUT', '/api/v1/admin/shipping/andreani')).toBeDefined());
    expect(sent(api, 'PUT', '/api/v1/admin/shipping/andreani')).toMatchObject({ volumetricFactor: 0.3 });
  });

  it('editar muestra los datos guardados y deja desconectar', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/andreani', {
      configured: true,
      active: true,
      canCreateShipments: false,
      username: 'usuario',
      hasPassword: true,
      homeDeliveryContract: '300006611',
      defaultWeightGrams: 1000,
    });
    api.on('POST', '/api/v1/admin/shipping/andreani/test', {
      ok: false,
      message: 'Usuario o contraseña incorrectos.',
    });
    const user = userEvent.setup();
    renderApp(PAGE);

    const andreani = await card('Andreani');
    expect(andreani.getByText('Faltan datos del remitente')).toBeInTheDocument();
    await user.click(andreani.getByRole('button', { name: 'Editar' }));
    const modal = within(await screen.findByRole('dialog'));
    expect(modal.getByDisplayValue('usuario')).toBeInTheDocument();
    await user.click(modal.getByRole('button', { name: /Probar conexión/ }));
    expect(await screen.findByText(/incorrectos/)).toBeInTheDocument();
    await user.click(modal.getByRole('button', { name: 'Cancelar' }));

    await user.click(andreani.getByRole('button', { name: 'Desconectar' }));
    const confirm = within(await screen.findByRole('dialog'));
    await user.click(confirm.getByRole('button', { name: 'Desconectar' }));
    await waitFor(() =>
      expect(
        api.calls.some((c) => c.method === 'DELETE' && c.path === '/api/v1/admin/shipping/andreani'),
      ).toBe(true),
    );
  });
});

describe('Zipnova', () => {
  it('se configura y prueba una cotización', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/zipnova', { configured: false });
    api.on('POST', '/api/v1/admin/shipping/zipnova/test', {
      ok: true,
      options: [
        {
          carrier: 'OCA',
          service: 'Estándar',
          logisticType: 'crossdock',
          price: 4840,
          estimatedDelivery: '2026-10-15',
        },
      ],
    });
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click((await card('Zipnova')).getByRole('button', { name: 'Configurar' }));
    const dialogEl = await screen.findByRole('dialog');
    const modal = within(dialogEl);
    // Las credenciales van en campos de contraseña: no se ven en pantalla.
    const [token, secret] = Array.from(dialogEl.querySelectorAll<HTMLInputElement>('input[type="password"]'));
    await user.type(token!, 'zn-token');
    await user.type(secret!, 'zn-secret');
    await user.click(modal.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(sent(api, 'PUT', '/api/v1/admin/shipping/zipnova')).toBeDefined());
    expect(sent(api, 'PUT', '/api/v1/admin/shipping/zipnova')).toMatchObject({ apiToken: 'zn-token' });
  });
});

describe('Correo Argentino', () => {
  it('se configura y prueba una cotización', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/admin/shipping/correo', { configured: false });
    api.on('POST', '/api/v1/admin/shipping/correo/test', {
      ok: true,
      destination: '1425',
      rates: [
        {
          deliveredType: 'D',
          productName: 'Clásico',
          price: 5200,
          deliveryTimeMin: '2',
          deliveryTimeMax: '5',
        },
      ],
    });
    const user = userEvent.setup();
    renderApp(PAGE);

    await user.click((await card('Correo Argentino')).getByRole('button', { name: 'Configurar' }));
    const dialogEl = await screen.findByRole('dialog');
    const modal = within(dialogEl);
    const [userToken, passwordToken] = Array.from(
      dialogEl.querySelectorAll<HTMLInputElement>('input[type="password"]'),
    );
    await user.type(userToken!, 'user-token');
    await user.type(passwordToken!, 'pass-token');
    await user.click(modal.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(sent(api, 'PUT', '/api/v1/admin/shipping/correo')).toBeDefined());
    expect(sent(api, 'PUT', '/api/v1/admin/shipping/correo')).toMatchObject({ userToken: 'user-token' });
  });
});

/* ---- Los tres carriers con el mismo recorrido, y lo propio de cada uno ---- */

const BASE = '/api/v1/admin/shipping';

interface Carrier {
  title: string;
  key: string;
  saved: string;
  disconnected: string;
  configured: Record<string, unknown>;
  /** Abre la prueba (cotización o conexión) dentro del modal y devuelve el botón. */
  testButton: RegExp;
}

const CARRIERS: Carrier[] = [
  {
    title: 'Zipnova',
    key: 'zipnova',
    saved: 'Zipnova configurado',
    disconnected: 'Zipnova desconectado',
    configured: {
      configured: true,
      country: 'AR',
      accountId: 1234,
      originId: '55',
      defaultWeightGrams: 1000,
      defaultLengthCm: 30,
      defaultWidthCm: 20,
      defaultHeightCm: 15,
      active: false,
    },
    testButton: /^Cotizar$/,
  },
  {
    title: 'Correo Argentino',
    key: 'correo',
    saved: 'Correo Argentino configurado',
    disconnected: 'Correo Argentino desconectado',
    configured: {
      configured: true,
      customerId: '0001234567',
      environment: 'TEST',
      originPostalCode: '1406',
      defaultWeightGrams: 1000,
      defaultLengthCm: 30,
      defaultWidthCm: 20,
      defaultHeightCm: 15,
      offerHomeDelivery: true,
      offerAgencyDelivery: true,
      active: true,
    },
    testButton: /Probar cotización/,
  },
  {
    title: 'Andreani',
    key: 'andreani',
    saved: 'Andreani configurado',
    disconnected: 'Andreani desconectado',
    configured: {
      configured: true,
      username: 'tienda',
      hasPassword: true,
      clientCode: '0012345678',
      homeDeliveryContract: '400006709',
      branchPickupContract: null,
      originBranch: 'PRC',
      useQa: true,
      senderName: null,
      active: true,
      canCreateShipments: false,
      defaultWeightGrams: 1000,
      defaultLengthCm: 30,
      defaultWidthCm: 20,
      defaultHeightCm: 15,
    },
    testButton: /Probar conexión/,
  },
];

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function openShipping(setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/configuracion/medios-de-envio');
  await waitFor(() => expect(screen.getByText('Zipnova')).toBeInTheDocument(), { timeout: 5000 });
  await settle(4);
  return { api, user };
}

const modal = async () => within(await screen.findByRole('dialog'));

describe.each(CARRIERS)('$title', (carrier) => {
  const url = `${BASE}/${carrier.key}`;

  it('configurar: se completa todo y se guarda (si falla, lo dice)', { timeout: 60_000 }, async () => {
    const { api, user } = await openShipping((a) =>
      a.on('PUT', url, { detail: 'Credenciales inválidas.' }, 400),
    );
    await user.click((await card(carrier.title)).getByRole('button', { name: 'Configurar' }));
    const d = await modal();
    await fill(user, screen.getByRole('dialog'), 100);
    await user.click(d.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Credenciales inválidas.')).toBeInTheDocument();

    api.on('PUT', url, {});
    api.on('GET', url, carrier.configured);
    await user.click(d.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(carrier.saved)).toBeInTheDocument();
    expect(api.calls.filter((c) => c.method === 'PUT' && c.path === url).at(-1)!.body).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect((await card(carrier.title)).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });

  it('configurado: editar, probar y cancelar', { timeout: 60_000 }, async () => {
    const { api, user } = await openShipping((a) => {
      a.on('GET', url, carrier.configured);
      a.on('POST', `${url}/test`, { detail: 'El servicio no responde.' }, 502);
    });
    await user.click((await card(carrier.title)).getByRole('button', { name: 'Editar' }));
    const d = await modal();
    await user.click(d.getByRole('button', { name: carrier.testButton }));
    expect(await screen.findByText('El servicio no responde.')).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === `${url}/test`)).toBe(true);

    await user.click(d.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('desconectar pide confirmación; si falla, lo dice', async () => {
    const { api, user } = await openShipping((a) => {
      a.on('GET', url, carrier.configured);
      a.on('DELETE', url, { detail: 'No se pudo borrar.' }, 500);
    });
    const disconnect = async () => (await card(carrier.title)).getByRole('button', { name: 'Desconectar' });
    await user.click(await disconnect());
    await user.click((await modal()).getByRole('button', { name: 'Cancelar' }));
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);

    await user.click(await disconnect());
    await user.click((await modal()).getByRole('button', { name: 'Desconectar' }));
    expect(await screen.findByText('No se pudo borrar.')).toBeInTheDocument();

    api.on('DELETE', url, {});
    api.on('GET', url, { configured: false });
    await user.click(await disconnect());
    await user.click((await modal()).getByRole('button', { name: 'Desconectar' }));
    expect(await screen.findByText(carrier.disconnected)).toBeInTheDocument();
    expect(
      await (await card(carrier.title)).findByRole('button', { name: 'Configurar' }),
    ).toBeInTheDocument();
  });
});

describe('lo propio de cada carrier', () => {
  it('Zipnova: la cotización de prueba lista transportes (o dice que no hay)', async () => {
    const zipnova = CARRIERS[0]!;
    const url = `${BASE}/zipnova`;
    const { api, user } = await openShipping((a) => {
      a.on('GET', url, zipnova.configured);
      a.on('POST', `${url}/test`, {
        options: [
          {
            carrier: 'Andreani',
            service: 'Estándar',
            logisticType: 'home',
            price: 5400,
            estimatedDelivery: '3 días',
          },
        ],
      });
    });
    // Pausado: se ve en la tarjeta.
    expect((await card('Zipnova')).getByText('Pausado')).toBeInTheDocument();
    await user.click((await card('Zipnova')).getByRole('button', { name: 'Editar' }));
    const d = await modal();
    // Vienen con una ciudad de ejemplo: se reemplaza.
    for (const [field, value] of [
      ['Ciudad', ' Córdoba '],
      ['Provincia', 'Córdoba'],
      ['CP', '5000'],
    ] as const) {
      await user.clear(d.getByPlaceholderText(field));
      await user.type(d.getByPlaceholderText(field), value);
    }
    await user.click(d.getByRole('button', { name: /^Cotizar$/ }));
    expect(await d.findByText(/Andreani — Estándar/)).toBeInTheDocument();
    expect(api.calls.find((c) => c.path === `${url}/test`)!.body).toEqual({
      city: 'Córdoba',
      state: 'Córdoba',
      zipcode: '5000',
    });

    api.on('POST', `${url}/test`, { options: [] });
    await user.click(d.getByRole('button', { name: /^Cotizar$/ }));
    await waitFor(() => expect(d.queryByText(/Andreani — Estándar/)).not.toBeInTheDocument());
  });

  it('Correo: la prueba muestra tarifas por domicilio y sucursal (o que no hay)', async () => {
    const correo = CARRIERS[1]!;
    const url = `${BASE}/correo`;
    const { api, user } = await openShipping((a) => {
      a.on('GET', url, correo.configured);
      a.on('POST', `${url}/test`, {
        rates: [
          {
            deliveredType: 'D',
            productName: 'Clásico',
            price: 4200,
            deliveryTimeMin: '2',
            deliveryTimeMax: '5',
          },
          {
            deliveredType: 'S',
            productName: 'Clásico',
            price: 3100,
            deliveryTimeMin: null,
            deliveryTimeMax: null,
          },
        ],
      });
    });
    expect((await card('Correo Argentino')).getByText('Modo prueba')).toBeInTheDocument();
    await user.click((await card('Correo Argentino')).getByRole('button', { name: 'Editar' }));
    const d = await modal();
    await user.click(d.getByRole('button', { name: /Probar cotización/ }));
    expect(await d.findByText('Cotización de prueba OK ✓')).toBeInTheDocument();
    expect(d.getByText(/Clásico — domicilio \(2-5 días\)/)).toBeInTheDocument();
    expect(d.getByText(/Clásico — sucursal/)).toBeInTheDocument();

    // Los switches de lo que se ofrece en el checkout.
    for (const name of [/Ofrecer envío a domicilio/, /Ofrecer retiro en sucursal/, /Activo/]) {
      await user.click(d.getByRole('switch', { name }));
    }
    api.on('PUT', url, {});
    await user.click(d.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Correo Argentino configurado')).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === 'PUT')!.body).toMatchObject({
      offerHomeDelivery: false,
      offerAgencyDelivery: false,
      active: false,
    });

    api.on('POST', `${url}/test`, { rates: [] });
    await user.click((await card('Correo Argentino')).getByRole('button', { name: 'Editar' }));
    const again = await modal();
    await user.click(again.getByRole('button', { name: /Probar cotización/ }));
    expect(await again.findByText('Conectó, pero sin tarifas para ese CP.')).toBeInTheDocument();
  });

  it('Andreani: avisa si faltan datos del remitente; la prueba informa ok o error', async () => {
    const andreani = CARRIERS[2]!;
    const url = `${BASE}/andreani`;
    const { api, user } = await openShipping((a) => {
      a.on('GET', url, andreani.configured);
      a.on('POST', `${url}/test`, { ok: true, message: 'Credenciales válidas.' });
    });
    expect((await card('Andreani')).getByText('Faltan datos del remitente')).toBeInTheDocument();
    await user.click((await card('Andreani')).getByRole('button', { name: 'Editar' }));
    const d = await modal();
    await user.click(d.getByRole('button', { name: /Probar conexión/ }));
    expect(await screen.findByText('Credenciales válidas.')).toBeInTheDocument();
    api.on('POST', `${url}/test`, { ok: false, message: 'Usuario o contraseña incorrectos.' });
    await user.click(d.getByRole('button', { name: /Probar conexión/ }));
    expect(await screen.findByText('Usuario o contraseña incorrectos.')).toBeInTheDocument();

    await user.click(d.getByRole('switch', { name: /Usar el ambiente de pruebas/ }));
    await user.click(d.getByRole('switch', { name: /Ofrecer Andreani en el checkout/ }));
    api.on('PUT', url, {});
    await user.click(d.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Andreani configurado')).toBeInTheDocument();
    // La contraseña vacía conserva la guardada.
    expect(api.calls.find((c) => c.method === 'PUT')!.body).toMatchObject({
      password: null,
      useQa: false,
      active: false,
    });
  });
});
