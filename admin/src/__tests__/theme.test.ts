import { describe, expect, it } from 'vitest';
import { baseTheme, headerColorsFor, normalizeTheme, sanitizeCss, type ThemeConfig } from '@tiendafy/types';

describe('normalizeTheme', () => {
  it('devuelve defaults completos ante null', () => {
    const t = normalizeTheme(null, []);
    expect(t.colors.primary).toBe(baseTheme.colors.primary);
    expect(t.sections).toEqual([]);
    expect(t.whatsappButton.enabled).toBe(false);
  });

  it('migra la barra de anuncio legacy v1 {message, link} a items[]', () => {
    const raw = { announcement: { show: true, message: '10% OFF', link: '/promo' } };
    const t = normalizeTheme(raw as unknown as Partial<ThemeConfig>, []);
    expect(t.announcement.items).toEqual([{ text: '10% OFF', link: '/promo' }]);
    expect(t.announcement.show).toBe(true);
  });

  it('barra de anuncio guardada antes de "uno por vez": 5 s y velocidad normal; el intervalo va de 3 a 10', () => {
    const old = normalizeTheme(
      { announcement: { show: true, animation: 'marquee', items: [] } } as never,
      [],
    );
    expect(old.announcement).toMatchObject({ animation: 'marquee', interval: 5, speed: 'normal' });
    const pick = (raw: unknown) =>
      normalizeTheme({ announcement: raw } as Partial<ThemeConfig>, []).announcement;
    expect(pick({ animation: 'rotate', interval: 1 })).toMatchObject({ animation: 'rotate', interval: 3 });
    expect(pick({ interval: 60, speed: 'fast' })).toMatchObject({ interval: 10, speed: 'fast' });
    expect(pick({ interval: '7', speed: 'turbo', animation: 'bounce' })).toMatchObject({
      interval: 5,
      speed: 'normal',
      animation: 'static',
    });
  });

  it('colores del encabezado por página: solo tipos conocidos con fondo válido', () => {
    const header = (pageColors: unknown) =>
      normalizeTheme({ header: { pageColors } } as unknown as Partial<ThemeConfig>, []).header.pageColors;
    expect(normalizeTheme({}, []).header.pageColors).toEqual({});
    expect(header('roto')).toEqual({});
    expect(header([{ bg: '1 2 3' }])).toEqual({});
    expect(
      header({
        home: { bg: '10 20 30', textColor: 'blanco' },
        product: { bg: '' },
        blog: { bg: '1 1 1' },
        checkout: { bg: '255 255 255', textColor: '0 0 0' },
      }),
    ).toEqual({
      home: { bg: '10 20 30', textColor: '' },
      checkout: { bg: '255 255 255', textColor: '0 0 0' },
    });
  });

  it('headerColorsFor: los de la página, o los generales', () => {
    const h = {
      bg: '27 21 16',
      textColor: '250 250 250',
      pageColors: { home: { bg: '255 255 255', textColor: '' } },
    };
    // Con fondo propio y texto automático no hereda el texto elegido para el general.
    expect(headerColorsFor(h, 'home')).toEqual({ bg: '255 255 255', textColor: '' });
    expect(headerColorsFor(h, 'listing')).toEqual({ bg: '27 21 16', textColor: '250 250 250' });
    expect(headerColorsFor(h, null)).toEqual({ bg: '27 21 16', textColor: '250 250 250' });
  });

  it('filtra logos de pago con slugs inválidos', () => {
    const raw = { footer: { paymentLogos: ['visa', 'inventado', 'mastercard'] } };
    const t = normalizeTheme(raw as Partial<ThemeConfig>, []);
    expect(t.footer.paymentLogos).toEqual(['visa', 'mastercard']);
  });

  it('usa las fallbackSections cuando el tema no trae secciones', () => {
    const fallback = [{ id: 'x', type: 'featured', visible: true, data: {} }] as ThemeConfig['sections'];
    // Las secciones salen normalizadas (data completa), así que se comparan por contenido.
    expect(normalizeTheme({}, fallback).sections.map((s) => s.id)).toEqual(['x']);
    // pero respeta las del tema si existen (aunque sea una lista vacía: inicio vacío a propósito)
    const own = [{ id: 'y', type: 'faq', visible: true, data: {} }] as ThemeConfig['sections'];
    expect(normalizeTheme({ sections: own }, fallback).sections.map((s) => s.id)).toEqual(['y']);
    expect(normalizeTheme({ sections: [] }, fallback).sections).toEqual([]);
  });

  it('rechaza valores inválidos de enums (borderRadius/motion/iconKit)', () => {
    const raw = { borderRadius: 'zigzag', motion: 'turbo', iconKit: 'comic' };
    const t = normalizeTheme(raw as unknown as Partial<ThemeConfig>, []);
    expect(t.borderRadius).toBe(baseTheme.borderRadius);
    expect(t.motion).toBe(baseTheme.motion);
    expect(t.iconKit).toBe(baseTheme.iconKit);
  });
});

describe('sanitizeCss', () => {
  it('elimina < (impide cerrar el <style> e inyectar HTML)', () => {
    expect(sanitizeCss('body{}</style><script>alert(1)</script>')).not.toContain('<');
  });

  it('elimina vectores de ejecución conocidos, case-insensitive', () => {
    const out = sanitizeCss('a{width:Expression(alert(1));background:JAVASCRIPT:x} @IMPORT url(evil)');
    expect(out.toLowerCase()).not.toContain('expression(');
    expect(out.toLowerCase()).not.toContain('javascript:');
    expect(out.toLowerCase()).not.toContain('@import');
  });

  it('conserva CSS legítimo, incluidas url() de fondos', () => {
    const css = '.hero{background:url(https://cdn.x/y.jpg);color:red}';
    expect(sanitizeCss(css)).toBe(css);
  });

  it('passthrough de vacío', () => {
    expect(sanitizeCss('')).toBe('');
  });
});
