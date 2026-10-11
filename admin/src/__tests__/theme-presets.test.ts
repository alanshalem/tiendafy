import { describe, expect, it } from 'vitest';
import { contrastRatio, normalizeTheme } from '@tiendafy/types';
import { themePresets } from '../lib/themePresets';

/**
 * Los presets de marca salen de guías escritas: cada valor tiene un motivo y
 * alguien lo firmó. Lo que se prueba acá no es "que se vea lindo" —eso no se
 * testea— sino las reglas que, si se pierden en una edición futura, rompen la
 * identidad sin que nadie se entere hasta verlo publicado.
 */
describe('presets de marca', () => {
  const byId = (id: string) => themePresets.find((p) => p.id === id)!;

  it('están las cuatro marcas del grupo', () => {
    const marcas = themePresets.filter((p) => p.category === 'Marcas del grupo').map((p) => p.id);
    expect(marcas).toEqual(['puente-oriente', 'smartfox', 'volxen', 'canicari']);
  });

  it('SmartFox va con esquinas rectas', () => {
    // "Esquinas siempre rectas: ni bloques, ni botones, ni fotos llevan bordes
    // redondeados." Es una regla de su guía, no una preferencia.
    expect(byId('smartfox').borderRadius).toBe('sharp');
  });

  it('Puente Oriente lleva el naranja de marca y su hover accesible', () => {
    const po = byId('puente-oriente');
    expect(po.tokens.colorPrimary).toBe('255 106 26'); // #FF6A1A
    expect(po.tokens.colorPrimaryHover).toBe('194 65 12'); // #C2410C
    expect(po.fonts).toEqual({ heading: 'poppins', body: 'inter' });
    // El buscador tipo marketplace B2B es parte de su identidad.
    expect(po.header?.showSearch).toBe(true);
  });

  it('el texto sobre el primario de cada marca se lee', () => {
    // La trampa que ya nos comimos una vez: un primario de luminancia media con
    // texto blanco encima. Acá se exige el mínimo de WCAG AA sobre el color
    // que el tema va a elegir solo.
    for (const preset of themePresets) {
      const theme = normalizeTheme({
        colors: {
          primary: preset.tokens.colorPrimary,
          accent: preset.tokens.colorAccent ?? '27 21 16',
          useAccent: !!preset.tokens.colorAccent,
          bg: preset.tokens.colorBg,
          text: preset.tokens.colorFg,
        },
      });
      const sobrePrimario = contrastRatio(
        contrastRatio('17 24 39', theme.colors.primary) >= contrastRatio('255 255 255', theme.colors.primary)
          ? '17 24 39'
          : '255 255 255',
        theme.colors.primary,
      );
      expect(
        sobrePrimario,
        `${preset.id}: el texto sobre el primario no llega a 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('el texto principal se lee sobre el fondo de cada preset', () => {
    for (const preset of themePresets) {
      expect(
        contrastRatio(preset.tokens.colorFg, preset.tokens.colorBg),
        `${preset.id}: el texto no contrasta con el fondo`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('las marcas que todavía no abren traen su página de espera vestida', () => {
    for (const id of ['volxen', 'canicari']) {
      const cs = byId(id).comingSoon;
      expect(cs?.enabled, `${id} debería abrir en construcción`).toBe(true);
      expect(cs?.title).toBeTruthy();
      expect(cs?.message).toBeTruthy();
    }

    // Las que sí venden, no.
    expect(byId('puente-oriente').comingSoon).toBeUndefined();
    expect(byId('smartfox').comingSoon).toBeUndefined();
  });

  it('ningún preset repite id', () => {
    const ids = themePresets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
