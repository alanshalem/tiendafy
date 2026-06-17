using System.Globalization;
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

        if (!string.IsNullOrWhiteSpace(connection.StatementDescriptor))
            body["statement_descriptor"] = connection.StatementDescriptor;

        using var req = new HttpRequestMessage(HttpMethod.Post, $"{_o.ApiBaseUrl.TrimEnd('/')}/v1/checkout/preferences");
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
            ["binary_mode"] = false, // permite challenge 3DS
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
        if (!string.IsNullOrWhiteSpace(connection.StatementDescriptor))
            body["statement_descriptor"] = connection.StatementDescriptor;

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
        return new CardPaymentResult(
            PaymentId: root.TryGetProperty("id", out var pid) ? pid.ToString() : string.Empty,
            Status: root.TryGetProperty("status", out var st) ? st.GetString() ?? "unknown" : "unknown",
            StatusDetail: root.TryGetProperty("status_detail", out var sd) ? sd.GetString() ?? string.Empty : string.Empty);
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
            TransactionAmount: root.TryGetProperty("transaction_amount", out var ta) && ta.ValueKind == JsonValueKind.Number ? ta.GetDecimal() : 0m);
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
