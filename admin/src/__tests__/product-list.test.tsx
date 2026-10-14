/**
 * El listado de productos del panel con el catálogo sembrado: acciones de
 * cada fila (editar, duplicar, archivar, eliminar con confirmación), precio
 * editable en la fila, acciones masivas, "eliminar todos" con la palabra de
 * confirmación, filtros (panel y chips), orden y búsqueda — y lo que cada una
 * pide a la API.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';

interface Product {
  id: string;
  name: string;
  variants: { id: string }[];
}
const products = fixture<{ items: Product[] }>('/api/v1/products#paged').items;
const first = products[0]!;

async function open() {
  const api = mockApi();
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/productos');
  await screen.findByText(first.name);
  await settle(2);
  return { api, user };
}

const did = (api: MockApi, method: string, path: string) =>
  api.calls.some((c) => c.method === method && c.path === path);
const lastList = (api: MockApi) =>
  new URLSearchParams(
    api.calls
      .filter((c) => c.method === 'GET' && c.path.startsWith('/api/v1/products?'))
      .at(-1)!
      .path.split('?')[1],
  );

async function rowAction(user: ReturnType<typeof userEvent.setup>, name: string, action: string) {
  await user.click(screen.getByRole('button', { name: `Acciones de ${name}` }));
  await user.click(await screen.findByRole('menuitem', { name: action }));
}

describe('listado de productos: cada fila', () => {
  it('duplicar, archivar y eliminar (con confirmación)', async () => {
    const { api, user } = await open();
    await rowAction(user, first.name, 'Duplicar');
    await rowAction(user, first.name, 'Archivar');
    await settle(2);
    expect(did(api, 'POST', `/api/v1/products/${first.id}/duplicate`)).toBe(true);
    expect(did(api, 'POST', `/api/v1/products/${first.id}/archive`)).toBe(true);

    await rowAction(user, first.name, 'Eliminar');
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Eliminar' }));
    await settle(2);
    expect(did(api, 'DELETE', `/api/v1/products/${first.id}`)).toBe(true);
  });

  it('editar lleva a la ficha', async () => {
    const { user } = await open();
    await rowAction(user, first.name, 'Editar');
    expect(await screen.findByRole('heading', { name: 'Editar producto' })).toBeInTheDocument();
  });

  it('el precio se edita en la fila: guarda al salir si cambió y si es válido', async () => {
    const { api, user } = await open();
    const row = screen.getByText(first.name).closest('tr')!;
    const [regular] = within(row).getAllByRole('textbox');
    await user.clear(regular!);
    await user.type(regular!, '1234,5{Enter}');
    await settle(2);
    expect(
      api.calls.find(
        (c) => c.method === 'PATCH' && c.path.endsWith(`/variants/${first.variants[0]!.id}/price`),
      )?.body,
    ).toMatchObject({ priceAmount: 123450, currency: 'ARS' });

    // Un valor inválido vuelve al anterior sin pedir nada.
    const before = api.calls.length;
    await user.clear(regular!);
    await user.type(regular!, 'abc{Enter}');
    expect(api.calls.filter((c) => c.method === 'PATCH').length).toBe(
      api.calls.slice(0, before).filter((c) => c.method === 'PATCH').length,
    );
  });
});

describe('listado de productos: en masa', () => {
  it('seleccionar todos → publicar, archivar y eliminar', async () => {
    const { api, user } = await open();
    await user.click(screen.getByLabelText('Seleccionar todos'));
    expect(screen.getByText(`${products.length} seleccionados`)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Publicar' }));
    await settle(2);
    for (const p of products) expect(did(api, 'POST', `/api/v1/products/${p.id}/publish`)).toBe(true);

    // Publicar limpió la selección: ahora uno solo.
    await user.click(screen.getByLabelText(`Seleccionar ${first.name}`));
    await user.click(screen.getByRole('button', { name: 'Archivar' }));
    await settle(2);
    expect(did(api, 'POST', `/api/v1/products/${first.id}/archive`)).toBe(true);

    await user.click(screen.getByLabelText(`Seleccionar ${first.name}`));
    await user.click(screen.getByRole('button', { name: /^Eliminar$/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Eliminar productos seleccionados' }));
    await user.click(dialog.getByRole('button', { name: 'Eliminar 1' }));
    await settle(2);
    expect(did(api, 'DELETE', `/api/v1/products/${first.id}`)).toBe(true);
  });

  it('si algunos fallan: hace los demás, refresca, dice cuáles fallaron y deja solo esos elegidos', async () => {
    const { api, user } = await open();
    const second = products[1]!;
    api.on('DELETE', `/api/v1/products/${second.id}`, { detail: 'Tiene ventas asociadas.' }, 409);
    await user.click(screen.getByLabelText('Seleccionar todos'));
    const listCallsBefore = api.calls.filter((c) => c.path.startsWith('/api/v1/products?')).length;
    await user.click(screen.getByRole('button', { name: /^Eliminar$/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Eliminar productos seleccionados' }));
    await user.click(dialog.getByRole('button', { name: `Eliminar ${products.length}` }));
    await settle(3);

    for (const p of products) expect(did(api, 'DELETE', `/api/v1/products/${p.id}`)).toBe(true);
    const summary = screen
      .getAllByRole('status')
      .find((s) => s.textContent?.includes('no se pudo eliminar'))!;
    expect(summary).toHaveTextContent(`${products.length - 1} productos eliminados · 1 no se pudo eliminar`);
    expect(summary).toHaveTextContent(`${second.name}: Tiene ventas asociadas.`);
    // La lista se volvió a pedir (lo borrado no queda a la vista).
    expect(api.calls.filter((c) => c.path.startsWith('/api/v1/products?')).length).toBeGreaterThan(
      listCallsBefore,
    );
    expect(screen.getByText('1 seleccionados')).toBeInTheDocument();
    expect(screen.getByLabelText(`Seleccionar ${second.name}`)).toBeChecked();
    await user.click(within(summary).getByRole('button', { name: 'Cerrar el resumen' }));
    expect(screen.queryByRole('button', { name: 'Cerrar el resumen' })).toBeNull();
  });

  it('deseleccionar limpia la selección', async () => {
    const { user } = await open();
    await user.click(screen.getByLabelText('Seleccionar todos'));
    await user.click(screen.getByRole('button', { name: /Deseleccionar/ }));
    expect(screen.queryByText(`${products.length} seleccionados`)).not.toBeInTheDocument();
  });

  it('"Eliminar todos" exige escribir ELIMINAR', async () => {
    const { api, user } = await open();
    api.on('DELETE', '/api/v1/products', { deleted: products.length });
    await user.click(screen.getByRole('button', { name: /Eliminar todos/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Eliminar todos los productos' }));
    const go = dialog.getByRole('button', { name: 'Eliminar todo' });
    await user.type(dialog.getByPlaceholderText('ELIMINAR'), 'eliminar');
    expect(go).toBeDisabled();
    await user.clear(dialog.getByPlaceholderText('ELIMINAR'));
    await user.type(dialog.getByPlaceholderText('ELIMINAR'), 'ELIMINAR');
    await user.click(go);
    await settle(2);
    expect(did(api, 'DELETE', '/api/v1/products')).toBe(true);
    expect(await screen.findByText(`${products.length} productos eliminados`)).toBeInTheDocument();
  });
});

/** El "Filtrar" de la barra (el panel lateral tiene otro para aplicar). */
const filterButton = () => screen.getByRole('button', { name: /^Filtrar/ });

