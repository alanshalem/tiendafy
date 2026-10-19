using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Payments.Contracts;
using Payments.Core.Abstractions;
using Payments.Core.Domain;
using Payments.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Payments.Infrastructure.Payway;

/// <summary>
/// Cliente de la API v2 de Payway (ex Decidir).
///
/// Tres cosas de esta API condicionan todo lo que hay acá:
///
/// 1. <b>Un 402 no es un error.</b> Es un rechazo del emisor, y viene con el
///    cuerpo completo del pago adentro. Tratarlo como fallo HTTP tira a la
///    basura el motivo del rechazo, que es justo lo que hay que mostrarle al
///    comprador.
/// 2. <b>Los montos van en centavos.</b> Coincide con cómo el proyecto guarda
///    los <see cref="Money"/>, así que no hay ninguna conversión — y esa
///    ausencia es deliberada: la conversión es donde se cobra de más o de menos.
/// 3. <b>No hay idempotencia.</b> Por eso un cobro nunca se reintenta solo. Si
///    algo falla, se consulta por nuestro id de transacción y se adopta lo que
///    Payway diga que pasó.
/// </summary>
public sealed class PaywayClient(
    HttpClient http,
    PaymentsDbContext db,
    IPaywayCredentialProtector protector,
    ILogger<PaywayClient> logger) : IPaywayPaymentService
{
    /// <summary>
    /// Cobrar puede tardar: la documentación de Payway admite entre 20 y 30
    /// segundos con transacciones concurrentes. Un timeout corto no evita el
    /// problema, lo crea: corta antes de saber el resultado y deja la duda de
    /// si se cobró.
    /// </summary>
    private static readonly TimeSpan ChargeTimeout = TimeSpan.FromSeconds(35);
    private static readonly TimeSpan QueryTimeout = TimeSpan.FromSeconds(10);

    public async Task<PaywayPublicConfig> GetPublicConfigAsync(TenantId tenantId, CancellationToken ct = default)
    {
        var connection = await FindConnectionAsync(tenantId, ct);
        return connection is null || !connection.IsActive
            ? new PaywayPublicConfig(false, null, null, null, [])
            : new PaywayPublicConfig(true, connection.PublicKey, connection.BaseUrl, connection.SiteId, connection.InstallmentOptions);
    }

    public async Task<Result<PaywayChargeResult>> ChargeAsync(PaywayChargeRequest request, CancellationToken ct = default)
    {
        var resolved = await ResolveAsync(request.TenantId, ct);
        if (resolved.IsFailure) return Result.Failure<PaywayChargeResult>(resolved.Error);
        var (connection, apiKey) = resolved.Value;

        var attempt = await OpenAttemptAsync(request, ct);
        if (attempt.IsFailure) return Result.Failure<PaywayChargeResult>(attempt.Error);
        if (attempt.Value.Existing is { } existing) return existing;
        var row = attempt.Value.Row!;

        var body = new Dictionary<string, object?>
        {
            ["site_transaction_id"] = row.SiteTransactionId,
            ["token"] = request.Token,
            ["bin"] = request.Bin,
            ["amount"] = request.AmountMinor,
            ["currency"] = request.Currency.ToUpperInvariant(),
            ["installments"] = request.Installments,
            ["payment_type"] = "single",
            ["sub_payments"] = Array.Empty<object>(),
            ["establishment_name"] = connection.EstablishmentName ?? "TIENDAFY",
            ["customer"] = new
            {
                id = request.OrderId.ToString("N"),
                email = request.BuyerEmail,
                ip_address = request.BuyerIpAddress,
            },
        };

        if (row.PaymentMethodId is { } methodId) body["payment_method_id"] = methodId;
        if (!string.IsNullOrWhiteSpace(request.Description)) body["description"] = request.Description;

        HttpResponseMessage? response = null;
        string json;
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(ChargeTimeout);

            using var message = Build(HttpMethod.Post, connection, "payments", apiKey);
            message.Content = JsonContent.Create(body);
            response = await http.SendAsync(message, timeout.Token);
            json = await response.Content.ReadAsStringAsync(ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException or TaskCanceledException)
        {
            response?.Dispose();

            // Acá NO se reintenta. Un timeout no dice que no se cobró: dice que
            // no sabemos. Se le pregunta a Payway por nuestro id y se adopta la
            // respuesta; reintentar a ciegas es como se cobra dos veces.
            logger.LogWarning(ex, "Payway no respondió al cobrar {SiteTransactionId}. Se consulta el estado real.",
                row.SiteTransactionId);

            var recovered = await FindBySiteTransactionIdAsync(request.TenantId, row.SiteTransactionId, ct);
            if (recovered.IsSuccess && recovered.Value is { } found)
            {
                await SettleAsync(row, found, ct);
                return found;
            }

            await SettleAsync(row, Unknown(request.AmountMinor, "timeout"), ct);
            return Result.Failure<PaywayChargeResult>(new Error("Payway.Timeout",
                "No pudimos confirmar el pago. No vuelvas a intentar: lo estamos verificando."));
        }

        using (response)
        {
            // 402 = rechazo del emisor. Es un resultado de negocio, con el
            // detalle del motivo en el cuerpo, no un error de integración.
            if (response.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK or HttpStatusCode.PaymentRequired)
            {
                var result = Parse(json, request.AmountMinor);
                await SettleAsync(row, result, ct);
                return result;
            }

            logger.LogError("Payway rechazó el cobro {SiteTransactionId} con {Status}: {Body}",
                row.SiteTransactionId, (int)response.StatusCode, json);
            await SettleAsync(row, Unknown(request.AmountMinor, $"http_{(int)response.StatusCode}"), ct);

            // El token de Payway es de un solo uso y vive 15 minutos: reusarlo
            // devuelve 400 con {"code":"repeated","param":"token"}. Casi siempre
            // significa que el comprador reenvió el formulario, así que es una
            // red de contención más contra el doble cobro — y merece que se le
            // diga qué pasó en vez de un "datos inválidos".
            if (response.StatusCode == HttpStatusCode.BadRequest && PaywayMaps.IsRepeatedToken(json))
            {
                return Result.Failure<PaywayChargeResult>(Error.Conflict("Payway.TokenAlreadyUsed",
                    "Los datos de la tarjeta ya se usaron para un intento anterior. Volvé a cargarlos."));
            }

            return Result.Failure<PaywayChargeResult>(response.StatusCode switch
            {
                HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => new Error("Payway.BadCredentials",
                    "Las credenciales de Payway de la tienda no son válidas."),
                HttpStatusCode.BadRequest => Error.Validation("Payway.BadRequest",
                    "Payway rechazó los datos del pago."),
                _ => new Error("Payway.Unavailable",
                    "Payway no está disponible en este momento. Probá de nuevo en unos minutos."),
            });
        }
    }

    public async Task<Result<PaywayChargeResult>> GetPaymentAsync(TenantId tenantId, string providerPaymentId, CancellationToken ct = default)
    {
        var resolved = await ResolveAsync(tenantId, ct);
        if (resolved.IsFailure) return Result.Failure<PaywayChargeResult>(resolved.Error);
        var (connection, apiKey) = resolved.Value;

        var json = await GetAsync(connection, $"payments/{providerPaymentId}", apiKey, ct);
        return json is null
            ? Result.Failure<PaywayChargeResult>(new Error("Payway.NotFound", "No se encontró el pago en Payway."))
            : Parse(json, 0);
    }

    public async Task<Result<PaywayChargeResult?>> FindBySiteTransactionIdAsync(
        TenantId tenantId, string siteTransactionId, CancellationToken ct = default)
    {
        var resolved = await ResolveAsync(tenantId, ct);
        if (resolved.IsFailure) return Result.Failure<PaywayChargeResult?>(resolved.Error);
        var (connection, apiKey) = resolved.Value;

        var json = await GetAsync(connection,
            $"payments?siteOperationId={Uri.EscapeDataString(siteTransactionId)}&pageSize=1", apiKey, ct);
        if (json is null) return Result.Success<PaywayChargeResult?>(null);

        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("results", out var results)
            || results.ValueKind != JsonValueKind.Array
            || results.GetArrayLength() == 0)
        {
            return Result.Success<PaywayChargeResult?>(null);
        }

        return Result.Success<PaywayChargeResult?>(ParseElement(results[0], 0));
    }

    public async Task<Result<PaywayRefundResult>> RefundAsync(
        TenantId tenantId, string providerPaymentId, long? amountMinor, CancellationToken ct = default)
    {
        var resolved = await ResolveAsync(tenantId, ct);
        if (resolved.IsFailure) return Result.Failure<PaywayRefundResult>(resolved.Error);
        var (connection, apiKey) = resolved.Value;

        // Total = cuerpo vacío; parcial = con el monto. Mismo endpoint.
        object body = amountMinor is { } amount ? new { amount } : new { };

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(ChargeTimeout);

        using var message = Build(HttpMethod.Post, connection, $"payments/{providerPaymentId}/refunds", apiKey);
        message.Content = JsonContent.Create(body);

        HttpResponseMessage response;
        string json;
        try
        {
            response = await http.SendAsync(message, timeout.Token);
            json = await response.Content.ReadAsStringAsync(ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException && !ct.IsCancellationRequested)
        {
            // Igual que con un cobro: sin idempotencia, un timeout no dice que no
            // se devolvió. No se reintenta; se avisa que hay que mirarlo antes de
            // volver a pedirlo, o se devuelve dos veces.
            logger.LogError(ex, "Payway no respondió a la devolución de {PaymentId}.", providerPaymentId);
            return Result.Failure<PaywayRefundResult>(new Error("Payway.RefundUnknown",
                "Payway no respondió y no sabemos si hizo la devolución. Fijate en el portal de Payway antes de volver a intentarlo."));
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                logger.LogError("Payway rechazó la devolución de {PaymentId} con {Status}: {Body}",
                    providerPaymentId, (int)response.StatusCode, json);
                return Result.Failure<PaywayRefundResult>(new Error("Payway.RefundFailed",
                    "Payway no pudo procesar la devolución."));
            }

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var status = JsonRead.GetString(root, "status") ?? "";

            // Un 2xx con la devolución rechazada adentro no es una devolución.
            if (status.Equals("rejected", StringComparison.OrdinalIgnoreCase))
            {
                logger.LogError("Payway rechazó la devolución de {PaymentId}: {Body}", providerPaymentId, json);
                return Result.Failure<PaywayRefundResult>(new Error("Payway.RefundFailed",
                    "Payway no pudo procesar la devolución."));
            }

            return new PaywayRefundResult(
                root.TryGetProperty("id", out var id) ? id.ToString() : "",
                root.TryGetProperty("amount", out var amt) && amt.TryGetInt64(out var value) ? value : amountMinor ?? 0,
                status);
        }
    }

    // ----------------------------------------------------------------- Interno

    private async Task<PaywayConnection?> FindConnectionAsync(TenantId tenantId, CancellationToken ct) =>
        await db.PaywayConnections.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);

    private async Task<Result<(PaywayConnection Connection, string ApiKey)>> ResolveAsync(TenantId tenantId, CancellationToken ct)
    {
        var connection = await FindConnectionAsync(tenantId, ct);
        if (connection is null || !connection.IsActive)
            return Result.Failure<(PaywayConnection, string)>(new Error("Payway.NotConnected",
                "La tienda no tiene Payway configurado."));

        try
        {
            return (connection, protector.Unprotect(connection.PrivateKeyEncrypted));
        }
        catch (Exception ex)
        {
            // Pasa si rotaron las claves de Data Protection o si el dato se
            // corrompió. Es un problema de configuración, no del comprador.
            logger.LogError(ex, "No se pudo descifrar la clave privada de Payway del tenant {TenantId}.", tenantId.Value);
            return Result.Failure<(PaywayConnection, string)>(new Error("Payway.BadCredentials",
                "Las credenciales de Payway de la tienda no se pudieron leer. Volvé a cargarlas."));
        }
    }

    /// <summary>
    /// El intento nuevo (<c>Row</c>) o, si no corresponde cobrar otra vez, lo
    /// que ya se sabe del anterior (<c>Existing</c>).
    /// </summary>
    private sealed record AttemptOpening(PaywayPaymentAttempt? Row, PaywayChargeResult? Existing);

    /// <summary>
    /// Abre la fila del intento ANTES de llamar a Payway. Si el proceso se cae
    /// en el medio, el registro queda y se puede averiguar qué pasó.
    ///
    /// Solo se cobra de nuevo una orden cuyo último intento fue rechazado. Desde
    /// el checkout no pasa (un rechazo deja la orden fallida y otra tarjeta es
    /// otra orden); queda como defensa. Si fue aprobado o todavía no se
    /// resolvió (en revisión, esperando el 3D Secure, sin respuesta), el mismo
    /// pedido repetido —doble clic, reintento del navegador, otra pestaña
    /// sobre la misma compra— recibe ese resultado y Payway no se entera: sin
    /// idempotencia de su lado, cobrar "por las dudas" es cobrar dos veces.
    /// </summary>
    private async Task<Result<AttemptOpening>> OpenAttemptAsync(PaywayChargeRequest request, CancellationToken ct)
    {
        var previous = await db.PaywayPaymentAttempts
            .Where(a => a.TenantId == request.TenantId.Value && a.OrderId == request.OrderId)
            .OrderByDescending(a => a.AttemptNumber)
            .FirstOrDefaultAsync(ct);

        if (previous is not null && previous.Status != PaywayPaymentStatus.Declined)
        {
            // Sin respuesta todavía: el otro pedido está esperando a Payway.
            if (previous.ProcessedAtUtc is null)
                return Result.Failure<AttemptOpening>(InProgress());
            return new AttemptOpening(null, new PaywayChargeResult(
                previous.Status, previous.ProviderPaymentId, previous.RawStatus ?? string.Empty, previous.AmountMinor,
                previous.AuthorizationCode, previous.NetworkTransactionId, previous.TicketNumber));
        }

        var brand = request.CardBrand ?? PaywayMaps.BrandFromBin(request.Bin);
        var number = (previous?.AttemptNumber ?? 0) + 1;

        var row = PaywayPaymentAttempt.Start(
            request.TenantId.Value, request.OrderId, number,
            PaywayPaymentAttempt.BuildSiteTransactionId(request.OrderId, number),
            request.AmountMinor, request.Currency, request.Installments,
            request.Bin, request.CardLastFour, brand,
            PaywayMaps.PaymentMethodId(brand, request.IsDebit));

        db.PaywayPaymentAttempts.Add(row);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // El índice único frenó un intento en paralelo con el mismo número.
            // Es exactamente lo que tiene que pasar: sin idempotencia del lado
            // de Payway, la base es la última línea contra el doble cobro.
            db.ChangeTracker.Clear();
            return Result.Failure<AttemptOpening>(InProgress());
        }

        return new AttemptOpening(row, null);
    }

    private static Error InProgress() => Error.Conflict("Payway.InProgress",
        "Ya hay un pago en curso para esta compra. Esperá unos segundos.");

    private async Task SettleAsync(PaywayPaymentAttempt row, PaywayChargeResult result, CancellationToken ct)
    {
        if (result.Status == PaywayPaymentStatus.Unknown && !string.IsNullOrWhiteSpace(result.RawStatus))
        {
            logger.LogWarning("Payway devolvió un estado que no sabemos interpretar: '{RawStatus}' en {SiteTransactionId}.",
                result.RawStatus, row.SiteTransactionId);
        }

        row.Complete(
            result.Status, result.RawStatus, result.ProviderPaymentId,
            result.AuthorizationCode, result.NetworkTransactionId, result.TicketNumber,
            result.Decline?.ProviderCode, result.Decline?.ProviderDescription);

        await db.SaveChangesAsync(ct);
    }

    private HttpRequestMessage Build(HttpMethod method, PaywayConnection connection, string path, string apiKey)
    {
        var message = new HttpRequestMessage(method, $"{connection.BaseUrl}/{path}");
        message.Headers.TryAddWithoutValidation("apikey", apiKey);
        message.Headers.TryAddWithoutValidation("Cache-Control", "no-cache");
        return message;
    }

    private async Task<string?> GetAsync(PaywayConnection connection, string path, string apiKey, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(QueryTimeout);

        try
        {
            using var message = Build(HttpMethod.Get, connection, path, apiKey);
            using var response = await http.SendAsync(message, timeout.Token);
            if (!response.IsSuccessStatusCode) return null;
            return await response.Content.ReadAsStringAsync(ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException or TaskCanceledException)
        {
            logger.LogWarning(ex, "Payway no respondió a la consulta {Path}.", path);
            return null;
        }
    }

    private static PaywayChargeResult Unknown(long amountMinor, string raw) =>
        new(PaywayPaymentStatus.Unknown, null, raw, amountMinor);

    private static PaywayChargeResult Parse(string json, long fallbackAmount)
    {
        using var doc = JsonDocument.Parse(json);
        return ParseElement(doc.RootElement, fallbackAmount);
    }

    private static PaywayChargeResult ParseElement(JsonElement root, long fallbackAmount)
    {
        var raw = JsonRead.GetString(root, "status") ?? "";
        var status = PaywayMaps.Status(raw);

        var amount = root.TryGetProperty("amount", out var amt) && amt.TryGetInt64(out var value)
            ? value
            : fallbackAmount;

        string? authorization = null, ticket = null;
        PaywayDecline? decline = null;

        if (root.TryGetProperty("status_details", out var details) && details.ValueKind == JsonValueKind.Object)
        {
            authorization = JsonRead.GetString(details, "card_authorization_code");
            ticket = JsonRead.GetString(details, "ticket");

            if (details.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.Object
                && error.TryGetProperty("reason", out var reason) && reason.ValueKind == JsonValueKind.Object)
            {
                var code = reason.TryGetProperty("id", out var id) && id.TryGetInt32(out var parsed) ? parsed : 0;
                decline = PaywayMaps.Decline(code, JsonRead.GetString(reason, "description"));
            }
        }

        return new PaywayChargeResult(
            status,
            root.TryGetProperty("id", out var pid) ? pid.ToString() : null,
            raw,
            amount,
            authorization,
            JsonRead.GetString(root, "tid"),
            ticket,
            decline);
    }
}
