/**
 * La verificación en dos pasos en el panel: el segundo paso del login (código
 * de la app o de recuperación), activarla desde Mi cuenta (QR, código y los
 * códigos de recuperación que se ven una sola vez), desactivarla confirmando
 * con la contraseña, y el aviso del Inicio para los dueños que no la tienen.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixture, mockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';

const me = fixture<{ id: string; email: string }>('/api/v1/auth/me');

/** Sin sesión: /auth/me responde 401, como la API real. */
function loggedOut() {
  const api = mockApi();
  api.on('GET', '/api/v1/auth/me', { title: 'Unauthorized' }, 401);
  return api;
}

async function submitButton(name: string) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

beforeEach(() => localStorage.clear());
afterEach(() => window.history.replaceState(null, '', '/'));

describe('login con verificación en dos pasos', () => {
  async function passwordStep() {
    const api = loggedOut();
    api.on('POST', '/api/v1/auth/login', { twoFactorRequired: true });
    const user = userEvent.setup();
    renderApp('/');
    await user.type(await screen.findByLabelText('Email'), me.email);
    await user.type(screen.getByLabelText('Contraseña'), 'una-clave-larga');
    await user.click(await submitButton('Iniciar sesión'));
    return { api, user };
  }

  it('después de la contraseña pide el código de la app y con el bueno entra', async () => {
    const { api, user } = await passwordStep();

    expect(await screen.findByRole('heading', { name: 'Verificación en dos pasos' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
    const code = screen.getByLabelText('Código de la app');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toHaveAttribute('inputmode', 'numeric');

    // Código equivocado: lo dice y borra el campo.
    api.on(
      'POST',
      '/api/v1/auth/login/2fa',
      { title: 'Auth.InvalidCode', detail: 'El código no es correcto o ya venció.' },
      401,
    );
    await user.type(code, '111111');
    await user.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El código no es correcto o ya venció.');
    expect(screen.getByLabelText('Código de la app')).toHaveValue('');

    api.on('POST', '/api/v1/auth/login/2fa', me);
    await user.type(screen.getByLabelText('Código de la app'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verificar' }));
    await waitFor(() => expect(screen.queryByLabelText('Código de la app')).not.toBeInTheDocument());
    expect(api.calls.filter((c) => c.path === '/api/v1/auth/login/2fa').at(-1)?.body).toEqual({
      code: '123456',
    });
  });

  it('sin el teléfono, entra con un código de recuperación', async () => {
    const { api, user } = await passwordStep();
    api.on('POST', '/api/v1/auth/login/2fa', me);

    await user.click(
      await screen.findByRole('button', { name: '¿No tenés el teléfono? Usá un código de recuperación' }),
    );
    await user.type(screen.getByLabelText('Código de recuperación'), 'ABCDE-12345');
    await user.click(screen.getByRole('button', { name: 'Verificar' }));
    await waitFor(() => expect(screen.queryByLabelText('Código de recuperación')).not.toBeInTheDocument());
    expect(api.calls.filter((c) => c.path === '/api/v1/auth/login/2fa').at(-1)?.body).toEqual({
      code: 'ABCDE-12345',
    });
  });

  it('si pasó demasiado tiempo vuelve a pedir la contraseña, con el motivo', async () => {
    const { api, user } = await passwordStep();
    api.on(
      'POST',
      '/api/v1/auth/login/2fa',
      { title: 'Auth.TwoFactorExpired', detail: 'Pasó demasiado tiempo. Volvé a ingresar tu contraseña.' },
      401,
    );
    await user.type(await screen.findByLabelText('Código de la app'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verificar' }));

    expect(await screen.findByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.getByText('Pasó demasiado tiempo. Volvé a ingresar tu contraseña.')).toBeInTheDocument();
  });
});

describe('Mi cuenta: activar y desactivar', () => {
  const setup = {
    sharedKey: 'abcd efgh ijkl mnop',
    authenticatorUri: 'otpauth://totp/Tiendafy:x?secret=ABCDEFGHIJKLMNOP&issuer=Tiendafy&digits=6',
    qrSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
  };
  const codes = Array.from({ length: 10 }, (_, i) => `CODE${i}-ABCDE`);

  it('se llega desde el menú de la cuenta', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/auth/2fa', { enabled: false, recoveryCodesLeft: 0 });
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: /^Tu cuenta/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Mi cuenta' }));
    expect(await screen.findByRole('heading', { name: 'Mi cuenta' })).toBeInTheDocument();
  });

  it('activa con QR y código, y muestra los códigos de recuperación una vez', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/auth/2fa', { enabled: false, recoveryCodesLeft: 0 });
    api.on('POST', '/api/v1/auth/2fa/setup', setup);
    const user = userEvent.setup();
    renderApp('/mi-cuenta');

    expect(await screen.findByText('Inactiva')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Activar' }));

    const qr = await screen.findByRole('img', { name: /Código QR/ });
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByText(setup.sharedKey)).toBeInTheDocument();

    // Un código equivocado no la activa.
    api.on(
      'POST',
      '/api/v1/auth/2fa/enable',
      { title: 'Auth.InvalidCode', detail: 'El código no es correcto o ya venció.' },
      400,
    );
    await user.type(screen.getByLabelText('Código de la app'), '000000');
    await user.click(screen.getByRole('button', { name: 'Confirmar y activar' }));
    expect(await screen.findByText('El código no es correcto o ya venció.')).toBeInTheDocument();

    api.on('POST', '/api/v1/auth/2fa/enable', { recoveryCodes: codes });
    api.on('GET', '/api/v1/auth/2fa', { enabled: true, recoveryCodesLeft: 10 });
    const field = screen.getByLabelText('Código de la app');
    await user.clear(field);
    await user.type(field, '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmar y activar' }));

    const list = await screen.findByRole('list', { name: 'Códigos de recuperación' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(codes);
    expect(api.calls.filter((c) => c.path === '/api/v1/auth/2fa/enable').at(-1)?.body).toEqual({
      code: '123456',
    });

    // Guardados: ya no se ven más, y queda activa.
    await user.click(screen.getByRole('button', { name: 'Ya los guardé' }));
    expect(screen.queryByRole('list', { name: 'Códigos de recuperación' })).not.toBeInTheDocument();
    expect(await screen.findByText('Activa')).toBeInTheDocument();
    expect(screen.getByText(/Te quedan/)).toHaveTextContent('Te quedan 10 códigos de recuperación.');
  });

  it('desactivar pide la contraseña (o un código)', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/auth/2fa', { enabled: true, recoveryCodesLeft: 2 });
    const user = userEvent.setup();
    renderApp('/mi-cuenta');

    // Con pocos códigos, avisa que conviene generar nuevos.
    expect(await screen.findByText(/Te quedan pocos códigos de recuperación/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByLabelText('Tu contraseña')).toHaveAttribute('type', 'password');

    // Con un código en vez de la contraseña.
    await user.click(dialog.getByRole('button', { name: 'Usar un código en vez de la contraseña' }));
    expect(dialog.getByLabelText('Código de la app o de recuperación')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Usar la contraseña' }));

    api.on('POST', '/api/v1/auth/2fa/disable', {}, 204);
    api.on('GET', '/api/v1/auth/2fa', { enabled: false, recoveryCodesLeft: 0 });
    await user.type(dialog.getByLabelText('Tu contraseña'), 'una-clave-larga');
    await user.click(dialog.getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.calls.filter((c) => c.path === '/api/v1/auth/2fa/disable').at(-1)?.body).toEqual({
      password: 'una-clave-larga',
    });
    expect(await screen.findByText('Inactiva')).toBeInTheDocument();
  });
});

describe('el aviso del Inicio para los dueños', () => {
  it('le recomienda activarla a un dueño que no la tiene, y se puede cerrar', async () => {
    mockApi();
    const user = userEvent.setup();
    renderApp('/');

    const reminder = await screen.findByRole('complementary', { name: 'Recomendación de seguridad' });
    expect(within(reminder).getByRole('link', { name: 'Activarla' })).toHaveAttribute('href', '/mi-cuenta');
    await user.click(within(reminder).getByRole('button', { name: 'Cerrar la recomendación' }));
    expect(
      screen.queryByRole('complementary', { name: 'Recomendación de seguridad' }),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem(`tiendafy.2fa-reminder-dismissed:${me.id}`)).toBe('1');
  });

  it('no aparece si ya la tiene activa', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/auth/me', { ...me, twoFactorEnabled: true });
    renderApp('/');
    await screen.findByRole('heading', { name: /Hola/ });
    await settle(3);
    expect(
      screen.queryByRole('complementary', { name: 'Recomendación de seguridad' }),
    ).not.toBeInTheDocument();
  });

  it('no aparece para quien no es dueño', async () => {
    const api = mockApi();
    const perms = fixture<{ role: string; permissions: string[] }>('/api/v1/me/permissions');
    api.on('GET', '/api/v1/me/permissions', { ...perms, role: 'vendedor' });
    renderApp('/');
    await screen.findByRole('heading', { name: /Hola/ });
    await settle(3);
    expect(
      screen.queryByRole('complementary', { name: 'Recomendación de seguridad' }),
    ).not.toBeInTheDocument();
  });
});
