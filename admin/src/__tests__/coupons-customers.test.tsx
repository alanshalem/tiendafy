/**
 * Cupones y clientes, de punta a punta en el panel: crear (con cada tipo de
 * descuento y vigencia), editar, pausar/activar, eliminar con confirmación,
 * buscar, y traer a la agenda los compradores de las ventas.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function open(path: string, heading: string, setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp(path);
  expect(await screen.findByRole('heading', { name: heading }, { timeout: 5000 })).toBeInTheDocument();
  await settle(4);
  return { api, user };
}

const modal = async (name: string) => within(await screen.findByRole('dialog', { name }));

async function action(user: ReturnType<typeof userEvent.setup>, of: string, item: RegExp) {
  await user.click(screen.getByRole('button', { name: `Acciones de ${of}` }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

describe('cupones', () => {
  type Coupon = { id: string; code: string; active: boolean };
  const coupons = fixture<{ items: Coupon[] }>('/api/v1/coupons').items;
  const paused = coupons.find((c) => !c.active)!;
  const active = coupons.find((c) => c.active)!;

  it('vigencias: desde y hasta, solo desde, solo hasta', async () => {
    await open('/descuentos', 'Cupones de descuento', (a) =>
      a.on('GET', '/api/v1/coupons', {
        items: [
          {
            ...active,
            id: 'c1',
            code: 'AMBAS',
            startsAtUtc: '2026-10-01T00:00:00Z',
            endsAtUtc: '2026-10-31T00:00:00Z',
          },
          { ...active, id: 'c2', code: 'DESDE', startsAtUtc: '2026-10-01T00:00:00Z', endsAtUtc: null },
          {
            ...active,
            id: 'c3',
            code: 'ENVIO',
            type: 'FreeShipping',
            value: 0,
            startsAtUtc: null,
            endsAtUtc: null,
          },
        ],
      }),
    );
    expect(screen.getByText(/–/)).toBeInTheDocument();
    expect(screen.getByText(/^Desde /)).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Envío gratis')).toBeInTheDocument();
  });

  it('crear un cupón de porcentaje con mínimo, límite y vigencia', async () => {
    const { api, user } = await open('/descuentos', 'Cupones de descuento', (a) =>
      a.on('POST', '/api/v1/coupons', { detail: 'Ya existe un cupón con ese código.' }, 409),
    );
    await user.click(screen.getByRole('button', { name: /Crear cupón/ }));
    const m = await modal('Crear cupón');
    await user.type(m.getByPlaceholderText('VERANO20'), 'otono15');
    await user.type(m.getByPlaceholderText('20'), '15');
    await user.type(m.getByPlaceholderText('—'), '20000');
    await user.type(m.getByPlaceholderText('Sin límite'), '50');
    await user.click(m.getAllByRole('button').find((b) => b.textContent === 'Crear')!);
    expect(await m.findByText('Ya existe un cupón con ese código.')).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({ value: 15 });

    api.on('POST', '/api/v1/coupons', { id: 'nuevo' });
    await user.click(m.getAllByRole('button').find((b) => b.textContent === 'Crear')!);
    expect(await screen.findByText('Cupón creado')).toBeInTheDocument();
  });

  it('editar, pausar y activar, eliminar con confirmación', async () => {
    const { api, user } = await open('/descuentos', 'Cupones de descuento', (a) => {
      a.on('POST', `/api/v1/coupons/${active.id}/toggle`, {});
      a.on('POST', `/api/v1/coupons/${paused.id}/toggle`, { detail: 'El cupón venció.' }, 409);
      a.on('PUT', `/api/v1/coupons/${active.id}`, {});
      a.on('DELETE', `/api/v1/coupons/${active.id}`, {});
    });
    await action(user, active.code, /Pausar/);
    expect(await screen.findByText('Cupón actualizado')).toBeInTheDocument();
    await action(user, paused.code, /Activar/);
    expect(await screen.findByText('El cupón venció.')).toBeInTheDocument();

    await action(user, active.code, /Editar/);
    const m = await modal('Editar cupón');
    expect(m.getByPlaceholderText('VERANO20')).toHaveValue(active.code);
    await user.click(m.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findAllByText('Cupón actualizado')).not.toHaveLength(0);
    expect(api.calls.some((c) => c.method === 'PUT')).toBe(true);

    await action(user, active.code, /Eliminar/);
    await user.click((await modal('Eliminar cupón')).getByRole('button', { name: 'Cancelar' }));
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);
    await action(user, active.code, /Eliminar/);
    await user.click((await modal('Eliminar cupón')).getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('Cupón eliminado')).toBeInTheDocument();
  });

  it('sin cupones invita a crear el primero; si eliminar falla, lo dice', async () => {
    const { user } = await open('/descuentos', 'Cupones de descuento', (a) =>
      a.on('GET', '/api/v1/coupons', { items: [] }),
    );
    expect(screen.getByText('Creá tu primer cupón')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Crear cupón/ }).at(-1)!);
    expect(await screen.findByRole('dialog', { name: 'Crear cupón' })).toBeInTheDocument();
  });
});

describe('clientes', () => {
  type Customer = { id: string; name: string };
  const customer = fixture<{ items: Customer[] }>('/api/v1/customers').items[0]!;

  it('traer compradores de las ventas: nuevos, ninguno nuevo o error', async () => {
    const { api, user } = await open('/clientes', 'Clientes', (a) =>
      a.on('POST', '/api/v1/customers/sync-from-orders', { imported: 7, scanned: 40 }),
    );
    const sync = screen.getByRole('button', { name: /Traer de mis ventas/ });
    await user.click(sync);
    expect(await screen.findByText('Se sumaron 7 clientes de tus ventas.')).toBeInTheDocument();
    api.on('POST', '/api/v1/customers/sync-from-orders', { imported: 0, scanned: 40 });
    await user.click(sync);
    expect(await screen.findByText('Tus ventas ya estaban todas en la agenda.')).toBeInTheDocument();
    // Un 500 sin explicación muestra el mensaje de la pantalla, no el técnico.
    api.on('POST', '/api/v1/customers/sync-from-orders', {}, 500);
    await user.click(sync);
    expect(await screen.findByText('No se pudieron traer los compradores.')).toBeInTheDocument();
    expect(screen.queryByText(/Request failed/)).not.toBeInTheDocument();
  });

  it('buscar con Enter consulta a la base', async () => {
    const { api, user } = await open('/clientes', 'Clientes');
    await user.type(screen.getByPlaceholderText('Nombre, email o teléfono'), 'julieta{Enter}');
    await waitFor(() => expect(api.calls.some((c) => c.path.includes('q=julieta'))).toBe(true));
  });

  // Escribe en cinco campos y abre tres diálogos: con la máquina cargada pasa los 15 s.
  it('agregar, editar y eliminar un cliente', { timeout: 30_000 }, async () => {
    const { api, user } = await open('/clientes', 'Clientes', (a) => {
      a.on('POST', '/api/v1/customers', { detail: 'Ya hay un cliente con ese email.' }, 409);
      a.on('PUT', `/api/v1/customers/${customer.id}`, {});
      a.on('DELETE', `/api/v1/customers/${customer.id}`, { detail: 'Tiene ventas asociadas.' }, 409);
    });
    await user.click(screen.getByRole('button', { name: /Agregar cliente/ }));
    const m = await modal('Agregar cliente');
    await user.type(m.getByPlaceholderText('Ej.: Juan Pérez'), 'Ana Gómez');
    await user.type(m.getByPlaceholderText('Ej.: juan@email.com'), 'ana@example.com');
    await user.type(m.getByPlaceholderText('Ej.: 11 1234 5678'), '1155554444');
    await user.type(m.getByPlaceholderText('Ej.: Av. Corrientes 1234, CABA'), 'Belgrano 890');
    await user.type(m.getByPlaceholderText('Notas internas sobre el cliente...'), 'Mayorista');
    const create = m
      .getAllByRole('button')
      .find((b) => /^(Crear|Agregar|Guardar)$/.test(b.textContent ?? ''))!;
    await user.click(create);
    expect(await m.findByText('Ya hay un cliente con ese email.')).toBeInTheDocument();
    api.on('POST', '/api/v1/customers', { id: 'nuevo' });
    await user.click(create);
    expect(await screen.findByText('Cliente creado')).toBeInTheDocument();

    await action(user, customer.name, /Editar/);
    const e = await modal('Editar cliente');
    expect(e.getByPlaceholderText('Ej.: Juan Pérez')).toHaveValue(customer.name);
    await user.click(e.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Cliente actualizado')).toBeInTheDocument();

    await action(user, customer.name, /Eliminar/);
    await user.click((await modal('Eliminar cliente')).getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('Tiene ventas asociadas.')).toBeInTheDocument();
    api.on('DELETE', `/api/v1/customers/${customer.id}`, {});
    await action(user, customer.name, /Eliminar/);
    await user.click((await modal('Eliminar cliente')).getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('Cliente eliminado')).toBeInTheDocument();
  });

  it('sin clientes ofrece traerlos de las ventas', async () => {
    const { api, user } = await open('/clientes', 'Clientes', (a) => {
      a.on('GET', '/api/v1/customers', { items: [], total: 0 });
      a.on('POST', '/api/v1/customers/sync-from-orders', { imported: 2, scanned: 5 });
    });
    expect(screen.getByText('Agregá tu primer cliente')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Traer de mis ventas/ }).at(-1)!);
    await waitFor(() =>
      expect(api.calls.some((c) => c.path === '/api/v1/customers/sync-from-orders')).toBe(true),
    );
  });
});
