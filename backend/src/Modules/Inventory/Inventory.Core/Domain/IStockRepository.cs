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

    /// <summary>Setea el disponible (alta o ajuste manual). Crea el item si no existe.</summary>
    Task<StockItem> SetAvailableAsync(TenantId tenantId, Guid variantId, int available, string? reason, CancellationToken ct = default);

    /// <summary>
    /// available += delta en UN update atómico, clampeado a 0 (ventas de otros
    /// canales, recepción de compras, componentes de kit): sin el read-modify-write
    /// que pierde actualizaciones contra las reservas del checkout. Crea el item
    /// si no existe. Devuelve el disponible resultante.
    /// </summary>
    Task<int> AdjustAvailableAsync(TenantId tenantId, Guid variantId, int delta, string? reason, CancellationToken ct = default);

    /// <summary>Ubicación física de la variante (crea la fila de stock con 0 si no existe).</summary>
    Task SetLocationAsync(TenantId tenantId, Guid variantId, string? location, CancellationToken ct = default);

    /// <summary>
    /// available -= qty, reserved += qty SI available >= qty (atómico).
    /// True = reservado (escribe Reservation + movimiento). False = sin stock.
    /// </summary>
    Task<Result<Reservation>> TryReserveAsync(TenantId tenantId, Guid variantId, int quantity, CancellationToken ct = default);

    /// <summary>reserved -= qty (la mercadería sale). Marca la reserva confirmada.</summary>
    Task<Result> ConfirmReservationAsync(TenantId tenantId, Guid reservationId, CancellationToken ct = default);

    /// <summary>reserved -= qty, available += qty. Marca liberada.</summary>
    Task<Result> ReleaseReservationAsync(TenantId tenantId, Guid reservationId, CancellationToken ct = default);

    /// <summary>Libera todas las reservas activas vencidas (job). Devuelve cuántas.</summary>
    Task<int> ReleaseExpiredAsync(DateTime nowUtc, CancellationToken ct = default);

    Task<IReadOnlyList<StockMovement>> GetLedgerAsync(TenantId tenantId, Guid variantId, int limit, CancellationToken ct = default);
}
