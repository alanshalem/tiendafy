/**
 * Chat posventa: la bandeja (con los filtros de las métricas), abrir un hilo,
 * responder con Enter o con el botón, adjuntar un archivo, pedirle a la IA un
 * borrador, cerrar la conversación y el polling que trae lo nuevo.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';
import { orderLabel } from '../lib/orderNumber';

const CONVS = '/api/v1/support/conversations';

interface Conv {
  id: string;
  orderId: string;
  orderNumber: number | null;
  customerEmail: string;
  status: 'OPEN' | 'CLOSED';
  unreadForStaff: number;
}

const inbox = fixture<{ items: Conv[] }>(CONVS).items;
const [waiting, other] = [inbox[0]!, inbox[1]!];
/** La venta de la conversación, como la ve el comprador (sale de la fixture). */
const saleLabel = orderLabel({ id: waiting.orderId, number: waiting.orderNumber });
const closed: Conv = {
  ...other,
  id: 'closed-1',
  customerEmail: 'cerrada@example.com',
  status: 'CLOSED',
  unreadForStaff: 0,
};
const answered: Conv = {
  ...other,
  id: 'answered-1',
  customerEmail: 'respondida@example.com',
  unreadForStaff: 0,
};
const CONVERSATIONS = [waiting, answered, closed];

const messages = [
  {
    id: 'm1',
    isFromStaff: false,
    authorName: waiting.customerEmail,
    body: '¿Cuándo llega?',
    attachment: null,
    createdAtUtc: '2026-10-10T10:00:00Z',
  },
  {
    id: 'm2',
    isFromStaff: true,
    authorName: 'Tienda',
    body: 'Te mando la factura',
    attachment: {
      url: 'https://cdn.example/factura.pdf',
      name: 'factura.pdf',
      contentType: 'application/pdf',
    },
    createdAtUtc: '2026-10-10T10:05:00Z',
  },
  {
    id: 'm3',
    isFromStaff: false,
    authorName: waiting.customerEmail,
    body: '',
    attachment: { url: 'https://cdn.example/foto.jpg', name: 'foto.jpg', contentType: 'image/jpeg' },
    createdAtUtc: '2026-10-10T10:06:00Z',
  },
];

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function openChat(setup?: (api: MockApi) => void) {
  const api = mockApi();
  api.on('GET', CONVS, { items: CONVERSATIONS });
  api.on('GET', `${CONVS}/${waiting.id}/messages`, { conversation: waiting, items: messages });
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/posventa');
  expect(
    await screen.findByRole('heading', { name: 'Chat posventa' }, { timeout: 5000 }),
  ).toBeInTheDocument();
  await settle(4);
  return { api, user };
}

const conversation = (email: string) => screen.getByRole('button', { name: new RegExp(email) });

async function openThread(user: ReturnType<typeof userEvent.setup>) {
  await user.click(conversation(waiting.customerEmail));
  return await screen.findByPlaceholderText('Respondé al cliente…');
}

