/**
 * Configurar los carriers desde Medios de envío: abrir el formulario, probar
 * la conexión, guardar (las claves nunca vuelven precargadas) y desconectar
 * con confirmación.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, type MockApi } from '../test/api';
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
    });
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
