/**
 * Las cuentas del resumen del checkout. Tienen que dar lo mismo que cobra el
 * servidor (Order.UseOfflinePayment): cupón sobre el subtotal de lista, el %
 * de la transferencia o el efectivo sobre lo que queda (redondeado al
 * centavo, el medio para arriba) y el envío entero, que nunca se descuenta.
 * Todo en centavos.
 */
import { describe, expect, it } from 'vitest';
import {
  checkoutTotals,
  freeByAmount,
  methodPrice,
  offlineDiscountOf,
  priceWithOfflineDiscount,
} from '../checkout-totals';

const ARS = (amount: number) => ({ amount, currency: 'ARS' });

describe('envío de un medio propio con "gratis desde"', () => {
  const method = { price: ARS(1500_00), freeAbove: ARS(50_000_00) };

  it('se cobra por debajo del monto y es gratis desde el monto exacto', () => {
    expect(freeByAmount(method, 49_999_99)).toBe(false);
    expect(methodPrice(method, 49_999_99)).toBe(1500_00);
    expect(freeByAmount(method, 50_000_00)).toBe(true);
    expect(methodPrice(method, 50_000_00)).toBe(0);
    expect(methodPrice(method, 80_000_00)).toBe(0);
  });

  it('sin "gratis desde" (null o ausente) siempre se cobra', () => {
    expect(freeByAmount({ price: ARS(900_00), freeAbove: null }, 1e12)).toBe(false);
    expect(methodPrice({ price: ARS(900_00) }, 1e12)).toBe(900_00);
  });

  it('un medio gratis vale 0 con cualquier subtotal', () => {
    expect(methodPrice({ price: ARS(0) }, 0)).toBe(0);
  });
});

describe('checkoutTotals', () => {
  const base = { subtotal: 10_000_00, coupon: null, shipping: 0, offline: false, offlinePercent: 0 };

  it('sin nada: el total es el subtotal', () => {
    expect(checkoutTotals(base)).toEqual({
      discount: 0,
      offlinePct: 0,
      offlineDiscount: 0,
      shipCost: 0,
      total: 10_000_00,
    });
  });

  it('el envío se suma entero', () => {
    expect(checkoutTotals({ ...base, shipping: 1500_00 })).toMatchObject({
      shipCost: 1500_00,
      total: 11_500_00,
    });
  });

  it('el cupón se resta del subtotal', () => {
    const t = checkoutTotals({ ...base, coupon: { discount: 1000_00 }, shipping: 500_00 });
    expect(t).toMatchObject({ discount: 1000_00, shipCost: 500_00, total: 9_500_00 });
  });

  it('un cupón mayor que el subtotal deja los productos en 0, no negativos (el envío se cobra igual)', () => {
    const t = checkoutTotals({ ...base, coupon: { discount: 20_000_00 }, shipping: 700_00 });
    // El resumen muestra el descuento del cupón tal cual vino.
    expect(t.discount).toBe(20_000_00);
    expect(t.total).toBe(700_00);
  });

  it('cupón de envío gratis: el envío va en 0 aunque el medio cobre', () => {
    const t = checkoutTotals({ ...base, coupon: { discount: 0, freeShipping: true }, shipping: 1500_00 });
    expect(t).toMatchObject({ shipCost: 0, total: 10_000_00 });
  });

  it('el % de transferencia o efectivo solo cuenta si se paga a mano', () => {
    expect(checkoutTotals({ ...base, offline: false, offlinePercent: 10 })).toMatchObject({
      offlinePct: 0,
      offlineDiscount: 0,
      total: 10_000_00,
    });
    expect(checkoutTotals({ ...base, offline: true, offlinePercent: 10 })).toMatchObject({
      offlinePct: 10,
      offlineDiscount: 1000_00,
      total: 9_000_00,
    });
  });

  it('pagando a mano sin % configurado (undefined o 0) no hay descuento', () => {
    expect(checkoutTotals({ ...base, offline: true, offlinePercent: undefined })).toMatchObject({
      offlinePct: 0,
      offlineDiscount: 0,
      total: 10_000_00,
    });
    expect(checkoutTotals({ ...base, offline: true, offlinePercent: 0 }).total).toBe(10_000_00);
  });

  it('encadenados: el % va sobre lo que queda después del cupón, y el envío no se descuenta', () => {
    // 10% de cupón + 10% por transferencia = 19%, no 20%.
    const t = checkoutTotals({
      subtotal: 10_000_00,
      coupon: { discount: 1000_00 },
      shipping: 1500_00,
      offline: true,
      offlinePercent: 10,
    });
    expect(t).toMatchObject({ discount: 1000_00, offlineDiscount: 900_00, shipCost: 1500_00 });
    expect(t.total).toBe(10_000_00 - 1000_00 - 900_00 + 1500_00);
  });

  it('con el cupón que se come todo, el % no tiene sobre qué aplicarse', () => {
    const t = checkoutTotals({
      ...base,
      coupon: { discount: 20_000_00 },
      offline: true,
      offlinePercent: 15,
    });
    expect(t.offlineDiscount).toBe(0);
    expect(t.total).toBe(0);
  });

  it('el descuento se redondea al centavo, el medio centavo para arriba (como el servidor)', () => {
    // 10% de 123,45 = 12,345 → 12,35 (no 12,34): se resta el descuento redondeado.
    expect(checkoutTotals({ ...base, subtotal: 12345, offline: true, offlinePercent: 10 })).toMatchObject({
      offlineDiscount: 1235,
      total: 11110,
    });
    // 1% de 0,50 = 0,005 → 0,01.
    expect(checkoutTotals({ ...base, subtotal: 50, offline: true, offlinePercent: 1 })).toMatchObject({
      offlineDiscount: 1,
      total: 49,
    });
    // 15% de 0,33 = 0,0495 → 0,05; y por debajo del medio, para abajo: 15% de 0,03 = 0,0045 → 0.
    expect(checkoutTotals({ ...base, subtotal: 33, offline: true, offlinePercent: 15 }).offlineDiscount).toBe(
      5,
    );
    expect(checkoutTotals({ ...base, subtotal: 3, offline: true, offlinePercent: 15 }).offlineDiscount).toBe(
      0,
    );
  });

  it('con un subtotal en 0 (carrito vacío) todo da 0 más el envío', () => {
    expect(
      checkoutTotals({ subtotal: 0, coupon: null, shipping: 300_00, offline: true, offlinePercent: 10 }),
    ).toEqual({ discount: 0, offlinePct: 10, offlineDiscount: 0, shipCost: 300_00, total: 300_00 });
  });
});

describe('precio con transferencia o efectivo (ficha y tarjetas)', () => {
  it('es lo mismo que cobra el checkout, también en el medio centavo', () => {
    // 10% de 123,45 = 12,345 → 12,35 de descuento → 111,10. La cuenta vieja de
    // la ficha, round(12345·0,9), daba 111,11: un centavo más que lo cobrado.
    expect(offlineDiscountOf(12345, 10)).toBe(1235);
    expect(priceWithOfflineDiscount(12345, 10)).toBe(11110);
    expect(Math.round(12345 * (1 - 10 / 100))).toBe(11111);
    expect(priceWithOfflineDiscount(12345, 10)).toBe(
      checkoutTotals({ subtotal: 12345, coupon: null, shipping: 0, offline: true, offlinePercent: 10 }).total,
    );
  });

  it('sin % no cambia el precio, y con 100% queda en 0', () => {
    expect(priceWithOfflineDiscount(99_99, 0)).toBe(99_99);
    expect(priceWithOfflineDiscount(99_99, 100)).toBe(0);
  });
});
