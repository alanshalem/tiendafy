import { describe, expect, it } from 'vitest';
import { declaredValueFromOrder, parseAddress, type ShippingOrderLike } from '../lib/shipping';

const order = (total: number): ShippingOrderLike => ({
  id: 'o1',
  buyerEmail: 'ana@example.com',
  buyerName: 'Ana',
  buyerPhone: null,
  shippingMethod: 'Correo Argentino',
  shippingAddress: null,
  total: { amount: total, currency: 'ARS' },
});

describe('parseAddress', () => {
  it('separa calle, número, ciudad y CP de una dirección completa', () => {
    expect(parseAddress('Av. Corrientes 1234, 2B, CABA, CP 1043')).toEqual({
      street: 'Av. Corrientes',
      number: '1234',
      city: 'CABA',
      cp: '1043',
    });
  });

  it('soporta número con letra (ej. 1234B)', () => {
    const out = parseAddress('Mitre 742B, Rosario, CP 2000');
    expect(out.street).toBe('Mitre');
    expect(out.number).toBe('742B');
    expect(out.city).toBe('Rosario');
    expect(out.cp).toBe('2000');
  });

  it('sin número deja la calle entera y number vacío', () => {
    const out = parseAddress('Camino sin numerar, Salta');
    expect(out.street).toBe('Camino sin numerar');
    expect(out.number).toBe('');
    expect(out.city).toBe('Salta');
  });

  it('null devuelve campos vacíos', () => {
    expect(parseAddress(null)).toEqual({ street: '', number: '', city: '', cp: '' });
  });
});

describe('declaredValueFromOrder', () => {
  it('convierte el total en unidades menores a pesos enteros', () => {
    expect(declaredValueFromOrder(order(1299950))).toBe('13000');
    expect(declaredValueFromOrder(order(100))).toBe('1');
  });
});
