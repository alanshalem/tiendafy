using Microsoft.AspNetCore.DataProtection;

namespace Api.Shipping;

/// <summary>
/// Opción de envío de Andreani cotizada y firmada por el servidor.
///
/// La cotización de Andreani no devuelve identificador ni vigencia: lo que se
/// congela acá es la promesa hacia el comprador, firmada, con vencimiento corto
/// y atada al tenant. El precio nunca viaja suelto en el navegador — si viajara,
/// alguien podría cobrarse el envío que quiera.
/// </summary>
public sealed record AndreaniQuotePayload(
    Guid TenantId,
    int Units,
    long PriceMinorUnits,
    string Currency,
    string ServiceName,
    /// <summary>Contrato con el que se cotizó: es el que hay que usar al despachar.</summary>
    string Contract,
    bool ToBranch,
    string DestPostalCode,
    // Huella del carrito cotizado (CartKey); null en cotizaciones por cantidad.
    string? CartKey = null);

public static class AndreaniQuoteToken
{
    private const string Purpose = "Tiendafy.Shipping.AndreaniQuote.v1";

    public static string Protect(IDataProtectionProvider dp, AndreaniQuotePayload payload) =>
        SignedQuoteToken.Protect(dp, Purpose, payload);

    /// <summary>null si el token es inválido, venció o es de otra tienda.</summary>
    public static AndreaniQuotePayload? Unprotect(IDataProtectionProvider dp, string token, Guid tenantId) =>
        SignedQuoteToken.Unprotect<AndreaniQuotePayload>(dp, Purpose, token, tenantId, p => p.TenantId);
}
