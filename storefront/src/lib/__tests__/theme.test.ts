import { describe, expect, it } from 'vitest';
import { DEFAULT_SECTIONS, contrastRatio, mixRgb, readableOn } from '@tiendafy/types';
import { defaultTheme, mergeTheme, themeToStyle, colClass, mutedText, primaryInk } from '../theme';
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

  it('con un primario de luminancia media elige el texto que de verdad se lee', () => {
    // El naranja de marca de una importadora real: con blanco encima da 2.9:1
    // —abajo del minimo de WCAG AA— y con el oscuro, 6.2:1. Antes se elegia
    // blanco por un umbral de luminancia aproximado y el boton de comprar de
    // esa tienda no se leia.
    const naranja = themeToStyle(mergeTheme({ colors: { ...defaultTheme.colors, primary: '255 106 26' } }));
    const fg = naranja['--color-primary-fg'];

    expect(contrastRatio(fg, '255 106 26')).toBeGreaterThanOrEqual(4.5);
    expect(fg).toBe('17 24 39');
  });

  it('sobre un primario oscuro sigue eligiendo blanco', () => {
    const verde = themeToStyle(mergeTheme({ colors: { ...defaultTheme.colors, primary: '25 90 58' } }));
    expect(verde['--color-primary-fg']).toBe('255 255 255');
    expect(contrastRatio(verde['--color-primary-fg'], '25 90 58')).toBeGreaterThanOrEqual(4.5);
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

describe('el color de la marca como texto (primary-ink)', () => {
  const conPrimario = (primary: string, bg = '255 255 255') =>
    mergeTheme({ colors: { ...defaultTheme.colors, primary, bg } });

  it('un teal de marca sobre su tinte no llegaba a 4,5:1: se profundiza lo justo', () => {
    // El "MUY PRONTO" de una tienda real: #0d9488 sobre su tinte daba 3,2:1.
    const theme = conPrimario('13 148 136', '253 252 248');
    const ink = primaryInk(theme);
    expect(ink).not.toBe('13 148 136');
    expect(contrastRatio(ink, '253 252 248')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(ink, mixRgb('253 252 248', '13 148 136', 0.15))).toBeGreaterThanOrEqual(4.5);
    // Sigue siendo teal: más verde-azul que rojo.
    const [r, g, b] = ink.split(' ').map(Number);
    expect(g!).toBeGreaterThan(r!);
    expect(b!).toBeGreaterThan(r!);
    expect(themeToStyle(theme)['--color-primary-ink']).toBe(ink);
  });

  it('si ya se lee, queda igual', () => {
    expect(primaryInk(conPrimario('20 40 120'))).toBe('20 40 120');
  });

  it('sobre un fondo oscuro, se aclara', () => {
    const ink = readableOn('40 60 140', ['16 18 22']);
    expect(contrastRatio(ink, '16 18 22')).toBeGreaterThanOrEqual(4.5);
    expect(Number(ink.split(' ')[0])).toBeGreaterThan(40);
  });

  it('con un fondo imposible, cae al extremo', () => {
    // Contra gris medio nada llega a 21:1: termina en el extremo.
    expect(readableOn('128 128 128', ['128 128 128'], 21)).toBe('0 0 0');
  });
});

describe('el texto secundario (fg-muted)', () => {
  it('es más claro que el texto pero se lee sobre el fondo y sobre bg-black/5', () => {
    // Un gris de marca que con opacity-60 daba 4,27:1.
    const theme = mergeTheme({ colors: { ...defaultTheme.colors, text: '43 46 59', bg: '255 255 255' } });
    const muted = mutedText(theme);
    expect(muted).not.toBe('43 46 59');
    expect(contrastRatio(muted, '255 255 255')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(muted, mixRgb('255 255 255', '0 0 0', 0.05))).toBeGreaterThanOrEqual(4.5);
    expect(themeToStyle(theme)['--color-fg-muted']).toBe(muted);
  });
});
