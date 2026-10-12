/**
 * Páginas de contenido (sobre nosotros, términos…) y su editor de texto con
 * formato: crear, editar, publicar o dejar en borrador, eliminar con
 * confirmación, y la barra del editor (formato, enlaces, imágenes subidas).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, type MockApi } from '../test/api';
import { settle, watchCrashes } from '../test/explore';
import { renderApp } from '../test/render';

const PAGES = '/api/v1/pages';
const page = {
  id: 'pg-1',
  title: 'Sobre nosotros',
  slug: 'sobre-nosotros',
  body: '<p>Somos una importadora.</p>',
  published: true,
  createdAtUtc: '2026-09-01T00:00:00Z',
  updatedAtUtc: '2026-10-01T00:00:00Z',
};

let crashes: () => unknown[][];

beforeEach(() => {
  crashes = watchCrashes();
});

afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

async function openPages(setup?: (api: MockApi) => void) {
  const api = mockApi();
  setup?.(api);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderApp('/paginas');
  expect(
    await screen.findByRole('heading', { name: 'Páginas de contenido' }, { timeout: 5000 }),
  ).toBeInTheDocument();
  await settle(4);
  return { api, user };
}

const modal = async (name: string) => within(await screen.findByRole('dialog', { name }));
/** El editor del modal abierto (el de crear y el de editar existen a la vez, uno cerrado). */
const editor = () =>
  (screen.getAllByRole('dialog').at(-1)!.querySelector('.ProseMirror') ??
    document.querySelector('.ProseMirror')) as HTMLElement;

describe('páginas de contenido', () => {
  it('sin páginas invita a crear la primera; crear una (como borrador) con su contenido', async () => {
    const { api, user } = await openPages((a) => {
      a.on('GET', PAGES, { items: [] });
      a.on('POST', PAGES, { detail: 'Ya existe una página con esa URL.' }, 409);
    });
    expect(screen.getByText('Creá tu primera página')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Crear página/ }).at(-1)!);
    const m = await modal('Crear página');
    const create = m.getByRole('button', { name: 'Crear' });
    expect(create).toBeDisabled();
    await user.type(m.getByPlaceholderText('Sobre nosotros'), 'Cómo comprar');
    await user.type(m.getByPlaceholderText('sobre-nosotros'), 'como-comprar');
    await user.click(editor());
    await user.keyboard('Elegí, pagá y listo.');
    await user.click(m.getByRole('checkbox'));
    await user.click(create);
    expect(await m.findByText('Ya existe una página con esa URL.')).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === 'POST')!.body).toMatchObject({
      title: 'Cómo comprar',
      slug: 'como-comprar',
      published: false,
    });
    expect((api.calls.find((c) => c.method === 'POST')!.body as { body: string }).body).toContain(
      'Elegí, pagá y listo.',
    );

    api.on('POST', PAGES, { ...page, id: 'pg-2' });
    await user.click(create);
    expect(await screen.findByText('Página creada')).toBeInTheDocument();
  });

  it('editar carga lo guardado; eliminar pide confirmación', async () => {
    const { api, user } = await openPages((a) => {
      a.on('GET', PAGES, {
        items: [page, { ...page, id: 'pg-2', title: 'Términos', slug: 'terminos', published: false }],
      });
      a.on('PUT', `${PAGES}/${page.id}`, {});
      a.on('DELETE', `${PAGES}/${page.id}`, { detail: 'No se pudo.' }, 500);
    });
    expect(screen.getByText('Borrador')).toBeInTheDocument();

    const actions = () => screen.getByRole('button', { name: `Acciones de ${page.title}` });
    await user.click(actions());
    await user.click(await screen.findByRole('menuitem', { name: /Editar/ }));
    const m = await modal('Editar página');
    expect(m.getByPlaceholderText('Sobre nosotros')).toHaveValue(page.title);
    await waitFor(() => expect(editor()).toHaveTextContent('Somos una importadora.'));
    await user.click(m.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Página actualizada')).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === 'PUT')!.body).toMatchObject({
      title: page.title,
      published: true,
    });

    await user.click(actions());
    await user.click(await screen.findByRole('menuitem', { name: /Eliminar/ }));
    await user.click((await modal('Eliminar página')).getByRole('button', { name: 'Cancelar' }));
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);

    await user.click(actions());
    await user.click(await screen.findByRole('menuitem', { name: /Eliminar/ }));
    await user.click((await modal('Eliminar página')).getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('No se pudo.')).toBeInTheDocument();
    api.on('DELETE', `${PAGES}/${page.id}`, {});
    await user.click(actions());
    await user.click(await screen.findByRole('menuitem', { name: /Eliminar/ }));
    await user.click((await modal('Eliminar página')).getByRole('button', { name: 'Eliminar' }));
    expect(await screen.findByText('Página eliminada')).toBeInTheDocument();
  });
});

