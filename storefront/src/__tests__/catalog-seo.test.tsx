/**
 * Las categorías para Google: cada una es su propio listado (título, h1 y
 * URL canónica con la categoría), los links a ellas están en el HTML que
 * manda el servidor (el menú del encabezado ya no las pide después de
 * cargar) y los links viejos con el id siguen funcionando.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductsPage, { generateMetadata } from '../app/productos/page';
import { CategoryMenu, StoreCategoriesProvider } from '../components/store/CategoryMenu';
import { StoreCategories } from '../components/store/StoreCategories';
import { categoryHref, findCategory } from '../lib/category-url';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderPage } from '../test/server';
import { StoreProviders } from '../test/store';

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
}
const musculacion = fixture<{ items: Category[] }>('/api/v1/categories').items[0]!;

let api: MockApi;
beforeEach(() => {
  api = mockApi();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const meta = (query: Record<string, string>) => generateMetadata({ searchParams: Promise.resolve(query) });
const BASE = 'http://seed.localhost:3000';

describe('el listado de una categoría', () => {
  it('se titula con la categoría y su canónica la lleva (por la ruta, legible)', async () => {
    const m = await meta({ category: musculacion.path });
    expect(m.title).toBe('Musculación');
    expect(m.description).toMatch(/^Musculación en /);
    expect(m.alternates?.canonical).toBe(`${BASE}/productos?category=${musculacion.path}`);
  });

  it('un link viejo con el id lleva a la misma canónica', async () => {
    expect((await meta({ category: musculacion.id })).alternates?.canonical).toBe(
      `${BASE}/productos?category=${musculacion.path}`,
    );
  });

  it('la página 2 es su propia canónica; el orden y la búsqueda no entran', async () => {
    const m = await meta({ category: musculacion.path, page: '2', sort: 'price_asc', q: 'barra' });
    expect(m.alternates?.canonical).toBe(`${BASE}/productos?category=${musculacion.path}&page=2`);
    expect((await meta({ category: musculacion.path, page: '2', sort: 'price_asc' })).title).toBe(
      'Musculación (página 2)',
    );
  });

  it('una búsqueda se titula con lo buscado y no se indexa (sus links sí se siguen)', async () => {
    const m = await meta({ q: 'kettlebell' });
    expect(m.title).toBe('Resultados para «kettlebell»');
    expect(m.robots).toEqual({ index: false, follow: true });
    await renderPage(ProductsPage, '/productos?q=kettlebell');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Resultados para «kettlebell»' }),
    ).toBeInTheDocument();
    expect(document.querySelector('script[type="application/ld+json"]')?.textContent ?? '').not.toContain(
      'ItemList',
    );
  });

  it('el listado lleva su ItemList para Google, con la URL de cada producto', async () => {
    await renderPage(ProductsPage, `/productos?category=${musculacion.path}`);
    const lists = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(
        (s) =>
          JSON.parse(s.textContent ?? '{}') as {
            '@type'?: string;
            itemListElement?: { url: string; position: number }[];
          },
      )
      .filter((d) => d['@type'] === 'ItemList');
    expect(lists).toHaveLength(1);
    expect(lists[0]!.itemListElement![0]).toMatchObject({
      position: 1,
      url: expect.stringMatching(/\/productos\//),
    });
  });

  it('"Solo con stock" llega a la API', async () => {
    await renderPage(ProductsPage, '/productos?inStock=1');
    const searched = api.calls.find((c) => c.path.startsWith('/api/v1/products/search'))!;
    expect(new URLSearchParams(searched.path.split('?')[1]).get('inStock')).toBe('true');
  });

  it('sin categoría (o una que no existe), el listado entero', async () => {
    expect(await meta({})).toMatchObject({
      title: 'Productos',
      alternates: { canonical: `${BASE}/productos` },
    });
    expect((await meta({ category: 'no-existe' })).alternates?.canonical).toBe(`${BASE}/productos`);
  });

  it('el h1 es la categoría y la API filtra por su id', async () => {
    await renderPage(ProductsPage, `/productos?category=${musculacion.path}`);
    expect(screen.getByRole('heading', { level: 1, name: 'Musculación' })).toBeInTheDocument();
    const searched = api.calls.find((c) => c.path.startsWith('/api/v1/products/search'))!;
    expect(new URLSearchParams(searched.path.split('?')[1]).get('category')).toBe(musculacion.id);
  });

  it('el "Ver todos" de ofertas: se titula Ofertas, la API filtra, y la canónica es la del listado', async () => {
    const m = await meta({ onSale: '1' });
    expect(m.title).toBe('Ofertas');
    expect(m.alternates?.canonical).toBe(`${BASE}/productos`);
    expect((await meta({ onSale: '1', category: musculacion.path })).title).toBe('Musculación en oferta');

    await renderPage(ProductsPage, '/productos?onSale=1&sort=best_sellers');
    expect(screen.getByRole('heading', { level: 1, name: 'Ofertas' })).toBeInTheDocument();
    const searched = api.calls.filter((c) => c.path.startsWith('/api/v1/products/search')).at(-1)!;
    const params = new URLSearchParams(searched.path.split('?')[1]);
    expect(params.get('onSale')).toBe('true');
    expect(params.get('sort')).toBe('best_sellers');

    // Cualquier otro valor no filtra (el parámetro no vuelve a la API).
    await renderPage(ProductsPage, '/productos?onSale=no');
    const last = api.calls.filter((c) => c.path.startsWith('/api/v1/products/search')).at(-1)!;
    expect(new URLSearchParams(last.path.split('?')[1]).has('onSale')).toBe(false);
  });

  it('una categoría que no está en el árbol: si es un id pasa tal cual; si no, no filtra', async () => {
    const id = '0f0f0f0f-0000-4000-8000-000000000000';
    await renderPage(ProductsPage, `/productos?category=${id}`);
    const searches = () => api.calls.filter((c) => c.path.startsWith('/api/v1/products/search'));
    expect(new URLSearchParams(searches().at(-1)!.path.split('?')[1]).get('category')).toBe(id);
    await renderPage(ProductsPage, '/productos?category=cualquiera');
    expect(new URLSearchParams(searches().at(-1)!.path.split('?')[1]).has('category')).toBe(false);
  });
});

describe('el menú de categorías del encabezado', () => {
  const cats: Category[] = [
    { id: 'c1', name: 'Ropa', parentId: null, path: 'ropa' },
    { id: 'c2', name: 'Remeras', parentId: 'c1', path: 'ropa/remeras' },
  ];

  it('con las categorías del servidor, los links están en el HTML sin abrir nada ni pedir a la API', () => {
    const { container } = render(
      <StoreProviders>
        <StoreCategoriesProvider categories={cats}>
          <CategoryMenu />
        </StoreCategoriesProvider>
      </StoreProviders>,
    );
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/productos?category=ropa', '/productos?category=ropa/remeras']);
    expect(api.calls.some((c) => c.path.startsWith('/api/v1/categories'))).toBe(false);
  });

  it('el layout las trae en el servidor; sin tienda, no provee nada', async () => {
    const tree = (await StoreCategories({ children: 'hola' })) as React.ReactElement<{
      categories: Category[];
    }>;
    expect(tree.props.categories[0]).toEqual({
      id: musculacion.id,
      name: musculacion.name,
      parentId: null,
      path: musculacion.path,
    });

    api.on('GET', '/api/v1/tenants/resolve', {}, 404);
    const bare = (await StoreCategories({ children: 'hola' })) as React.ReactElement<{
      categories?: unknown;
    }>;
    expect(bare.props.categories).toBeUndefined();
  });
});

describe('category-url', () => {
  it('la ruta si está, el id si no', () => {
    expect(categoryHref({ id: 'c1', path: 'a/b c' })).toBe('/productos?category=a/b+c');
    expect(categoryHref({ id: 'c1' })).toBe('/productos?category=c1');
  });

  it('encuentra por id o por ruta, sin importar mayúsculas', () => {
    const list = [{ id: 'AbC', path: 'ropa/remeras' }];
    expect(findCategory(list, 'abc')).toBe(list[0]);
    expect(findCategory(list, 'Ropa/Remeras ')).toBe(list[0]);
    expect(findCategory(list, '')).toBeUndefined();
    expect(findCategory(list, undefined)).toBeUndefined();
  });
});
