/**
 * Proveedores: la lista (buscar por nombre o CUIT), el alta y la edición,
 * la ficha con sus órdenes de compra y el salto a su cuenta corriente.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

const SUPPLIERS = '/api/v1/suppliers';
const row = fixture<{ items: { id: string; name: string }[] }>(SUPPLIERS).items[0]!;
const detail = fixture<Record<string, unknown>>(`${SUPPLIERS}/:id`);

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function openSuppliers(setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/proveedores');
  expect(await screen.findByRole('heading', { name: 'Proveedores' }, { timeout: 5000 })).toBeInTheDocument();
  await settle(3);
  return { api, user };
}

const form = async (title: string) => within(await screen.findByRole('dialog', { name: title }));

describe('proveedores', () => {
  it('alta de un proveedor con todos sus datos (y el error si falla)', async () => {
    const { api, user } = await openSuppliers((a) =>
      a.on('POST', SUPPLIERS, { detail: 'Ya existe un proveedor con ese CUIT.' }, 409),
    );
    await user.click(screen.getByRole('button', { name: /Nuevo proveedor/ }));
    const f = await form('Nuevo proveedor');
    const save = f.getByRole('button', { name: 'Guardar' });
    expect(save).toBeDisabled();
    for (const [label, value] of [
      ['Nombre', 'Textil Norte'],
      ['CUIT / Tax ID', '30711111119'],
      ['País', 'Argentina'],
      ['Email', 'ventas@norte.test'],
      ['Teléfono', '1144445555'],
      ['Dirección', 'Av. Siempreviva 742'],
      ['Notas', 'Paga a 30 días'],
    ] as const) {
      await user.type(f.getByLabelText(label, { exact: false }), value);
    }
    await user.click(save);
    expect(await screen.findByText('Ya existe un proveedor con ese CUIT.')).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      name: 'Textil Norte',
      taxId: '30711111119',
      email: 'ventas@norte.test',
      notes: 'Paga a 30 días',
    });

    api.on('POST', SUPPLIERS, { id: 'nuevo' });
    await user.click(save);
    expect(await screen.findByText('Proveedor creado')).toBeInTheDocument();
  });

  it('buscar consulta a la base; sin resultados lo dice', async () => {
    const { api, user } = await openSuppliers();
    api.on('GET', SUPPLIERS, { items: [] });
    await user.type(screen.getByPlaceholderText('Buscar por nombre o CUIT...'), 'zzz');
    expect(
      await screen.findByText('Ningún proveedor coincide con la búsqueda', {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(api.calls.some((c) => c.path.includes('q=zzz'))).toBe(true);
  });

  it('la ficha: órdenes de compra, cuenta corriente, editar y desactivar', async () => {
    const { api, user } = await openSuppliers((a) => {
      a.on('GET', `${SUPPLIERS}/:id`, {
        ...detail,
        phone: '1144445555',
        address: 'Av. Siempreviva 742',
        purchases: [
          {
            id: 'po-1',
            reference: 'OC-001',
            status: 'RECEIVED',
            currency: 'USD',
            createdAtUtc: '2026-09-01T00:00:00Z',
            invoiceNumber: 'A-0001-00000012',
          },
          {
            id: 'po-2',
            reference: null,
            status: 'DRAFT',
            currency: 'ARS',
            createdAtUtc: '2026-10-01T00:00:00Z',
            invoiceNumber: null,
          },
        ],
      });
      a.on('PATCH', `${SUPPLIERS}/:id`, {});
    });
    await user.click(screen.getByText(row.name));
    expect(await screen.findByRole('heading', { name: row.name })).toBeInTheDocument();
    // Plural con tilde (antes armaba "ordenes" pegando "es").
    expect(screen.getByText(/2 órdenes de compra/)).toBeInTheDocument();
    expect(screen.getByText('OC-001')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const f = await form('Editar proveedor');
    expect(f.getByLabelText('Nombre', { exact: false })).toHaveValue(row.name);
    await user.click(f.getByRole('checkbox', { name: 'Proveedor activo' }));
    await user.click(f.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Proveedor actualizado')).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ active: false });

    await user.click(screen.getByRole('button', { name: 'Ver cuenta corriente' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: row.name })).not.toBeInTheDocument());
  });

  it('volver de la ficha a la lista; cancelar el formulario no guarda', async () => {
    const { api, user } = await openSuppliers();
    await user.click(screen.getByText(row.name));
    await user.click(await screen.findByRole('button', { name: /Proveedores/ }));
    expect(await screen.findByPlaceholderText('Buscar por nombre o CUIT...')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Nuevo proveedor/ }));
    await user.click((await form('Nuevo proveedor')).getByRole('button', { name: 'Cancelar' }));
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  });
});
