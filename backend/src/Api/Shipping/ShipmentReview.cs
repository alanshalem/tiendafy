using Api.Auth;
using Api.Endpoints;
using Checkout.Core.Domain;
using Identity.Infrastructure;
using Orders.Core.Domain;
using SharedKernel.Common;

namespace Api.Shipping;

/// <summary>Lo que se carga a mano al cerrar una reserva a revisar: el número del envío que el carrier sí creó.</summary>
public sealed record ShipmentReviewRecordRequest(string? Number);

/// <summary>
/// Destrabar desde el panel una reserva de envío que quedó "a revisar" (ver
/// <see cref="ShipmentWriteAhead"/>): el carrier puede haber creado el envío
/// sin que quedara guardado acá, y mientras tanto la venta no deja crear otro.
///
/// Lo resuelve alguien del equipo después de mirar el panel del carrier, de
/// una de dos formas:
/// <list type="bullet">
/// <item>No se creó: se suelta la reserva y se puede crear de nuevo. Si se
/// equivoca, sale un envío duplicado que se paga; por eso el panel pide confirmar.</item>
/// <item>Se creó: se carga el número y se guarda el envío como si la creación
/// hubiera terminado bien. La reserva se borra en la misma transacción.</item>
/// </list>
/// Las dos solo valen mientras la reserva está a revisar (409 si no), así que
/// un doble clic o dos operadores no hacen nada dos veces. Quién lo resolvió
/// queda en el registro de actividad de la tienda.
/// </summary>
public static class ShipmentReview
{
    /// <summary>
    /// Lo que ve el panel al lado del botón del carrier: la reserva a revisar
    /// (con lo que devolvió el carrier) o null.
    /// </summary>
    public static async Task<object?> PendingAsync(
        IShipmentClaimRepository claims, Guid tenantId, Guid orderId, string carrier, CancellationToken ct) =>
        await claims.FindNeedsReviewAsync(tenantId, orderId, carrier, ct) is { } claim
            ? new { note = claim.Note, claimedAtUtc = claim.ClaimedAtUtc }
            : null;

    /// <summary>"Ya lo revisé: no se creó". Suelta la reserva.</summary>
    public static async Task<IResult> ReleaseAsync(
        HttpContext http, Guid tenantId, Guid orderId, string carrier, string carrierName,
        IOrderRepository orders, IShipmentClaimRepository claims, IAuditLog audit, ILogger logger, CancellationToken ct)
    {
        var order = await orders.GetByIdAsync(TenantId.From(tenantId), orderId, ct);
        if (order is null) return Results.NotFound();

        if (!await claims.ReleaseNeedsReviewAsync(tenantId, orderId, carrier, ct)) return NotInReview();

        logger.LogWarning(
            "Se soltó a mano la reserva a revisar de {Carrier} de la venta {OrderId}: el usuario {UserId} dice que no se creó.",
            carrier, orderId, http.User.GetUserId());
        await AuditAsync(http, audit, logger, tenantId, "shipment.review.release",
            $"Liberó el envío de {carrierName} de la venta {order.Label}: revisó que no se había creado.");
        return Results.NoContent();
    }

    /// <summary>
    /// "Se creó: cargar el número". Guarda <paramref name="recorded"/> y cierra
    /// la reserva en la misma transacción. <paramref name="number"/> es lo que
    /// queda en el registro de actividad.
    /// </summary>
    public static async Task<IResult> RecordAsync<TShipment>(
        HttpContext http, Guid tenantId, Guid orderId, string carrier, string carrierName,
        TShipment recorded, string? number, Func<TShipment, IResult> ok,
        IOrderRepository orders, IShipmentClaimRepository claims, IAuditLog audit, ILogger logger, CancellationToken ct)
        where TShipment : class
    {
        var order = await orders.GetByIdAsync(TenantId.From(tenantId), orderId, ct);
        if (order is null) return Results.NotFound();

        if (!await claims.CloseNeedsReviewAsync(tenantId, orderId, carrier, recorded, ct)) return NotInReview();

        var detail = string.IsNullOrWhiteSpace(number) ? "" : $" ({number})";
        logger.LogWarning(
            "Se cargó a mano el envío de {Carrier} de la venta {OrderId}{Detail}: el usuario {UserId} cerró la reserva a revisar.",
            carrier, orderId, LogValue.Safe(detail), http.User.GetUserId());
        await AuditAsync(http, audit, logger, tenantId, "shipment.review.record",
            $"Cargó a mano el envío de {carrierName} de la venta {order.Label}{detail}, que se había creado sin quedar registrado.");
        return ok(recorded);
    }

    private static IResult NotInReview() =>
        Error.Conflict("Shipping.NotInReview",
            "Este envío ya no está a revisar: puede que alguien lo haya resuelto. Recargá la venta.").ToProblem();

    /// <summary>
    /// El cambio ya quedó hecho: si el registro de actividad falla, se loguea y
    /// no se devuelve un error que invite a repetirlo.
    /// </summary>
    private static async Task AuditAsync(
        HttpContext http, IAuditLog audit, ILogger logger, Guid tenantId, string action, string summary)
    {
        try
        {
            await audit.RecordAsync(tenantId, http.User.GetUserId(), http.User.Identity?.Name ?? "—",
                action, summary, CancellationToken.None);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "No se pudo registrar en la actividad: {Summary}", LogValue.Safe(summary));
        }
    }
}
