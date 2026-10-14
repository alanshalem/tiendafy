/**
 * Lo que ayuda al comprador a encontrar algo: el buscador predictivo del
 * encabezado (combobox con teclado), los filtros del listado en el celular
 * (panel desde abajo), "Solo con stock", la búsqueda sin resultados, los
 * vistos recientemente, las sugerencias del carrito y las fotos de la card
 * que se pasan deslizando.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PredictiveSearch } from '../components/store/PredictiveSearch';
import { CatalogBrowser } from '../components/store/CatalogBrowser';
import { RecentlyViewed } from '../components/store/RecentlyViewed';
import { ProductCard, type StoreProduct } from '../components/store/ProductCard';
import { StorefrontView } from '../components/store/StorefrontView';
import { useCart } from '../components/store/cart';
import { toStoreProducts, type ProductDto } from '../lib/catalog';
import { readRecentlyViewed, recordProductView, RECENTLY_VIEWED_MAX } from '../lib/recently-viewed';
import { facetLabel } from '../lib/facet-label';
import { defaultTheme, mergeTheme } from '../lib/theme';
import { fixture, fixtureTenantId, mockApi, type MockApi } from '../test/api';
import { nav } from '../test/next';
import { settle, watchCrashes } from '../test/explore';
import { renderInStore } from '../test/store';
import { render } from '@testing-library/react';
import ProductDetailPage from '../app/productos/[slug]/page';
import { renderPage } from '../test/server';

const dto = fixture<ProductDto>('/api/v1/products/by-slug/x');
const product = toStoreProducts([dto])[0]!;
const kettlebell: ProductDto = {
  ...dto,
  id: 'k-1',
  name: 'Kettlebell 12 kg',
  slug: 'kettlebell-12',
  stock: 5,
};
const agotada: ProductDto = {
  ...dto,
  id: 'k-2',
  name: 'Kettlebell agotada',
  slug: 'kettlebell-agotada',
  stock: 0,
};

let api: MockApi;
let crashes: () => unknown[][];
beforeEach(() => {
  api = mockApi();
  crashes = watchCrashes();
  localStorage.clear();
  nav.reset();
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

const calls = (prefix: string) => api.calls.filter((c) => c.path.startsWith(prefix));

describe('buscador predictivo', () => {
  beforeEach(() => {
    api.on('GET', '/api/v1/products/suggest', {
      items: [kettlebell, agotada],
      total: 7,
      categories: [
        {
          id: 'c-1',
          name: 'Pesas rusas',
          slug: 'pesas-rusas',
          parentId: null,
          path: 'pesas-rusas',
          depth: 1,
        },
      ],
    });
    api.on('GET', '/api/v1/search/popular', { items: [{ term: 'mancuerna' }, { term: 'soga' }] });
  });

  it('mientras se escribe muestra productos, categorías y "Ver los N resultados", con una sola consulta', async () => {
    const user = userEvent.setup({ delay: null });
    renderInStore(<PredictiveSearch />);
    const box = screen.getByRole('combobox', { name: 'Buscar' });
    await user.type(box, 'kettlebell');

    const list = await screen.findByRole('listbox', { name: 'Sugerencias para «kettlebell»' });
    expect(box).toHaveAttribute('aria-expanded', 'true');
    expect(within(list).getByRole('option', { name: /Pesas rusas/ })).toBeInTheDocument();
    expect(within(list).getByRole('option', { name: /Kettlebell 12 kg/ })).toBeInTheDocument();
    expect(within(list).getByRole('option', { name: /Kettlebell agotada.*Sin stock/ })).toBeInTheDocument();
    expect(
      within(list).getByRole('option', { name: 'Ver los 7 resultados para «kettlebell»' }),
    ).toBeInTheDocument();
    // Una consulta por lo escrito, no una por letra (espera a que se deje de tipear).
    expect(calls('/api/v1/products/suggest')).toHaveLength(1);
    expect(calls('/api/v1/products/suggest')[0]!.path).toContain('q=kettlebell');
  });

  it('con el teclado: flechas para recorrer, Enter para ir, Escape para cerrar y después borrar', async () => {
    const user = userEvent.setup({ delay: null });
    renderInStore(<PredictiveSearch />);
    const box = screen.getByRole('combobox', { name: 'Buscar' });
    await user.type(box, 'kettle');
    await screen.findByRole('listbox');

    await user.keyboard('{ArrowDown}{ArrowDown}');
    const active = document.getElementById(box.getAttribute('aria-activedescendant')!)!;
    expect(active).toHaveAttribute('aria-selected', 'true');
    expect(active).toHaveTextContent('Kettlebell 12 kg');
    await user.keyboard('{Enter}');
    expect(nav.router.push).toHaveBeenLastCalledWith('/productos/kettlebell-12');

    await user.click(box);
    await user.keyboard('{ArrowUp}'); // de abajo: "Ver los resultados"
    await user.keyboard('{Enter}');
    expect(nav.router.push).toHaveBeenLastCalledWith('/productos?q=kettle');

    await user.click(box);
    expect(box).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(box).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{Escape}');
    expect(box).toHaveValue('');
  });

  it('con la caja vacía ofrece las búsquedas populares; tocar una busca eso', async () => {
    const user = userEvent.setup({ delay: null });
    renderInStore(<PredictiveSearch />);
    await user.click(screen.getByRole('combobox', { name: 'Buscar' }));
    const list = await screen.findByRole('listbox', { name: 'Búsquedas populares' });
    await user.click(within(list).getByRole('option', { name: 'mancuerna' }));
    expect(nav.router.push).toHaveBeenLastCalledWith('/productos?q=mancuerna');
  });

  it('una letra no consulta nada', async () => {
    const user = userEvent.setup({ delay: null });
    renderInStore(<PredictiveSearch />);
    await user.type(screen.getByRole('combobox', { name: 'Buscar' }), 'k');
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(calls('/api/v1/products/suggest')).toHaveLength(0);
  });
});

const CURRENT = {
  q: '',
  sort: '',
  category: '',
  brand: '',
  options: [],
  specs: [],
  priceMin: '',
  priceMax: '',
};
const FACETS = {
  brands: ['NIKE', 'adidas'],
  options: [{ name: 'Color', values: ['AMARILLO', 'Azul', 'XL'] }],
  priceMin: 2_500_000,
  priceMax: 1_256_292_200,
  specs: [],
  inStock: 12,
};

function catalog(props: Partial<Parameters<typeof CatalogBrowser>[0]> = {}) {
  return (
    <CatalogBrowser
      products={[product]}
      total={30}
      page={1}
      totalPages={2}
      categories={[]}
      facets={FACETS}
      productList={defaultTheme.productList}
      current={CURRENT}
      {...props}
    />
  );
}

describe('listado en el celular y filtros', () => {
  it('"Filtrar" abre los filtros como diálogo, con cuántos hay puestos, y "Ver N productos" lo cierra', async () => {
    nav.at('/productos?brand=NIKE&inStock=1');
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderInStore(catalog({ current: { ...CURRENT, brand: 'NIKE', inStock: true } }));

    const open = screen.getByRole('button', { name: 'Filtrar 2 activos' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    await user.click(open);
    const dialog = screen.getByRole('dialog', { name: 'Filtros' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true); // el foco queda adentro
    expect(document.documentElement.style.overflow).toBe('hidden');

    await user.click(within(dialog).getByRole('button', { name: 'Ver 30 productos' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.documentElement.style.overflow).toBe('');

    await user.click(open);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Solo con stock" se prende desde el costado y lo saca "Limpiar filtros"', async () => {
    nav.at('/productos?sort=name');
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderInStore(catalog());
    const toggle = screen.getByRole('switch', { name: /Solo con stock/ });
    expect(toggle).toHaveTextContent('(12)');
    await user.click(toggle);
    expect(nav.router.push).toHaveBeenLastCalledWith('/productos?sort=name&inStock=1');
  });

  it('precios en pesos con miles, valores con mayúscula pareja y el filtro con el valor exacto', async () => {
    nav.at('/productos');
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    renderInStore(catalog());
    expect(screen.getByLabelText('Precio hasta')).toHaveAttribute('placeholder', '12.562.922');
    expect(screen.getByRole('button', { name: 'Nike' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'XL' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Amarillo' }));
    expect(nav.router.push).toHaveBeenLastCalledWith('/productos?option=AMARILLO');
  });

  it('los títulos de los filtros cuelgan de "Filtros" (h2), no del h1', () => {
    nav.at('/productos');
    renderInStore(catalog());
    expect(screen.getByRole('heading', { level: 2, name: 'Filtros' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Precio' })).toBeInTheDocument();
  });

  it('una búsqueda sin resultados ayuda: otra búsqueda, ideas, populares y contacto; y se registra', async () => {
    api.on('GET', '/api/v1/search/popular', { items: [{ term: 'mancuerna' }, { term: 'kettlebel' }] });
    nav.at('/productos?q=kettlebel');
    renderInStore(
      catalog({
        products: [],
        total: 0,
        totalPages: 0,
        current: { ...CURRENT, q: 'kettlebel' },
        whatsappPhone: '+54 9 11 5555-0000',
      }),
    );
    await settle(3);
    expect(screen.getByRole('heading', { name: 'No encontramos nada para «kettlebel»' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Buscar' })).toHaveValue('kettlebel');
    expect(screen.getByText(/Revisá cómo está escrito/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'mancuerna' })).toHaveAttribute('href', '/productos?q=mancuerna');
    expect(screen.queryByRole('link', { name: 'kettlebel' })).not.toBeInTheDocument(); // la que falló, no
    expect(screen.getByRole('link', { name: /Preguntar por WhatsApp/ })).toHaveAttribute(
      'href',
      expect.stringContaining('https://wa.me/5491155550000?text='),
    );
    const log = calls('/api/v1/search/log');
    expect(log).toHaveLength(1);
    expect(log[0]!.body).toEqual({ q: 'kettlebel' });
  });
});

describe('vistos recientemente', () => {
  it('recuerda los últimos, sin repetir, con tope', () => {
    for (let i = 0; i < RECENTLY_VIEWED_MAX + 3; i++) recordProductView('t', `p${i}`);
    recordProductView('t', 'p5');
    const ids = readRecentlyViewed('t');
    expect(ids).toHaveLength(RECENTLY_VIEWED_MAX);
    expect(ids[0]).toBe('p5');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('la ficha cuenta la vista y muestra los otros, pedidos de nuevo por id', async () => {
    recordProductView(fixtureTenantId, 'otro-1');
    api.on('GET', '/api/v1/products/section', { items: [{ ...dto, id: 'otro-1', name: 'Soga de saltar' }] });
    renderInStore(<RecentlyViewed recordId="actual" />);
    expect(await screen.findByRole('heading', { name: 'Vistos recientemente' })).toBeInTheDocument();
    expect(screen.getAllByText('Soga de saltar').length).toBeGreaterThan(0);
    expect(readRecentlyViewed(fixtureTenantId)).toEqual(['actual', 'otro-1']);
    const asked = calls('/api/v1/products/section')[0]!.path;
    expect(asked).toContain('kind=manual');
    expect(decodeURIComponent(asked)).toContain('ids=otro-1');
    expect(decodeURIComponent(asked)).not.toContain('actual');
  });

  it('sin nada visto no ocupa lugar ni consulta', async () => {
    const { container } = renderInStore(<RecentlyViewed />);
    await settle(1);
    expect(container).toBeEmptyDOMElement();
    expect(calls('/api/v1/products/section')).toHaveLength(0);
  });
});

describe('sugerencias del carrito', () => {
  function OpenCart({ variantId }: { variantId: string }) {
    const { add, setOpen } = useCart();
    return (
      <button
        type="button"
        onClick={() => {
          add({
            variantId,
            productName: 'Mancuerna',
            variantLabel: 'Única',
            priceAmount: 100,
            currency: 'ARS',
            image: null,
          });
          setOpen(true);
        }}
      >
        abrir
      </button>
    );
  }

  it('salen de lo que tiene el carrito (la API), no de los primeros productos de la tienda', async () => {
    api.on('GET', '/api/v1/products/cart-suggestions', {
      items: [{ ...dto, id: 's-1', name: 'Colchoneta sugerida' }],
    });
    const theme = mergeTheme({ ...defaultTheme, cart: { ...defaultTheme.cart, showSuggested: true } });
    nav.at('/');
    const user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    render(
      <StorefrontView tenantId={fixtureTenantId} tenantName="Tienda" theme={theme} products={[product]}>
        <OpenCart variantId="v-carrito" />
      </StorefrontView>,
    );
    await user.click(screen.getByRole('button', { name: 'abrir' }));
    await waitFor(() => expect(screen.getAllByText('Colchoneta sugerida').length).toBeGreaterThan(0));
    const asked = calls('/api/v1/products/cart-suggestions')[0]!.path;
    expect(asked).toContain('variants=v-carrito');
    expect(asked).toContain('limit=3');
  });
});

describe('la ficha', () => {
  it('se comparte como producto (og:type y precio) y cuenta para "vistos recientemente"', async () => {
    await renderPage(ProductDetailPage, `/productos/${dto.slug}`, { slug: dto.slug });
    await settle(2);
    expect(document.querySelector('meta[property="og:type"]')).toHaveAttribute('content', 'product');
    const amount = Math.min(...dto.variants.map((v) => v.price.amount)) / 100;
    expect(document.querySelector('meta[property="product:price:amount"]')).toHaveAttribute(
      'content',
      amount.toFixed(2),
    );
    expect(readRecentlyViewed(fixtureTenantId)).toEqual([dto.id]);
  });
});

describe('card en pantallas táctiles', () => {
  const withPhotos: StoreProduct = {
    ...product,
    images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
  };

  it('las flechas miden 40 px y se esconden sin mouse; las fotos se pasan deslizando', () => {
    renderInStore(<ProductCard product={withPhotos} list={defaultTheme.productList} />);
    const next = screen.getByRole('button', { name: 'Imagen siguiente' });
    expect(next).toHaveClass('h-10', 'w-10', '[@media(hover:none)]:hidden');

    const frame = next.closest('a')!;
    const img = () => frame.querySelector('img')!.getAttribute('src') ?? '';
    const first = img();
    fireEvent.touchStart(frame, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(frame, { changedTouches: [{ clientX: 100, clientY: 105 }] });
    expect(img()).not.toBe(first);
    // Un scroll vertical no cambia la foto.
    const second = img();
    fireEvent.touchStart(frame, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(frame, { changedTouches: [{ clientX: 60, clientY: 300 }] });
    expect(img()).toBe(second);
  });
});

describe('cómo se muestra un valor de filtro', () => {
  it.each([
    ['AMARILLO', 'Amarillo'],
    ['azul marino', 'Azul Marino'],
    ['XL', 'XL'],
    ['LED BLANCO', 'LED Blanco'],
    ['iPhone', 'iPhone'],
    ['ROJO/NEGRO', 'Rojo/Negro'],
    ['110', '110'],
  ])('%s → %s', (raw, shown) => expect(facetLabel(raw)).toBe(shown));
});
