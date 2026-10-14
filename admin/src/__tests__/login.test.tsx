/**
 * La puerta del panel: entrar, el error de credenciales, el email sin
 * verificar (con reenvío), olvidé mi contraseña, el alta del primer dueño en
 * una instalación vacía, y los links del mail (reseteo y verificación).
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi } from '../test/api';
import { renderApp } from '../test/render';

/** Sin sesión: /auth/me responde 401, como la API real. */
function loggedOut() {
  const api = mockApi();
  api.on('GET', '/api/v1/auth/me', { title: 'Unauthorized' }, 401);
  return api;
}

afterEach(() => window.history.replaceState(null, '', '/'));

/** El botón de enviar se habilita cuando responde el captcha (acá, desactivado). */
async function submitButton(name: string) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe('sesión: no poder preguntar no es estar deslogueado', () => {
  it.each([
    ['la API cortó por exceso de pedidos (429)', 429],
    ['la API falló (500)', 500],
  ])('%s: avisa y deja reintentar, sin mostrar el login', async (_, status) => {
    const api = mockApi();
    api.on('GET', '/api/v1/auth/me', { title: 'RateLimit.Exceeded', detail: 'Demasiados intentos' }, status);
    const user = userEvent.setup();
    renderApp('/');
    expect(await screen.findByText('No pudimos conectar con el servidor')).toBeInTheDocument();
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();

    // Vuelve la API: reintentar entra con la sesión que nunca se cerró.
    api.on('GET', '/api/v1/auth/me', fixture('/api/v1/auth/me'));
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() =>
      expect(screen.queryByText('No pudimos conectar con el servidor')).not.toBeInTheDocument(),
    );
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
  });

  it('sin red: también avisa en vez de pedir la clave', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderApp('/');
    expect(await screen.findByText('No pudimos conectar con el servidor')).toBeInTheDocument();
  });

  it('un 401 sí es no tener sesión: muestra el login', async () => {
    loggedOut();
    renderApp('/');
    expect(await screen.findByLabelText('Contraseña')).toBeInTheDocument();
  });
});

