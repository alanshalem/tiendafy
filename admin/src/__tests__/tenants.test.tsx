/**
 * Tiendas del grupo: el tablero (ventas, tendencia, última venta), crear y
 * editar con el chequeo de disponibilidad de nombre y URL, archivar y
 * reactivar, eliminar escribiendo el nombre y el borrado definitivo que solo
 * existe en desarrollo.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  customDomain: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'CANCELED';
  createdAtUtc: string;
}

const seeded = fixture<{ items: Tenant[] }>('/api/v1/tenants').items[0]!;
const archived: Tenant = {
  ...seeded,
  id: 'archivada-1',
  name: 'Tienda Vieja',
  subdomain: 'vieja',
  customDomain: 'www.vieja.com',
  status: 'SUSPENDED',
};
const overview = fixture<{ days: number; items: Record<string, unknown>[] }>('/api/v1/tenants/overview');

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function openTenants(setup?: (api: MockApi) => void) {
  const api = mockApi();
  // Quien mira es dueño de las dos: puede crear y manejar cada una.
  api.on('GET', '/api/v1/tenants', {
    items: [seeded, archived],
    total: 2,
    canCreate: true,
    manageable: [seeded.id, archived.id],
  });
  api.on('GET', '/api/v1/tenants/overview', {
    ...overview,
    items: [
      ...overview.items,
      // Una que vendía y dejó de vender: sin ventas en la ventana y con la última hace meses.
      {
        ...overview.items[0],
        tenantId: archived.id,
        orders: 0,
        revenueMinor: 0,
        previousRevenueMinor: 500_000,
        lastOrderAtUtc: new Date(Date.now() - 65 * 86_400_000).toISOString(),
      },
    ],
  });
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/tenants');
  expect(await screen.findByRole('table', {}, { timeout: 5000 })).toBeInTheDocument();
  await screen.findByText(archived.name);
  await settle(4);
  return { api, user };
}

/** La fila de la tabla (el nombre de la tienda activa también está en el selector de tiendas). */
const row = (name: string) => within(screen.getByRole('table')).getByText(name).closest('tr') as HTMLElement;

async function action(user: ReturnType<typeof userEvent.setup>, tenant: Tenant, item: string) {
  await user.click(screen.getByRole('button', { name: `Acciones de ${tenant.name}` }));
  await user.click(await screen.findByRole('menuitem', { name: new RegExp(item) }));
}

describe('tiendas: tablero', () => {
  it('muestra estado, dominio, ventas y hace cuánto vendió cada una', async () => {
    await openTenants();
    expect(within(row(archived.name)).getByText('Archivada')).toBeInTheDocument();
    expect(within(row(archived.name)).getByText('www.vieja.com')).toBeInTheDocument();
    expect(within(row(seeded.name)).getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('Tiendas activas')).toBeInTheDocument();
    expect(screen.getByText('Tiendas que vendieron')).toBeInTheDocument();
  });

  it('si el tablero no carga, la lista igual se muestra', async () => {
    await openTenants((a) => a.on('GET', '/api/v1/tenants/overview', {}, 500));
    expect(row(seeded.name)).toBeInTheDocument();
    expect(row(archived.name)).toBeInTheDocument();
  });
});

