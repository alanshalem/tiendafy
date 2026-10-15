/**
 * Cambiar de tienda no vacía el cache de React Query: lo que es de cada tienda
 * tiene que llevar la tienda en la clave. Si no, al cambiar se seguía viendo
 * lo de la anterior (el equipo, la actividad) mientras llegaba lo nuevo, y
 * para siempre si el pedido nuevo fallaba.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Tenant } from '@tiendafy/types';
import { describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';

const seeded = fixture<{ items: Tenant[] }>('/api/v1/tenants').items[0]!;
const other: Tenant = {
  ...seeded,
  id: '0b9d3c55-5f39-4f0e-9a51-2f4a0c6e7d11' as Tenant['id'],
  name: 'Otra Tienda',
  subdomain: 'otra',
};
const members = fixture<{ items: { email: string; name: string }[] }>('/api/v1/members');
const owner = members.items[0]!;

const tenantOf = (init?: RequestInit) => new Headers(init?.headers).get('x-tenant-id');

const asked = (api: MockApi, path: string, tenantId: string) =>
  api.calls.some(
    (c) => c.method === 'GET' && c.path.startsWith(path) && c.headers['x-tenant-id'] === tenantId,
  );

describe('cambiar de tienda', () => {
  it('el equipo y su actividad se piden de nuevo, sin mostrar los de la tienda anterior', async () => {
    const api = mockApi();
    api.on('GET', '/api/v1/tenants', { ...fixture<object>('/api/v1/tenants'), items: [seeded, other] });
    // La otra tienda tiene a una sola persona, y su lista tarda en llegar.
    const waiting: (() => void)[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/v1/members?') && tenantOf(init) === other.id) {
        await new Promise<void>((r) => waiting.push(r));
        return new Response(
          JSON.stringify({ items: [{ ...owner, email: 'sola@otra.com', name: 'Sola' }], total: 1 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return api.fetch(input, init);
    });
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderApp('/configuracion/usuarios');
    await settle(4);

    expect(await screen.findByText(owner.email)).toBeInTheDocument();
    expect(asked(api, '/api/v1/members?', seeded.id)).toBe(true);
    expect(asked(api, '/api/v1/members/activity', seeded.id)).toBe(true);

    await user.click(screen.getAllByRole('button', { name: new RegExp(seeded.name) })[0]!);
    await user.click(await screen.findByRole('menuitem', { name: new RegExp(other.name) }));
    await settle(4);

    // Mientras llega la lista nueva, no se ve la de la tienda anterior.
    await waitFor(() => expect(waiting.length).toBeGreaterThan(0));
    expect(screen.queryByText(owner.email)).not.toBeInTheDocument();
    expect(asked(api, '/api/v1/members/activity', other.id)).toBe(true);

    waiting.splice(0).forEach((r) => r());
    expect(await screen.findByText('sola@otra.com')).toBeInTheDocument();
    expect(screen.queryByText(owner.email)).not.toBeInTheDocument();
  });
});
