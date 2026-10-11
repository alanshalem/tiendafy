import { describe, expect, it } from 'vitest';
import { isValidPrice, parseMoneyInput, toCents } from '../lib/price';

/**
 * El lector único de importes escritos a mano.
 *
 * Antes había seis lectores y se contradecían: el de Tesorería leía `1500.50`
 * como $150.050 y el de cupones leía `1.500` como $1,50. Cada caso de abajo es
 * una entrada que alguno de los dos leía mal, o una que ambos leían bien y que
 * tiene que seguir dando lo mismo.
 */
describe('parseMoneyInput', () => {
  it.each([
    // Lo que ya funcionaba en todos lados: no se mueve.
    ['1500', 150000],
    ['1500,5', 150050],
    ['1500,50', 150050],
    ['0,99', 99],

    // Formato argentino con miles: lo que Tesorería sí leía bien.
    ['1.500', 150000],
    ['12.345', 1234500],
    ['1.234.567', 123456700],
    ['1.500,50', 150050],
    ['1.234.567,89', 123456789],

    // Punto decimal: lo que Tesorería leía cien veces más grande.
    ['1500.50', 150050],
    ['1500.5', 150050],
    ['0.50', 50],
    ['1.5', 150],
    ['1.50', 150],

    // Formato inglés completo.
    ['1,234.56', 123456],
    ['1,234,567', 123456700],

    // Ruido que una persona pega o tipea.
    ['  1500  ', 150000],
    ['$ 1.500', 150000],
    ['1 500', 150000],

    // A mitad de tipeo: los lectores anteriores los aceptaban.
    ['1500.', 150000],
    ['1500,', 150000],
    ['.5', 50],
  ])('%s → %i centavos', (entrada, centavos) => {
    expect(parseMoneyInput(entrada)).toBe(centavos);
  });

  it.each(['', '   ', 'abc', '.', ',', '12a', '1.2.3,4,5', '-', '--5'])('%j no es un importe', (entrada) => {
    expect(parseMoneyInput(entrada)).toBeNaN();
  });

  it('el signo pasa tal cual: si un negativo vale lo decide cada pantalla', () => {
    // Los lectores anteriores devolvían el negativo y cada form lo rechaza con
    // su propio `<= 0`. Devolver NaN acá cambiaría el mensaje que ve el usuario.
    expect(parseMoneyInput('-100')).toBe(-10000);
    expect(parseMoneyInput('-1.500,50')).toBe(-150050);
  });

  it('un cero adelante nunca es un grupo de miles', () => {
    // `0.500` es medio peso, no quinientos.
    expect(parseMoneyInput('0.500')).toBe(50);
  });

  it('lee lo que el propio panel escribe al autocompletar un precio', () => {
    // El bug que esto cierra: Presupuestos completa el precio sugerido con
    // String(centavos / 100), que en JavaScript sale con punto. El lector
    // viejo lo leía como miles y guardaba el presupuesto a 10× o 100×.
    for (const centavos of [150050, 150055, 99, 1234567, 100]) {
      expect(parseMoneyInput(String(centavos / 100))).toBe(centavos);
    }
  });
});

describe('toCents (forms de producto)', () => {
  it('da lo mismo que antes para todo lo que isValidPrice deja pasar', () => {
    // Los forms de producto validan primero. Para esas entradas el lector
    // nuevo tiene que coincidir con el viejo, centavo por centavo.
    const viejo = (s: string) => Math.round(parseFloat(s.replace(',', '.')) * 100);
    for (const s of ['0', '1', '99', '1500', '1500,5', '1500,50', '1500.5', '1500.50', '0.01', '123456.78']) {
      expect(isValidPrice(s)).toBe(true);
      expect(toCents(s)).toBe(viejo(s));
    }
  });
});
