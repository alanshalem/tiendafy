/**
 * Tipos primitivos del contrato API. Espejan SharedKernel del backend —
 * si cambia el backend, cambia acá (hasta que el generator OpenAPI
 * reemplace los tipos escritos a mano).
 */

/** UUID serializado. Brand evita mezclar ids de entidades distintas. */
export type TenantId = string & { readonly __brand: 'TenantId' };

/**
 * Dinero como entero en unidad mínima (centavos) + ISO 4217.
 * Espeja SharedKernel/Common/Money.cs. Nunca float.
 */
export interface Money {
  /** Centavos. 1999 = $19.99 */
  amount: number;
  /** "ARS", "BRL", "MXN", "USD" */
  currency: string;
}

/** Error de API con código estable (espeja Error de Result.cs). */
export interface ApiError {
  code: string;
  message: string;
}

/** Página por cursor — la API pública no usa offset. */
export interface CursorPage<T> {
  items: T[];
  /** Cursor opaco para la página siguiente. null = última página. */
  nextCursor: string | null;
  hasMore: boolean;
}

/** Timestamps siempre UTC ISO 8601. Presentación en TZ del tenant es del cliente. */
export type IsoDateTime = string;
