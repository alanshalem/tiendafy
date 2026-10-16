/**
 * Inventario: corregir el stock de una variante (solo números; vacío es 0),
 * filtrar lo que no tiene o tiene poco, buscar, bajar las etiquetas QR de la
 * página y ver el historial de movimientos de cada variante.
 */
import { screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { a11yViolations } from '../../../test-fixtures/a11y';
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

  describe('historial de stock de una variante', () => {
    const historyButton = () =>
      screen.getByRole('button', {
        name: `Historial de stock de ${product.name}${
          variant.optionValues.length ? ` (${variant.optionValues.join(' / ')})` : ''
        }`,
      });
    const ledger = fixture<{ items: { orderId: string | null; orderNumber: number | null }[] }>(
      '/api/v1/inventory/:id/ledger',
    );
    const sale = ledger.items.find((m) => m.orderId)!;

    it('cada movimiento dice qué pasó, cuánto cambió y de qué venta fue', async () => {
      const { api, user } = await openInventory();
      await user.click(historyButton());
      const panel = within(await screen.findByRole('dialog', { name: 'Historial de stock' }));
      expect(await panel.findByText(/Alta de stock/)).toBeInTheDocument();
      expect(api.calls.some((c) => c.path === `/api/v1/inventory/${variant.id}/ledger`)).toBe(true);

      // La carga inicial suma, con su motivo; la reserva resta; la venta cobrada no vuelve a restar.
      expect(panel.getByText('carga inicial de test')).toBeInTheDocument();
      expect(panel.getByText('Entraron 50')).toBeInTheDocument();
      expect(panel.getByText('Salieron 1')).toBeInTheDocument();
      expect(panel.getByText('Sin cambio en el disponible')).toBeInTheDocument();
      expect(panel.getByText('Ya se había descontado al apartarse.')).toBeInTheDocument();

      // La reserva y la venta llevan a la venta que se llevó el stock.
      const links = panel.getAllByRole('link', { name: `Venta #${sale.orderNumber}` });
      expect(links).toHaveLength(2);
      expect(links[0]).toHaveAttribute('href', `/ventas?order=${sale.orderId}`);
      // Pocos movimientos: no hace falta aclarar que hay un tope.
      expect(panel.queryByText(/Se muestran los últimos/)).not.toBeInTheDocument();
      expect(await a11yViolations(axe)).toEqual([]);
    });

    it('sin movimientos lo dice; con el tope, aclara que son los últimos; si falla, deja reintentar', async () => {
      const { api, user } = await openInventory((a) =>
        a.on('GET', '/api/v1/inventory/:id/ledger', { items: [], limit: 50 }),
      );
      await user.click(historyButton());
      expect(await screen.findByText('Sin movimientos todavía')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      const many = Array.from({ length: 2 }, (_, i) => ({
        type: 'Adjustment',
        quantity: i + 1,
        reason: `Conteo ${i + 1}`,
        occurredAtUtc: '2026-10-15T12:00:00Z',
        orderId: null,
        orderNumber: null,
      }));
      api.on('GET', '/api/v1/inventory/:id/ledger', { items: many, limit: 2 });
      await user.click(historyButton());
      expect(await screen.findByText('Se muestran los últimos 2 movimientos.')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      api.on('GET', '/api/v1/inventory/:id/ledger', { detail: 'La base no responde.' }, 503);
      await user.click(historyButton());
      expect(await screen.findByText('No se pudo cargar el historial de stock.')).toBeInTheDocument();
      expect(screen.getByText(/La base no responde/)).toBeInTheDocument();
      api.on('GET', '/api/v1/inventory/:id/ledger', { items: many, limit: 50 });
      await user.click(screen.getByRole('button', { name: /Reintentar/ }));
      expect(await screen.findByText('Conteo 2')).toBeInTheDocument();
    });

    it('quien solo puede ver el stock también ve el historial', async () => {
      const perms = fixture<{ role: string; permissions: string[] }>('/api/v1/me/permissions');
      const { user } = await openInventory((a) =>
        a.on('GET', '/api/v1/me/permissions', {
          ...perms,
          permissions: perms.permissions.filter((p) => p !== 'inventory.write'),
        }),
      );
      expect(screen.getByLabelText(stockLabel)).toHaveAttribute('readonly');
      await user.click(historyButton());
      expect(await screen.findByRole('dialog', { name: 'Historial de stock' })).toBeInTheDocument();
    });
  });

  it('sin productos invita a cargarlos', async () => {
    mockApi().on('GET', '/api/v1/products', { items: [], total: 0 });
    renderApp('/productos/inventario');
    expect(await screen.findByText('Primero, productos', {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
