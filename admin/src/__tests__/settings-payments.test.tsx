/**
 * Medios de pago: Mercado Pago (OAuth, modo de checkout, nombre en el resumen,
 * desconectar, vuelta del OAuth) y Payway (credenciales con la privada que no
 * vuelve, cuotas, probar la conexión, desconectar). Y el rol que solo mira.
 *
 * La tienda sembrada no tiene ninguno conectado: las conexiones se arman acá
 * con la forma de los DTOs.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

const MP = '/api/v1/payments/mercadopago';
const PAYWAY = '/api/v1/payments/payway';

const mpConnected = {
  connected: true,
  userId: 123456,
  checkoutMode: 'PRO',
  marketplaceFeePercent: 0,
  statementDescriptor: 'MI MARCA',
  tokenExpiresAtUtc: '2027-04-01T00:00:00Z',
  connectedAtUtc: '2026-10-01T00:00:00Z',
};

const paywayConnected = {
  connected: true,
  siteId: '00020220',
  environment: 'SANDBOX',
  publicKey: 'pub-123',
  hasPrivateKey: true,
  baseUrlOverride: null,
  establishmentName: 'MI TIENDA',
  installmentOptions: [1, 3],
  baseUrl: 'https://developers.decidir.com/api/v2',
  isActive: true,
  updatedAtUtc: '2026-10-02T15:00:00Z',
};

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function openPayments(setup?: (api: MockApi) => void, path = '/configuracion/medios-de-pago') {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  expect(
    await screen.findByText(/Cobrá con tarjeta, dinero en cuenta/, {}, { timeout: 5000 }),
  ).toBeInTheDocument();
  await settle(4);
  return { api, user };
}

const confirm = async (button: string) =>
  within(await screen.findByRole('dialog')).getByRole('button', { name: button });

describe('Mercado Pago', () => {
  it('conectar inicia el OAuth; si no se puede, lo dice', async () => {
    const { api, user } = await openPayments((a) =>
      a.on('POST', `${MP}/connect`, { detail: 'Falta configurar la app de Mercado Pago.' }, 400),
    );
    const connect = screen.getByRole('button', { name: 'Conectá tu cuenta de Mercado Pago' });
    await user.click(connect);
    expect(await screen.findByText('Falta configurar la app de Mercado Pago.')).toBeInTheDocument();
    expect(connect).toBeEnabled();

    api.on('POST', `${MP}/connect`, { authUrl: 'https://auth.mercadopago.com/authorization' });
    await user.click(connect);
    await waitFor(() => expect(api.calls.filter((c) => c.path === `${MP}/connect`)).toHaveLength(2));
  });

  it('conectada: cambiar el modo de checkout y el nombre en el resumen', async () => {
    const { api, user } = await openPayments((a) => {
      a.on('GET', `${MP}/connection`, mpConnected);
      a.on('PUT', `${MP}/preferences`, { ...mpConnected, checkoutMode: 'API' });
    });
    const pro = screen.getByRole('button', { name: /Checkout Pro/ });
    const integrated = screen.getByRole('button', { name: /Checkout integrado/ });
    expect(pro).toHaveAttribute('aria-pressed', 'true');

    await user.click(integrated);
    expect(await screen.findByText('Preferencias guardadas')).toBeInTheDocument();
    expect(integrated).toHaveAttribute('aria-pressed', 'true');
    expect(api.calls.find((c) => c.path === `${MP}/preferences`)!.body).toEqual({
      checkoutMode: 'API',
      statementDescriptor: 'MI MARCA',
      marketplaceFeePercent: null,
    });

    // El de Mercado Pago (Payway tiene un campo con el mismo nombre).
    const descriptor = screen.getByLabelText('Nombre en el resumen de la tarjeta', {
      selector: 'input[maxlength="13"]',
    });
    expect(screen.getByText(/Hasta 13 caracteres/)).toBeInTheDocument();
    await user.clear(descriptor);
    await user.type(descriptor, 'CKING');
    api.on('PUT', `${MP}/preferences`, { detail: 'Máximo 13 caracteres.' }, 400);
    await user.click(screen.getAllByRole('button', { name: 'Guardar' })[0]!);
    expect(await screen.findByText('Máximo 13 caracteres.')).toBeInTheDocument();
    expect((api.calls.at(-1)!.body as { statementDescriptor: string }).statementDescriptor).toBe('CKING');
    // El input no deja pasar de 13 (Mercado Pago no muestra más).
    await user.clear(descriptor);
    await user.type(descriptor, 'MI TIENDA DE ROPA');
    expect(descriptor).toHaveValue('MI TIENDA DE ');
  });

  it('uno guardado cuando se aceptaban 22 avisa cómo sale en el resumen', async () => {
    await openPayments((a) =>
      a.on('GET', `${MP}/connection`, { ...mpConnected, statementDescriptor: 'MI TIENDA DE ROPA SRL' }),
    );
    expect(
      screen.getByText(/Mercado Pago muestra hasta 13 caracteres: en el resumen sale “\s*MI TIENDA DE”/),
    ).toBeInTheDocument();
  });

  it('desconectar pide confirmación y recarga el estado', async () => {
    const { api, user } = await openPayments((a) => {
      a.on('GET', `${MP}/connection`, mpConnected);
      a.on('DELETE', `${MP}/connection`, { detail: 'Mercado Pago no respondió.' }, 502);
    });
    const disconnect = () =>
      within(
        screen.getByText(/Cobrá con tarjeta, dinero en cuenta/).closest('.rounded-xl, .rounded-lg')!
          .parentElement!,
      ).getAllByRole('button', { name: /Desconectar/ })[0]!;
    await user.click(disconnect());
    await user.click(await confirm('Cancelar'));
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);

    await user.click(disconnect());
    await user.click(await confirm('Desconectar'));
    expect(await screen.findByText('Mercado Pago no respondió.')).toBeInTheDocument();

    api.on('DELETE', `${MP}/connection`, {});
    api.on('GET', `${MP}/connection`, fixture(`${MP}/connection`));
    await user.click(disconnect());
    await user.click(await confirm('Desconectar'));
    expect(await screen.findByText('Cuenta desconectada')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Conectá tu cuenta de Mercado Pago' }),
    ).toBeInTheDocument();
  });

  it('la vuelta del OAuth avisa si se conectó o no', async () => {
    await openPayments(undefined, '/configuracion/medios-de-pago?mp=connected');
    expect(await screen.findByText('¡Cuenta de Mercado Pago conectada!')).toBeInTheDocument();
  });

  it('la vuelta del OAuth con error lo dice', async () => {
    await openPayments(undefined, '/configuracion/medios-de-pago?mp=error');
    expect(await screen.findByText('No se pudo conectar Mercado Pago. Reintentá.')).toBeInTheDocument();
  });
});

describe('Payway', () => {
  const card = () =>
    screen.getByText(/ex Decidir, de Prisma/).closest('div.rounded-xl, div.rounded-lg')!
      .parentElement as HTMLElement;

  it('guarda las credenciales y las cuotas (al menos un pago siempre)', async () => {
    const { api, user } = await openPayments((a) => a.on('PUT', `${PAYWAY}/connection`, {}));
    const scope = within(card());
    await user.type(scope.getByLabelText('Número de comercio (site ID)'), '00020220');
    await user.selectOptions(scope.getByLabelText('Ambiente'), 'PRODUCTION');
    expect(scope.getByText(/En producción los cobros son reales/)).toBeInTheDocument();
    await user.type(scope.getByLabelText('Clave pública'), 'pub-123');
    await user.type(scope.getByLabelText('Clave privada'), 'priv-456');
    await user.type(scope.getByLabelText('Nombre en el resumen de la tarjeta'), 'MI TIENDA');
    await user.type(scope.getByLabelText('Host alternativo de la API (opcional)'), 'https://payway.example');

    const one = scope.getByRole('button', { name: '1 pago' });
    expect(one).toHaveAttribute('aria-pressed', 'true');
    await user.click(scope.getByRole('button', { name: '12 cuotas' }));
    await user.click(scope.getByRole('button', { name: '3 cuotas' }));
    await user.click(one);
    await user.click(scope.getByRole('button', { name: '12 cuotas' }));
    // Sacar la última opción deja "1 pago": sin ninguna el comprador no podría pagar.
    await user.click(scope.getByRole('button', { name: '3 cuotas' }));
    expect(one).toHaveAttribute('aria-pressed', 'true');
    await user.click(scope.getByRole('button', { name: '6 cuotas' }));

    await user.click(scope.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Payway guardado')).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === 'PUT' && c.path === `${PAYWAY}/connection`)!.body).toEqual({
      siteId: '00020220',
      environment: 'PRODUCTION',
      publicKey: 'pub-123',
      privateKey: 'priv-456',
      baseUrlOverride: 'https://payway.example',
      establishmentName: 'MI TIENDA',
      installmentOptions: [1, 6],
    });
  });

  it('conectado: la privada vacía conserva la guardada; probar y desconectar', async () => {
    const { api, user } = await openPayments((a) => {
      a.on('GET', `${PAYWAY}/connection`, paywayConnected);
      a.on('PUT', `${PAYWAY}/connection`, { detail: 'La clave pública no es válida.' }, 400);
      a.on('POST', `${PAYWAY}/test`, { ok: false, status: 401 });
    });
    const scope = within(card());
    expect(scope.getByLabelText('Clave privada (ya cargada)')).toHaveValue('');
    expect(scope.getByText(/actualizado el/)).toBeInTheDocument();
    await user.click(scope.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('La clave pública no es válida.')).toBeInTheDocument();
    expect(
      (api.calls.find((c) => c.method === 'PUT')!.body as { privateKey: unknown }).privateKey,
    ).toBeNull();

    await user.click(scope.getByRole('button', { name: /Probar conexión/ }));
    expect(await screen.findByText('Payway no respondió (HTTP 401).')).toBeInTheDocument();
    api.on('POST', `${PAYWAY}/test`, { ok: false, status: 0 });
    await user.click(scope.getByRole('button', { name: /Probar conexión/ }));
    expect(await screen.findByText('Payway no respondió.')).toBeInTheDocument();
    api.on('POST', `${PAYWAY}/test`, { ok: true, status: 200 });
    await user.click(scope.getByRole('button', { name: /Probar conexión/ }));
    expect(await screen.findByText('Payway responde correctamente.')).toBeInTheDocument();
    api.on('POST', `${PAYWAY}/test`, { detail: 'Sin credenciales.' }, 400);
    await user.click(scope.getByRole('button', { name: /Probar conexión/ }));
    expect(await screen.findByText('Sin credenciales.')).toBeInTheDocument();

    api.on('DELETE', `${PAYWAY}/connection`, { detail: 'No se pudo borrar.' }, 500);
    await user.click(scope.getByRole('button', { name: /Desconectar/ }));
    await user.click(await confirm('Desconectar'));
    expect(await screen.findByText('No se pudo borrar.')).toBeInTheDocument();
    api.on('DELETE', `${PAYWAY}/connection`, {});
    api.on('GET', `${PAYWAY}/connection`, { connected: false });
    await user.click(scope.getByRole('button', { name: /Desconectar/ }));
    await user.click(await confirm('Desconectar'));
    expect(await screen.findByText('Payway desconectado')).toBeInTheDocument();
  });
});

describe('medios de pago: rol que solo mira', () => {
  it('ve el estado pero no puede cambiar nada', async () => {
    const perms = fixture<{ role: string; permissions: string[] }>('/api/v1/me/permissions');
    await openPayments((a) => {
      a.on('GET', '/api/v1/me/permissions', {
        ...perms,
        permissions: perms.permissions.filter((p) => p !== 'payments.write'),
      });
      a.on('GET', `${MP}/connection`, mpConnected);
      a.on('GET', `${PAYWAY}/connection`, paywayConnected);
    });
    expect(screen.getByText('Solo lectura: tu rol no puede modificar los pagos.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Checkout integrado/ })).toBeDisabled();
    expect(
      screen.getByLabelText('Nombre en el resumen de la tarjeta', { selector: 'input[maxlength="13"]' }),
    ).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3 cuotas' })).toBeDisabled();
  });

  it('desconectada, tampoco ofrece conectar', async () => {
    const perms = fixture<{ role: string; permissions: string[] }>('/api/v1/me/permissions');
    await openPayments((a) =>
      a.on('GET', '/api/v1/me/permissions', {
        ...perms,
        permissions: perms.permissions.filter((p) => p !== 'payments.write'),
      }),
    );
    expect(
      screen.queryByRole('button', { name: 'Conectá tu cuenta de Mercado Pago' }),
    ).not.toBeInTheDocument();
  });
});

describe('avisos de Mercado Pago trabados', () => {
  const stuck = (id: string, lastError: string | null) => ({
    id,
    dataId: `pay-${id}`,
    attempts: 8,
    lastError,
    createdAtUtc: '2026-10-10T12:00:00Z',
  });

  it('todo bien no muestra nada', async () => {
    await openPayments((a) => a.on('GET', `${MP}/connection`, mpConnected));
    expect(screen.queryByText(/no se pud(o|ieron) procesar/)).not.toBeInTheDocument();
  });

  it('lista los trabados y deja reintentarlos', async () => {
    const { api, user } = await openPayments((a) => {
      a.on('GET', `${MP}/connection`, mpConnected);
      a.on('GET', `${MP}/webhooks/health`, {
        connected: true,
        pending: 0,
        stuck: 2,
        last: null,
        stuckEvents: [stuck('ev-1', 'Timeout'), stuck('ev-2', null)],
      });
      a.on('POST', `${MP}/webhooks/ev-1/retry`, { detail: 'Mercado Pago no responde.' }, 502);
    });
    expect(screen.getByText('Hay 2 avisos de pago que no se pudieron procesar')).toBeInTheDocument();
    expect(screen.getByText(/8 intentos · Timeout/)).toBeInTheDocument();
    const retry = () => screen.getAllByRole('button', { name: /Reintentar/ })[0]!;
    await user.click(retry());
    expect(await screen.findByText('Mercado Pago no responde.')).toBeInTheDocument();

    api.on('POST', `${MP}/webhooks/ev-1/retry`, {});
    api.on('GET', `${MP}/webhooks/health`, {
      connected: true,
      pending: 1,
      stuck: 1,
      last: null,
      stuckEvents: [stuck('ev-2', null)],
    });
    await user.click(retry());
    expect(await screen.findByText('Lo volvimos a poner en cola')).toBeInTheDocument();
    expect(await screen.findByText('Hay un aviso de pago que no se pudo procesar')).toBeInTheDocument();
  });
});
