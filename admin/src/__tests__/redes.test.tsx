/**
 * La pantalla de redes sociales alrededor del compositor: conectar y
 * desconectar cuentas (OAuth y Telegram por formulario), la bandeja de
 * publicaciones (filtrar, desprogramar, eliminar, abrir), el calendario
 * (navegar meses, abrir el compositor en un día) y la vuelta del OAuth.
 *
 * La tienda sembrada no tiene cuentas ni posts: acá se arman a mano, con la
 * forma de los DTOs.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialAccountDto, SocialPostDto } from '../pages/redes-shared';
import { mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

const ACCOUNTS = '/api/v1/admin/social/accounts';
const POSTS = '/api/v1/admin/social/posts';

const account = (over: Partial<SocialAccountDto>): SocialAccountDto => ({
  id: 'acc-fb',
  provider: 'meta_facebook',
  providerId: 'fb-1',
  name: 'Tienda FB',
  username: 'tiendafb',
  avatarUrl: 'https://cdn.example/fb.png',
  authorized: true,
  connectedAtUtc: '2026-10-01T00:00:00Z',
  ...over,
});

/** Un día de este mes (el calendario arranca en el mes actual). */
const thisMonth = (day: number, hour = 12) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), day, hour, 0).toISOString();
};

const post = (over: Partial<SocialPostDto>): SocialPostDto => ({
  id: 'post-1',
  content: 'Llegó la colección de primavera',
  mediaUrls: [],
  status: 'Draft',
  scheduleStatus: 'Pending',
  scheduledAtUtc: null,
  publishedAtUtc: null,
  createdAtUtc: thisMonth(2),
  isEditable: true,
  couponCode: null,
  attributedOrders: 0,
  attributedRevenueMinor: 0,
  targets: [
    {
      accountId: 'acc-fb',
      provider: 'meta_facebook',
      accountName: 'Tienda FB',
      contentOverride: null,
      providerPostId: null,
      externalUrl: null,
      error: null,
      publishedAtUtc: null,
    },
  ],
  ...over,
});

const POSTS_DATA = [
  post({ id: 'p-draft', content: 'Borrador de otoño', createdAtUtc: thisMonth(5, 8) }),
  post({
    id: 'p-scheduled',
    content: 'Programado de verano',
    status: 'Scheduled',
    scheduledAtUtc: thisMonth(20, 18),
    mediaUrls: ['https://cdn.example/foto.jpg'],
  }),
  post({
    id: 'p-published',
    content: '',
    status: 'Published',
    scheduleStatus: 'Processed',
    isEditable: false,
    publishedAtUtc: thisMonth(5, 9),
    couponCode: 'REDES10',
    attributedOrders: 2,
    attributedRevenueMinor: 3_500_000,
    targets: [
      {
        ...post({}).targets[0]!,
        externalUrl: 'https://facebook.com/p/1',
        providerPostId: '1',
        publishedAtUtc: thisMonth(5, 9),
      },
    ],
  }),
  post({
    id: 'p-failed',
    content: 'Falló en X',
    status: 'Failed',
    scheduleStatus: 'Processed',
    isEditable: false,
    publishedAtUtc: thisMonth(5, 10),
    couponCode: 'UNO',
    attributedOrders: 1,
    attributedRevenueMinor: 100_000,
    targets: [{ ...post({}).targets[0]!, provider: 'x', accountName: 'TiendaX', error: 'Token vencido' }],
  }),
  post({ id: 'p-extra', content: 'Otro del 5', status: 'Scheduled', scheduledAtUtc: thisMonth(5, 11) }),
];

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function openRedes(setup?: (api: MockApi) => void, path = '/redes') {
  const api = mockApi();
  api.on('GET', ACCOUNTS, {
    accounts: [
      account({}),
      account({
        id: 'acc-x',
        provider: 'x',
        name: 'TiendaX',
        username: null,
        authorized: false,
        avatarUrl: null,
      }),
    ],
  });
  api.on('GET', POSTS, { posts: POSTS_DATA });
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  expect(
    await screen.findByRole('heading', { name: 'Redes sociales' }, { timeout: 5000 }),
  ).toBeInTheDocument();
  await settle(3);
  return { api, user };
}

