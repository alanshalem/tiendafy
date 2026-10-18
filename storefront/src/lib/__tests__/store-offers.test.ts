/**
 * Las ofertas de la tienda sobre el tema: una tienda que nunca las configuró
 * se ve igual que ayer; configuradas, mandan ellas (también para apagar); y
 * el envío gratis sale solo de los medios de envío.
 */
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@tiendafy/types';
import { applyStoreOffers, offersOf, offlineDiscountLabel, type StoreOffers } from '../store-offers';
import { defaultTheme } from '../theme';
import { themeToStyle } from '../theme-style';

const theme = {
  ...defaultTheme,
  productDetail: { ...defaultTheme.productDetail, cashDiscountPercent: 15, installmentsCount: 3 },
  productList: { ...defaultTheme.productList, installmentsCount: 12 },
  cart: { ...defaultTheme.cart, freeShippingBar: true, freeShippingThreshold: 5_000_000 },
};

const OFFERS: StoreOffers = {
  configured: true,
  transfer: { enabled: true, discountPercent: 10, holdHours: 48 },
  cashOnPickup: { enabled: false },
  installments: { max: 6, note: 'Con tarjetas bancarias.' },
  freeShipping: { from: { amount: 8_000_000, currency: 'ARS' }, methodName: 'Moto' },
  canCheckout: true,
};

describe('applyStoreOffers', () => {
  it('configuradas, el descuento y las cuotas salen de la tienda, iguales en la ficha y las tarjetas', () => {
    const t = applyStoreOffers(theme, OFFERS);
    expect(t.productDetail.cashDiscountPercent).toBe(10);
    expect(t.productDetail.installmentsCount).toBe(6);
    expect(t.productList.installmentsCount).toBe(6);
    expect(t.cart.freeShippingThreshold).toBe(8_000_000);
    expect(offersOf(t)).toBe(OFFERS);
  });

  it('una transferencia apagada no anuncia descuento', () => {
    const t = applyStoreOffers(theme, { ...OFFERS, transfer: { ...OFFERS.transfer, enabled: false } });
    expect(t.productDetail.cashDiscountPercent).toBe(0);
  });

  it('sin configurar, el descuento y las cuotas del diseño siguen (temas viejos)', () => {
    const t = applyStoreOffers(theme, { ...OFFERS, configured: false });
    expect(t.productDetail.cashDiscountPercent).toBe(15);
    expect(t.productList.installmentsCount).toBe(12);
  });

  it('el envío gratis sale solo de los medios: sin umbral, la barra no promete nada', () => {
    const t = applyStoreOffers(theme, { ...OFFERS, configured: false, freeShipping: null });
    expect(t.cart.freeShippingThreshold).toBe(0);
  });

  it('sin respuesta (o con otra forma) el tema queda como estaba', () => {
    expect(applyStoreOffers(theme, null)).toBe(theme);
    expect(applyStoreOffers(theme, {} as StoreOffers)).toBe(theme);
  });

  it('el efectivo se nombra solo si existe', () => {
    expect(offlineDiscountLabel(OFFERS)).toBe('transferencia');
    expect(offlineDiscountLabel({ ...OFFERS, cashOnPickup: { enabled: true } })).toBe(
      'transferencia o efectivo',
    );
    expect(offlineDiscountLabel(null)).toBe('transferencia o efectivo');
  });
});

describe('colores de estado', () => {
  it('rojo y verde se leen a 4,5:1 sobre un fondo oscuro', () => {
    const dark = { ...defaultTheme, colors: { ...defaultTheme.colors, bg: '17 17 17', text: '245 245 245' } };
    const style = themeToStyle(dark);
    expect(contrastRatio(style['--color-danger']!, '17 17 17')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(style['--color-success']!, '17 17 17')).toBeGreaterThanOrEqual(4.5);
  });
});