describe('chat posventa: la bandeja', () => {
  it('las métricas filtran: esperando respuesta, abiertas y todas', async () => {
    const { api, user } = await openChat();
    const stat = (label: RegExp) => screen.getByRole('button', { name: label });
    const asked = (filter: string) =>
      api.calls.some((c) => c.path.startsWith(`${CONVS}?`) && c.path.includes(`filter=${filter}`));
    expect(conversation(closed.customerEmail)).toHaveTextContent('Cerrada');

    // El recorte lo hace el servidor (la bandeja va de a una página); las
    // cifras de arriba son de todas.
    api.on('GET', CONVS, { items: [waiting], total: 1, waitingCount: 1, openCount: 2, allCount: 3 });
    await user.click(stat(/Esperando respuesta/));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: new RegExp(answered.customerEmail) }),
      ).not.toBeInTheDocument(),
    );
    expect(asked('waiting')).toBe(true);
    expect(conversation(waiting.customerEmail)).toBeInTheDocument();
    expect(stat(/Total de consultas/)).toHaveTextContent('3');

    // Tocar de nuevo la misma vuelve a todas.
    api.on('GET', CONVS, { items: CONVERSATIONS, total: 3, waitingCount: 1, openCount: 2, allCount: 3 });
    await user.click(stat(/Esperando respuesta/));
    expect(
      await screen.findByRole('button', { name: new RegExp(answered.customerEmail) }),
    ).toBeInTheDocument();

    api.on('GET', CONVS, {
      items: CONVERSATIONS.filter((c) => c.status === 'OPEN'),
      total: 2,
      waitingCount: 1,
      openCount: 2,
      allCount: 3,
    });
    await user.click(stat(/Abiertas/));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: new RegExp(closed.customerEmail) }),
      ).not.toBeInTheDocument(),
    );
    expect(asked('open')).toBe(true);
    api.on('GET', CONVS, { items: CONVERSATIONS, total: 3, waitingCount: 1, openCount: 2, allCount: 3 });
    await user.click(stat(/Total de consultas/));
    expect(await screen.findByRole('button', { name: new RegExp(closed.customerEmail) })).toBeInTheDocument();
  });

  it('el hilo trae los últimos mensajes y "Ver anteriores" suma los de antes', async () => {
    const { api, user } = await openChat((a) =>
      a.on('GET', `${CONVS}/${waiting.id}/messages`, {
        conversation: waiting,
        items: messages.slice(-1),
        hasMore: true,
      }),
    );
    await openThread(user);
    api.on('GET', `${CONVS}/${waiting.id}/messages`, {
      conversation: waiting,
      items: messages.slice(0, -1),
      hasMore: false,
    });
    await user.click(await screen.findByRole('button', { name: /Ver anteriores/ }));
    expect(api.calls.some((c) => c.path.includes(`/messages?before=${messages.at(-1)!.id}`))).toBe(true);
    for (const m of messages.filter((m) => m.body))
      expect(await screen.findByText(m.body)).toBeInTheDocument();
    // No queda nada más atrás.
    expect(screen.queryByRole('button', { name: /Ver anteriores/ })).not.toBeInTheDocument();
  });

  it('si la bandeja no carga lo dice (no "sin consultas"); Actualizar vuelve a pedir', async () => {
    const { api, user } = await openChat((a) => a.on('GET', CONVS, {}, 500));
    expect(screen.getByText('No se pudieron cargar las consultas.')).toBeInTheDocument();
    expect(screen.queryByText('Sin consultas todavía.')).not.toBeInTheDocument();
    api.on('GET', CONVS, { items: CONVERSATIONS });
    await user.click(screen.getByRole('button', { name: /Actualizar/ }));
    expect(
      await screen.findByRole('button', { name: new RegExp(waiting.customerEmail) }),
    ).toBeInTheDocument();
  });
});

