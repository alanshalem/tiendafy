/**
 * El compositor de posts para redes: un texto para todas las cuentas (con
 * variaciones por red), imágenes por URL, cupón para medir ventas, y guardar
 * como borrador o programado. Lo que importa es lo que viaja a la API.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComposerModal } from '../pages/redes-composer';
import { fixture, mockApi } from '../test/api';
import { explore, settle, watchCrashes } from '../test/explore';
import { renderWithProviders } from '../test/render';

type Channels = Parameters<typeof ComposerModal>[0]['channels'];
type Account = Parameters<typeof ComposerModal>[0]['accounts'][number];

const channels = fixture<Channels>('/api/v1/admin/social/channels');
const account = (provider: string, name: string): Account =>
  ({
    id: `${provider}-0000-0000-0000-000000000000`.slice(0, 36),
    provider,
    providerId: `${provider}-1`,
    name,
    username: name.toLowerCase(),
    avatarUrl: null,
    authorized: true,
    connectedAtUtc: '2026-10-01T00:00:00Z',
  }) as unknown as Account;

const accounts = [
  account('meta_facebook', 'Tienda FB'),
  account('meta_instagram', 'Tienda IG'),
  account('x', 'TiendaX'),
  account('telegram', 'Canal'),
];

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('compositor de redes', () => {
  it('arma el post para varias cuentas y lo guarda', async () => {
    const api = mockApi();
    api.on('POST', '/api/v1/admin/social/posts', {
      id: '99999999-0000-0000-0000-000000000000',
      status: 'Draft',
      targets: [],
    });
    const onSaved = vi.fn();
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderWithProviders(
      <ComposerModal
        post={null}
        channels={channels}
        accounts={accounts}
        initialDate={null}
        onClose={() => {}}
        onSaved={onSaved}
      />,
    );
    await settle(3);

    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getAllByRole('textbox')[0]!, '¡Llegó la temporada! Usá VERANO10.');
    for (const box of dialog.queryAllByRole('checkbox')) await user.click(box);

    const save = dialog
      .queryAllByRole('button')
      .find((b) => /guardar|programar|publicar/i.test(b.textContent ?? ''));
    expect(save).toBeDefined();
    await user.click(save!);

    await waitFor(() =>
      expect(api.calls.some((c) => c.method === 'POST' && c.path === '/api/v1/admin/social/posts')).toBe(
        true,
      ),
    );
    const body = api.calls.find((c) => c.method === 'POST')!.body as { content: string; targets: unknown[] };
    expect(body.content).toContain('VERANO10');
  });

  it('se puede tocar todo sin romperlo (y editar un post existente)', { timeout: 60_000 }, async () => {
    mockApi();
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    const existing = {
      id: '88888888-0000-0000-0000-000000000000',
      content: 'Post viejo',
      mediaUrls: ['https://cdn.example/remera.png'],
      status: 'Scheduled',
      scheduleStatus: 'Pending',
      scheduledAtUtc: '2030-01-01T12:00:00Z',
      publishedAtUtc: null,
      createdAtUtc: '2026-10-01T00:00:00Z',
      isEditable: true,
      couponCode: 'VIEJO',
      attributedOrders: 0,
      attributedRevenueMinor: 0,
      targets: [
        {
          accountId: accounts[0]!.id,
          provider: 'meta_facebook',
          accountName: 'Tienda FB',
          contentOverride: 'Solo FB',
        },
      ],
    };
    const { container } = renderWithProviders(
      <ComposerModal
        post={existing as never}
        channels={channels}
        accounts={accounts}
        initialDate={new Date('2030-02-01T10:00:00Z')}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    await settle(3);
    await explore(user, () => container, 60);
    expect(crashes()).toEqual([]);
  });
});
