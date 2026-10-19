using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Payments.Contracts;
using Payments.Core.Abstractions;
using Payments.Core.Domain;
using SharedKernel.Common;

namespace Payments.Infrastructure.MercadoPago;

/// <summary>
/// Cobro con MercadoPago en nombre del seller: crea preferences de Checkout Pro
/// y consulta pagos, usando el access_token (descifrado, auto-refrescado) del tenant.
/// </summary>
public sealed class MercadoPagoCheckoutClient(
    HttpClient http,
    IOptions<MercadoPagoOptions> options,
    IMercadoPagoConnectionRepository connections,
    IMercadoPagoOAuthClient oauth,
    ITokenProtector protector,
    ILogger<MercadoPagoCheckoutClient> logger) : IMercadoPagoPaymentService
{
    private readonly MercadoPagoOptions _o = options.Value;

    public async Task<Result<PreferenceResult>> CreateCheckoutProPreferenceAsync(CreatePreferenceRequest request, CancellationToken ct = default)
    {
        var tokenResult = await GetSellerTokenAsync(request.TenantId, ct);
        if (tokenResult.IsFailure) return Result.Failure<PreferenceResult>(tokenResult.Error);
        var (accessToken, connection) = tokenResult.Value;

        var subtotal = request.Items.Sum(i => i.UnitPrice * i.Quantity);
        var total = Math.Max(0m, subtotal - request.DiscountAmount);

        // MercadoPago Checkout Pro no tiene campo de descuento a nivel orden. Con
        // descuento, colapsamos a un único ítem por el neto (cobro siempre correcto);
        // sin descuento, mandamos los ítems detallados.
        object[] items = request.DiscountAmount > 0
            ? [new { title = "Tu compra (con descuento)", quantity = 1, unit_price = total, currency_id = request.Currency }]
            : [.. request.Items.Select(i => new { title = i.Title, quantity = i.Quantity, unit_price = i.UnitPrice, currency_id = request.Currency })];

        var body = new Dictionary<string, object?>
        {
            ["items"] = items,
            ["payer"] = new { email = request.PayerEmail },
            ["back_urls"] = new
            {
                success = request.SuccessUrl,
                failure = request.FailureUrl,
                pending = request.PendingUrl,
            },
            ["auto_return"] = "approved",
            ["external_reference"] = request.OrderId.ToString(),
        };

        if (!string.IsNullOrWhiteSpace(_o.PublicApiBaseUrl))
            body["notification_url"] = $"{_o.PublicApiBaseUrl.TrimEnd('/')}/api/v1/payments/webhooks/mercadopago";

        if (connection.MarketplaceFeePercent > 0)
            body["marketplace_fee"] = Math.Round(total * connection.MarketplaceFeePercent / 100m, 2);

        if (connection.StatementDescriptorToSend is { } descriptor)
            body["statement_descriptor"] = descriptor;

        // Sin /v1: la API de preferences de Checkout Pro no está versionada como /v1/payments.
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{_o.ApiBaseUrl.TrimEnd('/')}/checkout/preferences");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        req.Headers.TryAddWithoutValidation("X-Idempotency-Key", request.OrderId.ToString());
        req.Content = JsonContent.Create(body);

        using var resp = await http.SendAsync(req, ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogError("MercadoPago preference error {Status}: {Body}", (int)resp.StatusCode, json);
            return Result.Failure<PreferenceResult>(new Error("MercadoPago.PreferenceFailed",
                "No se pudo iniciar el pago con MercadoPago."));
        }

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        var id = root.GetProperty("id").GetString() ?? string.Empty;
        var initPoint = root.TryGetProperty("init_point", out var ip) ? ip.GetString() ?? string.Empty : string.Empty;
        return new PreferenceResult(id, initPoint);
    }

    public async Task<Result<CardPaymentResult>> CreateCardPaymentAsync(CreateCardPaymentRequest request, CancellationToken ct = default)
    {
        var tokenResult = await GetSellerTokenAsync(request.TenantId, ct);
        if (tokenResult.IsFailure) return Result.Failure<CardPaymentResult>(tokenResult.Error);
        var (accessToken, connection) = tokenResult.Value;

        var body = new Dictionary<string, object?>
        {
            ["transaction_amount"] = request.Amount,
            ["token"] = request.Token,
            ["description"] = $"Orden {request.OrderId}",
            ["installments"] = request.Installments < 1 ? 1 : request.Installments,
            ["payment_method_id"] = request.PaymentMethodId,
            // 3DS 2.0: con "optional" Mercado Pago (y el banco) deciden por riesgo
            // si hace falta el desafío; sin este campo el default es
            // "not_supported" y el 3DS no se pide nunca. La guía oficial pide
            // además captura automática y binary_mode apagado: el pago queda
            // "pending" mientras el comprador responde el desafío, y con
            // binary_mode prendido solo puede quedar aprobado o rechazado.
            ["three_d_secure_mode"] = "optional",
            ["capture"] = true,
            ["binary_mode"] = false,
            ["external_reference"] = request.OrderId.ToString(),
            ["payer"] = new Dictionary<string, object?>
            {
                ["email"] = request.PayerEmail,
                ["identification"] = string.IsNullOrWhiteSpace(request.PayerDocNumber)
                    ? null
                    : new { type = request.PayerDocType ?? "DNI", number = request.PayerDocNumber },
            },
        };

        if (!string.IsNullOrWhiteSpace(request.IssuerId)) body["issuer_id"] = request.IssuerId;
        if (!string.IsNullOrWhiteSpace(_o.PublicApiBaseUrl))
            body["notification_url"] = $"{_o.PublicApiBaseUrl.TrimEnd('/')}/api/v1/payments/webhooks/mercadopago";
        if (connection.MarketplaceFeePercent > 0)
            body["application_fee"] = Math.Round(request.Amount * connection.MarketplaceFeePercent / 100m, 2);
        if (connection.StatementDescriptorToSend is { } descriptor)
            body["statement_descriptor"] = descriptor;

        using var req = new HttpRequestMessage(HttpMethod.Post, $"{_o.ApiBaseUrl.TrimEnd('/')}/v1/payments");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        req.Headers.TryAddWithoutValidation("X-Idempotency-Key", request.OrderId.ToString());
        req.Content = JsonContent.Create(body);

        using var resp = await http.SendAsync(req, ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogError("MercadoPago card payment error {Status}: {Body}", (int)resp.StatusCode, json);
            return Result.Failure<CardPaymentResult>(new Error("MercadoPago.PaymentFailed",
                "No se pudo procesar el pago con la tarjeta."));
        }

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        var result = new CardPaymentResult(
            PaymentId: root.TryGetProperty("id", out var pid) ? pid.ToString() : string.Empty,
            Status: root.TryGetProperty("status", out var st) ? st.GetString() ?? "unknown" : "unknown",
            StatusDetail: root.TryGetProperty("status_detail", out var sd) ? sd.GetString() ?? string.Empty : string.Empty);
        return result with { Challenge = ReadChallenge(root, result) };
    }

    /// <summary>
    /// El desafío 3DS que hay que mostrarle al comprador, si el pago quedó
    /// esperándolo (<c>pending</c> / <c>pending_challenge</c>): la URL del banco
    /// (<c>three_ds_info.external_resource_url</c>) y el <c>creq</c> que se le
    /// postea. Solo se acepta una URL https absoluta: es lo que el navegador del
    /// comprador va a abrir en un iframe de la tienda.
    /// </summary>
    private ThreeDsChallenge? ReadChallenge(JsonElement root, CardPaymentResult payment)
    {
        if (!payment.IsPendingChallenge) return null;

        string? url = null, creq = null;
        if (root.TryGetProperty("three_ds_info", out var info) && info.ValueKind == JsonValueKind.Object)
        {
            url = info.TryGetProperty("external_resource_url", out var u) && u.ValueKind == JsonValueKind.String ? u.GetString() : null;
            creq = info.TryGetProperty("creq", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() : null;
        }

        if (Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps
            && !string.IsNullOrWhiteSpace(creq) && !string.IsNullOrEmpty(payment.PaymentId))
            return new ThreeDsChallenge(url!, creq);

        // Sin datos para mostrarlo, el pago se resuelve solo: el banco lo
        // rechaza al vencer el desafío y llega por webhook.
        logger.LogWarning("MercadoPago pago {PaymentId} pide desafío 3DS sin three_ds_info utilizable.", payment.PaymentId);
        return null;
    }

    public async Task<Result<PaymentStatusDto>> GetPaymentAsync(TenantId tenantId, string paymentId, CancellationToken ct = default)
    {
        var tokenResult = await GetSellerTokenAsync(tenantId, ct);
        if (tokenResult.IsFailure) return Result.Failure<PaymentStatusDto>(tokenResult.Error);

        using var req = new HttpRequestMessage(HttpMethod.Get, $"{_o.ApiBaseUrl.TrimEnd('/')}/v1/payments/{paymentId}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.Value.AccessToken);

        using var resp = await http.SendAsync(req, ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogError("MercadoPago get payment {Id} error {Status}: {Body}", paymentId, (int)resp.StatusCode, json);
            return Result.Failure<PaymentStatusDto>(new Error("MercadoPago.GetPaymentFailed", "No se pudo consultar el pago."));
        }

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        return new PaymentStatusDto(
            PaymentId: root.TryGetProperty("id", out var pid) ? pid.ToString() : paymentId,
            Status: root.TryGetProperty("status", out var st) ? st.GetString() ?? "unknown" : "unknown",
            StatusDetail: root.TryGetProperty("status_detail", out var sd) ? sd.GetString() ?? string.Empty : string.Empty,
            ExternalReference: root.TryGetProperty("external_reference", out var er) ? er.GetString() : null,
            TransactionAmount: JsonRead.GetDecimal(root, "transaction_amount"),
            TransactionAmountRefunded: JsonRead.GetDecimal(root, "transaction_amount_refunded"),
            NetReceivedAmount: root.TryGetProperty("transaction_details", out var td) && td.ValueKind == JsonValueKind.Object
                ? JsonRead.GetDecimal(td, "net_received_amount") is var net and > 0m ? net : null
                : null);
    }

    public async Task<Result<RefundResult>> RefundAsync(TenantId tenantId, string paymentId, decimal? amount, string idempotencyKey, CancellationToken ct = default)
    {
        var tokenResult = await GetSellerTokenAsync(tenantId, ct);
        if (tokenResult.IsFailure) return Result.Failure<RefundResult>(tokenResult.Error);

        // POST /v1/payments/{id}/refunds — body vacío = total; { amount } = parcial.
        // La clave de idempotencia viene del caller y es única POR INTENTO: una
        // clave fija por pago haría que MP deduplique parciales sucesivos.
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{_o.ApiBaseUrl.TrimEnd('/')}/v1/payments/{paymentId}/refunds");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.Value.AccessToken);
        req.Headers.TryAddWithoutValidation("X-Idempotency-Key", idempotencyKey);
        req.Content = amount is { } a
            ? JsonContent.Create(new { amount = Math.Round(a, 2) })
            : JsonContent.Create(new { });

        using var resp = await http.SendAsync(req, ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogError("MercadoPago refund {Id} error {Status}: {Body}", paymentId, (int)resp.StatusCode, json);
            return Result.Failure<RefundResult>(new Error("MercadoPago.RefundFailed",
                "No se pudo reembolsar el pago en MercadoPago."));
        }

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        return new RefundResult(
            RefundId: root.TryGetProperty("id", out var rid) ? rid.ToString() : string.Empty,
            Amount: root.TryGetProperty("amount", out var am) && am.ValueKind == JsonValueKind.Number ? am.GetDecimal() : amount ?? 0m);
    }

    public async Task<Result> ExpirePreferenceAsync(TenantId tenantId, string preferenceId, CancellationToken ct = default)
    {
        var tokenResult = await GetSellerTokenAsync(tenantId, ct);
        if (tokenResult.IsFailure) return Result.Failure(tokenResult.Error);

        // Mercado Pago no borra preferences: se le pone vencimiento ya. Desde
        // ese momento el link muestra "venció" en vez de dejar pagar.
        using var req = new HttpRequestMessage(HttpMethod.Put,
            $"{_o.ApiBaseUrl.TrimEnd('/')}/checkout/preferences/{Uri.EscapeDataString(preferenceId)}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenResult.Value.AccessToken);
        req.Content = JsonContent.Create(new
        {
            expires = true,
            expiration_date_to = DateTime.UtcNow.AddMinutes(-1).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'"),
        });

        using var resp = await http.SendAsync(req, ct);
        if (resp.IsSuccessStatusCode) return Result.Success();

        var json = await resp.Content.ReadAsStringAsync(ct);
        logger.LogWarning("MercadoPago expire preference {Id} error {Status}: {Body}", preferenceId, (int)resp.StatusCode, json);
        return Result.Failure(new Error("MercadoPago.ExpireFailed", "No se pudo anular el link de pago en Mercado Pago."));
    }

    /// <summary>Carga la conexión del tenant, refresca el token si está por vencer, y devuelve el access_token descifrado.</summary>
    private async Task<Result<(string AccessToken, MercadoPagoConnection Connection)>> GetSellerTokenAsync(TenantId tenantId, CancellationToken ct)
    {
        var connection = await connections.GetByTenantAsync(tenantId, ct);
        if (connection is null)
            return Result.Failure<(string, MercadoPagoConnection)>(new Error("MercadoPago.NotConnected",
                "El comercio no tiene MercadoPago conectado."));

        // Refresh proactivo: si vence en < 7 días y hay refresh_token, renovamos.
        if (connection.TokenExpiresAtUtc <= DateTime.UtcNow.AddDays(7) && !string.IsNullOrEmpty(connection.RefreshTokenEncrypted))
        {
            try
            {
                var tokens = await oauth.RefreshAsync(protector.Unprotect(connection.RefreshTokenEncrypted), ct);
                connection.UpdateTokens(
                    tokens.UserId == 0 ? connection.MercadoPagoUserId : tokens.UserId,
                    protector.Protect(tokens.AccessToken),
                    string.IsNullOrEmpty(tokens.RefreshToken) ? connection.RefreshTokenEncrypted : protector.Protect(tokens.RefreshToken),
                    tokens.PublicKey, tokens.Scope, DateTime.UtcNow.AddSeconds(tokens.ExpiresInSeconds));
                await connections.SaveChangesAsync(ct);
                logger.LogInformation("Token MercadoPago refrescado para tenant {TenantId}.", tenantId);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "No se pudo refrescar el token de MercadoPago (tenant {TenantId}); uso el actual.", tenantId);
            }
        }

        return (protector.Unprotect(connection.AccessTokenEncrypted), connection);
    }
}
