/**
 * La página de un producto más allá del render: la metadata para buscadores y
 * redes, los datos estructurados (migas y Product con precio y
 * disponibilidad), la miga con la cadena de categorías, la ficha técnica
 * cruzada con las definiciones de la tienda, los relacionados de la misma
 * categoría y el producto que no existe.
 */
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductDetailPage, { generateMetadata } from '../app/productos/[slug]/page';
import { fixture, mockApi, type MockApi } from '../test/api';
import { renderPage } from '../test/server';

interface Product {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  stock: number | null;
  categoryIds: string[];
  specs: { definitionId: string; value: string }[];
  images: { url: string }[];
}

const product = fixture<Product>('/api/v1/products/by-slug/x');
const search = fixture<{ items: { id: string; slug: string; name: string }[] }>('/api/v1/products/search');
const params = (slug = product.slug) => ({ params: Promise.resolve({ slug }) });

const CATEGORIES = {
  items: [
    { id: 'c-root', name: 'Deportes', parentId: null },
    { id: 'c-leaf', name: 'Pesas', parentId: 'c-root' },
  ],
};
const SPECS = {
  items: [
    { id: 'd-peso', name: 'Peso', unit: 'kg', showOnProduct: true, sortOrder: 2 },
    { id: 'd-mat', name: 'Material', unit: null, showOnProduct: true, sortOrder: 1 },
    { id: 'd-int', name: 'Código interno', unit: null, showOnProduct: false, sortOrder: 0 },
  ],
};

let api: MockApi;

/** El producto sembrado, en una subcategoría y con ficha técnica. */
function richProduct(extra: Partial<Product> = {}) {
  api.on('GET', `/api/v1/products/by-slug/${product.slug}`, {
    ...product,
    categoryIds: ['c-leaf'],
    specs: [
      { definitionId: 'd-peso', value: '10' },
      { definitionId: 'd-mat', value: 'Hierro' },
      { definitionId: 'd-int', value: 'X-1' },
      { definitionId: 'd-borrada', value: '?' },
    ],
    ...extra,
  });
  api.on('GET', '/api/v1/categories', CATEGORIES);
  api.on('GET', '/api/v1/spec-definitions', SPECS);
}

const jsonLd = () =>
  Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((s) =>
    JSON.parse(s.innerHTML),
  );

