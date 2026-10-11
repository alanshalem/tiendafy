/**
 * Los formularios públicos de la tienda: contacto, botón de arrepentimiento
 * (Ley 24.240: la constancia la numera el servidor), cambio de contraseña con
 * el link del email, y la lista de favoritos.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactForm } from '../components/store/ContactForm';
import { RepentanceForm } from '../components/store/RepentanceForm';
import { ResetPassword } from '../components/store/ResetPassword';
import { FavoritesList } from '../components/store/FavoritesList';
import { defaultTheme } from '../lib/theme';
import { fixture, fixtureTenantId, mockApi, type MockApi } from '../test/api';
import { nav } from '../test/next';
import { settle, watchCrashes } from '../test/explore';
import { renderInStore } from '../test/store';

let api: MockApi;
let crashes: () => unknown[][];

beforeEach(() => {
  api = mockApi();
  crashes = watchCrashes();
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function show(ui: React.ReactNode) {
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderInStore(ui);
  await settle(2);
  return user;
}
const submit = async (user: ReturnType<typeof userEvent.setup>, name: RegExp | string) => {
  const button = screen.getByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled()); // el captcha (apagado) ya respondió
  await user.click(button);
  await settle(1);
};
const contactBody = () =>
  api.calls.find((c) => c.path === '/api/v1/contact/submit')?.body as Record<string, unknown>;

describe('contacto', () => {
  async function fill() {
    const user = await show(<ContactForm />);
    await user.type(screen.getByLabelText('Tu nombre'), 'Ana');
    await user.type(screen.getByLabelText('Tu email'), 'ana@example.com');
    await user.type(screen.getByLabelText('Tu mensaje'), '¿Tienen stock?');
    return user;
  }

  it('envía el mensaje y confirma', async () => {
    const user = await fill();
    await submit(user, /Enviar/);
    expect(contactBody()).toMatchObject({ name: 'Ana', email: 'ana@example.com', body: '¿Tienen stock?' });
    expect(screen.queryByRole('button', { name: /Enviar/ })).not.toBeInTheDocument();
  });

  it('muestra el motivo si la API lo rechaza, y un aviso si no hay red', async () => {
    api.on('POST', '/api/v1/contact/submit', { detail: 'Demasiados mensajes.' }, 429);
    const user = await fill();
    await submit(user, /Enviar/);
    expect(screen.getByText('Demasiados mensajes.')).toBeInTheDocument();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await submit(user, /Enviar/);
    expect(screen.getByText('No se pudo enviar. Revisá tu conexión.')).toBeInTheDocument();
  });
});

describe('arrepentimiento', () => {
  async function fill(order = '') {
    const user = await show(<RepentanceForm />);
    await user.type(screen.getByLabelText('Tu nombre'), 'Ana');
    await user.type(screen.getByLabelText('Tu email'), 'ana@example.com');
    if (order) await user.type(screen.getByLabelText('Número de pedido'), order);
    return user;
  }

  it('la constancia lleva el número que da el servidor', async () => {
    api.on('POST', '/api/v1/contact/submit', { reference: 'ARR-000123' });
    const user = await fill('A-77');
    await user.type(screen.getByLabelText('Motivo'), 'No me sirvió');
    await submit(user, /Enviar|Solicitar|arrepent/i);

    expect(contactBody()).toMatchObject({ kind: 'repentance', orderRef: 'A-77' });
    expect(contactBody().body).toContain('Pedido: A-77');
    expect(contactBody().body).toContain('Motivo: No me sirvió');
    expect(screen.getByText('ARR-000123')).toBeInTheDocument();
  });

  it('sin número de pedido igual se registra; un error se explica', async () => {
    api.on('POST', '/api/v1/contact/submit', {});
    const user = await fill();
    await submit(user, /Enviar|Solicitar|arrepent/i);
    expect(contactBody().body).toContain('Pedido: no informado');
    expect(screen.getByText('registrada')).toBeInTheDocument();
  });

  it('si falla, lo dice', async () => {
    api.on('POST', '/api/v1/contact/submit', {}, 500);
    const user = await fill();
    await submit(user, /Enviar|Solicitar|arrepent/i);
    expect(screen.getByText('No se pudo enviar. Probá de nuevo.')).toBeInTheDocument();
  });
});

describe('cambio de contraseña', () => {
  it('sin token en el link pide uno nuevo', async () => {
    await show(<ResetPassword />);
    expect(screen.queryByPlaceholderText('Nueva contraseña')).not.toBeInTheDocument();
  });

  it('con el token cambia la clave', async () => {
    nav.at('/cuenta/reset?token=tok-1');
    const user = await show(<ResetPassword />);
    await user.type(screen.getByPlaceholderText('Nueva contraseña'), 'una-clave-larga');
    await user.click(screen.getByRole('button'));
    await settle(1);
    expect(api.calls.find((c) => c.path === '/api/v1/shop/auth/reset')?.body).toEqual({
      token: 'tok-1',
      password: 'una-clave-larga',
    });
    expect(screen.getByText('Tu contraseña fue cambiada y ya iniciaste sesión.')).toBeInTheDocument();
  });

  it('un link vencido lo explica', async () => {
    nav.at('/cuenta/reset?token=viejo');
    api.on('POST', '/api/v1/shop/auth/reset', {}, 400);
    const user = await show(<ResetPassword />);
    await user.type(screen.getByPlaceholderText('Nueva contraseña'), 'una-clave-larga');
    await user.click(screen.getByRole('button'));
    await settle(1);
    expect(screen.getByText('El link no es válido o expiró. Pedí uno nuevo.')).toBeInTheDocument();
  });
});

describe('favoritos', () => {
  const productId = fixture<{ productIds: string[] }>('/api/v1/shop/favorites').productIds[0]!;
  const name = fixture<{ name: string }>('/api/v1/products/:id').name;

  it('al entrar, sube los locales y adopta los del servidor', async () => {
    localStorage.setItem(`tiendafy.favorites.${fixtureTenantId}`, JSON.stringify(['local-1']));
    // El merge contesta el set completo de la cuenta (lo mismo que GET /shop/favorites).
    api.on('POST', '/api/v1/shop/favorites/merge', fixture('/api/v1/shop/favorites'));
    await show(<FavoritesList productList={defaultTheme.productList} />);
    await settle(2);
    expect(api.calls.find((c) => c.path === '/api/v1/shop/favorites/merge')?.body).toEqual({
      productIds: ['local-1'],
    });
    expect(api.calls.some((c) => c.path === `/api/v1/products/${productId}`)).toBe(true);
    expect(screen.getAllByText(name).length).toBeGreaterThan(0);
  });

  it('sin cuenta, los del navegador', async () => {
    api.on('GET', '/api/v1/shop/auth/me', {}, 401);
    localStorage.setItem(`tiendafy.favorites.${fixtureTenantId}`, JSON.stringify([productId, 7]));
    await show(<FavoritesList productList={defaultTheme.productList} />);
    expect(screen.getAllByText(name).length).toBeGreaterThan(0);
  });

  it('sin favoritos invita a explorar', async () => {
    api.on('GET', '/api/v1/shop/auth/me', {}, 401);
    await show(<FavoritesList productList={defaultTheme.productList} />);
    expect(screen.getByText('Todavía no guardaste favoritos')).toBeInTheDocument();
  });
});
