/**
 * La cuenta del comprador: entrar, registrarse y recuperar la clave desde el
 * header; el menú con la sesión iniciada; "Mi cuenta" con sus pedidos y el
 * chat posventa de una compra. Con las respuestas reales de un comprador
 * sembrado (una compra pagada y un mensaje en el chat).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountButton } from '../components/store/AccountButton';
import { AccountDashboard } from '../components/store/AccountDashboard';
import { fixture, fixtureTenantId, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderInStore } from '../test/store';

interface Me {
  name: string;
  email: string;
}
interface Orders {
  items: { id: string; items: { productName: string }[] }[];
}
interface Thread {
  conversation: { id: string };
  items: { body: string }[];
}

const me = fixture<Me>('/api/v1/shop/auth/me');
const orders = fixture<Orders>('/api/v1/shop/orders');
const thread = fixture<Thread>('/api/v1/shop/support/conversations/:id/messages');
const conversationId = thread.conversation.id;

let api: MockApi;
let crashes: () => unknown[][];

/** Sin sesión: /me contesta 401, como sin cookie. */
const anonymous = () => api.on('GET', '/api/v1/shop/auth/me', { title: 'Unauthorized' }, 401);

async function show(ui: React.ReactNode) {
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderInStore(ui);
  await settle(3);
  return user;
}

const posted = (suffix: string) =>
  api.calls.filter((c) => c.method === 'POST' && c.path.endsWith(suffix)).map((c) => c.body);

