import { describe, expect, it } from 'vitest';
import { baseTheme, normalizeTheme } from '@tiendafy/types';

/**
 * La página de "en construcción" es la única cara de la marca durante semanas.
 * Lo que se prueba acá es que su configuración sobreviva a lo que ya está
 * guardado: las tiendas existentes tienen temas sin estos campos, y si el
 * merge los dejara en undefined la página rompería justo cuando es lo único
 * que se ve.
 */
describe('tienda en construcción', () => {
  it('un tema viejo recibe los campos nuevos con valores usables', () => {
    const viejo = normalizeTheme({
      comingSoon: { enabled: true, title: 'Ya abrimos', message: '', collectEmails: false },
    } as never);

    expect(viejo.comingSoon.enabled).toBe(true);
    expect(viejo.comingSoon.title).toBe('Ya abrimos');
    expect(viejo.comingSoon.eyebrow).toBe(baseTheme.comingSoon.eyebrow);
    expect(viejo.comingSoon.layout).toBe('centered');
    expect(viejo.comingSoon.image).toBe('');
    expect(viejo.comingSoon.launchDate).toBe('');
    expect(viejo.comingSoon.whatsapp).toBe('');
    expect(typeof viejo.comingSoon.showSocial).toBe('boolean');
  });

  it('el diseño dividido se conserva y cualquier otra cosa cae en centrado', () => {
    expect(normalizeTheme({ comingSoon: { layout: 'split' } } as never).comingSoon.layout).toBe('split');

    // Un valor inventado (tema editado a mano, versión futura) no puede dejar
    // la página sin layout: cae al centrado, que funciona sin imagen.
    expect(normalizeTheme({ comingSoon: { layout: 'diagonal' } } as never).comingSoon.layout).toBe(
      'centered',
    );
  });

  it('por defecto está apagada', () => {
    expect(baseTheme.comingSoon.enabled).toBe(false);
  });
});
