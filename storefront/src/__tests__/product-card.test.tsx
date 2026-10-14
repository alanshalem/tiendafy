/**
 * El botón de compra de la card: agrega solo cuando no hay nada que elegir
 * (una variante, con stock). Antes agregaba siempre la primera variante,
 * aunque estuviera agotada o el producto tuviera talles.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductCard, type StoreProduct } from '../components/store/ProductCard';
import { cartStorageKey } from '../components/store/cart';
import { defaultTheme } from '../lib/theme';
import { fixtureTenantId, mockApi } from '../test/api';
import { watchCrashes } from '../test/explore';
import { renderInStore } from '../test/store';

const PRODUCT: StoreProduct = {
  id: 'p-1',
  name: 'Mate',
  slug: 'mate',
  priceAmount: 10_000_00,
  currency: 'ARS',
  compareAtAmount: null,
  image: null,
  images: [],
  variantId: 'v-1',
  variantLabel: 'Única',
  variantCount: 1,
  stock: 10,
};

const list = { ...defaultTheme.productList, showBuyButton: true, showStockBadge: false };
const saved = () => JSON.parse(localStorage.getItem(cartStorageKey(fixtureTenantId)) ?? '[]');

let crashes: () => unknown[][];
beforeEach(() => {
  mockApi();
  crashes = watchCrashes();
});
afterEach(() => {
  expect(crashes()).toEqual([]);
  vi.restoreAllMocks();
});

describe('card de producto: agregar al carrito', () => {
  it('con una sola variante y stock (o stock desconocido), agrega esa', async () => {
    renderInStore(<ProductCard product={{ ...PRODUCT, stock: null }} list={list} />);
    await userEvent.click(screen.getByRole('button', { name: 'Agregar al carrito' }));
    expect(saved()).toEqual([expect.objectContaining({ variantId: 'v-1', quantity: 1 })]);
  });

  it('agotado no agrega, aunque el comercio oculte el cartel de "Sin stock"', async () => {
    renderInStore(<ProductCard product={{ ...PRODUCT, stock: 0 }} list={list} />);
    const button = screen.getByRole('button', { name: 'Sin stock' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(saved()).toEqual([]);
  });

  it('con varias variantes lleva a la ficha a elegir, en vez de agregar la primera', () => {
    renderInStore(<ProductCard product={{ ...PRODUCT, variantCount: 3 }} list={list} />);
    expect(screen.queryByRole('button', { name: 'Agregar al carrito' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Elegir opciones' })).toHaveAttribute('href', '/productos/mate');
  });
});