beforeEach(() => {
  crashes = watchCrashes();
  api = mockApi();
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

describe('entrar a la cuenta', () => {
  beforeEach(() => anonymous());

  async function openModal() {
    const user = await show(<AccountButton />);
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    const dialog = screen.getByRole('dialog');
    const submit = () =>
      within(dialog).getByRole('button', { name: /Iniciar sesión|Crear cuenta|Enviar link/ });
    await waitFor(() => expect(submit()).toBeEnabled()); // el captcha (apagado) ya respondió
    return { user, dialog, submit };
  }

  it('inicia sesión y queda el menú con su nombre', async () => {
    api.on('POST', '/api/v1/shop/auth/login', { customer: me });
    const { user, submit } = await openModal();
    await user.type(screen.getByPlaceholderText('Email'), me.email);
    await user.type(screen.getByPlaceholderText('Contraseña'), 'una-clave-larga');
    await user.click(submit());
    await settle(1);

    expect(posted('/shop/auth/login')[0]).toMatchObject({ email: me.email, password: 'una-clave-larga' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mi cuenta' })).toHaveTextContent(me.name.split(' ')[0]!);
  });

  it('una clave incorrecta muestra el motivo de la API', async () => {
    api.on('POST', '/api/v1/shop/auth/login', { detail: 'Email o contraseña incorrectos.' }, 401);
    const { user, submit } = await openModal();
    await user.type(screen.getByPlaceholderText('Email'), me.email);
    await user.type(screen.getByPlaceholderText('Contraseña'), 'otra-clave-larga');
    await user.click(submit());
    await settle(1);
    expect(screen.getByText('Email o contraseña incorrectos.')).toBeInTheDocument();
  });

  it('se registra con nombre', async () => {
    api.on('POST', '/api/v1/shop/auth/register', { customer: me });
    const { user, submit } = await openModal();
    await user.click(screen.getByRole('button', { name: 'Registrate' }));
    await user.type(screen.getByPlaceholderText('Nombre'), me.name);
    await user.type(screen.getByPlaceholderText('Email'), me.email);
    await user.type(screen.getByPlaceholderText('Contraseña'), 'una-clave-larga');
    await user.click(submit());
    await settle(1);
    expect(posted('/shop/auth/register')[0]).toMatchObject({ name: me.name, email: me.email });
    expect(screen.getByRole('button', { name: 'Mi cuenta' })).toBeInTheDocument();
  });

  it('recupera la clave: avisa sin decir si la cuenta existe', async () => {
    const { user, submit } = await openModal();
    await user.click(screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' }));
    expect(screen.queryByPlaceholderText('Contraseña')).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Email'), me.email);
    await user.click(submit());
    await settle(1);
    expect(posted('/shop/auth/forgot')[0]).toEqual({ email: me.email });
    expect(screen.getByText(/Si hay una cuenta con ese email/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Volver a iniciar sesión' }));
    expect(screen.getByPlaceholderText('Contraseña')).toBeInTheDocument();
  });

  it('si el pedido de recuperación falla, lo dice', async () => {
    api.on('POST', '/api/v1/shop/auth/forgot', {}, 500);
    const { user, submit } = await openModal();
    await user.click(screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' }));
    await user.type(screen.getByPlaceholderText('Email'), me.email);
    await user.click(submit());
    await settle(1);
    expect(screen.getByText('Algo salió mal. Probá de nuevo.')).toBeInTheDocument();
  });

  it('con Google configurado ofrece entrar con Google', async () => {
    api.on('GET', '/api/v1/shop/auth/google/configured', { configured: true });
    await openModal();
    expect(screen.getByRole('button', { name: /Continuar con Google/ })).toBeInTheDocument();
  });

  it('se cierra con Escape, con la X y tocando afuera', async () => {
    const { user } = await openModal();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await user.click(screen.getByRole('dialog').parentElement!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('si no se puede preguntar por la sesión', () => {
  it.each([429, 500])('un %s no cierra la sesión del comprador cacheado', async (status) => {
    localStorage.setItem(`tiendafy.shop.user.${fixtureTenantId}`, JSON.stringify(me));
    api.on('GET', '/api/v1/shop/auth/me', { title: 'x' }, status);
    await show(<AccountButton />);
    expect(screen.getByRole('button', { name: 'Mi cuenta' })).toBeInTheDocument();
  });

  it('un 401 sí: borra el cacheado y muestra entrar', async () => {
    localStorage.setItem(`tiendafy.shop.user.${fixtureTenantId}`, JSON.stringify(me));
    anonymous();
    await show(<AccountButton />);
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(localStorage.getItem(`tiendafy.shop.user.${fixtureTenantId}`)).toBeNull();
  });
});

describe('con la sesión iniciada', () => {
  it('el menú lleva a la cuenta y a favoritos, se cierra afuera y cierra la sesión', async () => {
    const user = await show(
      <>
        <AccountButton />
        <p>afuera</p>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Mi cuenta' }));
    expect(screen.getByText(me.email)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mi cuenta y pedidos/ })).toHaveAttribute('href', '/cuenta');
    expect(screen.getByRole('link', { name: /Mis favoritos/ })).toHaveAttribute('href', '/favoritos');

    await user.click(screen.getByText('afuera'));
    expect(screen.queryByText(me.email)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mi cuenta' }));
    await user.click(screen.getByRole('button', { name: /Cerrar sesión/ }));
    expect(api.calls.some((c) => c.method === 'POST' && c.path.endsWith('/shop/auth/logout'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('Mi cuenta lista sus pedidos con estado y productos', async () => {
    await show(<AccountDashboard />);
    expect(screen.getByText(`Hola, ${me.name.split(' ')[0]}`)).toBeInTheDocument();
    expect(screen.getByText('Pagado')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(orders.items[0]!.items[0]!.productName))).toBeInTheDocument();
  });

  it('muestra estados desconocidos tal cual, el seguimiento y la cuenta sin pedidos', async () => {
    api.on('GET', '/api/v1/shop/orders', {
      items: [{ ...orders.items[0], status: 'NUEVO', tracking: 'TRK-1' }],
    });
    await show(<AccountDashboard />);
    expect(screen.getByText('NUEVO')).toBeInTheDocument();
    expect(screen.getByText('TRK-1')).toBeInTheDocument();
  });

  it('sin pedidos lo dice', async () => {
    api.on('GET', '/api/v1/shop/orders', { items: [] });
    await show(<AccountDashboard />);
    expect(screen.getByText('Todavía no hiciste ningún pedido.')).toBeInTheDocument();
  });

  it('sin sesión invita a entrar', async () => {
    anonymous();
    await show(<AccountDashboard />);
    expect(screen.getByText('Iniciá sesión para ver tu cuenta')).toBeInTheDocument();
  });

  it('Salir cierra la sesión', async () => {
    const user = await show(<AccountDashboard />);
    await user.click(screen.getByRole('button', { name: /Salir/ }));
    expect(screen.getByText('Iniciá sesión para ver tu cuenta')).toBeInTheDocument();
  });
});

describe('chat posventa', () => {
  async function openChat() {
    const user = await show(<AccountDashboard />);
    api.on('POST', '/api/v1/shop/support/conversations', thread.conversation);
    await user.click(screen.getByRole('button', { name: /Consultar sobre este pedido/ }));
    await settle(3);
    return user;
  }

  const input = () => screen.getByPlaceholderText('Escribí tu mensaje…');
  const attach = (file: File) =>
    userEvent.upload(document.querySelector<HTMLInputElement>('input[type=file]')!, file, {
      applyAccept: false,
    });

  it('abre la conversación de la compra con sus mensajes y envía uno nuevo', async () => {
    const user = await openChat();
    expect(posted('/shop/support/conversations')[0]).toEqual({ orderId: orders.items[0]!.id });
    expect(screen.getByText(thread.items[0]!.body)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enviar' })); // vacío: no manda nada
    expect(posted(`/conversations/${conversationId}/messages`)).toEqual([]);

    await user.type(input(), 'Gracias{Enter}');
    await settle(2);
    expect(posted(`/conversations/${conversationId}/messages`)).toEqual([{ body: 'Gracias' }]);
    expect(input()).toHaveValue('');
  });

  it('si el mensaje no sale, lo dice', async () => {
    const user = await openChat();
    api.on('POST', `/api/v1/shop/support/conversations/${conversationId}/messages`, {}, 500);
    await user.type(input(), 'Hola');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await settle(1);
    expect(screen.getByText('No se pudo enviar el mensaje.')).toBeInTheDocument();
  });

  it('adjunta PDF, JPG o PNG de hasta 10 MB; rechaza el resto', async () => {
    await openChat();
    await attach(new File(['x'], 'virus.exe', { type: 'application/x-msdownload' }));
    expect(screen.getByText('Solo PDF, JPG o PNG.')).toBeInTheDocument();

    const huge = new File(['x'], 'enorme.pdf', { type: 'application/pdf' });
    Object.defineProperty(huge, 'size', { value: 11 * 1024 * 1024 });
    await attach(huge);
    expect(screen.getByText('El archivo supera los 10 MB.')).toBeInTheDocument();

    await attach(new File(['%PDF'], 'factura.pdf', { type: 'application/pdf' }));
    await settle(2);
    const upload = api.calls.find((c) => c.path.endsWith(`/conversations/${conversationId}/attachments`));
    expect(upload?.method).toBe('POST');

    api.on('POST', `/api/v1/shop/support/conversations/${conversationId}/attachments`, {}, 500);
    await attach(new File(['png'], 'foto.png', { type: 'image/png' }));
    await settle(2);
    expect(screen.getByText('No se pudo adjuntar el archivo.')).toBeInTheDocument();
  });

  it('si la conversación no abre, lo dice; y se cierra', async () => {
    const user = await show(<AccountDashboard />);
    api.on('POST', '/api/v1/shop/support/conversations', { detail: 'No' }, 409);
    await user.click(screen.getByRole('button', { name: /Consultar sobre este pedido/ }));
    await settle(2);
    expect(screen.getByText('No pudimos abrir el chat. Probá de nuevo.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar chat' }));
    expect(screen.queryByText('Consulta sobre tu pedido')).not.toBeInTheDocument();
  });

  it('se refresca solo cada unos segundos', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      await openChat();
      const reads = () => api.calls.filter((c) => c.method === 'GET' && c.path.endsWith('/messages')).length;
      const before = reads();
      vi.advanceTimersByTime(6_000);
      await settle(1);
      expect(reads()).toBe(before + 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
