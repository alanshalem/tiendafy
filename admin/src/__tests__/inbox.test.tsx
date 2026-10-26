/**
 * La bandeja unificada: una lista con los cuatro canales, la conversación a
 * la derecha, leído al abrir, asignar, archivar y responder en el lugar. Lo
 * que no puede pasar: que una respuesta pública a una pregunta de Mercado
 * Libre salga con un Enter suelto.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';
import type { InboxPage, InboxThread } from '../lib/inbox';

const base = {
  lastActivityAtUtc: '2026-10-14T12:00:00Z',
  archived: false,
  awaitingReply: true,
  assignedTo: null,
};

const question: InboxThread = {
  ...base,
  key: 'ml-pregunta:123456789',
  channel: 'ml-pregunta',
  externalId: '123456789',
  title: 'Kit Distribución 150cc',
  subtitle: 'Sin responder',
  preview: '¿Sirve para la Rouser 200?',
  unread: true,
  unreadCount: 1,
  context: {
    questionId: 123456789,
    text: '¿Sirve para la Rouser 200?',
    status: 'UNANSWERED',
    dateCreated: '2026-10-14T11:00:00Z',
    answer: null,
    listing: {
      id: 'MLA1',
      title: 'Kit Distribución 150cc',
      thumbnail: null,
      price: 48900,
      availableQuantity: 12,
      permalink: 'https://articulo.mercadolibre.com.ar/MLA1',
    },
    demo: false,
  },
};

const chat: InboxThread = {
  ...base,
  key: 'posventa:11111111-1111-1111-1111-111111111111',
  channel: 'posventa',
  externalId: '11111111-1111-1111-1111-111111111111',
  title: 'beto@mail.com',
  subtitle: 'Pedido #A1B2C3D4',
  preview: '¿Cuándo sale?',
  unread: false,
  unreadCount: 0,
  lastActivityAtUtc: '2026-10-14T10:00:00Z',
  context: {
    conversationId: '11111111-1111-1111-1111-111111111111',
    orderId: '22222222-2222-2222-2222-222222222222',
    orderNumber: '#A1B2C3D4',
    status: 'OPEN',
  },
};

const page: InboxPage = {
  items: [question, chat],
  total: 2,
  counts: { unread: 1, mine: 0, mineUnread: 0, byChannel: { 'ml-pregunta': 1, posventa: 0 } },
  channels: ['contacto', 'posventa', 'ml-pregunta', 'ml-mensaje'],
  warnings: [],
};

async function open(path = '/bandeja', setup?: (api: MockApi) => void) {
  const api = mockApi();
  api.on('GET', '/api/v1/inbox', page);
  setup?.(api);
  api.on('GET', '/api/v1/inbox/counts', page.counts);
  api.on('GET', '/api/v1/inbox/assignees', {
    items: [
      { userId: 'u-soporte', name: 'Sofi Soporte', email: 's@x.com', channels: ['posventa', 'ml-pregunta'] },
      { userId: 'u-contacto', name: 'Carla Contacto', email: 'c@x.com', channels: ['contacto'] },
    ],
  });
  api.on('GET', `/api/v1/support/conversations/${chat.externalId}/messages`, {
    items: [
      {
        id: 'm1',
        isFromStaff: false,
        authorName: 'beto@mail.com',
        body: '¿Cuándo sale?',
        attachment: null,
        createdAtUtc: '2026-10-14T10:00:00Z',
      },
    ],
  });
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  await screen.findByRole('heading', { name: 'Bandeja', level: 1 });
  await settle(3);
  return { api, user };
}

const draftPage = (item: InboxThread): InboxPage => ({ ...page, items: [item], total: 1 });

const posts = (api: MockApi, path: string) => api.calls.filter((c) => c.method === 'POST' && c.path === path);

describe('bandeja', () => {
  it('lista los canales juntos y el menú muestra lo sin leer', async () => {
    await open();
    expect(screen.getByRole('button', { name: /Kit Distribución 150cc/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /beto@mail.com/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 sin leer');
    expect(await screen.findByLabelText('1 sin leer')).toBeInTheDocument(); // el contador del menú
  });

  it('abrir una pregunta la marca leída y muestra la publicación', async () => {
    const { api, user } = await open();
    await user.click(screen.getByRole('button', { name: /Kit Distribución 150cc/ }));
    await waitFor(() =>
      expect(posts(api, '/api/v1/inbox/threads/ml-pregunta/123456789/read')).toHaveLength(1),
    );
    expect(screen.getByText('12 disponibles')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver publicación/ })).toHaveAttribute(
      'href',
      'https://articulo.mercadolibre.com.ar/MLA1',
    );
  });

  it('una respuesta pública no sale con Enter: sale con Ctrl+Enter o con el botón', async () => {
    const { api, user } = await open(`/bandeja?conversacion=${encodeURIComponent(question.key)}`);
    const answer = '/api/v1/admin/meli/questions/123456789/answer';
    const box = await screen.findByRole('textbox', { name: 'Respuesta' });

    await user.type(box, 'Sí, le va.{Enter}');
    await settle(2);
    expect(posts(api, answer)).toHaveLength(0);
    expect(box).toHaveValue('Sí, le va.\n'); // Enter fue un salto de línea

    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(posts(api, answer)).toHaveLength(1));
    expect(posts(api, answer)[0]!.body).toEqual({ text: 'Sí, le va.' });
  });

  it('en el chat posventa Enter envía (es privado)', async () => {
    const { api, user } = await open(`/bandeja?conversacion=${encodeURIComponent(chat.key)}`);
    expect(await screen.findByText('¿Cuándo sale?', { selector: 'p' })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Respuesta' }), 'Mañana sale{Enter}');
    const path = `/api/v1/support/conversations/${chat.externalId}/messages`;
    await waitFor(() => expect(posts(api, path)).toHaveLength(1));
    expect(posts(api, path)[0]!.body).toEqual({ body: 'Mañana sale' });
  });

  it('asigna solo entre quienes atienden el canal, y archiva', async () => {
    const { api, user } = await open(`/bandeja?conversacion=${encodeURIComponent(chat.key)}`);
    const select = await screen.findByRole('combobox', { name: 'Asignada a' });
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Sin asignar', 'Sofi Soporte']); // Carla solo atiende contacto
    await user.selectOptions(select, 'u-soporte');
    await waitFor(() =>
      expect(api.calls.find((c) => c.method === 'PUT' && c.path.endsWith('/assignee'))?.body).toEqual({
        userId: 'u-soporte',
      }),
    );

    await user.click(screen.getByRole('button', { name: /Archivar/ }));
    await waitFor(() =>
      expect(posts(api, `/api/v1/inbox/threads/posventa/${chat.externalId}/archive`)).toHaveLength(1),
    );
  });

  it('en el celular, Volver vuelve a la lista', async () => {
    const { user } = await open(`/bandeja?conversacion=${encodeURIComponent(chat.key)}`);
    await user.click(await screen.findByRole('button', { name: /Volver/ }));
    await settle(2);
    expect(screen.getByText('Elegí una conversación.')).toBeInTheDocument();
  });
});

describe('bandeja: borrador de IA', () => {
  const contact: InboxThread = {
    ...base,
    key: 'contacto:33333333-3333-3333-3333-333333333333',
    channel: 'contacto',
    externalId: '33333333-3333-3333-3333-333333333333',
    title: 'Ana',
    subtitle: null,
    preview: '¿Hacen factura A?',
    unread: false,
    unreadCount: 0,
    context: {
      email: 'ana@mail.com',
      body: '¿Hacen factura A?',
      kind: 'contact',
      repentance: false,
      reference: null,
      orderRef: null,
      replies: 0,
    },
  };
  const pack: InboxThread = {
    ...base,
    key: 'ml-mensaje:2000001',
    channel: 'ml-mensaje',
    externalId: '2000001',
    title: 'Venta 2000001',
    subtitle: null,
    preview: '¿Cuándo llega?',
    unread: false,
    unreadCount: 0,
    context: {
      packId: 2000001,
      meliOrderId: 2000001,
      buyerNickname: null,
      total: null,
      currency: null,
      demo: false,
    },
  };
  const ready = {
    tasks: [
      { task: 'QuestionClassify', available: true, reason: null, code: null },
      { task: 'QuestionDraft', available: true, reason: null, code: null },
    ],
  };
  const draft = {
    text: 'Borrador del servidor.',
    category: 'other',
    reason: null,
    manual: false,
    warnings: [{ code: 'amount', message: 'El borrador menciona un importe.' }],
  };

  it.each([
    ['ml-pregunta', question, '/api/v1/ai/ml/questions/123456789/draft'],
    ['ml-mensaje', pack, '/api/v1/ai/ml/messages/2000001/draft'],
    ['posventa', chat, `/api/v1/ai/support/conversations/${chat.externalId}/draft`],
    ['contacto', contact, `/api/v1/ai/contact/${contact.externalId}/draft`],
  ] as const)(
    'el canal %s pide su borrador sin mandar texto y muestra los avisos',
    async (_c, thread, path) => {
      const { api, user } = await open(`/bandeja?conversacion=${encodeURIComponent(thread.key)}`, (a) => {
        a.on('GET', '/api/v1/inbox', draftPage(thread));
        a.on('GET', '/api/v1/ai/status', ready);
        a.on('POST', path, draft);
      });
      await user.click(await screen.findByRole('button', { name: 'Sugerir con IA' }));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Respuesta' })).toHaveValue('Borrador del servidor.'),
      );
      expect(posts(api, path)).toHaveLength(1);
      expect(posts(api, path)[0]!.body).toBeUndefined();
      expect(screen.getByText('El borrador menciona un importe.')).toBeInTheDocument();
    },
  );

  it('fuera de política: "Respondé a mano" con el motivo y el campo sin tocar', async () => {
    const path = `/api/v1/ai/contact/${contact.externalId}/draft`;
    const { user } = await open(`/bandeja?conversacion=${encodeURIComponent(contact.key)}`, (a) => {
      a.on('GET', '/api/v1/inbox', draftPage(contact));
      a.on('GET', '/api/v1/ai/status', ready);
      a.on('POST', path, {
        text: null,
        category: 'legal',
        reason: 'es un reclamo legal',
        manual: true,
        warnings: [],
      });
    });
    await user.click(await screen.findByRole('button', { name: 'Sugerir con IA' }));
    expect(await screen.findByText('Respondé a mano')).toBeInTheDocument();
    expect(screen.getByText('es un reclamo legal')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Respuesta' })).toHaveValue('');
  });

  it('sin el permiso del canal, el botón no se muestra', async () => {
    await open(`/bandeja?conversacion=${encodeURIComponent(question.key)}`, (a) => {
      a.on('GET', '/api/v1/me/permissions', {
        role: 'staff',
        permissions: ['support.chat', 'messages.read'],
      });
      a.on('GET', '/api/v1/ai/status', ready);
    });
    await screen.findByRole('textbox', { name: 'Respuesta' });
    expect(screen.queryByRole('button', { name: 'Sugerir con IA' })).not.toBeInTheDocument();
  });

  it('con una tarea no disponible, el botón va deshabilitado con el primer motivo', async () => {
    const reason = 'Elegí un modelo para esta tarea en Configuración → Inteligencia artificial.';
    await open(`/bandeja?conversacion=${encodeURIComponent(contact.key)}`, (a) => {
      a.on('GET', '/api/v1/inbox', draftPage(contact));
      a.on('GET', '/api/v1/ai/status', {
        tasks: [
          { task: 'QuestionClassify', available: false, reason, code: 'Ai.TaskNotConfigured' },
          { task: 'QuestionDraft', available: true, reason: null, code: null },
        ],
      });
    });
    // La tienda tiene IA armada (otra tarea sí tiene modelo): el botón se ve, apagado.
    const button = await screen.findByRole('button', { name: 'Sugerir con IA' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', reason);
  });
});
