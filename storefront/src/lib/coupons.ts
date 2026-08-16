import { API_URL, tenantHeaders } from './api-client';

export type CouponValidation =
  { ok: true; code: string; discount: number; freeShipping: boolean } | { ok: false; error: string };

/**
 * Valida un cupón contra la API (misma llamada desde el drawer del carrito y
 * el checkout; antes duplicada con los mismos literales de error).
 */
export async function validateCoupon(
  tenantId: string,
  code: string,
  subtotal: number,
): Promise<CouponValidation> {
  try {
    const res = await fetch(`${API_URL}/api/v1/coupons/validate`, {
      method: 'POST',
      headers: tenantHeaders(tenantId, true),
      body: JSON.stringify({ code, subtotal }),
    });
    const data = await res.json();
    if (data.valid) {
      return { ok: true, code: data.code, discount: data.discountAmount, freeShipping: !!data.freeShipping };
    }
    return { ok: false, error: data.error ?? 'Cupón inválido.' };
  } catch {
    return { ok: false, error: 'No se pudo validar el cupón.' };
  }
}
