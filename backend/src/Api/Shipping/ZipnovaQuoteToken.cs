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

    public static string Protect(IDataProtectionProvider dp, ZipnovaQuotePayload payload) =>
        SignedQuoteToken.Protect(dp, Purpose, payload);

    /// <summary>null si el token es inválido, vencido o de otro tenant.</summary>
    public static ZipnovaQuotePayload? Unprotect(IDataProtectionProvider dp, string token, Guid tenantId) =>
        SignedQuoteToken.Unprotect<ZipnovaQuotePayload>(dp, Purpose, token, tenantId, p => p.TenantId);
}
