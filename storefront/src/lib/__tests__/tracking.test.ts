import { describe, expect, it } from 'vitest';
import { isPaymentPage, shouldAskConsent, shouldLoad } from '@/components/store/TrackingTags';

const base = {
  hasAnyTag: true,
  pathname: '/productos',
  requireConsent: true,
  decision: 'granted' as const,
};

/**
 * La regla que no puede fallar. Cargar de más acá significa un script de un
 * tercero en la pantalla donde el comprador escribe el número de tarjeta.
 */
describe('shouldLoad', () => {
  it('nunca carga en la pantalla de pago, ni siquiera con permiso dado', () => {
    expect(shouldLoad({ ...base, pathname: '/checkout' })).toBe(false);
    expect(shouldLoad({ ...base, pathname: '/checkout', requireConsent: false })).toBe(false);
  });

  it('sí carga en las pantallas de resultado: ahí ya no hay datos de tarjeta', () => {
    expect(shouldLoad({ ...base, pathname: '/checkout/success' })).toBe(true);
    expect(shouldLoad({ ...base, pathname: '/checkout/pending' })).toBe(true);
  });

  it('sin permiso no carga nada', () => {
    expect(shouldLoad({ ...base, decision: null })).toBe(false);
    expect(shouldLoad({ ...base, decision: 'denied' })).toBe(false);
  });

  it('si la tienda no pide permiso, carga igual', () => {
    expect(shouldLoad({ ...base, requireConsent: false, decision: null })).toBe(true);
  });

  it('sin ninguna herramienta configurada no hay nada que cargar', () => {
    expect(shouldLoad({ ...base, hasAnyTag: false })).toBe(false);
  });
});

describe('shouldAskConsent', () => {
  it('no molesta si no hay nada que consentir', () => {
    expect(shouldAskConsent({ ...base, hasAnyTag: false, decision: null })).toBe(false);
  });

  it('no vuelve a preguntar una vez que hay respuesta', () => {
    expect(shouldAskConsent({ ...base, decision: 'granted' })).toBe(false);
    expect(shouldAskConsent({ ...base, decision: 'denied' })).toBe(false);
  });

  it('no interrumpe el pago', () => {
    expect(shouldAskConsent({ ...base, pathname: '/checkout', decision: null })).toBe(false);
  });

  it('pregunta cuando corresponde', () => {
    expect(shouldAskConsent({ ...base, decision: null })).toBe(true);
  });
});

describe('isPaymentPage', () => {
  it('es solo el checkout exacto', () => {
    expect(isPaymentPage('/checkout')).toBe(true);
    expect(isPaymentPage('/checkout/success')).toBe(false);
    expect(isPaymentPage('/productos')).toBe(false);
  });
});