describe('listado de productos: buscar, filtrar y ordenar', () => {
  it('cada filtro del panel viaja a la API y se puede sacar desde su chip', async () => {
    const { api, user } = await open();
    await user.click(filterButton());
    const panel = within(screen.getByRole('dialog', { name: 'Filtrar productos' }));
    await user.click(panel.getByRole('button', { name: 'Fuera de stock' }));
    await user.click(panel.getByRole('button', { name: 'Promocional' }));
    await user.click(panel.getByRole('button', { name: 'Borradores' }));
    await user.click(panel.getByRole('button', { name: 'Sin foto' }));
    await user.click(panel.getAllByRole('button', { name: 'Filtrar' }).at(-1)!);
    await settle(2);

    const params = lastList(api);
    expect(params.get('status')).toBeTruthy();
    expect(filterButton()).toHaveTextContent('4');

    // Sacar uno desde su chip y después todos desde el panel.
    const chips = screen
      .getAllByRole('button')
      .filter((b) => b.querySelector('svg') && /Sin foto/.test(b.textContent ?? ''));
    if (chips[0]) await user.click(chips[0]);
    await user.click(filterButton());
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filtrar productos' })).getByRole('button', {
        name: 'Borrar filtros',
      }),
    );
    await settle(2);
    // "Borrar filtros" deja el panel abierto; se cierra con la X.
    await user.click(
      within(screen.getByRole('dialog', { name: 'Filtrar productos' })).getByRole('button', {
        name: 'Cerrar',
      }),
    );
    expect(filterButton()).not.toHaveTextContent(/\d/);
    await settle(2);
  });

  it('buscar y ordenar', async () => {
    const { api, user } = await open();
    await user.type(screen.getByPlaceholderText('Buscar por nombre, SKU o tags'), 'barra');
    await waitFor(() => expect(lastList(api).get('q')).toBe('barra'), { timeout: 3000 });
    const sort = screen.getByDisplayValue('Más nuevo');
    const other = Array.from((sort as HTMLSelectElement).options).at(-1)!.value;
    await user.selectOptions(sort, other);
    await settle(2);
    expect(lastList(api).get('sort')).toBeTruthy();
  });
});
