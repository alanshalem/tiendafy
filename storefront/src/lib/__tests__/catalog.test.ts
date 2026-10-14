import { describe, expect, it } from 'vitest';
import { toStoreProduct, type ProductDto } from '../catalog';
import { readJson, writeJson } from '../storage';

const producto = (over: Partial<ProductDto> = {}): ProductDto => ({
  id: 'p1',
  name: 'Remera',
  slug: 'remera',
  description: null,
  brand: null,
  variants: [
    {
      id: 'v1',
      sku: 'SKU-1',
      optionValues: ['Rojo', 'M'],
      price: { amount: 129900, currency: 'ARS' },
      compareAtPrice: { amount: 159900, currency: 'ARS' },
    },
  ],
  images: [
    { id: 'i1', url: 'https://cdn/img1.jpg', altText: null, position: 0 },
    { id: 'i2', url: 'https://cdn/img2.jpg', altText: null, position: 1 },
  ],
  stock: 7,
  ...over,
});

describe('toStoreProduct', () => {
  it('mapea la primera variante a la card (precio, tachado, label de opciones)', () => {
    const sp = toStoreProduct(producto())!;
    expect(sp.priceAmount).toBe(129900);
    expect(sp.compareAtAmount).toBe(159900);
    expect(sp.variantLabel).toBe('Rojo / M');
    expect(sp.image).toBe('https://cdn/img1.jpg');
    expect(sp.images).toHaveLength(2);
    expect(sp.stock).toBe(7);
    // La card necesita saber si hay algo que elegir antes de agregar.
    expect(sp.variantCount).toBe(1);
    expect(
      toStoreProduct(producto({ variants: [...producto().variants, ...producto().variants] }))!.variantCount,
    ).toBe(2);
  });

  it('sin variantes devuelve null (no se puede vender)', () => {
    expect(toStoreProduct(producto({ variants: [] }))).toBeNull();
  });

  it('variante sin opciones se etiqueta "Única" y sin imagen queda null', () => {
    const sp = toStoreProduct(
      producto({
        images: [],
        variants: [
          {
            id: 'v1',
            sku: 'S',
            optionValues: [],
            price: { amount: 100, currency: 'ARS' },
            compareAtPrice: null,
          },
        ],
      }),
    )!;
    expect(sp.variantLabel).toBe('Única');
    expect(sp.image).toBeNull();
    expect(sp.compareAtAmount).toBeNull();
  });
});

describe('storage (readJson/writeJson)', () => {
  it('en entorno sin window devuelve el fallback y no explota al escribir', () => {
    // vitest corre en node: typeof window === 'undefined'
    expect(readJson('clave', { def: true })).toEqual({ def: true });
    expect(() => writeJson('clave', { a: 1 })).not.toThrow();
  });
});