describe('chat posventa: el hilo', () => {
  it('abrir marca como leída y muestra los adjuntos', async () => {
    const { user } = await openChat();
    expect(screen.getByText('Elegí una conversación.')).toBeInTheDocument();
    await openThread(user);
    expect(await screen.findByText('¿Cuándo llega?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /factura\.pdf/ })).toHaveAttribute(
      'href',
      'https://cdn.example/factura.pdf',
    );
    expect(screen.getByRole('img', { name: 'foto.jpg' })).toBeInTheDocument();
    // Ya leída: la bandeja deja de contarla como pendiente.
    expect(
      within(conversation(waiting.customerEmail)).queryByText(String(waiting.unreadForStaff)),
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: /Volver/ }));
    expect(screen.getByText('Elegí una conversación.')).toBeInTheDocument();
  });

  it('responder con Enter o con el botón; Shift+Enter no manda; un error se muestra', async () => {
    const { api, user } = await openChat((a) =>
      a.on('POST', `${CONVS}/${waiting.id}/messages`, { detail: 'La conversación está cerrada.' }, 409),
    );
    const box = await openThread(user);
    const sends = () =>
      api.calls.filter((c) => c.method === 'POST' && c.path === `${CONVS}/${waiting.id}/messages`);

    // Vacío no manda.
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(sends()).toHaveLength(0);

    await user.type(box, 'Sale mañana');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(sends()).toHaveLength(0);
    await user.keyboard('{Enter}');
    expect(await screen.findByText('La conversación está cerrada.')).toBeInTheDocument();
    expect(box).toHaveValue('Sale mañana');

    api.on('POST', `${CONVS}/${waiting.id}/messages`, {});
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(box).toHaveValue(''));
    expect(sends().at(-1)!.body).toEqual({ body: 'Sale mañana' });
  });

  it('adjuntar manda el archivo (con el texto escrito); si se rechaza, lo dice', async () => {
    const { api, user } = await openChat((a) =>
      a.on('POST', `${CONVS}/${waiting.id}/attachments`, { detail: 'Solo PDF, JPG o PNG.' }, 400),
    );
    const box = await openThread(user);
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    await user.click(screen.getByRole('button', { name: 'Adjuntar' }));
    expect(click).toHaveBeenCalled();

    await user.type(box, 'Acá va el comprobante');
    // El servidor valida tipo y tamaño: lo que rechaza se muestra tal cual.
    await user.upload(input, new File(['x'], 'comprobante.png', { type: 'image/png' }));
    expect(await screen.findByText('Solo PDF, JPG o PNG.')).toBeInTheDocument();

    api.on('POST', `${CONVS}/${waiting.id}/attachments`, {});
    await user.upload(input, new File(['%PDF'], 'comprobante.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(box).toHaveValue(''));
    expect(api.calls.filter((c) => c.path === `${CONVS}/${waiting.id}/attachments`)).toHaveLength(2);
    // Sin archivo elegido (se canceló el diálogo) no hace nada.
    fireEvent.change(input, { target: { files: [] } });
  });

  it('la IA sugiere un borrador a partir del último mensaje del cliente', async () => {
    const { api, user } = await openChat((a) => {
      a.on('GET', '/api/v1/ai/status', {
        tasks: [{ task: 'QuestionDraft', available: true, reason: null, code: null }],
      });
      a.on('POST', '/api/v1/ai/support-reply', { detail: 'La IA está saturada.' }, 503);
    });
    const box = await openThread(user);
    await screen.findByText('¿Cuándo llega?');
    await user.click(await screen.findByRole('button', { name: 'Sugerir con IA' }));
    expect(await screen.findByText('La IA está saturada.')).toBeInTheDocument();

    api.on('POST', '/api/v1/ai/support-reply', { text: '¡Hola! Tu pedido sale mañana.' });
    await user.click(screen.getByRole('button', { name: 'Sugerir con IA' }));
    await waitFor(() => expect(box).toHaveValue('¡Hola! Tu pedido sale mañana.'));
    // El mensaje del cliente es el último que mandó con texto o adjunto, y el
    // pedido es el de la conversación (no el id de la conversación), con el
    // número que ve el comprador.
    expect(api.calls.filter((c) => c.path === '/api/v1/ai/support-reply').at(-1)!.body).toMatchObject({
      orderSummary: `Pedido ${saleLabel}`,
    });
  });

  it('el pedido de cada conversación se muestra con su número de venta', async () => {
    const { user } = await openChat();
    // El correlativo de la tienda (#1042), no el principio del id.
    const number = `#${waiting.orderNumber}`;
    expect(saleLabel).toBe(number);
    expect(screen.getAllByText(new RegExp(`Pedido ${number}`)).length).toBeGreaterThan(0);
    await openThread(user);
    expect(screen.getAllByText(`Pedido ${number}`).length).toBeGreaterThan(0);
  });

  it('cerrar la conversación; si falla, lo dice', async () => {
    const { api, user } = await openChat((a) =>
      a.on('POST', `${CONVS}/${waiting.id}/close`, { detail: 'Ya estaba cerrada.' }, 409),
    );
    await openThread(user);
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(await screen.findByText('Ya estaba cerrada.')).toBeInTheDocument();
    api.on('POST', `${CONVS}/${waiting.id}/close`, {});
    api.on('GET', CONVS, { items: [{ ...waiting, status: 'CLOSED' }, answered, closed] });
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(await screen.findByText('Conversación cerrada')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument());
  });

  it('el polling trae la bandeja y el hilo abierto cada 8 segundos', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api, user } = await openChat();
    await openThread(user);
    // La bandeja va con su página en la query: se cuenta por la ruta sola.
    const count = (path: string) =>
      api.calls.filter((c) => c.method === 'GET' && c.path.split('?')[0] === path).length;
    const before = { inbox: count(CONVS), thread: count(`${CONVS}/${waiting.id}/messages`) };
    await act(async () => {
      vi.advanceTimersByTime(8_000);
    });
    await waitFor(() => expect(count(CONVS)).toBeGreaterThan(before.inbox));
    expect(count(`${CONVS}/${waiting.id}/messages`)).toBeGreaterThan(before.thread);
  });
});
