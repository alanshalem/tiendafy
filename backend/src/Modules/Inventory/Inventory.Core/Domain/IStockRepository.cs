using SharedKernel.Common;

namespace Inventory.Core.Domain;

/// <summary>
/// Puerto de stock. Las operaciones de reserva/confirmación son ATÓMICAS
/// en la implementación (single UPDATE condicional + tx) — el contrato lo
/// exige: TryReserve devuelve false si no hay stock, sin race posible.
/// </summary>
public interface IStockRepository
{
    Task<IReadOnlyList<StockItem>> GetByVariantsAsync(TenantId tenantId, IReadOnlyCollection<Guid> variantIds, CancellationToken ct = default);

    /// <summary>
    /// Las variantes de la tienda con algo disponible para vender (las de stock
    /// sin límite, siempre). Sin fila de stock no hay stock (como en la reserva
    /// del checkout), así que esas no están. La usa la tienda para mandar lo
    /// agotado al final del listado.
    /// </summary>
    Task<List<Guid>> ListInStockVariantIdsAsync(TenantId tenantId, CancellationToken ct = default);

    /// <summary>
    /// Setea el disponible (alta o ajuste manual). Crea el item si no existe.
    /// Una variante sin límite pasa a tener este stock.
    /// </summary>
    Task<StockItem> SetAvailableAsync(TenantId tenantId, Guid variantId, int available, string? reason, CancellationToken ct = default);

    /// <summary>
    /// Setea el disponible SOLO si sigue siendo <paramref name="expectedAvailable"/>
    /// (lo que vio quien lo editó), en un UPDATE condicional: si en el medio se
    /// vendió o entró mercadería, falla con Stock.Changed y no pisa nada. Sin
    /// fila de stock cuenta como 0; una variante sin límite no es ningún número
    /// (para pasarla a un número se usa <see cref="SetAvailableAsync"/>).
    /// </summary>
    Task<Result<StockItem>> SetAvailableIfUnchangedAsync(
        TenantId tenantId, Guid variantId, int expectedAvailable, int available, string? reason, CancellationToken ct = default);

    /// <summary>
    /// available += delta en UN update atómico, clampeado a 0 (ventas de otros
    /// canales, recepción de compras, componentes de kit): sin el read-modify-write
    /// que pierde actualizaciones contra las reservas del checkout. Crea el item
    /// si no existe. Devuelve el disponible resultante; null si la variante es
    /// sin límite (no se toca nada).
    /// </summary>
    Task<int?> AdjustAvailableAsync(TenantId tenantId, Guid variantId, int delta, string? reason, CancellationToken ct = default);

    /// <summary>
    /// Descuenta las unidades de una venta cobrada que ya no tenía su reserva
    /// (se pagó después de que venciera, o sobre una venta que figuraba
    /// rechazada o cancelada). Saca lo que haya hasta <paramref name="quantity"/>
    /// y devuelve cuántas unidades faltaron: 0 si alcanzó o si la variante es
    /// sin límite (no se toca nada). Nunca deja el disponible en negativo.
    /// </summary>
    Task<int> DeductSaleAsync(TenantId tenantId, Guid variantId, int quantity, string? reason, CancellationToken ct = default);

    /// <summary>
    /// Pasa la variante a stock sin límite (crea la fila si no existe). Las
    /// reservas que ya estaban siguen su curso; las nuevas no se hacen.
    /// </summary>
    Task<StockItem> SetUnlimitedAsync(TenantId tenantId, Guid variantId, string? reason, CancellationToken ct = default);

    /// <summary>Ubicación física de la variante (crea la fila de stock con 0 si no existe).</summary>
    Task SetLocationAsync(TenantId tenantId, Guid variantId, string? location, CancellationToken ct = default);

    /// <summary>
    /// available -= qty, reserved += qty SI available >= qty (atómico).
    /// Éxito = reservado (escribe Reservation + movimiento); éxito con null =
    /// la variante es sin límite y no hace falta reservar. Falla = sin stock.
    /// </summary>
    Task<Result<Reservation?>> TryReserveAsync(TenantId tenantId, Guid variantId, int quantity, CancellationToken ct = default);

    /// <summary>reserved -= qty (la mercadería sale). Marca la reserva confirmada.</summary>
    Task<Result> ConfirmReservationAsync(TenantId tenantId, Guid reservationId, CancellationToken ct = default);

    /// <summary>reserved -= qty, available += qty. Marca liberada.</summary>
    Task<Result> ReleaseReservationAsync(TenantId tenantId, Guid reservationId, CancellationToken ct = default);

    /// <summary>Estira el vencimiento de una reserva activa (ver Reservation.ExtendUntil).</summary>
    Task<Result> ExtendReservationAsync(TenantId tenantId, Guid reservationId, DateTime expiresAtUtc, CancellationToken ct = default);

    /// <summary>Libera todas las reservas activas vencidas (job). Devuelve cuántas.</summary>
    Task<int> ReleaseExpiredAsync(DateTime nowUtc, CancellationToken ct = default);

    Task<IReadOnlyList<StockMovement>> GetLedgerAsync(TenantId tenantId, Guid variantId, int limit, CancellationToken ct = default);
}
