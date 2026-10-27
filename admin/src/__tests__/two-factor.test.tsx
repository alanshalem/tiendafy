/**
 * La verificación en dos pasos en el panel: el segundo paso del login (código
 * de la app o de recuperación), activarla desde Mi cuenta (QR, código y los
 * códigos de recuperación que se ven una sola vez), desactivarla confirmando
 * con la contraseña, pasarla a otra app, la configuración obligatoria de
 * dueños y administradores (al entrar y con una sesión de antes) y el aviso
 * del Inicio para quien no la tiene ni se la exigen.
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

const setup = {
  sharedKey: 'abcd efgh ijkl mnop',
  authenticatorUri: 'otpauth://totp/Tiendafy:x?secret=ABCDEFGHIJKLMNOP&issuer=Tiendafy&digits=6',
  qrSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
};
const codes = Array.from({ length: 10 }, (_, i) => `CODE${i}-ABCDE`);

describe('obligatoria para dueños y administradores', () => {
  it('al entrar sin ella, la configura (sin volver a escribir la contraseña) y recién ahí entra', async () => {
    const api = loggedOut();
    api.on('POST', '/api/v1/auth/login', { twoFactorSetupRequired: true });
    api.on('POST', '/api/v1/auth/2fa/setup', setup);
    const user = userEvent.setup();
    renderApp('/');
    await user.type(await screen.findByLabelText('Email'), me.email);
    await user.type(screen.getByLabelText('Contraseña'), 'una-clave-larga');
    await user.click(await submitButton('Iniciar sesión'));

    expect(
      await screen.findByRole('heading', { name: 'Activá la verificación en dos pasos' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Para dueños y administradores es obligatoria/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Empezar' }));

    expect(await screen.findByRole('img', { name: /Código QR/ })).toBeInTheDocument();
    expect(screen.getByText(setup.sharedKey)).toBeInTheDocument();
    // La contraseña recién escrita no se vuelve a pedir.
    expect(screen.queryByLabelText('Tu contraseña')).not.toBeInTheDocument();

    api.on('POST', '/api/v1/auth/2fa/enable', {
      recoveryCodes: codes,
      user: { ...me, twoFactorEnabled: true, twoFactorMandatory: true },
    });
    await user.type(screen.getByLabelText('Código de la app'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmar y activar' }));
    expect(api.calls.filter((c) => c.path === '/api/v1/auth/2fa/enable').at(-1)?.body).toEqual({
      code: '123456',
      password: 'una-clave-larga',
    });

    // Los códigos de recuperación, una vez; después, el panel.
    const list = await screen.findByRole('list', { name: 'Códigos de recuperación' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: 'Ya los guardé' }));
    expect(await screen.findByRole('heading', { name: /Hola/ })).toBeInTheDocument();
  });

  it('si el paso venció, vuelve a pedir la contraseña con el motivo', async () => {
    const api = loggedOut();
    api.on('POST', '/api/v1/auth/login', { twoFactorSetupRequired: true });
    api.on(
      'POST',
      '/api/v1/auth/2fa/setup',
      { title: 'Auth.TwoFactorExpired', detail: 'Pasó demasiado tiempo. Volvé a ingresar tu contraseña.' },
      401,
    );
    const user = userEvent.setup();
    renderApp('/');
    await user.type(await screen.findByLabelText('Email'), me.email);
    await user.type(screen.getByLabelText('Contraseña'), 'una-clave-larga');
    await user.click(await submitButton('Iniciar sesión'));
    await user.click(await screen.findByRole('button', { name: 'Empezar' }));

    expect(await screen.findByLabelText('Contraseña')).toHaveValue('');
    expect(screen.getByText('Pasó demasiado tiempo. Volvé a ingresar tu contraseña.')).toBeInTheDocument();
  });

  it('con una sesión abierta sin ella, el panel lleva a configurarla (pidiendo la contraseña)', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/auth/me', { ...me, twoFactorEnabled: false, twoFactorMandatory: true });
    api.on('POST', '/api/v1/auth/2fa/setup', setup);
    const user = userEvent.setup();
    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'Activá la verificación en dos pasos' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Hola/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Empezar' }));
    expect(await screen.findByLabelText('Tu contraseña')).toHaveAttribute('autocomplete', 'current-password');

    api.on('POST', '/api/v1/auth/2fa/enable', {
      recoveryCodes: codes,
      user: { ...me, twoFactorEnabled: true, twoFactorMandatory: true },
    });
    await user.type(screen.getByLabelText('Código de la app'), '123456');
    await user.type(screen.getByLabelText('Tu contraseña'), 'mi-clave-larga');
    await user.click(screen.getByRole('button', { name: 'Confirmar y activar' }));
    await user.click(await screen.findByRole('button', { name: 'Ya los guardé' }));
    expect(await screen.findByRole('heading', { name: /Hola/ })).toBeInTheDocument();
  });

  it('un 403 Auth.TwoFactorSetupRequired de la API lleva a la misma pantalla, y se puede salir', async () => {
    const api = mockApi();
    api.on(
      'GET',
      '/api/v1/me/permissions',
      { title: 'Auth.TwoFactorSetupRequired', detail: 'Para dueños y administradores es obligatoria.' },
      403,
    );
    const user = userEvent.setup();
    renderApp('/');

    expect(
      await screen.findByRole('heading', { name: 'Activá la verificación en dos pasos' }),
    ).toBeInTheDocument();
    api.on('POST', '/api/v1/auth/logout', {}, 204);
    await user.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByLabelText('Contraseña')).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/v1/auth/logout')).toBe(true);
  });

  it('en Mi cuenta no se puede desactivar, pero sí pasar a otra app', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/auth/me', { ...me, twoFactorEnabled: true, twoFactorMandatory: true });
    api.on('GET', '/api/v1/auth/2fa', { enabled: true, recoveryCodesLeft: 8 });
    const user = userEvent.setup();
    renderApp('/mi-cuenta');

    expect(await screen.findByText('Activa')).toBeInTheDocument();
    expect(screen.getByText(/es obligatoria: no se puede desactivar/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();

    // Pasar a otra app pide la contraseña y un código.
    await user.click(screen.getByRole('button', { name: 'Pasar a otra app' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByRole('button', { name: 'Seguir' })).toBeDisabled();
    api.on('POST', '/api/v1/auth/2fa/relink', { ...setup, ticket: 'ticket-cifrado' });
    await user.type(dialog.getByLabelText('Tu contraseña'), 'mi-clave-larga');
    await user.type(dialog.getByLabelText('Código de la app o de recuperación'), 'ABCDE-12345');
    await user.click(dialog.getByRole('button', { name: 'Seguir' }));
    expect(api.calls.filter((c) => c.path === '/api/v1/auth/2fa/relink').at(-1)?.body).toEqual({
      password: 'mi-clave-larga',
      code: 'ABCDE-12345',
    });

    // El QR de la app nueva y su código (sin volver a pedir la contraseña).
    expect(await screen.findByRole('img', { name: /Código QR/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('Tu contraseña')).not.toBeInTheDocument();
    api.on('POST', '/api/v1/auth/2fa/relink/confirm', {}, 204);
    await user.type(screen.getByLabelText('Código de la app'), '654321');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(screen.queryByRole('img', { name: /Código QR/ })).not.toBeInTheDocument());
    expect(api.calls.filter((c) => c.path === '/api/v1/auth/2fa/relink/confirm').at(-1)?.body).toEqual({
      ticket: 'ticket-cifrado',
      code: '654321',
    });
    expect(await screen.findByText(/quedó en la app nueva/)).toBeInTheDocument();
  });
});

describe('Mi cuenta: activar y desactivar', () => {
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
    // Activarla pide la contraseña: sin ella el botón no se habilita.
    expect(screen.getByLabelText('Tu contraseña')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Tu contraseña')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('button', { name: 'Confirmar y activar' })).toBeDisabled();
    await user.type(screen.getByLabelText('Tu contraseña'), 'mi-clave-larga');
    await user.click(screen.getByRole('button', { name: 'Confirmar y activar' }));
    expect(await screen.findByText('El código no es correcto o ya venció.')).toBeInTheDocument();

    // Una contraseña equivocada se marca en su campo.
    api.on(
      'POST',
      '/api/v1/auth/2fa/enable',
      { title: 'Auth.InvalidPassword', detail: 'La contraseña no es correcta.' },
      400,
    );
    await user.click(screen.getByRole('button', { name: 'Confirmar y activar' }));
    expect(await screen.findByText('La contraseña no es correcta.')).toBeInTheDocument();
    expect(screen.getByLabelText('Tu contraseña')).toHaveAccessibleDescription(
      'La contraseña no es correcta.',
    );

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
      password: 'mi-clave-larga',
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

describe('el aviso del Inicio para quien no la tiene ni se la exigen', () => {
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

  it('también se lo recomienda a los demás roles', async () => {
    const api = mockApi();
    const perms = fixture<{ role: string; permissions: string[] }>('/api/v1/me/permissions');
    api.on('GET', '/api/v1/me/permissions', { ...perms, role: 'vendedor' });
    renderApp('/');
    expect(
      await screen.findByRole('complementary', { name: 'Recomendación de seguridad' }),
    ).toBeInTheDocument();
  });

  it('no aparece para quien la tiene obligatoria', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/auth/me', { ...me, twoFactorEnabled: true, twoFactorMandatory: true });
    renderApp('/');
    await screen.findByRole('heading', { name: /Hola/ });
    await settle(3);
    expect(
      screen.queryByRole('complementary', { name: 'Recomendación de seguridad' }),
    ).not.toBeInTheDocument();
  });
});
