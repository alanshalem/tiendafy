import { describe, expect, it } from 'vitest';
import { DEFAULT_SECTIONS } from '@tiendafy/types';
import { defaultTheme, mergeTheme, themeToStyle, colClass } from '../theme';
import { defaultPrivacy, defaultTerms } from '../legal';

describe('mergeTheme (storefront)', () => {
  it('sin config siembra las secciones iniciales del storefront', () => {
    expect(mergeTheme(null).sections).toEqual(DEFAULT_SECTIONS);
    expect(defaultTheme.sections).toEqual(DEFAULT_SECTIONS);
  });
});

describe('themeToStyle', () => {
  it('mapea colores a CSS custom properties', () => {
    const style = themeToStyle(defaultTheme);
    expect(style['--color-primary']).toBe(defaultTheme.colors.primary);
    expect(style['--store-header-bg']).toBe(defaultTheme.header.bg);
  });

  it('el texto sobre el primario contrasta: oscuro sobre claro, claro sobre oscuro', () => {
    const claro = themeToStyle(mergeTheme({ colors: { ...defaultTheme.colors, primary: '250 250 250' } }));
    const oscuro = themeToStyle(mergeTheme({ colors: { ...defaultTheme.colors, primary: '10 10 10' } }));
    expect(claro['--color-primary-fg']).not.toBe(oscuro['--color-primary-fg']);
  });

  it('usa el acento solo si useAccent está activo', () => {
    const conAcento = mergeTheme({
      colors: { ...defaultTheme.colors, useAccent: true, accent: '1 2 3' },
    });
    const sinAcento = mergeTheme({
      colors: { ...defaultTheme.colors, useAccent: false, accent: '1 2 3' },
    });
    expect(themeToStyle(conAcento)['--color-accent']).toBe('1 2 3');
    expect(themeToStyle(sinAcento)['--color-accent']).toBe(sinAcento.colors.primary);
  });
});

describe('colClass', () => {
  it('tiene clase de grilla para 2/3/4 columnas', () => {
    expect(colClass[2]).toContain('grid-cols-2');
    expect(colClass[4]).toContain('lg:grid-cols-4');
  });
});

describe('plantillas legales', () => {
  it('los términos nombran a la tienda y al derecho de arrepentimiento (Ley 24.240 / Res. 424/2020)', () => {
    const doc = defaultTerms('Mi Tienda Test');
    const text = doc.intro + doc.sections.map((s) => s.heading + s.body).join(' ');
    expect(text).toContain('Mi Tienda Test');
    expect(text).toContain('24.240');
    expect(text).toContain('424/2020');
  });

  it('la privacidad cita la Ley 25.326 y los derechos del titular', () => {
    const doc = defaultPrivacy('Mi Tienda Test');
    const text = doc.intro + doc.sections.map((s) => s.body).join(' ');
    expect(text).toContain('25.326');
    expect(text.toLowerCase()).toContain('supresión');
  });
});
