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
  const input = within(dialog).getByLabelText('Buscar pantallas o productos');
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
    await user.click(screen.getByLabelText('Buscar pantallas o productos'));
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
});
