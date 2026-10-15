using System.Text.Json;
using Api.Endpoints;
using Checkout.Core.Domain;
using SharedKernel.Common;

namespace Api.Shipping;

/// <summary>
/// Lo que la creación le cuenta al guard: si el carrier ya creó el envío. De
/// ahí en adelante, un error no puede soltar la reserva (ver <see cref="ShipmentWriteAhead"/>).
/// </summary>
public sealed class ShipmentAttempt
{
    /// <summary>Lo que devolvió el carrier (número, id), para poder rastrear el envío si no se guarda.</summary>
    public string? CreatedAtCarrier { get; private set; }

    /// <summary>Se llama apenas el carrier confirma el envío, ANTES de guardarlo.</summary>
    public void CarrierCreated(string detail) => CreatedAtCarrier = detail;
}

/// <summary>
/// Crea el envío de una venta con un carrier UNA sola vez, aunque lleguen dos
/// pedidos juntos (doble clic, dos operadores).
///
/// Ningún carrier deduplica, así que mirar "¿ya hay envío?" antes de llamar no
/// alcanza: los dos pedidos miran a la vez y los dos llaman. Acá se graba una
/// reserva (<see cref="ShipmentClaim"/>) ANTES de llamar al carrier, y su
/// índice único decide: el que la graba llama; el otro recibe un 409 sin
/// llamar. Con la reserva tomada se vuelve a mirar si hay envío, por si el
/// otro pedido terminó entre la primera mirada y la reserva.
///
/// <list type="bullet">
/// <item>El carrier rechazó el envío (error con respuesta): la reserva se suelta y se puede reintentar.</item>
/// <item>El carrier no respondió (timeout, red): se suelta igual, pero se avisa
/// que el envío pudo haberse creado y que hay que mirarlo antes de reintentar.</item>
/// <item>El carrier lo creó y no se pudo guardar: la reserva queda "a revisar"
/// y nunca vence sola. Otro envío sería un duplicado que se paga.</item>
/// <item>El proceso murió a mitad de camino: la reserva vence a los
/// <see cref="StaleAfter"/> para no trabar la venta para siempre.</item>
/// </list>
/// </summary>
public static class ShipmentWriteAhead
{
    /// <summary>
    /// Bastante más de lo que puede tardar una creación: Andreani hace login y
    /// orden con 20 s de timeout cada uno; Zipnova y MiCorreo cortan antes.
    /// </summary>
    public static readonly TimeSpan StaleAfter = TimeSpan.FromMinutes(5);

    /// <param name="findExisting">El envío ya guardado de esa venta, como respuesta; null si no hay.</param>
    /// <param name="create">Llama al carrier y guarda. Avisa con <see cref="ShipmentAttempt.CarrierCreated"/> apenas el carrier confirma.</param>
    public static async Task<IResult> CreateOnceAsync(
        IShipmentClaimRepository claims, ILogger logger,
        Guid tenantId, Guid orderId, string carrier, string carrierName,
        Func<CancellationToken, Task<IResult?>> findExisting,
        Func<ShipmentAttempt, Task<IResult>> create,
        CancellationToken ct)
    {
        var (outcome, claimId) = await claims.TryClaimAsync(
            tenantId, orderId, carrier, DateTime.UtcNow - StaleAfter, ct);

        switch (outcome)
        {
            case ShipmentClaimOutcome.Busy:
                return Error.Conflict("Shipping.InProgress",
                    "Ya hay un envío en curso para esta venta. Esperá unos segundos y recargá la página.").ToProblem();
            case ShipmentClaimOutcome.NeedsReview:
                return Error.Conflict("Shipping.NeedsReview",
                    $"{carrierName} creó un envío para esta venta que no quedó registrado en Tiendafy. " +
                    $"Revisalo en el panel de {carrierName} antes de crear otro y avisá a soporte.").ToProblem();
            case ShipmentClaimOutcome.ClaimedOverStale:
                logger.LogWarning(
                    "Se pisó una reserva vieja de envío de {Carrier} para la venta {OrderId}: el pedido anterior no terminó.",
                    carrier, orderId);
                break;
        }

        var attempt = new ShipmentAttempt();
        var keepClaim = false;
        try
        {
            if (await findExisting(ct) is { } existing) return existing;
            return await create(attempt);
        }
        catch (Exception ex) when (attempt.CreatedAtCarrier is not null)
        {
            // El carrier creó el envío y no quedó guardado. Si se soltara la
            // reserva, el reintento crearía otro, y se pagan los dos.
            keepClaim = true;
            logger.LogCritical(ex,
                "{Carrier} creó el envío de la venta {OrderId} ({Detail}) pero no se pudo guardar: queda a revisar.",
                carrier, orderId, LogValue.Safe(attempt.CreatedAtCarrier));
            await claims.MarkNeedsReviewAsync(claimId, attempt.CreatedAtCarrier, CancellationToken.None);
            return Results.Problem(
                title: "Shipping.NotRecorded",
                detail: $"El envío se creó en {carrierName} ({attempt.CreatedAtCarrier}) pero no se pudo registrar " +
                    "en Tiendafy. No lo vuelvas a crear: avisá a soporte.",
                statusCode: StatusCodes.Status500InternalServerError);
        }
        catch (Exception ex) when (IsNoAnswer(ex))
        {
            logger.LogWarning(ex, "{Carrier} no respondió al crear el envío de la venta {OrderId}.", carrier, orderId);
            return Results.Problem(
                title: "Shipping.NoAnswer",
                detail: $"{carrierName} no respondió a tiempo. Puede que el envío se haya creado igual: " +
                    $"revisalo en el panel de {carrierName} antes de volver a intentar.",
                statusCode: StatusCodes.Status502BadGateway);
        }
        finally
        {
            // Sin el token del pedido: soltar la reserva no puede cancelarse.
            if (!keepClaim) await claims.ReleaseAsync(claimId, CancellationToken.None);
        }
    }

    /// <summary>Errores en los que no se sabe qué hizo el carrier: no hubo respuesta, o no se pudo leer.</summary>
    private static bool IsNoAnswer(Exception ex) =>
        ex is HttpRequestException or OperationCanceledException or JsonException;
}
