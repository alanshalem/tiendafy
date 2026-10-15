namespace Checkout.Core.Domain;

/// <summary>
/// Reserva de "estoy creando el envío de esta venta con este carrier",
/// grabada ANTES de llamar al carrier (write-ahead).
///
/// Andreani, Zipnova y MiCorreo no deduplican: dos pedidos de creación son
/// dos envíos reales, y Andreani ni siquiera deja cancelarlos. Mirar si ya
/// hay envío antes de llamar no alcanza: con un doble clic, los dos pedidos
/// miran a la vez, los dos llaman al carrier, y el índice único de la tabla
/// de envíos frena recién la segunda fila, cuando el segundo envío ya existe.
/// La reserva tiene su propio índice único por (tienda, venta, carrier): el
/// que la graba primero llama al carrier; el otro recibe un 409 sin llamar.
///
/// Vive en una tabla aparte y no como una fila "pendiente" en la de envíos
/// para que nadie que lea envíos (despacho, etiquetas, seguimiento del
/// comprador) tenga que aprender a ignorar las pendientes.
/// </summary>
public sealed class ShipmentClaim
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid OrderId { get; private set; }

    /// <summary>Uno de <see cref="ShipmentCarriers"/>.</summary>
    public string Carrier { get; private set; } = string.Empty;

    /// <summary>Uno de <see cref="ShipmentClaimStatus"/>.</summary>
    public string Status { get; private set; } = ShipmentClaimStatus.InProgress;

    public DateTime ClaimedAtUtc { get; private set; }

    /// <summary>Qué devolvió el carrier cuando el envío no se pudo registrar acá. Para destrabarlo a mano.</summary>
    public string? Note { get; private set; }

    private ShipmentClaim() { } // EF Core

    public static ShipmentClaim Create(Guid tenantId, Guid orderId, string carrier) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        OrderId = orderId,
        Carrier = carrier,
        Status = ShipmentClaimStatus.InProgress,
        ClaimedAtUtc = DateTime.UtcNow,
    };

    public const int MaxNoteLength = 500;
}

public static class ShipmentCarriers
{
    public const string Andreani = "andreani";
    public const string Zipnova = "zipnova";
    public const string Correo = "correo";
}

public static class ShipmentClaimStatus
{
    /// <summary>Alguien está llamando al carrier en este momento.</summary>
    public const string InProgress = "in_progress";

    /// <summary>
    /// El carrier creó el envío pero no se pudo guardar en Tiendafy. Nunca
    /// vence sola: crear otro sería un envío duplicado. Se destraba a mano,
    /// después de cargar el envío que ya existe.
    /// </summary>
    public const string NeedsReview = "needs_review";
}

/// <summary>Resultado de intentar reservar.</summary>
public enum ShipmentClaimOutcome
{
    /// <summary>La reserva es nuestra: se puede llamar al carrier.</summary>
    Claimed,

    /// <summary>Era nuestra después de pisar una reserva vieja (el proceso murió a mitad de camino).</summary>
    ClaimedOverStale,

    /// <summary>Otro pedido la tiene: hay un envío en curso.</summary>
    Busy,

    /// <summary>El carrier creó un envío que no quedó registrado: no se crea otro.</summary>
    NeedsReview,
}

public interface IShipmentClaimRepository
{
    /// <summary>
    /// Intenta reservar la creación del envío. Una reserva <see cref="ShipmentClaimStatus.InProgress"/>
    /// más vieja que <paramref name="staleBeforeUtc"/> se considera abandonada y se pisa.
    /// </summary>
    Task<(ShipmentClaimOutcome Outcome, Guid ClaimId)> TryClaimAsync(
        Guid tenantId, Guid orderId, string carrier, DateTime staleBeforeUtc, CancellationToken ct = default);

    /// <summary>Suelta la reserva (por id: nunca la de otro pedido que haya pisado una vieja).</summary>
    Task ReleaseAsync(Guid claimId, CancellationToken ct = default);

    /// <summary>El carrier creó el envío pero no se pudo guardar: la reserva queda para revisión.</summary>
    Task MarkNeedsReviewAsync(Guid claimId, string note, CancellationToken ct = default);
}