describe('login del panel', () => {
  it('los campos tienen nombre y dicen qué completa el gestor de contraseñas', async () => {
    loggedOut();
    renderApp('/');
    expect(await screen.findByLabelText('Email')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('entra con email y contraseña', async () => {
    const api = loggedOut();
    api.on('POST', '/api/v1/auth/login', fixture('/api/v1/auth/me'));
    const user = userEvent.setup();
    renderApp('/');

    await user.type(await screen.findByLabelText('Email'), 'duenio@tienda.com');
    await user.type(screen.getByLabelText('Contraseña'), 'una-clave-larga');
    await user.click(await submitButton('Iniciar sesión'));

    await waitFor(() => expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument());
    expect(api.calls).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/api/v1/auth/login',
        body: expect.objectContaining({ email: 'duenio@tienda.com' }),
      }),
    );
  });

  it('muestra el error y, si falta verificar, ofrece reenviar el mail', async () => {
    const api = loggedOut();
    api.on(
      'POST',
      '/api/v1/auth/login',
      { title: 'Auth.EmailNotVerified', detail: 'Verificá tu email para entrar.' },
      403,
    );
    const user = userEvent.setup();
    renderApp('/');

    await user.type(await screen.findByLabelText('Email'), 'nuevo@tienda.com');
    await user.type(screen.getByLabelText('Contraseña'), 'una-clave-larga');
    await user.click(await submitButton('Iniciar sesión'));

    expect(await screen.findByText('Verificá tu email para entrar.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reenviar email de verificación/ }));
    expect(await screen.findByText(/Email reenviado/)).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/api/v1/auth/resend-verification')).toBe(true);
  });

  it('olvidé mi contraseña responde igual exista o no la cuenta', async () => {
    const api = loggedOut();
    api.on('POST', '/api/v1/auth/forgot', {}, 500);
    const user = userEvent.setup();
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: '¿Olvidaste tu contraseña?' }));
    await user.type(screen.getByLabelText('Email'), 'alguien@tienda.com');
    await user.click(screen.getByRole('button', { name: 'Enviar link' }));
    expect(await screen.findByText(/te llegó un link/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Volver a iniciar sesión' }));
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('en una instalación vacía deja crear la cuenta del dueño', async () => {
    const api = loggedOut();
    api.on('GET', '/api/v1/auth/registration-open', { open: true });
    api.on('POST', '/api/v1/auth/register', fixture('/api/v1/auth/me'));
    const user = userEvent.setup();
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Creá la cuenta de dueño' }));
    await user.type(screen.getByLabelText('Tu nombre'), 'Ana');
    await user.type(screen.getByLabelText('Email'), 'ana@tienda.com');
    await user.type(screen.getByLabelText('Contraseña'), 'una-clave-larga');
    await user.click(await submitButton('Crear cuenta'));

    await waitFor(() => expect(api.calls.some((c) => c.path === '/api/v1/auth/register')).toBe(true));
    expect(api.calls.find((c) => c.path === '/api/v1/auth/register')?.body).toMatchObject({
      name: 'Ana',
      email: 'ana@tienda.com',
    });
  });

  it('el link de reseteo cambia la contraseña', async () => {
    window.history.replaceState(null, '', '/restablecer?email=ana%40tienda.com&token=tok123');
    const api = loggedOut();
    const user = userEvent.setup();
    renderApp('/restablecer');

    await user.type(await screen.findByLabelText('Nueva contraseña'), 'clave-nueva-larga');
    await user.click(screen.getByRole('button'));
    await waitFor(() => expect(api.calls.some((c) => c.path === '/api/v1/auth/reset')).toBe(true));
    expect(api.calls.find((c) => c.path === '/api/v1/auth/reset')?.body).toEqual({
      email: 'ana@tienda.com',
      token: 'tok123',
      password: 'clave-nueva-larga',
    });
    expect(await screen.findByText('Iniciar sesión')).toBeInTheDocument();
  });

  it('un link de reseteo vencido lo dice', async () => {
    window.history.replaceState(null, '', '/restablecer?email=a%40b.com&token=viejo');
    const api = loggedOut();
    api.on(
      'POST',
      '/api/v1/auth/reset',
      { title: 'Auth.InvalidToken', detail: 'El link no es válido o expiró.' },
      400,
    );
    const user = userEvent.setup();
    renderApp('/restablecer');

    await user.type(await screen.findByLabelText('Nueva contraseña'), 'clave-nueva-larga');
    await user.click(screen.getByRole('button'));
    expect(await screen.findByText('El link no es válido o expiró.')).toBeInTheDocument();
  });

  it('un link de reseteo incompleto no muestra el formulario', async () => {
    window.history.replaceState(null, '', '/restablecer');
    loggedOut();
    renderApp('/restablecer');
    expect(await screen.findByText(/Link inválido/)).toBeInTheDocument();
  });

  it('el link de verificación confirma el email', async () => {
    window.history.replaceState(null, '', '/verificar?email=ana%40tienda.com&token=tok');
    const api = loggedOut();
    renderApp('/verificar');
    expect(await screen.findByText('Ir al panel')).toBeInTheDocument();
    expect(api.calls.find((c) => c.path === '/api/v1/auth/verify')?.body).toEqual({
      email: 'ana@tienda.com',
      token: 'tok',
    });
  });

  it('un link de verificación que no sirve lo dice', async () => {
    window.history.replaceState(null, '', '/verificar?email=x%40y.com&token=malo');
    const api = loggedOut();
    api.on('POST', '/api/v1/auth/verify', { title: 'Auth.InvalidToken' }, 400);
    renderApp('/verificar');
    await waitFor(() => expect(screen.queryByText('Ir al panel')).not.toBeInTheDocument());
    expect(await screen.findByRole('link')).toBeInTheDocument();
  });
});
