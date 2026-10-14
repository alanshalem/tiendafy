/**
 * Opciones globales del tema: estilo de botones (→ variables CSS), columnas
 * del listado en el celular, links propios del pie y del anuncio. Lo que
 * guardó un tema viejo sin estos campos tiene que verse igual que antes.
 */
import { describe, expect, it } from 'vitest';
import { baseTheme, normalizeTheme } from '@tiendafy/types';
import { buttonVars, mergeTheme, productGridClass, themeToStyle } from '../theme';

describe('estilo de botones', () => {
  it('lo de siempre no define ninguna variable (cada botón queda como estaba)', () => {
    expect(buttonVars(baseTheme.buttons)).toEqual({});
    const style = themeToStyle(mergeTheme(null));
    expect(Object.keys(style).filter((k) => k.startsWith('--btn'))).toEqual([]);
  });

  it.each([
    ['square', '0px'],
    ['rounded', '0.5rem'],
    ['pill', '9999px'],
  ] as const)('forma %s → --btn-radius %s', (shape, radius) => {
    expect(buttonVars({ ...baseTheme.buttons, shape })['--btn-radius']).toBe(radius);
  });

  it('contorno: fondo transparente, texto y borde del color de marca', () => {
    expect(buttonVars({ ...baseTheme.buttons, variant: 'outline' })).toMatchObject({
      '--btn-bg': 'transparent',
      '--btn-fg': 'rgb(var(--color-primary-ink))',
      '--btn-border-width': '1.5px',
    });
  });

  it('mayúsculas con un poco de aire entre letras', () => {
    expect(buttonVars({ ...baseTheme.buttons, textCase: 'uppercase' })).toEqual({
      '--btn-case': 'uppercase',
      '--btn-tracking': '0.06em',
    });
  });

  it('themeToStyle las suma; un tema sin `buttons` usa los de siempre', () => {
    const t = mergeTheme({ buttons: { shape: 'pill', variant: 'outline', textCase: 'uppercase' } });
    expect(themeToStyle(t)['--btn-radius']).toBe('9999px');
    const legacy = { ...mergeTheme(null), buttons: undefined } as never;
    expect(themeToStyle(legacy)['--btn-radius']).toBeUndefined();
  });

  it('normalizeTheme descarta valores desconocidos', () => {
    expect(
      normalizeTheme({ buttons: { shape: 'raro', variant: 'x', textCase: 1 } } as never).buttons,
    ).toEqual(baseTheme.buttons);
    expect(normalizeTheme({ buttons: { shape: 'square' } } as never).buttons.shape).toBe('square');
  });
});

describe('columnas del listado', () => {
  it('2 en el celular (lo de siempre) o 1', () => {
    expect(productGridClass({ columns: 4, mobileColumns: 2 })).toBe(
      'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
    );
    expect(productGridClass({ columns: 4, mobileColumns: 1 })).toBe(
      'grid-cols-1 sm:grid-cols-3 lg:grid-cols-4',
    );
    expect(productGridClass({ columns: 3, mobileColumns: 1 })).toBe('grid-cols-1 sm:grid-cols-3');
    expect(productGridClass({ columns: 2, mobileColumns: 1 })).toBe('grid-cols-1 sm:grid-cols-2');
    expect(productGridClass({ columns: 9, mobileColumns: 2 })).toBe(
      'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
    );
  });

  it('un tema viejo o con basura queda en 2', () => {
    expect(normalizeTheme({ productList: { columns: 3 } } as never).productList.mobileColumns).toBe(2);
    expect(normalizeTheme({ productList: { mobileColumns: 7 } } as never).productList.mobileColumns).toBe(2);
    expect(normalizeTheme({ productList: { mobileColumns: 1 } } as never).productList.mobileColumns).toBe(1);
  });
});

describe('links del pie y del anuncio', () => {
  it('el pie guarda solo los links con nombre y destino', () => {
    const footer = normalizeTheme({
      footer: {
        links: [
          { label: 'Envíos', href: '/paginas/envios', newTab: false },
          { label: 'PDF', href: 'x.com/a.pdf', newTab: true },
          { label: 'Sin destino' },
          'basura',
        ],
      },
    } as never).footer;
    expect(footer.links).toEqual([
      { label: 'Envíos', href: '/paginas/envios' },
      { label: 'PDF', href: 'x.com/a.pdf', newTab: true },
    ]);
    expect(normalizeTheme({ footer: {} } as never).footer.links).toEqual([]);
  });

  it('el anuncio conserva "abrir en otra pestaña"', () => {
    const ann = normalizeTheme({
      announcement: {
        show: true,
        items: [
          { text: 'A', link: 'x.com', newTab: true },
          { text: 'B', link: '/b' },
        ],
      },
    } as never).announcement;
    expect(ann.items).toEqual([
      { text: 'A', link: 'x.com', newTab: true },
      { text: 'B', link: '/b' },
    ]);
  });
});
