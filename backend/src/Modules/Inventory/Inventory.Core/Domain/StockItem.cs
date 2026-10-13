using SharedKernel.Common;
using SharedKernel.Domain;

namespace Inventory.Core.Domain;

/// <summary>
/// Proyección de stock por variante: disponible + reservado.
/// Las MUTACIONES de available/reserved van por SQL atómico en el
/// repositorio (UPDATE ... WHERE available >= qty) — nunca read-modify-write
/// desde acá: esa race es exactamente el oversell que este módulo previene.
/// </summary>
public sealed class StockItem : Entity
{
    public TenantId TenantId { get; private set; }
    public Guid VariantId { get; private set; }
    public int Available { get; private set; }
    public int Reserved { get; private set; }

    /// <summary>Ubicación física en el depósito ("Estantería B3"). Solo informativa.</summary>
    public string? Location { get; private set; }

    public void SetLocation(string? location) =>
        Location = string.IsNullOrWhiteSpace(location) ? null : location.Trim();

    private StockItem() { } // EF Core

    public StockItem(TenantId tenantId, Guid variantId, int initialAvailable)
        : base(Guid.NewGuid())
    {
        TenantId = tenantId;
        VariantId = variantId;
        Available = initialAvailable;
        Reserved = 0;
    }
}

public enum MovementType
{
    Initial = 0,       // alta de stock
    Adjustment = 1,    // corrección manual del merchant
    Reserved = 2,      // checkout inició: available → reserved
    ReleaseExpired = 3,// reserva venció: reserved → available
    Released = 4,      // reserva cancelada: reserved → available
    Sold = 5,          // pago aprobado: reserved → afuera
}

/// <summary>
/// Ledger append-only: cada cambio de stock queda escrito. La proyección
/// (StockItem) se puede reconstruir desde acá; los reclamos de merchants
/// se responden con esta tabla.
/// </summary>
public sealed class StockMovement : Entity
{
    public TenantId TenantId { get; private set; }
    public Guid VariantId { get; private set; }
    public MovementType Type { get; private set; }
    /// <summary>Delta sobre available (negativo = sale de disponible).</summary>
    public int Quantity { get; private set; }
    public Guid? ReservationId { get; private set; }
    public string? Reason { get; private set; }
    public DateTime OccurredAtUtc { get; private set; }

    private StockMovement() { } // EF Core

    public StockMovement(TenantId tenantId, Guid variantId, MovementType type, int quantity, Guid? reservationId = null, string? reason = null)
        : base(Guid.NewGuid())
    {
        TenantId = tenantId;
        VariantId = variantId;
        Type = type;
        Quantity = quantity;
        ReservationId = reservationId;
        Reason = reason;
        OccurredAtUtc = DateTime.UtcNow;
    }
}

public enum ReservationStatus
{
    Active = 0,
    Confirmed = 1,
    Released = 2,
}

/// <summary>Reserva de checkout con vencimiento. Expira → vuelve a disponible.</summary>
public sealed class Reservation : Entity
{
    public static readonly TimeSpan DefaultTtl = TimeSpan.FromMinutes(30);

    public TenantId TenantId { get; private set; }
    public Guid VariantId { get; private set; }
    public int Quantity { get; private set; }
    public ReservationStatus Status { get; private set; }
    public DateTime ExpiresAtUtc { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private Reservation() { } // EF Core

    public Reservation(TenantId tenantId, Guid variantId, int quantity, TimeSpan? ttl = null)
        : base(Guid.NewGuid())
    {
        TenantId = tenantId;
        VariantId = variantId;
        Quantity = quantity;
        Status = ReservationStatus.Active;
        CreatedAtUtc = DateTime.UtcNow;
        ExpiresAtUtc = CreatedAtUtc + (ttl ?? DefaultTtl);
    }

    public bool IsExpired(DateTime nowUtc) => Status == ReservationStatus.Active && nowUtc >= ExpiresAtUtc;

    public Result Confirm(DateTime nowUtc)
    {
        if (Status != ReservationStatus.Active)
            return Result.Failure(Error.Conflict("Reservation.NotActive", "La reserva de stock ya no está activa."));
        if (nowUtc >= ExpiresAtUtc)
            return Result.Failure(Error.Conflict("Reservation.Expired", "La reserva de stock venció."));

        Status = ReservationStatus.Confirmed;
        return Result.Success();
    }

    public Result Release()
    {
        if (Status != ReservationStatus.Active)
            return Result.Failure(Error.Conflict("Reservation.NotActive", "La reserva de stock ya no está activa."));

        Status = ReservationStatus.Released;
        return Result.Success();
    }
}