describe('editor de texto con formato', () => {
  async function openEditor() {
    const ctx = await openPages((a) => a.on('GET', PAGES, { items: [] }));
    await ctx.user.click(screen.getAllByRole('button', { name: /Crear página/ }).at(-1)!);
    const m = await modal('Crear página');
    await ctx.user.click(editor());
    await ctx.user.keyboard('Hola mundo');
    return { ...ctx, m };
  }

  // Regresión: con Tiptap 3 la barra no se re-renderizaba y nunca marcaba el formato activo.
  it('los botones de formato se prenden y se apagan', async () => {
    const { user, m } = await openEditor();
    for (const name of ['Negrita', 'Cursiva', 'Título', 'Subtítulo', 'Lista', 'Lista numerada', 'Cita']) {
      const button = m.getByRole('button', { name });
      await user.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'true');
      await user.click(button);
    }
    await user.click(m.getByRole('button', { name: 'Deshacer' }));
    await user.click(m.getByRole('button', { name: 'Rehacer' }));
    expect(editor()).toHaveTextContent('Hola mundo');
  });

  it('enlace: se pone con la URL, se quita vacío y se cancela sin tocar nada', async () => {
    const { user, m } = await openEditor();
    await user.keyboard('{Control>}a{/Control}');
    const link = m.getByRole('button', { name: 'Enlace' });

    await user.click(link);
    const prompt = await modal('Enlace');
    const url = prompt.getByLabelText('URL del enlace (vacío para quitar):');
    await user.clear(url);
    await user.type(url, 'https://tienda.example/envios');
    await user.click(prompt.getByRole('button', { name: 'Aceptar' }));
    await waitFor(() =>
      expect(editor().querySelector('a')?.getAttribute('href')).toBe('https://tienda.example/envios'),
    );
    expect(link).toHaveAttribute('aria-pressed', 'true');

    await user.click(link);
    await user.click((await modal('Enlace')).getByRole('button', { name: 'Cancelar' }));
    expect(editor().querySelector('a')).not.toBeNull();

    await user.click(link);
    const again = await modal('Enlace');
    await user.clear(again.getByLabelText('URL del enlace (vacío para quitar):'));
    await user.click(again.getByRole('button', { name: 'Aceptar' }));
    await waitFor(() => expect(editor().querySelector('a')).toBeNull());
  });

  it('imagen: se sube y se inserta; si la subida falla, lo dice', async () => {
    const { api, user, m } = await openEditor();
    api.on('POST', '/api/v1/media', { detail: 'La imagen pesa más de 5 MB.' }, 413);
    const input = m
      .getByRole('button', { name: 'Imagen' })
      .closest('div')!
      .parentElement!.querySelector('input[type=file]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    await user.click(m.getByRole('button', { name: 'Imagen' }));
    expect(click).toHaveBeenCalled();

    await user.upload(input, new File(['x'], 'foto.png', { type: 'image/png' }));
    expect(await screen.findByText('La imagen pesa más de 5 MB.')).toBeInTheDocument();

    api.on('POST', '/api/v1/media', { url: 'https://cdn.example/foto.png' });
    await user.upload(input, new File(['x'], 'foto.png', { type: 'image/png' }));
    await waitFor(() =>
      expect(editor().querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/foto.png'),
    );
  });
});
