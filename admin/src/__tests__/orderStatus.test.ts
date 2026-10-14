import { describe, expect, it } from 'vitest';
import { ORDER_STATUS, orderStatusLabel } from '../lib/orderStatus';

describe('mapa canónico de estados de venta', () => {
  it('cubre todos los estados que emite el backend', () => {
    for (const s of [
      'PENDINGPAYMENT',
      'PAID',
      'FAILED',
      'CANCELLED',
      'REFUNDED',
      'PARTIALLYREFUNDED',
      'CHARGEDBACK',
      'FULFILLED',
    ]) {
      expect(ORDER_STATUS[s]?.label, s).toBeTruthy();
      expect(ORDER_STATUS[s]?.cls, s).toMatch(/bg-/);
    }
  });

  it('los colores son los tonos del Badge, que tienen modo oscuro', () => {
    for (const { cls } of Object.values(ORDER_STATUS)) {
      expect(cls).not.toMatch(/-(green|red|amber|blue|sky|rose|gray)-\d/);
    }
  });

  it('orderStatusLabel traduce estados conocidos', () => {
    expect(orderStatusLabel('PAID')).toBe('Pagada');
    expect(orderStatusLabel('FULFILLED')).toBe('Enviada');
    expect(orderStatusLabel('PARTIALLYREFUNDED')).toBe('Reembolso parcial');
  });

  it('orderStatusLabel deja pasar estados desconocidos tal cual', () => {
    expect(orderStatusLabel('ALGO_NUEVO')).toBe('ALGO_NUEVO');
  });
});
