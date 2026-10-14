import { describe, expect, it } from 'vitest';
import { CARRIERS, enabledCarriers, quoteHint } from '../components/store/checkout-carriers';

describe('correos que cotizan en el checkout', () => {
  it('se leen activos de /shipping/methods, cada uno con su campo', () => {
    expect(enabledCarriers({ items: [] })).toEqual([]);
    expect(
      enabledCarriers({
        correoArgentino: { enabled: true },
        zipnova: { enabled: false },
        andreani: { enabled: true },
      }),
    ).toEqual(['andreani', 'correo']);
  });

  it('el texto de ayuda nombra a todos los activos, en singular o plural', () => {
    expect(quoteHint(['andreani'])).toBe('Andreani cotiza al instante para tu dirección.');
    expect(quoteHint(['andreani', 'correo'])).toBe(
      'Andreani y Correo Argentino cotizan al instante para tu dirección.',
    );
    expect(quoteHint(['andreani', 'zipnova', 'correo'])).toBe(
      'Andreani, Zipnova y Correo Argentino cotizan al instante para tu dirección.',
    );
  });

  it('cada respuesta se lleva a la misma forma: retiro, sucursal y plazo', () => {
    const price = { amount: 100, currency: 'ARS' };
    expect(CARRIERS.andreani.toOption({ token: 't', name: 'A', price, toBranch: true })).toMatchObject({
      pickup: true,
      needsAgency: false,
      detail: 'Lo retirás en una sucursal de Andreani',
    });
    expect(
      CARRIERS.correo.toOption({ token: 't', kind: 'S', name: 'C', price, etaMin: '2', etaMax: '2' }),
    ).toMatchObject({ pickup: true, needsAgency: true, detail: 'Llega en 2 días hábiles' });
    expect(
      CARRIERS.zipnova.toOption({ token: 't', name: 'Z', price, estimatedDelivery: null }),
    ).toMatchObject({ pickup: false, detail: null });
  });
});
