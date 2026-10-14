/**
 * La sesión vence con el panel abierto (la cookie dura 12 h desde el último
 * uso): el próximo pedido responde 401. En vez del genérico "No se pudo
 * guardar", se pide la clave ENCIMA de la pantalla, sin desmontarla: lo que
 * se estaba cargando sigue ahí, y se repite después de entrar.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixture, mockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';
import { api as client, ApiRequestError, errMsg } from '../lib/api';

const product = fixture<{ id: string }>('/api/v1/products/:id');
const me = fixture<{ email: string }>('/api/v1/auth/me');

async function editingProduct() {
  const api = mockApi();
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(`/productos/${product.id}/editar`);
  await screen.findByRole('heading', { name: 'Editar producto' });
  await settle(3);
  const name = screen.getByLabelText(/^Nombre/);
  await user.clear(name);
  await user.type(name, 'Nombre sin guardar');
  return { api, user };
}

describe('sesión vencida', () => {
  it('pide la clave encima del form, que no se pierde, y después se guarda', async () => {
    const { api, user } = await editingProduct();
    api.on('PATCH', `/api/v1/products/${product.id}`, {}, 401);
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Tu sesión venció' }));
    expect(screen.getByText('Tu sesión venció. Volvé a ingresar.')).toBeInTheDocument();
    // La pantalla sigue montada debajo, con lo que se había escrito.
    expect(screen.getByLabelText(/^Nombre/)).toHaveValue('Nombre sin guardar');

    // El email es el de la sesión; la clave, con las pistas para el gestor de contraseñas.
    expect(dialog.getByLabelText('Email')).toHaveValue(me.email);
    expect(dialog.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username');
    const password = dialog.getByLabelText('Contraseña');
    expect(password).toHaveAttribute('autocomplete', 'current-password');

    // Clave mal: lo dice y la borra.
    api.on(
      'POST',
      '/api/v1/auth/login',
      { title: 'Auth.Invalid', detail: 'Email o contraseña incorrectos.' },
      401,
    );
    await user.type(password, 'clave-mal-escrita');
    const submit = dialog.getByRole('button', { name: 'Ingresar' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    expect(await dialog.findByText('Email o contraseña incorrectos.')).toBeInTheDocument();
    expect(password).toHaveValue('');

    api.on('POST', '/api/v1/auth/login', me);
    await user.type(password, 'una-clave-larga');
    await user.click(dialog.getByRole('button', { name: 'Ingresar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Tu sesión venció' })).not.toBeInTheDocument(),
    );
    expect(api.calls.filter((c) => c.path === '/api/v1/auth/login').at(-1)?.body).toMatchObject({
      email: me.email,
      password: 'una-clave-larga',
    });
    expect(screen.getByLabelText(/^Nombre/)).toHaveValue('Nombre sin guardar');

    // Se repite lo que no se guardó.
    api.on('PATCH', `/api/v1/products/${product.id}`, {});
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await settle(4);
    expect(
      api.calls.filter((c) => c.method === 'PATCH' && c.path === `/api/v1/products/${product.id}`).at(-1)
        ?.body,
    ).toMatchObject({ name: 'Nombre sin guardar' });
  });

  it('se puede cerrar para copiar lo que había; el próximo 401 lo vuelve a abrir', async () => {
    const { api, user } = await editingProduct();
    api.on('PATCH', `/api/v1/products/${product.id}`, {}, 401);
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tu sesión venció' });
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Tu sesión venció' })).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('dialog', { name: 'Tu sesión venció' })).toBeInTheDocument();
  });

  it('"Entrar con otra cuenta" cierra la sesión y lleva al ingreso', async () => {
    const { api, user } = await editingProduct();
    api.on('PATCH', `/api/v1/products/${product.id}`, {}, 401);
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tu sesión venció' });
    await user.click(within(dialog).getByRole('button', { name: 'Entrar con otra cuenta' }));
    expect(await screen.findByLabelText('Contraseña')).toBeInTheDocument();
    expect(api.calls.some((c) => c.path === '/api/v1/auth/logout')).toBe(true);
  });

  it('el mensaje del 401 es el de la sesión, y los de /auth/ no cuentan como sesión vencida', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/orders', {}, 401);
    api.on('POST', '/api/v1/auth/login', { title: 'Auth.Invalid', detail: 'Clave incorrecta.' }, 401);

    const expired = await client.get('/api/v1/orders').catch((e: unknown) => e);
    expect(expired).toBeInstanceOf(ApiRequestError);
    expect(errMsg(expired, 'No se pudo guardar.')).toBe('Tu sesión venció. Volvé a ingresar.');

    const wrong = await client.post('/api/v1/auth/login', {}).catch((e: unknown) => e);
    expect(errMsg(wrong)).toBe('Clave incorrecta.');
    expect((wrong as ApiRequestError).error.code).toBe('Auth.Invalid');
  });
});
