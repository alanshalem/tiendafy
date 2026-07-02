/**
 * DTOs de transporte (wire types) que espejan la forma serializada del backend
 * en respuestas del API público. Distintos de los tipos de dominio de `common`:
 * un DTO puede tener menos garantías (p.ej. sin brands) y evoluciona con el
 * contrato HTTP, no con el modelo interno.
 */

/**
 * Dinero tal como llega/serializa en el wire: monto en unidad mínima + ISO 4217.
 * Redeclarado a mano en varios consumidores (catalog, EditProduct, Products,
 * Orders); esta es la fuente única. Distinto del dominio `Money` de `common`.
 */
export interface MoneyDto {
  amount: number;
  currency: string;
}