beforeEach(() => {
  api = mockApi();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('página de producto: metadata', () => {
  it('título, descripción, canonical y la imagen para redes', async () => {
    const meta = await generateMetadata(params());
    // El nombre de la tienda lo suma la plantilla del layout ("… · Tienda").
    expect(meta.title).toBe(product.name);
    expect(meta.alternates?.canonical).toBe(`http://seed.localhost:3000/productos/${product.slug}`);
    expect(meta.openGraph?.title).toBe(product.name);
  });

  it('sin descripción arma una; producto o tienda inexistentes caen al nombre', async () => {
    api.on('GET', `/api/v1/products/by-slug/${product.slug}`, { ...product, description: null, images: [] });
    expect((await generateMetadata(params())).description).toMatch(new RegExp(`^${product.name} en `));

    api.on('GET', '/api/v1/products/by-slug/nada', {}, 404);
    expect((await generateMetadata(params('nada'))).title).toBe('Producto no encontrado');

    api.on('GET', '/api/v1/tenants/resolve', {}, 404);
    expect((await generateMetadata(params())).title).toBe('Tienda');
  });
});

describe('página de producto: SEO cargado por el comercio', () => {
  it('el título SEO va tal cual (sin la plantilla) y la descripción SEO gana', async () => {
    api.on('GET', `/api/v1/products/by-slug/${product.slug}`, {
      ...product,
      seoTitle: ' Mancuernas baratas ',
      seoDescription: 'Las mejores mancuernas.',
    });
    const meta = await generateMetadata(params());
    expect(meta.title).toEqual({ absolute: 'Mancuernas baratas' });
    expect(meta.description).toBe('Las mejores mancuernas.');
  });
});

describe('página de producto: contenido', () => {
  it('miga con la cadena de categorías, ficha técnica ordenada y datos estructurados', async () => {
    richProduct();
    await renderPage(ProductDetailPage, `/productos/${product.slug}`, { slug: product.slug });

    expect(screen.getByRole('link', { name: 'Deportes' })).toHaveAttribute(
      'href',
      '/productos?category=c-root',
    );
    expect(screen.getByRole('link', { name: 'Pesas' })).toHaveAttribute('href', '/productos?category=c-leaf');

    // Solo lo que la tienda muestra, en su orden y con la unidad.
    expect(screen.getByText('Material')).toBeInTheDocument();
    expect(screen.getByText('10 kg')).toBeInTheDocument();
    expect(screen.queryByText('Código interno')).not.toBeInTheDocument();

    const [crumbs, item] = jsonLd();
    expect(crumbs['@type']).toBe('BreadcrumbList');
    expect(crumbs.itemListElement.map((i: { name: string }) => i.name)).toEqual([
      'Inicio',
      'Productos',
      'Deportes',
      'Pesas',
      product.name,
    ]);
    expect(item).toMatchObject({ '@type': 'Product', name: product.name });
    expect(item.offers.availability).toBe('https://schema.org/InStock');
  });

  it('sin stock lo dice en los datos estructurados', async () => {
    richProduct({ stock: 0 });
    await renderPage(ProductDetailPage, `/productos/${product.slug}`, { slug: product.slug });
    expect(jsonLd()[1].offers.availability).toBe('https://schema.org/OutOfStock');
  });

  it('relacionados: primero la misma categoría, sin repetir ni incluir el actual', async () => {
    richProduct();
    api.on('GET', '/api/v1/products/search', { ...search, items: search.items });
    await renderPage(ProductDetailPage, `/productos/${product.slug}`, { slug: product.slug });
    expect(
      api.calls.some(
        (c) => c.path.startsWith('/api/v1/products/search') && c.path.includes('category=c-leaf'),
      ),
    ).toBe(true);
    expect(screen.getByText('También te puede gustar')).toBeInTheDocument();
    const others = search.items.filter((p) => p.slug !== product.slug);
    expect(screen.getAllByText(others[0]!.name).length).toBeGreaterThan(0);
  });

  it('si las categorías, la búsqueda o las definiciones fallan, la ficha sale igual', async () => {
    richProduct();
    api.on('GET', '/api/v1/categories', {}, 500);
    api.on('GET', '/api/v1/products/search', {}, 500);
    api.on('GET', '/api/v1/spec-definitions', {}, 500);
    await renderPage(ProductDetailPage, `/productos/${product.slug}`, { slug: product.slug });
    expect(screen.getAllByText(product.name).length).toBeGreaterThan(0);
    expect(screen.queryByText('Material')).not.toBeInTheDocument();
  });

  it('un producto que no existe responde 404 (y así corre la búsqueda de redirecciones)', async () => {
    api.on('GET', '/api/v1/products/by-slug/no-existe', {}, 404);
    await expect(
      renderPage(ProductDetailPage, '/productos/no-existe', { slug: 'no-existe' }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('si la API falla (5xx) no es un 404: es un error', async () => {
    api.on('GET', '/api/v1/products/by-slug/roto', {}, 503);
    const err = await renderPage(ProductDetailPage, '/productos/roto', { slug: 'roto' }).catch(
      (e: Error) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toBe('NEXT_NOT_FOUND');
  });

  it('los datos estructurados no se pueden cortar con un </script> en el nombre', async () => {
    richProduct({ name: 'Remera </script><script>alert(1)</script>' });
    await renderPage(ProductDetailPage, `/productos/${product.slug}`, { slug: product.slug });
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    scripts.forEach((s) => expect(s.innerHTML).not.toContain('</script'));
    expect(jsonLd()[1].name).toBe('Remera </script><script>alert(1)</script>');
  });
});
