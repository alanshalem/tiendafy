/**
 * Tipos primitivos del contrato API. Espejan SharedKernel del backend —
 * si cambia el backend, cambia acá (hasta que el generator OpenAPI
 * reemplace los tipos escritos a mano).
 */

/** UUID serializado. Brand evita mezclar ids de entidades distintas. */
export type TenantId = string & { readonly __brand: 'TenantId' };

/** Error de API con código estable (espeja Error de Result.cs). */
export interface ApiError {
  code: string;
  message: string;
}

/** Timestamps siempre UTC ISO 8601. Presentación en TZ del tenant es del cliente. */
export type IsoDateTime = string;
