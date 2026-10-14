/**
 * Inventario: corregir el stock de una variante (solo números; vacío es 0),
 * filtrar lo que no tiene o tiene poco, buscar, y bajar las etiquetas QR de la
 * página.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

const download = vi.hoisted(() => vi.fn());
vi.mock('../lib/download', () => ({ downloadBlob: download }));

type Product = { name: string; variants: { id: string; optionValues: string[] }[] };
const product = fixture<{ items: Product[] }>('/api/v1/products').items[0]!;
const variant = product.variants[0]!;
const stockLabel = `Stock disponible de ${product.name}${variant.optionValues.length ? ` (${variant.optionValues.join(' / ')})` : ''}`;

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
  download.mockReset();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function openInventory(setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/productos/inventario');
  expect(await screen.findByLabelText(stockLabel, {}, { timeout: 5000 })).toBeInTheDocument();
  await settle(3);
  return { api, user };
}

describe('inventario', () => {
  it('corregir el stock: solo números, y el error se muestra', async () => {
    const { api, user } = await openInventory((a) => {
      a.on('PUT', '/api/v1/inventory/:id', { detail: 'Hay reservas por encima de ese número.' }, 409);
      // 5 disponibles y 2 reservadas en checkouts en curso.
      a.on('GET', '/api/v1/inventory', { items: [{ variantId: variant.id, available: 5, reserved: 2 }] });
    });
    const input = screen.getByLabelText(stockLabel);
    const row = input.closest('tr') as HTMLElement;
    await waitFor(() => expect(input).toHaveValue('5'));
    expect(within(row).getByText('2')).toBeInTheDocument(); // reservadas
    await user.clear(input);
    await user.type(input, '9a9');
    expect(input).toHaveValue('99');
    await user.click(within(row).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Hay reservas por encima de ese número.')).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === 'PUT')!.body).toEqual({
      available: 99,
      reason: 'Ajuste manual desde el panel',
      expectedAvailable: 5,
    });

    // Vacío se guarda como 0.
    api.on('PUT', '/api/v1/inventory/:id', {});
    await user.clear(input);
    await user.click(within(row).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Stock actualizado')).toBeInTheDocument();
    expect(api.calls.filter((c) => c.method === 'PUT').at(-1)!.body).toMatchObject({ available: 0 });
  });

  it('si el stock cambió mientras se tipeaba, no lo pisa: avisa, refresca la fila y el segundo guardado entra', async () => {
    const { api, user } = await openInventory((a) =>
      a.on('GET', '/api/v1/inventory', { items: [{ variantId: variant.id, available: 5, reserved: 0 }] }),
    );
    const input = screen.getByLabelText(stockLabel);
    const row = input.closest('tr') as HTMLElement;
    await waitFor(() => expect(input).toHaveValue('5'));
    await user.clear(input);
    await user.type(input, '8');

    // En el medio se vendieron 2 y entró una reserva.
    const changed = 'El stock cambió mientras editabas: ahora hay 3. Revisalo y guardá de nuevo.';
    api.on('PUT', `/api/v1/inventory/${variant.id}`, { title: 'Stock.Changed', detail: changed }, 409);
    api.on('GET', '/api/v1/inventory', { items: [{ variantId: variant.id, available: 3, reserved: 1 }] });
    await user.click(within(row).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(changed)).toBeInTheDocument();
    const puts = () => api.calls.filter((c) => c.method === 'PUT').map((c) => c.body);
    expect(puts()[0]).toEqual({ available: 8, reason: 'Ajuste manual desde el panel', expectedAvailable: 5 });
    // La fila muestra la reserva nueva y lo tipeado sigue ahí.
    await waitFor(() => expect(within(row).getByText('1')).toBeInTheDocument());
    expect(input).toHaveValue('8');
    await settle(2);

    // Revisado, el segundo guardado va contra el stock actual.
    api.on('PUT', `/api/v1/inventory/${variant.id}`, {});
    await user.click(within(row).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Stock actualizado')).toBeInTheDocument();
    expect(puts()[1]).toMatchObject({ available: 8, expectedAvailable: 3 });
  });

  it('filtrar sin stock o con poco, volver a ver todo, y buscar', async () => {
    const { api, user } = await openInventory((a) =>
      a.on('GET', '/api/v1/inventory/summary', {
        ...fixture<object>('/api/v1/inventory/summary'),
        outOfStock: 2,
        lowStock: 3,
      }),
    );
    await user.click(screen.getByRole('button', { name: /Sin stock/ }));
    await waitFor(() => expect(api.calls.some((c) => c.path.includes('stock=out'))).toBe(true));
    expect(screen.getByText(/Mostrando solo/)).toBeInTheDocument();
    // Tocar el mismo filtro lo apaga; el otro lo cambia.
    await user.click(screen.getByRole('button', { name: /Quedan \d+ o menos/ }));
    await waitFor(() => expect(api.calls.some((c) => c.path.includes('stock=low'))).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Ver todo' }));
    expect(screen.queryByText(/Mostrando solo/)).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Buscar por producto o SKU…'), 'barra');
    await waitFor(() => expect(api.calls.some((c) => c.path.includes('q=barra'))).toBe(true), {
      timeout: 3000,
    });
  });

  it('las etiquetas QR de la página se bajan en PDF; si fallan, lo dice', async () => {
    const { api, user } = await openInventory((a) => a.on('GET', '/api/v1/products/labels', {}));
    await user.click(screen.getByRole('button', { name: 'Etiquetas QR de esta página' }));
    await waitFor(() => expect(download).toHaveBeenCalledWith(expect.anything(), 'etiquetas.pdf'));
    expect(api.calls.find((c) => c.path.startsWith('/api/v1/products/labels'))!.path).toContain(variant.id);

    api.on('GET', '/api/v1/products/labels', { detail: 'Demasiadas variantes.' }, 400);
    await user.click(screen.getByRole('button', { name: 'Etiquetas QR de esta página' }));
    expect(await screen.findByText('Demasiadas variantes.')).toBeInTheDocument();
  });

  it('sin productos invita a cargarlos', async () => {
    mockApi().on('GET', '/api/v1/products', { items: [], total: 0 });
    renderApp('/productos/inventario');
    expect(await screen.findByText('Primero, productos', {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
