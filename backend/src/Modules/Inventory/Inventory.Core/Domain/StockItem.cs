using SharedKernel.Common;
using SharedKernel.Domain;

namespace Inventory.Core.Domain;

/// <summary>
/// Proyección de stock por variante: disponible + reservado.
/// Las MUTACIONES de available/reserved van por SQL atómico en el
/// repositorio (UPDATE ... WHERE available >= qty) — nunca read-modify-write
/// desde acá: esa race es exactamente el oversell que este módulo previene.
///
/// Sin fila, la variante tiene 0 (no se cargó stock). Con
/// <see cref="Unlimited"/>, el stock es "sin límite": siempre se puede vender,
/// no se reserva ni se descuenta, y Available/Reserved no significan nada.
/// </summary>
public sealed class StockItem : Entity
{
    public TenantId TenantId { get; private set; }
    public Guid VariantId { get; private set; }
    public int Available { get; private set; }
    public int Reserved { get; private set; }

    /// <summary>"Sin límite": se vende siempre, sin reservar ni descontar.</summary>
    public bool Unlimited { get; private set; }

    /// <summary>Lo que se puede vender: null = sin límite.</summary>
    public int? Sellable => Unlimited ? null : Available;

    /// <summary>Ubicación física en el depósito ("Estantería B3"). Solo informativa.</summary>
    public string? Location { get; private set; }

    public void SetLocation(string? location) =>
        Location = string.IsNullOrWhiteSpace(location) ? null : location.Trim();

    private StockItem() { } // EF Core

    public StockItem(TenantId tenantId, Guid variantId, int initialAvailable, bool unlimited = false)
        : base(Guid.NewGuid())
    {
        TenantId = tenantId;
        VariantId = variantId;
        Available = initialAvailable;
        Reserved = 0;
        Unlimited = unlimited;
    }

    /// <summary>
    /// Lo vendible de cada variante pedida: null = sin límite; sin fila, 0
    /// (igual que la reserva del checkout).
    /// </summary>
    public static Dictionary<Guid, int?> SellableByVariant(
        IEnumerable<Guid> variantIds, IEnumerable<StockItem> items)
    {
        var byVariant = items.ToDictionary(s => s.VariantId);
        return variantIds.Distinct().ToDictionary(
            id => id, id => byVariant.TryGetValue(id, out var s) ? s.Sellable : 0);
    }

    /// <summary>Suma de lo vendible (un producto): null si alguna variante es sin límite.</summary>
    public static int? Total(IEnumerable<int?> sellable)
    {
        var total = 0;
        foreach (var s in sellable)
        {
            if (s is not { } n) return null;
            total += n;
        }
        return total;
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

    public Result Confirm(DateTime nowUtc)
    {
        if (Status != ReservationStatus.Active)
            return Result.Failure(Error.Conflict("Reservation.NotActive", "La reserva de stock ya no está activa."));
        if (nowUtc >= ExpiresAtUtc)
            return Result.Failure(Error.Conflict("Reservation.Expired", "La reserva de stock venció."));

        Status = ReservationStatus.Confirmed;
        return Result.Success();
    }

    /// <summary>
    /// Estira el vencimiento de una reserva activa (nunca lo acorta). La usa el
    /// pago por transferencia: el comprador tiene horas para pagar, no los 30
    /// minutos de un checkout con tarjeta.
    /// </summary>
    public Result ExtendUntil(DateTime expiresAtUtc)
    {
        if (Status != ReservationStatus.Active)
            return Result.Failure(Error.Conflict("Reservation.NotActive", "La reserva de stock ya no está activa."));
        if (expiresAtUtc > ExpiresAtUtc) ExpiresAtUtc = expiresAtUtc;
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
