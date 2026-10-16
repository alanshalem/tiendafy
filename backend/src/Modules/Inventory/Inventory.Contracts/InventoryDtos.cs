using SharedKernel.Common;

namespace Inventory.Contracts;

public sealed record ReservationDto(
    Guid Id,
    Guid VariantId,
    int Quantity,
    string Status,
    DateTime ExpiresAtUtc);

/// <summary>
/// Puerta del módulo para Checkout: reservar al iniciar pago,
/// confirmar al aprobarse, liberar al expirar/cancelar/compensar.
/// </summary>
public interface IInventoryService
{
    Task<Result<ReservationDto>> ReserveAsync(Guid tenantId, Guid variantId, int quantity, CancellationToken ct = default);
    Task<Result> ConfirmReservationAsync(Guid tenantId, Guid reservationId, CancellationToken ct = default);
    Task<Result> ReleaseReservationAsync(Guid tenantId, Guid reservationId, CancellationToken ct = default);

    /// <summary>Le da más tiempo a una reserva activa (pago por transferencia).</summary>
    Task<Result> ExtendReservationAsync(Guid tenantId, Guid reservationId, DateTime expiresAtUtc, CancellationToken ct = default);
}
