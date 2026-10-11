import { describe, expect, it } from 'vitest';
import { foldText } from '../lib/text';

/**
 * La comparación sin tildes que usan los buscadores del panel. Reemplazó tres
 * copias con dos órdenes distintos (minúscula antes o después de descomponer):
 * acá se fija que el resultado sea el mismo con cualquiera de los dos.
 */
describe('foldText', () => {
  it.each([
    ['Camión', 'camion'],
    ['ÁÉÍÓÚ', 'aeiou'],
    ['Ñandú', 'nandu'],
    ['Pingüino', 'pinguino'],
    ['Envíos a todo el país', 'envios a todo el pais'],
    ['sin tildes', 'sin tildes'],
    ['', ''],
  ])('%j → %j', (entrada, esperado) => {
    expect(foldText(entrada)).toBe(esperado);
  });

  it('da lo mismo que las dos copias que reemplazó', () => {
    const marcas = /[̀-ͯ]/g;
    const palette = (s: string) => s.normalize('NFD').replace(marcas, '').toLowerCase();
    const editor = (s: string) => s.toLowerCase().normalize('NFD').replace(marcas, '');
    for (const s of ['Camión', 'ÑANDÚ', 'Pingüino', 'Configuración de envíos', 'İstanbul', 'ÀÈÌÒÙ']) {
      expect(foldText(s)).toBe(palette(s));
      expect(foldText(s)).toBe(editor(s));
    }
  });
});
