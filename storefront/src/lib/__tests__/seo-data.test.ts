import { describe, expect, it } from 'vitest';
import { jsonLd } from '../json-ld';
import { productJsonLd, type ProductForJsonLd } from '../product-json-ld';
import { describeHtml } from '../describe';

/**
 * Lo que la tienda le dice a Google: datos estructurados que no se pueden
 * romper con lo que carga el comercio, el schema de producto con precio
 * real, marca y SKU, y la descripción de una página de contenido.
 */

describe('jsonLd', () => {
  it('un texto con </script> no cierra el script, y sigue siendo el mismo JSON', () => {
    const data = { name: '</script><img src=x onerror=alert(1)> & <!-- -->' };
    const { __html } = jsonLd(data);
    expect(__html).not.toMatch(/[<>&]/);
    expect(JSON.parse(__html)).toEqual(data);
  });
});

const product = (over: Partial<ProductForJsonLd> = {}): ProductForJsonLd => ({
  name: 'Mancuerna',
  slug: 'mancuerna',
  description: 'Hexagonal',
  brand: 'Hierro Fuerte',
  images: [{ url: 'https://cdn/m.jpg' }],
  variants: [{ sku: 'MAN-10', price: { amount: 1299900, currency: 'ARS' } }],
  stock: 4,
  ...over,
});

describe('productJsonLd', () => {
  it('una variante: Offer con su precio, la marca y el SKU', () => {
    expect(productJsonLd(product(), 'https://t.com')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Mancuerna',
      description: 'Hexagonal',
      image: ['https://cdn/m.jpg'],
      url: 'https://t.com/productos/mancuerna',
      brand: { '@type': 'Brand', name: 'Hierro Fuerte' },
      sku: 'MAN-10',
      offers: {
        '@type': 'Offer',
        priceCurrency: 'ARS',
        price: '12999.00',
        availability: 'https://schema.org/InStock',
        url: 'https://t.com/productos/mancuerna',
      },
    });
  });

  it('varias variantes: AggregateOffer con el rango real, no el precio de la primera', () => {
    const ld = productJsonLd(
      product({
        variants: [
          { sku: 'A', price: { amount: 5000, currency: 'ARS' } },
          { sku: 'B', price: { amount: 2000, currency: 'ARS' } },
          { sku: 'C', price: { amount: 9000, currency: 'ARS' } },
        ],
      }),
      '',
    )!;
    expect(ld.offers).toEqual({
      '@type': 'AggregateOffer',
      priceCurrency: 'ARS',
      lowPrice: '20.00',
      highPrice: '90.00',
      offerCount: 3,
      availability: 'https://schema.org/InStock',
    });
    expect(ld.sku).toBeUndefined(); // cada variante tiene el suyo
    expect(ld.url).toBeUndefined(); // sin host conocido, sin URLs
  });

  it('sin marca ni stock: sin brand y OutOfStock', () => {
    const ld = productJsonLd(product({ brand: '  ', stock: 0 }), '')!;
    expect(ld.brand).toBeUndefined();
    expect((ld.offers as { availability: string }).availability).toBe('https://schema.org/OutOfStock');
  });

  it('sin variantes no hay precio que publicar', () => {
    expect(productJsonLd(product({ variants: [] }), '')).toBeNull();
  });
});

describe('describeHtml', () => {
  it('saca el HTML, los scripts y las entidades', () => {
    expect(
      describeHtml('<h2>Envíos</h2><p>Llegamos a todo el país&nbsp;&amp; rápido.</p><script>x()</script>'),
    ).toBe('Envíos Llegamos a todo el país & rápido.');
  });

  it('corta en una palabra, con puntos suspensivos', () => {
    const text = describeHtml(`<p>${'palabra '.repeat(40)}</p>`, 30);
    expect(text.length).toBeLessThanOrEqual(30);
    expect(text).toMatch(/palabra…$/);
  });

  it('una página vacía da una descripción vacía', () => {
    expect(describeHtml('<p> </p>')).toBe('');
  });
});