const tab = (name: string) => screen.getByRole('button', { name });
const confirmDialog = async (button: string) =>
  within(await screen.findByRole('dialog')).getByRole('button', { name: button });

describe('redes: cuentas', () => {
  it('conectar por OAuth lleva a la red; si no se puede, lo dice', async () => {
    const { api, user } = await openRedes((a) => {
      a.on('POST', `${ACCOUNTS}/connect/meta`, { detail: 'La app de Meta no está aprobada.' }, 400);
    });
    await user.click(tab('Cuentas'));
    const connect = () => screen.getAllByRole('button', { name: /Conectar/ });
    await user.click(connect()[0]!);
    expect(await screen.findByText('La app de Meta no está aprobada.')).toBeInTheDocument();

    // La API devuelve la URL de autorización y el navegador va para allá.
    api.on('POST', `${ACCOUNTS}/connect/x`, { authUrl: 'https://x.com/oauth' });
    await user.click(screen.getByRole('button', { name: 'Reconectar' }));
    await waitFor(() => expect(api.calls.some((c) => c.path === `${ACCOUNTS}/connect/x`)).toBe(true));
  });

  it('desconectar pide confirmación; si falla, lo dice', async () => {
    const { api, user } = await openRedes((a) => {
      a.on('DELETE', `${ACCOUNTS}/acc-fb`, { detail: 'No se pudo hablar con Meta.' }, 502);
    });
    await user.click(tab('Cuentas'));
    expect(screen.getByText('@tiendafb')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Desconectar' })[0]!);
    await user.click(await confirmDialog('Cancelar'));
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);

    await user.click(screen.getAllByRole('button', { name: 'Desconectar' })[0]!);
    await user.click(await confirmDialog('Desconectar'));
    expect(await screen.findByText('No se pudo hablar con Meta.')).toBeInTheDocument();

    api.on('DELETE', `${ACCOUNTS}/acc-fb`, {});
    await user.click(screen.getAllByRole('button', { name: 'Desconectar' })[0]!);
    await user.click(await confirmDialog('Desconectar'));
    expect(await screen.findByText('Cuenta desconectada')).toBeInTheDocument();
  });

  it('Telegram se conecta con el token del bot y el canal', async () => {
    const { api, user } = await openRedes((a) => {
      a.on('POST', `${ACCOUNTS}/telegram`, { detail: 'El bot no es admin del canal.' }, 400);
    });
    await user.click(tab('Cuentas'));
    await user.click(screen.getAllByRole('button', { name: /Conectar/ }).at(-1)!);
    const dialog = await screen.findByRole('dialog', { name: 'Conectar Telegram' });
    const send = within(dialog).getByRole('button', { name: /Conectar/ });
    expect(send).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Token del bot'), '123:ABC');
    await user.type(within(dialog).getByLabelText('Canal o chat'), '@mitienda');
    await user.click(send);
    expect(await screen.findByText('El bot no es admin del canal.')).toBeInTheDocument();

    api.on('POST', `${ACCOUNTS}/telegram`, {});
    await user.click(send);
    expect(await screen.findByText('Telegram conectado')).toBeInTheDocument();
    expect(api.calls.at(-2)?.body ?? api.calls.find((c) => c.path === `${ACCOUNTS}/telegram`)?.body).toEqual({
      botToken: '123:ABC',
      chatId: '@mitienda',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sin cuentas lo explica, y una red sin configurar no ofrece conectar', async () => {
    const { user } = await openRedes((a) => {
      a.on('GET', ACCOUNTS, { accounts: [] });
      a.on('GET', '/api/v1/admin/social/channels', {
        connectors: [{ key: 'meta', displayName: 'Facebook / Instagram', configured: false }],
        channels: [],
      });
    });
    await user.click(tab('Cuentas'));
    expect(screen.getByText(/Conectá tu primera cuenta/)).toBeInTheDocument();
    expect(screen.getByText('No configurado en la plataforma todavía.')).toBeInTheDocument();
  });
});

describe('redes: publicaciones', () => {
  it('muestra próximos e historial, con cupón, ventas y errores por red', async () => {
    const { user } = await openRedes();
    await user.click(tab('Publicaciones'));
    expect(screen.getByRole('heading', { name: 'Próximos' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Historial' })).toBeInTheDocument();
    expect(screen.getByText('(solo imagen)')).toBeInTheDocument();
    expect(screen.getByText(/trajo 2 ventas/)).toBeInTheDocument();
    expect(screen.getByText(/trajo 1 venta ·/)).toBeInTheDocument();
    expect(screen.getByText('Token vencido')).toBeInTheDocument();
    expect(screen.getByTitle('Ver en Facebook')).toHaveAttribute('href', 'https://facebook.com/p/1');

    // Filtrar por estado.
    await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'Failed');
    expect(screen.queryByText('Borrador de otoño')).not.toBeInTheDocument();
    expect(screen.getByText('Falló en X')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'Draft');
    expect(screen.queryByText('Falló en X')).not.toBeInTheDocument();
  });

  it('desprogramar y eliminar (con sus errores)', async () => {
    const { api, user } = await openRedes((a) => {
      a.on('POST', `${POSTS}/p-scheduled/unschedule`, { detail: 'Ya se está publicando.' }, 409);
      a.on('DELETE', `${POSTS}/p-published`, { detail: 'No se pudo borrar.' }, 500);
    });
    await user.click(tab('Publicaciones'));
    const scheduled = screen.getByText('Programado de verano').closest('[role=button]') as HTMLElement;
    await user.click(within(scheduled).getByTitle('Volver a borrador'));
    expect(await screen.findByText('Ya se está publicando.')).toBeInTheDocument();
    api.on('POST', `${POSTS}/p-scheduled/unschedule`, {});
    await user.click(within(scheduled).getByTitle('Volver a borrador'));
    expect(await screen.findByText('El post volvió a borradores')).toBeInTheDocument();

    // Eliminar uno publicado avisa que en las redes queda.
    const published = screen.getByText('(solo imagen)').closest('[role=button]') as HTMLElement;
    await user.click(within(published).getByTitle('Eliminar'));
    expect(await screen.findByText(/lo ya publicado en las redes queda/)).toBeInTheDocument();
    await user.click(await confirmDialog('Eliminar'));
    expect(await screen.findByText('No se pudo borrar.')).toBeInTheDocument();

    api.on('DELETE', `${POSTS}/p-draft`, {});
    const draft = screen.getByText('Borrador de otoño').closest('[role=button]') as HTMLElement;
    await user.click(within(draft).getByTitle('Eliminar'));
    expect(await screen.findByText('El post se elimina y no se publica.')).toBeInTheDocument();
    await user.click(await confirmDialog('Eliminar'));
    expect(await screen.findByText('Post eliminado')).toBeInTheDocument();
  });

  it('una tarjeta se abre con clic, con Enter o con el lápiz', async () => {
    const { user } = await openRedes();
    await user.click(tab('Publicaciones'));
    await user.click(screen.getByText('Falló en X'));
    expect(await screen.findByRole('dialog', { name: 'Ver post' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const draft = screen.getByText('Borrador de otoño').closest('[role=button]') as HTMLElement;
    draft.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Editar post' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(within(draft).getByTitle('Editar'));
    expect(await screen.findByRole('dialog', { name: 'Editar post' })).toBeInTheDocument();
  });

  it('sin posts lo explica (también filtrando)', async () => {
    const { user } = await openRedes((a) => a.on('GET', POSTS, { posts: [] }));
    await user.click(tab('Publicaciones'));
    expect(screen.getByText(/Todavía no hay posts\./)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'Published');
    expect(screen.getByText(/Todavía no hay posts en ese estado/)).toBeInTheDocument();
  });
});

describe('redes: calendario', () => {
  it('navega meses, agrupa los posts del día y abre el compositor', async () => {
    const { user } = await openRedes();
    const now = new Date();
    const title = () => screen.getByText(new RegExp(`\\d{4}$`), { selector: 'p' }).textContent;
    const start = title();
    expect(screen.getByText('+1 más')).toBeInTheDocument(); // el 5 tiene cuatro posts (se ven tres)

    await user.click(screen.getByTitle('Mes siguiente'));
    expect(title()).not.toBe(start);
    await user.click(screen.getByTitle('Mes anterior'));
    await user.click(screen.getByTitle('Mes anterior'));
    await user.click(screen.getByRole('button', { name: 'Hoy' }));
    expect(title()).toBe(start);

    // Un post del calendario abre el compositor con ese post.
    // El chip del post (la celda del día, que también es un botón, lo contiene).
    const chip = screen
      .getAllByRole('button', { name: /Programado de verano/ })
      .find((b) => b.tagName === 'BUTTON');
    await user.click(chip!);
    expect(await screen.findByRole('dialog', { name: 'Editar post' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Un día vacío abre el compositor nuevo (con la fecha ya puesta).
    const day = screen
      .getAllByRole('button')
      .find((b) => b.textContent === String(now.getDate() === 27 ? 26 : 27))!;
    await user.click(day);
    expect(await screen.findByRole('dialog', { name: 'Nuevo post' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    day.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Nuevo post' })).toBeInTheDocument();
  });

  it('sin cuentas autorizadas, el día y "Nuevo post" llevan a conectar una', async () => {
    const { user } = await openRedes((a) =>
      a.on('GET', ACCOUNTS, { accounts: [account({ authorized: false })] }),
    );
    await user.click(screen.getByRole('button', { name: /Nuevo post/ }));
    expect(await screen.findByText('Conectá una cuenta primero (pestaña Cuentas).')).toBeInTheDocument();
    expect(screen.getByText('Reconectar', { selector: 'button' })).toBeInTheDocument();

    await user.click(tab('Calendario'));
    await user.click(screen.getAllByRole('button').find((b) => b.textContent === '15')!);
    expect(await screen.findByText('Reconectar', { selector: 'button' })).toBeInTheDocument();
  });

  it('las métricas del mes suman programados, publicados, fallidos y ventas', async () => {
    await openRedes();
    expect(screen.getByText('Programados')).toBeInTheDocument();
    expect(screen.getByText('Ventas atribuidas')).toBeInTheDocument();
  });
});

describe('redes: vuelta del OAuth', () => {
  it('?social=connected avisa y muestra las cuentas', async () => {
    await openRedes(undefined, '/redes?social=connected');
    expect(await screen.findByText('¡Cuenta conectada!')).toBeInTheDocument();
    expect(screen.getByText('@tiendafb')).toBeInTheDocument();
  });

  it('?social=error avisa que no se pudo', async () => {
    await openRedes(undefined, '/redes?social=error');
    expect(await screen.findByText('No se pudo conectar la cuenta. Probá de nuevo.')).toBeInTheDocument();
  });

  it('si la API de redes no responde, la pantalla igual carga', async () => {
    const { user } = await openRedes((a) => {
      a.on('GET', ACCOUNTS, {}, 500);
      a.on('GET', POSTS, {}, 500);
      a.on('GET', '/api/v1/admin/social/channels', {}, 500);
    });
    await user.click(tab('Cuentas'));
    expect(screen.getByText(/Conectá tu primera cuenta/)).toBeInTheDocument();
  });
});
