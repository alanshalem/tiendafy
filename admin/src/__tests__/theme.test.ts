import { describe, expect, it } from 'vitest';
import { baseTheme, normalizeTheme, sanitizeCss, type ThemeConfig } from '@tiendafy/types';

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

  it('filtra logos de pago con slugs inválidos', () => {
    const raw = { footer: { paymentLogos: ['visa', 'inventado', 'mastercard'] } };
    const t = normalizeTheme(raw as Partial<ThemeConfig>, []);
    expect(t.footer.paymentLogos).toEqual(['visa', 'mastercard']);
  });

  it('usa las fallbackSections cuando el tema no trae secciones', () => {
    const fallback = [{ id: 'x', type: 'featured', visible: true, data: {} }] as ThemeConfig['sections'];
    expect(normalizeTheme({}, fallback).sections).toBe(fallback);
    // pero respeta las del tema si existen
    const own = [{ id: 'y', type: 'faq', visible: true, data: {} }] as ThemeConfig['sections'];
    expect(normalizeTheme({ sections: own }, fallback).sections).toBe(own);
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
