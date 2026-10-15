/**
 * Las flechas del carrusel de productos de la portada: se tocan con el dedo
 * (40 px) y no quedan activas donde no hacen nada. Antes "Anterior" estaba
 * activa al abrir el carrusel, en el principio.
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductGrid } from '../components/store/product-grid';
import type { StoreProduct } from '../components/store/ProductCard';
import { defaultTheme } from '../lib/theme';
import { mockApi } from '../test/api';
import { renderInStore } from '../test/store';

const product = (i: number): StoreProduct => ({
  id: `p-${i}`,
  name: `Producto ${i}`,
  slug: `producto-${i}`,
  priceAmount: 1_000_00,
  currency: 'ARS',
  compareAtAmount: null,
  image: null,
  images: [],
  variantId: `v-${i}`,
  variantLabel: 'Única',
  variantCount: 1,
  stock: null,
});

const products = [1, 2, 3, 4].map(product);

/** Le da al carrusel un tamaño y una posición de scroll (jsdom no hace layout). */
function scrollTo(el: HTMLElement, { left, width, total }: { left: number; width: number; total: number }) {
  Object.defineProperty(el, 'scrollLeft', { value: left, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'scrollWidth', { value: total, configurable: true });
}

beforeEach(() => {
  mockApi();
});
afterEach(() => vi.restoreAllMocks());

describe('carrusel de productos', () => {
  it('"Anterior" arranca deshabilitada y "Siguiente" se apaga al llegar al final', () => {
    renderInStore(
      <ProductGrid title="Destacados" products={products} list={defaultTheme.productList} carousel />,
    );
    const prev = screen.getByRole('button', { name: 'Anterior' });
    const next = screen.getByRole('button', { name: 'Siguiente' });
    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();
    expect(prev).toHaveClass('h-10', 'w-10');
    expect(next).toHaveClass('h-10', 'w-10');

    const scroller = screen.getByText('Producto 1').closest('.snap-x') as HTMLElement;
    scrollTo(scroller, { left: 300, width: 600, total: 1200 });
    fireEvent.scroll(scroller);
    expect(prev).toBeEnabled();
    expect(next).toBeEnabled();

    scrollTo(scroller, { left: 600, width: 600, total: 1200 });
    fireEvent.scroll(scroller);
    expect(prev).toBeEnabled();
    expect(next).toBeDisabled();
  });

  it('si todo entra a lo ancho, las dos quedan apagadas desde el principio', () => {
    let measure: () => void = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          measure = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    renderInStore(
      <ProductGrid title="Ofertas" products={products} list={defaultTheme.productList} carousel />,
    );
    const scroller = screen.getByText('Producto 1').closest('.snap-x') as HTMLElement;
    scrollTo(scroller, { left: 0, width: 1200, total: 1200 });
    act(() => measure());
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });
});
