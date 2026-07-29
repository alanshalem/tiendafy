using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;

namespace Api.Shipping;

/// <summary>
/// Opción de envío de Zipnova cotizada y firmada por el servidor. La cotización
/// de Zipnova no tiene identificador ni congela precio (spec 04 §1): lo que se
/// "congela" acá es la promesa hacia el comprador, firmada y con TTL corto,
/// atada al tenant y a las unidades del carrito. El precio nunca viaja suelto.
/// </summary>
public sealed record ZipnovaQuotePayload(
    Guid TenantId,
    int Units,
    long PriceMinorUnits,
    string Currency,
    string ServiceName,   // ej: "Zipnova · Andreani (Estándar)"
    string? EstimatedDelivery,
    string DestZipcode);

public static class ZipnovaQuoteToken
{
    private const string Purpose = "Tiendafy.Shipping.ZipnovaQuote.v1";
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(30);

    public static string Protect(IDataProtectionProvider dp, ZipnovaQuotePayload payload) =>
        dp.CreateProtector(Purpose).ToTimeLimitedDataProtector()
            .Protect(JsonSerializer.Serialize(payload), Lifetime);

    /// <summary>null si el token es inválido, vencido o de otro tenant.</summary>
    public static ZipnovaQuotePayload? Unprotect(IDataProtectionProvider dp, string token, Guid tenantId)
    {
        try
        {
            var raw = dp.CreateProtector(Purpose).ToTimeLimitedDataProtector().Unprotect(token);
            var payload = JsonSerializer.Deserialize<ZipnovaQuotePayload>(raw);
            return payload is null || payload.TenantId != tenantId ? null : payload;
        }
        catch (Exception)
        {
            return null;
        }
    }
}
