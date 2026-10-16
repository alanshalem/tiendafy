/**
 * "Mis conversaciones" en la cuenta del comprador: la lista del chat posventa
 * con el pedido, el último mensaje y lo que falta leer; tocar una abre el chat
 * de esa compra. Con las respuestas reales de un comprador sembrado (una
 * compra pagada y un mensaje en el chat).
 */
import axe from 'axe-core';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { a11yViolations } from '../../../test-fixtures/a11y';
import { AccountConversations, type CustomerConversation } from '../components/store/AccountConversations';
import { fixture, fixtureTenantId, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderInStore } from '../test/store';

const LIST = '/api/v1/shop/support/conversations';
const me = fixture<{ name: string; email: string }>('/api/v1/shop/auth/me');
const listed = fixture<{ items: CustomerConversation[] }>(LIST);
const conversation = listed.items[0]!;
const thread = fixture<{ conversation: { id: string }; items: { body: string }[] }>(`${LIST}/:id/messages`);

let api: MockApi;
let crashes: () => unknown[][];

const listReads = () => api.calls.filter((c) => c.method === 'GET' && c.path === LIST).length;

async function show() {
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderInStore(<AccountConversations />);
  await settle(3);
  return user;
}

beforeEach(() => {
  crashes = watchCrashes();
  api = mockApi();
  // Un comprador que ya entró antes (la tienda lo recuerda y valida su sesión).
  localStorage.setItem(`tiendafy.shop.user.${fixtureTenantId}`, JSON.stringify(me));
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

describe('Mis conversaciones', () => {
  it('lista cada consulta con su pedido, el último mensaje y la fecha', async () => {
    await show();
    expect(screen.getByRole('heading', { name: 'Mis conversaciones' })).toBeInTheDocument();
    const row = screen.getByRole('button', { name: new RegExp(`Pedido ${conversation.orderLabel}`) });
    expect(row).toHaveTextContent(conversation.lastMessage!.body);
    // El último lo escribió el comprador: se aclara que fue suyo.
    expect(row).toHaveTextContent('Vos:');
    expect(row).not.toHaveTextContent('sin leer');
    expect(screen.getByRole('link', { name: /Mi cuenta/ })).toHaveAttribute('href', '/cuenta');
    expect(await a11yViolations(axe)).toEqual([]);
  });

  it('marca las que tienen respuestas sin leer y muestra el adjunto si vino sin texto', async () => {
    api.on('GET', LIST, {
      items: [
        {
          ...conversation,
          unreadForCustomer: 2,
          lastMessage: { body: '', attachmentName: 'etiqueta.pdf', isFromStaff: true },
        },
        { ...conversation, id: 'otra', orderLabel: '#1001', unreadForCustomer: 1 },
      ],
    });
    await show();
    const row = screen.getByRole('button', { name: new RegExp(`Pedido ${conversation.orderLabel}`) });
    expect(row).toHaveTextContent('2 sin leer');
    expect(row).toHaveTextContent('etiqueta.pdf');
    expect(row).not.toHaveTextContent('Vos:');
    expect(screen.getByRole('button', { name: /Pedido #1001/ })).toHaveTextContent('1 sin leer');
  });

  it('al tocar una abre el chat de ese pedido, y al cerrarlo la lista se pone al día', async () => {
    api.on('POST', LIST, thread.conversation);
    const user = await show();
    const before = listReads();
    await user.click(screen.getByRole('button', { name: new RegExp(`Pedido ${conversation.orderLabel}`) }));
    await settle(3);

    expect(api.calls.find((c) => c.method === 'POST' && c.path === LIST)?.body).toEqual({
      orderId: conversation.orderId,
    });
    expect(screen.getByText('Consulta sobre tu pedido')).toBeInTheDocument();
    expect(screen.getAllByText(thread.items[0]!.body).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Cerrar chat' }));
    await settle(2);
    expect(screen.queryByText('Consulta sobre tu pedido')).not.toBeInTheDocument();
    expect(listReads()).toBe(before + 1);
  });

  it('sin conversaciones explica cómo empezar una', async () => {
    api.on('GET', LIST, { items: [] });
    await show();
    expect(screen.getByText('Todavía no tenés conversaciones')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver mis pedidos' })).toHaveAttribute('href', '/cuenta');
  });

  it('si no se puede cargar lo dice y deja reintentar', async () => {
    api.on('GET', LIST, { title: 'x' }, 500);
    const user = await show();
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar tus conversaciones.');

    api.on('GET', LIST, listed);
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await settle(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: new RegExp(`Pedido ${conversation.orderLabel}`) }),
    ).toBeInTheDocument();
  });

  it('mientras carga lo avisa', async () => {
    renderInStore(<AccountConversations />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
    await settle(3);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('sin sesión invita a entrar y no pide la lista', async () => {
    localStorage.clear();
    api.on('GET', '/api/v1/shop/auth/me', { title: 'Unauthorized' }, 401);
    const user = await show();
    expect(screen.getByText('Iniciá sesión para ver tus consultas sobre tus pedidos.')).toBeInTheDocument();
    expect(listReads()).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
