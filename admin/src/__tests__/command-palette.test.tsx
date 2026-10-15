/**
 * La paleta de comandos del panel (Ctrl/Cmd+K): abre y cierra con el teclado,
 * busca pantallas sin tildes y productos en la base, se maneja con flechas y
 * Enter, y lleva a la pantalla o al producto elegido.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, mockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

const product = fixture<{ items: { id: string; name: string }[] }>('/api/v1/products').items[0]!;
const ORDER_ID = 'abcdef12-3456-4789-8abc-def012345678';
const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function openPanel(noProducts = false) {
  // El mock no filtra por q: para "sin resultados" la base no devuelve nada.
  const api = mockApi();
  // El buscador del servidor (GET /api/v1/search): un producto, una venta y
  // un cliente; sin resultados, todos los grupos vacíos.
  const hit = (id: string, title: string, extra: object = {}) => ({
    id,
    title,
    subtitle: null,
    imageUrl: null,
    detail: null,
    amountMinor: null,
    currency: null,
    atUtc: null,
    ...extra,
  });
  api.on(
    'GET',
    '/api/v1/search',
    noProducts
      ? { orders: [], customers: [], products: [], purchaseOrders: [], suppliers: [] }
      : {
          orders: [
            hit(ORDER_ID, '#ABCDEF12 · Laura Gómez', {
              subtitle: 'PAID',
              amountMinor: 1_500_00,
              currency: 'ARS',
            }),
          ],
          customers: [hit(CUSTOMER_ID, 'Laura Gómez', { subtitle: 'laura@test.local', detail: '2 compras' })],
          products: [hit(product.id, product.name, { subtitle: 'SKU MAN-1' })],
          purchaseOrders: [],
          suppliers: null,
        },
  );
  api.on('GET', `/api/v1/customers/${CUSTOMER_ID}`, {
    customer: {
      id: CUSTOMER_ID,
      name: 'Laura Gómez',
      email: 'laura@test.local',
      phone: null,
      address: null,
      notes: null,
      priceListId: null,
      createdAtUtc: '2026-01-01T00:00:00Z',
      tags: [],
      ordersCount: 2,
      totalSpentMinor: 3_000_00,
      lastOrderAtUtc: '2026-09-01T00:00:00Z',
    },
    stats: {
      ordersCount: 2,
      totalSpentMinor: 3_000_00,
      averageTicketMinor: 1_500_00,
      lastOrderAtUtc: '2026-09-01T00:00:00Z',
      firstOrderAtUtc: '2026-08-01T00:00:00Z',
      currency: 'ARS',
    },
    orders: [],
    hasMoreOrders: false,
  });
  if (noProducts) api.on('GET', '/api/v1/products', { items: [], total: 0 });
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/');
  await screen.findAllByRole('link', {}, { timeout: 5000 });
  await settle(4);
  return user;
}

const palette = () => screen.queryByRole('dialog', { name: 'Buscar en el panel' });

async function openPalette(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Control>}k{/Control}');
  const dialog = await screen.findByRole('dialog', { name: 'Buscar en el panel' });
  const input = within(dialog).getByLabelText('Buscar en el panel');
  await waitFor(() => expect(input).toHaveFocus());
  return { dialog: within(dialog), input };
}

describe('paleta de comandos', () => {
  it('Ctrl+K abre y cierra; Escape y el clic afuera cierran', async () => {
    const user = await openPanel();
    await openPalette(user);
    await user.keyboard('{Control>}k{/Control}');
    expect(palette()).not.toBeInTheDocument();

    await openPalette(user);
    await user.keyboard('{Escape}');
    expect(palette()).not.toBeInTheDocument();

    // Cmd+K en Mac.
    fireEvent.keyDown(window, { key: 'K', metaKey: true });
    expect(await screen.findByRole('dialog', { name: 'Buscar en el panel' })).toBeInTheDocument();
    // Clic adentro no cierra; en el fondo, sí.
    await user.click(within(palette()!).getByRole('searchbox'));
    expect(palette()).toBeInTheDocument();
    await user.click(palette()!);
    expect(palette()).not.toBeInTheDocument();
  });

  it('busca pantallas sin tildes y va con Enter; las flechas mueven la selección', async () => {
    const user = await openPanel();
    const { dialog, input } = await openPalette(user);
    await user.type(input, 'configuracion');
    const options = dialog.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}');
    const selected = dialog
      .getAllByRole('option')
      .findIndex((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected).toBe(options.length > 1 ? 1 : 0);
    // No pasa del primero.
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(dialog.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Enter}');
    expect(palette()).not.toBeInTheDocument();
  });

  it('sin resultados lo dice; el mouse elige la opción', async () => {
    const user = await openPanel(true);
    const { dialog, input } = await openPalette(user);
    await user.type(input, 'qwertyuiop');
    expect(dialog.getByText(/Sin resultados para «qwertyuiop»/)).toBeInTheDocument();
    // Enter sin resultados no hace nada.
    await user.keyboard('{Enter}');
    expect(palette()).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'ventas');
    const option = dialog.getAllByRole('option')[0]!;
    await user.hover(option);
    expect(option).toHaveAttribute('aria-selected', 'true');
    await user.click(option);
    expect(palette()).not.toBeInTheDocument();
  });

  it('busca productos en la base y abre el elegido para editar', async () => {
    const user = await openPanel();
    const { dialog, input } = await openPalette(user);
    await user.type(input, product.name.slice(0, 6));
    const hit = await dialog.findByRole(
      'option',
      { name: new RegExp(product.name.slice(0, 6), 'i') },
      { timeout: 3000 },
    );
    await act(async () => {
      await user.click(hit);
    });
    expect(palette()).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: /Editar|producto/i }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('ventas y clientes del servidor, agrupados, llevan a su pantalla', async () => {
    const user = await openPanel();
    const { dialog, input } = await openPalette(user);
    await user.type(input, 'laura');
    const sale = await dialog.findByRole('option', { name: /#ABCDEF12/ });
    expect(dialog.getByText('Ventas')).toBeInTheDocument();
    expect(dialog.getByText('Clientes')).toBeInTheDocument();
    // La venta aparece con su estado y su total.
    expect(sale).toHaveTextContent('Pagada');
    await user.click(dialog.getByRole('option', { name: /laura@test\.local/ }));
    expect(palette()).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Laura Gómez' }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('el botón del encabezado abre el buscador y muestra el atajo', async () => {
    const user = await openPanel();
    const button = screen.getByRole('button', { name: 'Buscar en el panel' });
    // El atajo se anuncia con aria-keyshortcuts y se ve encima del botón, pero no
    // es texto del botón: lo visible tiene que estar en su nombre (WCAG 2.5.3).
    expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K');
    expect(button).not.toHaveTextContent(/Ctrl K|⌘ K/);
    expect(button.parentElement).toHaveTextContent(/Ctrl K|⌘ K/);
    await user.click(button);
    expect(await screen.findByRole('dialog', { name: 'Buscar en el panel' })).toBeInTheDocument();
  });
});
