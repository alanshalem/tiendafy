using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Api.Notifications;

/// <summary>
/// Verificación e interpretación del webhook de Resend (firmado con svix):
/// no es lógica de campañas, es el contrato del proveedor de email.
/// </summary>
public static class ResendWebhook
{
    /// <summary>Verificación de firma svix: HMAC-SHA256 de "{id}.{timestamp}.{payload}".</summary>
    public static bool VerifySvix(string secret, string? id, string? timestamp, string? signatureHeader, string payload)
    {
        if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(timestamp) || string.IsNullOrEmpty(signatureHeader))
            return false;
        var key = Convert.FromBase64String(secret.StartsWith("whsec_", StringComparison.Ordinal) ? secret[6..] : secret);
        using var hmac = new HMACSHA256(key);
        var expected = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes($"{id}.{timestamp}.{payload}")));
        // Header: "v1,<base64> v1,<base64> ..." — alcanza con que una coincida.
        return signatureHeader.Split(' ')
            .Select(part => part.Split(',', 2))
            .Any(parts => parts.Length == 2 && parts[0] == "v1"
                && CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(parts[1]), Encoding.UTF8.GetBytes(expected)));
    }

    /// <summary>El tag "tenant" del envío (objeto o array, según versión del payload).</summary>
    public static Guid? ExtractTenantTag(JsonElement data)
    {
        if (!data.TryGetProperty("tags", out var tags)) return null;
        string? value = null;
        if (tags.ValueKind == JsonValueKind.Object && tags.TryGetProperty("tenant", out var v))
            value = v.GetString();
        else if (tags.ValueKind == JsonValueKind.Array)
            foreach (var tag in tags.EnumerateArray())
                if (tag.TryGetProperty("name", out var n) && n.GetString() == "tenant"
                    && tag.TryGetProperty("value", out var val))
                    value = val.GetString();
        return Guid.TryParse(value, out var g) ? g : null;
    }

}
