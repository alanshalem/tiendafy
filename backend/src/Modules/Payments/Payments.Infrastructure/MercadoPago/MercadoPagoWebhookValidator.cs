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
    private MercadoPagoOptions _o => options.Value;

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
        // Un ts que no se puede leer es una firma inválida (401), nunca un 500.
        if (!IsFresh(ts, DateTimeOffset.UtcNow))
            return new WebhookValidationResult(false, type, dataId);

        var canonical = $"id:{dataId};request-id:{xRequestId};ts:{ts};";
        var expected = Convert.ToHexString(
            HMACSHA256.HashData(Encoding.UTF8.GetBytes(_o.WebhookSecret), Encoding.UTF8.GetBytes(canonical)));

        var ok = CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected.ToLowerInvariant()),
            Encoding.UTF8.GetBytes(v1.ToLowerInvariant()));

        return new WebhookValidationResult(ok, type, dataId);
    }

    /// <summary>Cuánto puede diferir el <c>ts</c> de la firma del reloj del servidor.</summary>
    public static readonly TimeSpan MaxClockSkew = TimeSpan.FromMinutes(5);

    /// <summary>
    /// A partir de acá un <c>ts</c> se lee en milisegundos: 10^11 segundos es el
    /// año 5138, y 10^11 milisegundos, marzo de 1973.
    /// </summary>
    private const long MillisecondsThreshold = 100_000_000_000;

    /// <summary>
    /// Si el <c>ts</c> de <c>x-signature</c> está dentro de <see cref="MaxClockSkew"/>.
    /// Las SDK oficiales lo leen en segundos (y exigen solo dígitos), pero un
    /// ejemplo de la documentación de Mercado Pago lo muestra en milisegundos
    /// (13 dígitos): se aceptan los dos. Antes, uno en milisegundos se pasaba a
    /// <c>FromUnixTimeSeconds</c>, que tiraba fuera de rango, y el webhook
    /// contestaba 500; y uno que no era un número salteaba el control.
    /// </summary>
    public static bool IsFresh(string ts, DateTimeOffset now)
    {
        if (ts.Length is 0 or > 18 || !ts.All(char.IsAsciiDigit)) return false;
        var value = long.Parse(ts, System.Globalization.CultureInfo.InvariantCulture);
        var tsMs = value < MillisecondsThreshold ? value * 1000 : value;
        // Sin DateTimeOffset en el medio: cualquier long de 18 dígitos entra
        // en la resta sin desbordar.
        return Math.Abs(now.ToUnixTimeMilliseconds() - tsMs) <= (long)MaxClockSkew.TotalMilliseconds;
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
