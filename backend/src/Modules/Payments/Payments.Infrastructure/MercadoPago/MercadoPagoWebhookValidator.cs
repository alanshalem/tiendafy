using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Payments.Contracts;

namespace Payments.Infrastructure.MercadoPago;

/// <summary>
/// Valida la firma HMAC-SHA256 de los webhooks (cabeceras x-signature + x-request-id).
/// Canonical: <c>id:{data.id};request-id:{x-request-id};ts:{ts};</c>
/// </summary>
public sealed class MercadoPagoWebhookValidator(IOptions<MercadoPagoOptions> options) : IMercadoPagoWebhookValidator
{
    private readonly MercadoPagoOptions _o = options.Value;

    public WebhookValidationResult Validate(string? xSignatureHeader, string? xRequestId, string? dataIdFromQuery, string rawBody)
    {
        var (type, dataId) = ParseBody(rawBody);
        dataId ??= dataIdFromQuery;

        // Sin secret configurado no podemos validar: en dev devolvemos parsed pero marcamos inválido
        // salvo que falte el secret a propósito. Acá exigimos secret para confiar.
        if (string.IsNullOrEmpty(_o.WebhookSecret) || string.IsNullOrEmpty(xSignatureHeader)
            || string.IsNullOrEmpty(xRequestId) || string.IsNullOrEmpty(dataId))
            return new WebhookValidationResult(false, type, dataId);

        // x-signature: "ts=1700000000,v1=abc123..."
        string? ts = null, v1 = null;
        foreach (var part in xSignatureHeader.Split(','))
        {
            var kv = part.Split('=', 2);
            if (kv.Length != 2) continue;
            var key = kv[0].Trim();
            if (key == "ts") ts = kv[1].Trim();
            else if (key == "v1") v1 = kv[1].Trim();
        }
        if (string.IsNullOrEmpty(ts) || string.IsNullOrEmpty(v1))
            return new WebhookValidationResult(false, type, dataId);

        // Anti-replay: rechazar si el ts difiere > 5 min del reloj del server.
        if (long.TryParse(ts, out var tsUnix))
        {
            var age = DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeSeconds(tsUnix);
            if (Math.Abs(age.TotalMinutes) > 5) return new WebhookValidationResult(false, type, dataId);
        }

        var canonical = $"id:{dataId};request-id:{xRequestId};ts:{ts};";
        var expected = Convert.ToHexString(
            HMACSHA256.HashData(Encoding.UTF8.GetBytes(_o.WebhookSecret), Encoding.UTF8.GetBytes(canonical)));

        var ok = CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected.ToLowerInvariant()),
            Encoding.UTF8.GetBytes(v1.ToLowerInvariant()));

        return new WebhookValidationResult(ok, type, dataId);
    }

    private static (string? Type, string? DataId) ParseBody(string rawBody)
    {
        if (string.IsNullOrWhiteSpace(rawBody)) return (null, null);
        try
        {
            using var doc = JsonDocument.Parse(rawBody);
            var root = doc.RootElement;
            var type = root.TryGetProperty("type", out var t) ? t.GetString() : null;
            string? dataId = null;
            if (root.TryGetProperty("data", out var data) && data.TryGetProperty("id", out var id))
                dataId = id.ValueKind == JsonValueKind.Number ? id.GetRawText() : id.GetString();
            return (type, dataId);
        }
        catch
        {
            return (null, null);
        }
    }
}
