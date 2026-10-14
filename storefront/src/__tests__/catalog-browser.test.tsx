/**
 * El listado de productos con todos sus filtros: buscar, ordenar, categorías
 * (árbol, buscador, "ver más"), precio, marca, opciones y ficha técnica, y el
 * paginado. Cada acción tiene que terminar en la URL correcta — la URL es el
 * estado del listado (se comparte, se indexa, vuelve con "atrás").
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogBrowser } from '../components/store/CatalogBrowser';
import type { CategoryDto, ProductFacets } from '../lib/catalog';
import { toStoreProducts, type ProductDto } from '../lib/catalog';
import { defaultTheme } from '../lib/theme';
import { fixture, mockApi } from '../test/api';
import { nav } from '../test/next';
import { settle, watchCrashes } from '../test/explore';
import { renderInStore } from '../test/store';

const products = toStoreProducts([fixture<ProductDto>('/api/v1/products/by-slug/x')]);

const cat = (id: string, name: string, parentId: string | null = null, depth = 1): CategoryDto => ({
  id,
  name,
  slug: id,
  parentId,
  path: id,
  depth,
});
/** Quince raíces (más de las 8 visibles; más de 15 categorías: con buscador), una con hijas y nieta. */
const CATEGORIES = [
  cat('fitness', 'Fitness'),
  cat('pesas', 'Pesas', 'fitness', 2),
  cat('rusas', 'Pesas rusas', 'pesas', 3),
  ...Array.from({ length: 14 }, (_, i) => cat(`raiz-${i}`, `Rubro ${i}`)),
];
const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix} ${i}`);

const FACETS: ProductFacets = {
  brands: many('Marca', 16), // más de 15: con buscador
  options: [
    { name: 'Color', values: ['Rojo', 'Azul'] },
    { name: 'Talle', values: many('T', 16) },
  ],
  priceMin: 2_500_000,
  priceMax: 12_500_050,
  specs: [{ definitionId: 'def-motor', key: 'motor', name: 'Motor', unit: 'cc', values: ['110', '150'] }],
};

const CURRENT = {
  q: '',
  sort: 'newest',
  category: '',
  brand: '',
  options: [],
  specs: [],
  priceMin: '',
  priceMax: '',
};

type Props = Partial<Parameters<typeof CatalogBrowser>[0]>;

async function show(props: Props = {}, url = '/productos') {
  nav.at(url);
  const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
  renderInStore(
    <CatalogBrowser
      products={products}
      total={60}
      page={1}
      totalPages={1}
      categories={CATEGORIES}
      facets={FACETS}
      productList={defaultTheme.productList}
      current={CURRENT}
      {...props}
    />,
  );
  await settle(1);
  return user;
}

/** El destino de un link del listado, ya parseado. */
const target = (link: HTMLElement) => {
  const [path, query = ''] = link.getAttribute('href')!.split('?');
  return { path, params: new URLSearchParams(query) };
};

/** La última URL a la que navegó el listado, ya parseada. */
const pushed = () => {
  const url = nav.router.push.mock.calls.at(-1)?.[0] as string;
  const [path, query = ''] = url.split('?');
  return { path, params: new URLSearchParams(query) };
};

let crashes: () => unknown[][];
beforeEach(() => {
  mockApi();
  crashes = watchCrashes();
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

describe('listado: buscar y ordenar', () => {
  it('busca sin perder los demás parámetros y vuelve a la página 1', async () => {
    const user = await show({}, '/productos?sort=name&page=3');
    await user.type(screen.getByPlaceholderText('Buscar productos'), '  mancuerna ');
    await user.click(screen.getAllByRole('button', { name: 'Buscar' })[0]!);
    const { path, params } = pushed();
    expect(path).toBe('/productos');
    expect(params.get('q')).toBe('mancuerna');
    expect(params.get('sort')).toBe('name');
    expect(params.has('page')).toBe(false);
  });

  it('limpiar la búsqueda saca q', async () => {
    const user = await show({ current: { ...CURRENT, q: 'pesa' } }, '/productos?q=pesa');
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(pushed().params.has('q')).toBe(false);
  });

  it('ordena con el desplegable; el orden por defecto no ensucia la URL', async () => {
    const user = await show();
    await user.click(screen.getByRole('button', { name: /Más nuevos/ }));
    await user.click(screen.getByRole('button', { name: 'Mayor precio' }));
    expect(pushed().params.get('sort')).toBe('price_desc');

    await user.click(screen.getByRole('button', { name: /Más nuevos/ }));
    await user.click(screen.getByRole('button', { name: 'Más vendidos' }));
    expect(pushed().params.get('sort')).toBe('best_sellers');

    await user.click(screen.getByRole('button', { name: /Más nuevos/ }));
    await user.click(screen.getAllByRole('button', { name: /Más nuevos/ }).at(-1)!);
    expect(pushed().params.has('sort')).toBe(false);

    // Se cierra al tocar afuera.
    await user.click(screen.getByRole('button', { name: /Más nuevos/ }));
    expect(screen.getByRole('button', { name: 'Menor precio' })).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole('button', { name: 'Menor precio' })).not.toBeInTheDocument();
  });
});

describe('listado: filtros', () => {
  it('categorías: árbol, ver más, buscador y "Todas", como links de verdad', async () => {
    const user = await show({}, '/productos?sort=name&page=3');
    expect(screen.queryByRole('link', { name: 'Rubro 8' })).not.toBeInTheDocument(); // más de 8 raíces
    await user.click(screen.getByRole('button', { name: 'Ver 7 más' }));
    expect(screen.getByRole('link', { name: 'Rubro 8' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Ver menos' })[0]!);

    await user.click(screen.getAllByRole('button', { name: 'Expandir' })[0]!);
    await user.click(screen.getAllByRole('button', { name: 'Expandir' })[0]!);
    // Elegir una categoría vuelve a la página 1 y mantiene el orden.
    const rusas = target(screen.getByRole('link', { name: 'Pesas rusas' }));
    expect(rusas.path).toBe('/productos');
    expect(Object.fromEntries(rusas.params)).toEqual({ sort: 'name', category: 'rusas' });
    await user.click(screen.getAllByRole('button', { name: 'Contraer' })[0]!);
    expect(screen.queryByRole('link', { name: 'Pesas rusas' })).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Buscar categoría'), 'rubro 3');
    expect(target(screen.getByRole('link', { name: 'Rubro 3' })).params.get('category')).toBe('raiz-3');
    await user.clear(screen.getByPlaceholderText('Buscar categoría'));
    await user.type(screen.getByPlaceholderText('Buscar categoría'), 'zzz');
    expect(screen.getAllByText('Sin coincidencias.').length).toBeGreaterThan(0);

    expect(target(screen.getByRole('link', { name: 'Todas' })).params.has('category')).toBe(false);
    await user.click(screen.getByRole('button', { name: /^Categorías/ })); // abre/cierra en el celular
  });

  it('todas las categorías van en el HTML, también las colapsadas (Google sigue los links)', async () => {
    await show();
    const hrefs = [...document.querySelectorAll('aside a[href*="category="]')].map((a) =>
      new URLSearchParams(a.getAttribute('href')!.split('?')[1]).get('category'),
    );
    expect(hrefs).toEqual(expect.arrayContaining(['fitness', 'pesas', 'rusas', 'raiz-13']));
  });

  it('el link lleva la ruta de la categoría, con la barra legible', async () => {
    await show({
      categories: [
        { id: 'c1', name: 'Remeras', slug: 'remeras', parentId: null, path: 'ropa/remeras', depth: 1 },
      ],
    });
    expect(screen.getByRole('link', { name: 'Remeras' })).toHaveAttribute(
      'href',
      '/productos?category=ropa/remeras',
    );
  });

  it('la categoría activa abre su rama y se ve en el título', async () => {
    await show({ current: { ...CURRENT, category: 'rusas' } });
    expect(screen.getByRole('link', { name: 'Pesas rusas' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText(': Pesas rusas')).toBeInTheDocument();
  });

  it('precio: solo dígitos, en pesos, y vacío no filtra', async () => {
    const user = await show();
    expect(screen.getByLabelText('Precio desde')).toHaveAttribute('placeholder', '25000');
    expect(screen.getByLabelText('Precio hasta')).toHaveAttribute('placeholder', '125001');
    await user.type(screen.getByLabelText('Precio desde'), '1.000');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(pushed().params.get('priceMin')).toBe('1000');
    expect(pushed().params.has('priceMax')).toBe(false);
  });

  it('marca: una a la vez, se destilda; con muchas hay buscador', async () => {
    const user = await show();
    // La marca va antes que las opciones: su "ver más" es el primero de 8.
    await user.click(screen.getAllByRole('button', { name: 'Ver 8 más' })[0]!);
    await user.click(screen.getByRole('button', { name: 'Marca 12' }));
    expect(pushed().params.get('brand')).toBe('Marca 12');
    await user.type(screen.getByPlaceholderText('Buscar marca'), 'nada');
    expect(screen.getAllByText('Sin coincidencias.').length).toBeGreaterThan(0);
  });

  it('marca elegida: tocarla de nuevo la saca', async () => {
    const user = await show({ current: { ...CURRENT, brand: 'Marca 1' } });
    await user.click(screen.getByRole('button', { name: 'Marca 1' }));
    expect(pushed().params.has('brand')).toBe(false);
  });

  it('opciones y ficha técnica suman valores en la URL y se sacan de a uno', async () => {
    const user = await show(
      { current: { ...CURRENT, options: ['Rojo'], specs: ['def-motor:110'] } },
      '/productos?option=Rojo&spec=def-motor:110&page=2',
    );
    expect(screen.getByRole('button', { name: 'Rojo' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Azul' }));
    expect(pushed().params.getAll('option')).toEqual(['Rojo', 'Azul']);
    expect(pushed().params.has('page')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Rojo' }));
    expect(pushed().params.getAll('option')).toEqual([]);

    await user.click(screen.getByRole('button', { name: /150/ }));
    expect(pushed().params.getAll('spec')).toEqual(['def-motor:110', 'def-motor:150']);
    await user.click(screen.getByRole('button', { name: /110/ }));
    expect(pushed().params.getAll('spec')).toEqual([]);

    await user.type(screen.getByPlaceholderText('Buscar talle'), 'T 1');
    expect(screen.getByRole('button', { name: 'T 15' })).toBeInTheDocument();
  });

  it('"Limpiar filtros" saca todos los filtros pero no la búsqueda ni el orden', async () => {
    const user = await show(
      { current: { ...CURRENT, brand: 'Marca 1', priceMin: '10' } },
      '/productos?q=pesa&sort=name&brand=Marca%201&option=Rojo&spec=x:y&priceMin=10&priceMax=20&page=2',
    );
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(Object.fromEntries(pushed().params)).toEqual({ q: 'pesa', sort: 'name' });
    expect(screen.getByLabelText('Precio desde')).toHaveValue('');
  });

  it('"Solo ofertas" aparece si hay ofertas, prende el filtro y se apaga desde ahí o con "Limpiar filtros"', async () => {
    const user = await show({ facets: { ...FACETS, onSale: 3 } }, '/productos?sort=name&page=2');
    const toggle = screen.getByRole('switch', { name: /Solo ofertas/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle).toHaveTextContent('(3)');
    await user.click(toggle);
    expect(Object.fromEntries(pushed().params)).toEqual({ sort: 'name', onSale: '1' });
  });

  it('con el filtro prendido se ve marcado aunque ya no queden ofertas, y se puede sacar', async () => {
    const user = await show(
      { current: { ...CURRENT, onSale: true }, facets: { ...FACETS, onSale: 0 } },
      '/productos?onSale=1&brand=Marca%201',
    );
    const toggle = screen.getByRole('switch', { name: /Solo ofertas/ });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.click(toggle);
    expect(Object.fromEntries(pushed().params)).toEqual({ brand: 'Marca 1' });
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(pushed().params.has('onSale')).toBe(false);
  });

  it('sin ofertas (o una respuesta vieja sin el conteo) no ofrece el filtro', async () => {
    await show();
    expect(screen.queryByRole('switch', { name: /Solo ofertas/ })).not.toBeInTheDocument();
  });

  it('el comercio puede apagar cada filtro; las facetas viejas sin specs no rompen', async () => {
    await show({
      productList: {
        ...defaultTheme.productList,
        filterCategories: false,
        filterPrice: false,
        filterBrand: false,
        filterOptions: false,
      },
      facets: { brands: ['X'], options: [], priceMin: null, priceMax: null },
    });
    expect(screen.queryByText('Precio')).not.toBeInTheDocument();
    expect(screen.queryByText('Marca')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Todas' })).not.toBeInTheDocument();
  });
});

describe('listado: resultados y paginado', () => {
  it('sin resultados ofrece ver todo y oculta los filtros', async () => {
    await show({ products: [], total: 0 });
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Buscar productos')).not.toBeInTheDocument();
  });

  it('pagina con links: anterior, siguiente y números (con saltos)', async () => {
    await show({ page: 5, totalPages: 10 }, '/productos?q=x&page=5');
    const pager = screen.getByRole('navigation', { name: 'Páginas' });
    expect(within(pager).getAllByText('…').length).toBeGreaterThan(0);
    const prev = within(pager).getByRole('link', { name: 'Página anterior' });
    expect(prev).toHaveAttribute('rel', 'prev');
    expect(target(prev).params.get('page')).toBe('4');
    expect(target(within(pager).getByRole('link', { name: 'Página siguiente' })).params.get('page')).toBe(
      '6',
    );
    const last = target(within(pager).getByRole('link', { name: '10' }));
    expect(last.params.get('page')).toBe('10');
    expect(last.params.get('q')).toBe('x');
    expect(within(pager).getByRole('link', { name: '5' })).toHaveAttribute('aria-current', 'page');
  });

  it('la página 1 no lleva ?page= (es la misma URL que el listado)', async () => {
    await show({ page: 2, totalPages: 3 }, '/productos?category=pesas&page=2');
    const first = target(screen.getByRole('link', { name: '1' }));
    expect(Object.fromEntries(first.params)).toEqual({ category: 'pesas' });
  });

  it('en la primera y la última página las flechas no avanzan', async () => {
    await show({ page: 1, totalPages: 2 });
    expect(screen.getByRole('link', { name: 'Página anterior' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: 'Página anterior' })).not.toHaveAttribute('href');
  });
});

describe('listado: grilla', () => {
  const grid = () =>
    screen.getAllByRole('link', { name: new RegExp(products[0]!.name) })[0]!.closest('.grid')!;

  it('en el celular, 2 columnas por defecto', async () => {
    await show();
    expect(grid()).toHaveClass('grid-cols-2');
  });

  it('o 1 si el comercio lo eligió', async () => {
    await show({ productList: { ...defaultTheme.productList, columns: 3, mobileColumns: 1 } });
    expect(grid()).toHaveClass('grid-cols-1', 'sm:grid-cols-3');
  });

  it('la página activa usa los colores de marca pero no el estilo de botón', async () => {
    await show({ page: 2, totalPages: 3 });
    expect(screen.getByRole('link', { name: '2' })).toHaveAttribute('data-tf-plain');
  });
});