describe('tiendas: crear y editar', () => {
  it('crear chequea nombre y URL antes de dejar guardar', async () => {
    const { api, user } = await openTenants((a) => {
      a.on('GET', '/api/v1/tenants/check', {
        subdomainValid: true,
        subdomainAvailable: false,
        nameAvailable: false,
      });
      a.on('POST', '/api/v1/tenants', { detail: 'Llegaste al límite de tiendas.' }, 400);
    });
    await user.click(screen.getByRole('button', { name: 'Crear tienda' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Crear tienda' }));
    const create = dialog.getByRole('button', { name: 'Crear' });
    expect(create).toBeDisabled();

    await user.type(dialog.getByPlaceholderText('Mi Tienda'), 'Hogar');
    // La URL se escribe en minúscula sola.
    await user.type(dialog.getByPlaceholderText('mitienda'), 'HOGAR');
    expect(dialog.getByPlaceholderText('mitienda')).toHaveValue('hogar');
    expect(
      await dialog.findByText('Ya existe una tienda con ese nombre.', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(dialog.getByText('Esa URL ya está en uso.')).toBeInTheDocument();
    expect(create).toBeDisabled();

    api.on('GET', '/api/v1/tenants/check', {
      subdomainValid: false,
      subdomainAvailable: false,
      nameAvailable: true,
    });
    await user.type(dialog.getByPlaceholderText('mitienda'), '-');
    expect(await dialog.findByText(/URL inválida/, {}, { timeout: 3000 })).toBeInTheDocument();

    api.on('GET', '/api/v1/tenants/check', {
      subdomainValid: true,
      subdomainAvailable: true,
      nameAvailable: true,
    });
    await user.type(dialog.getByPlaceholderText('mitienda'), 'x');
    await waitFor(() => expect(create).toBeEnabled(), { timeout: 3000 });
    await user.click(create);
    expect(await dialog.findByText('Llegaste al límite de tiendas.')).toBeInTheDocument();

    api.on('POST', '/api/v1/tenants', { ...seeded, id: 'nueva', name: 'Hogar', subdomain: 'hogar-x' });
    await user.click(create);
    expect(await screen.findByText('Tienda "Hogar" creada')).toBeInTheDocument();
    expect(api.calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/tenants').at(-1)!.body).toEqual(
      {
        name: 'Hogar',
        subdomain: 'hogar-x',
        customDomain: null,
      },
    );
  });

  it('si el chequeo falla, no bloquea; editar guarda el dominio propio', async () => {
    const { api, user } = await openTenants((a) => {
      a.on('GET', '/api/v1/tenants/check', {}, 500);
      a.on('PATCH', `/api/v1/tenants/${archived.id}`, { ...archived, name: 'Tienda Vieja 2' });
    });
    await action(user, archived, 'Editar');
    const dialog = within(await screen.findByRole('dialog', { name: 'Editar tienda' }));
    expect(dialog.getByPlaceholderText('Mi Tienda')).toHaveValue(archived.name);
    expect(dialog.getByText(/Cambiar la URL hace que el link viejo deje de funcionar/)).toBeInTheDocument();
    const domain = dialog.getByPlaceholderText('www.mitienda.com');
    await user.clear(domain);
    await user.type(domain, 'WWW.VIEJA.COM.AR');
    await user.type(dialog.getByPlaceholderText('Mi Tienda'), ' 2');
    await settle(30);
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Tienda "Tienda Vieja 2" actualizada')).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      name: 'Tienda Vieja 2',
      subdomain: 'vieja',
      customDomain: 'www.vieja.com.ar',
    });
  });
});

describe('tiendas: archivar, activar, eliminar', () => {
  it('archivar una activa y activar una archivada (con sus errores)', async () => {
    const { api, user } = await openTenants((a) => {
      a.on('POST', `/api/v1/tenants/${seeded.id}/archive`, { detail: 'Es la única tienda activa.' }, 409);
      a.on('POST', `/api/v1/tenants/${archived.id}/activate`, { ...archived, status: 'ACTIVE' });
    });
    await action(user, seeded, 'Archivar');
    expect(await screen.findByText('Es la única tienda activa.')).toBeInTheDocument();
    api.on('POST', `/api/v1/tenants/${seeded.id}/archive`, { ...seeded, status: 'SUSPENDED' });
    await action(user, seeded, 'Archivar');
    expect(await screen.findByText(`"${seeded.name}" archivada`)).toBeInTheDocument();

    await action(user, archived, 'Activar');
    expect(await screen.findByText(`"${archived.name}" activada`)).toBeInTheDocument();
  });

  it('eliminar pide escribir el nombre exacto', async () => {
    const { api, user } = await openTenants((a) =>
      a.on('DELETE', `/api/v1/tenants/${archived.id}`, { detail: 'Tiene ventas abiertas.' }, 409),
    );
    await action(user, archived, 'Eliminar');
    const dialog = within(await screen.findByRole('dialog', { name: 'Eliminar tienda' }));
    const remove = dialog.getAllByRole('button').find((b) => /Eliminar/.test(b.textContent ?? ''))!;
    expect(remove).toBeDisabled();
    await user.type(dialog.getByPlaceholderText(archived.name), 'Tienda');
    expect(remove).toBeDisabled();
    await user.type(dialog.getByPlaceholderText(archived.name), ' Vieja');
    await user.click(remove);
    expect(await screen.findByText('Tiene ventas abiertas.')).toBeInTheDocument();

    api.on('DELETE', `/api/v1/tenants/${archived.id}`, { ...archived, status: 'CANCELED' });
    await user.click(remove);
    expect(await screen.findByText(`"${archived.name}" eliminada`)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Cancelar cierra y limpia lo escrito.
    await action(user, archived, 'Eliminar');
    const again = within(await screen.findByRole('dialog', { name: 'Eliminar tienda' }));
    expect(again.getByPlaceholderText(archived.name)).toHaveValue('');
    await user.click(again.getByRole('button', { name: 'Cancelar' }));
  });

  it('en desarrollo, el borrado definitivo pide confirmación', async () => {
    const { api, user } = await openTenants((a) =>
      a.on('DELETE', `/api/v1/tenants/${archived.id}/purge`, { detail: 'Solo en desarrollo.' }, 403),
    );
    await action(user, archived, 'Borrar definitivo');
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(api.calls.some((c) => c.path.endsWith('/purge'))).toBe(false);

    await action(user, archived, 'Borrar definitivo');
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Borrar para siempre' }),
    );
    expect(await screen.findByText('Solo en desarrollo.')).toBeInTheDocument();

    api.on('DELETE', `/api/v1/tenants/${archived.id}/purge`, {});
    await action(user, archived, 'Borrar definitivo');
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Borrar para siempre' }),
    );
    expect(await screen.findByText(`"${archived.name}" borrada definitivamente`)).toBeInTheDocument();
  });
});

describe('tiendas: alguien del equipo que no es dueño', () => {
  it('las ve, pero no crea ni maneja ninguna', async () => {
    await openTenants((api) =>
      api.on('GET', '/api/v1/tenants', {
        items: [seeded, archived],
        total: 2,
        canCreate: false,
        manageable: [],
      }),
    );
    expect(row(seeded.name)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear tienda' })).toBeNull();
    for (const t of [seeded, archived])
      expect(screen.queryByRole('button', { name: `Acciones de ${t.name}` })).toBeNull();
  });
});
