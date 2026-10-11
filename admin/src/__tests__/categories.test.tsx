/**
 * Categorías del catálogo: crear (con o sin padre), agregar una subcategoría
 * desde la fila, renombrar, ver en la tienda, eliminar con confirmación,
 * colapsar ramas y reordenar arrastrando (solo entre hermanas; el orden se
 * guarda en el navegador y se puede descartar).
 */
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, type MockApi } from '../test/api';
import { renderApp } from '../test/render';
import { settle } from '../test/explore';

const cat = (id: string, name: string, parentId: string | null = null, depth = 1) => ({
  id,
  name,
  slug: id,
  parentId,
  path: parentId ? `${parentId}/${id}` : id,
  depth,
});
const CATEGORIES = {
  items: [
    cat('fit', 'Fitness'),
    cat('pesas', 'Pesas', 'fit', 2),
    cat('bancos', 'Bancos', 'fit', 2),
    cat('ropa', 'Ropa'),
  ],
};

async function open(categories: object = CATEGORIES) {
  const api = mockApi();
  api.on('GET', '/api/v1/categories', categories);
  api.on('POST', '/api/v1/categories', (body) => ({
    ...cat('nueva', (body as { name: string }).name),
    id: 'nueva',
  }));
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/productos/categorias');
  await screen.findByRole('heading', { name: 'Categorías' });
  await settle(2);
  return { api, user };
}

async function action(user: ReturnType<typeof userEvent.setup>, name: string, item: RegExp) {
  await user.click(screen.getByRole('button', { name: `Acciones de ${name}` }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
}

describe('categorías', () => {
  it('sin categorías invita a crear la primera', async () => {
    const { api, user } = await open({ items: [] });
    await user.click(screen.getByRole('button', { name: 'Crear mi primera categoría' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Crear categoría' }));
    await user.type(dialog.getByPlaceholderText('Indumentaria'), 'Accesorios');
    await user.click(dialog.getByRole('button', { name: 'Crear' }));
    await settle(2);
    expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'Accesorios', parentId: null });
  });

  it('crea con padre elegido y agrega una subcategoría desde la fila', async () => {
    const { api, user } = await open();
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }));
    let dialog = within(screen.getByRole('dialog', { name: 'Crear categoría' }));
    await user.type(dialog.getByPlaceholderText('Indumentaria'), 'Remeras');
    await user.selectOptions(dialog.getByRole('combobox'), 'ropa');
    await user.click(dialog.getByRole('button', { name: 'Crear' }));
    await settle(2);
    expect(api.calls.filter((c) => c.method === 'POST').at(-1)?.body).toEqual({
      name: 'Remeras',
      parentId: 'ropa',
    });

    await action(user, 'Fitness', /Agregar subcategoría/);
    dialog = within(screen.getByRole('dialog', { name: 'Crear categoría' }));
    expect(dialog.getByRole('combobox')).toHaveValue('fit');
    await user.type(dialog.getByPlaceholderText('Indumentaria'), 'Colchonetas');
    await user.click(dialog.getByRole('button', { name: 'Crear' }));
    await settle(2);
    expect(api.calls.filter((c) => c.method === 'POST').at(-1)?.body).toEqual({
      name: 'Colchonetas',
      parentId: 'fit',
    });
  });

  it('un nombre repetido muestra el error de la API', async () => {
    const { api, user } = await open();
    api.on('POST', '/api/v1/categories', { detail: 'Ya existe esa categoría.' }, 409);
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Crear categoría' }));
    await user.type(dialog.getByPlaceholderText('Indumentaria'), 'Ropa');
    await user.click(dialog.getByRole('button', { name: 'Crear' }));
    expect(await dialog.findByText('Ya existe esa categoría.')).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Cancelar' }));
  });

  it('renombrar, ver en la tienda y eliminar', async () => {
    const { api, user } = await open();
    const open$ = vi.fn();
    vi.stubGlobal('open', open$);

    await action(user, 'Ropa', /Editar nombre/);
    const dialog = within(screen.getByRole('dialog', { name: 'Editar nombre' }));
    const input = dialog.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Indumentaria');
    await user.click(dialog.getByRole('button', { name: 'Guardar' }));
    await settle(2);
    expect(api.calls.find((c) => c.method === 'PUT' && c.path === '/api/v1/categories/ropa')?.body).toEqual({
      name: 'Indumentaria',
    });

    await action(user, 'Ropa', /Ver en la tienda/);
    expect(open$).toHaveBeenCalledWith(expect.stringContaining('/productos?category=ropa'), '_blank');

    await action(user, 'Ropa', /Eliminar/);
    await user.click(
      within(await screen.findByRole('dialog', { name: /Eliminar/ })).getByRole('button', {
        name: 'Eliminar',
      }),
    );
    await settle(2);
    expect(api.calls.some((c) => c.method === 'DELETE' && c.path === '/api/v1/categories/ropa')).toBe(true);
  });

  it('colapsa una rama y reordena arrastrando entre hermanas (guardar o descartar)', async () => {
    const { user } = await open();
    expect(screen.getByText('Pesas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Colapsar' }));
    expect(screen.queryByText('Pesas')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expandir' }));

    // La fila arrastrable de esa categoría (el nombre también está en el <select> del modal).
    const row = (name: string) =>
      Array.from(document.querySelectorAll<HTMLElement>('[draggable="true"]')).find((r) =>
        within(r).queryByText(name, { exact: true }),
      )!;
    fireEvent.dragStart(row('Bancos'));
    fireEvent.dragOver(row('Pesas'));
    fireEvent.drop(row('Pesas'));
    expect(screen.getByText('Tenés cambios de orden sin guardar.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar orden' }));
    expect(
      Object.values(
        JSON.parse(Object.entries(localStorage).find(([k]) => k.startsWith('tiendafy.catOrder.'))![1]),
      ),
    ).toContainEqual(['bancos', 'pesas']);

    // Entre niveles distintos no se puede.
    fireEvent.dragStart(row('Pesas'));
    fireEvent.drop(row('Ropa'));
    expect(
      await screen.findByText('Solo se puede reordenar dentro de la misma categoría padre'),
    ).toBeInTheDocument();

    // Un cambio se puede descartar.
    fireEvent.dragStart(row('Ropa'));
    fireEvent.dragLeave(row('Fitness'));
    fireEvent.drop(row('Fitness'));
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByText('Tenés cambios de orden sin guardar.')).not.toBeInTheDocument();
  });
});
