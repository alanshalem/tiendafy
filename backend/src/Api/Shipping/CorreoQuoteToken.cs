using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;

namespace Api.Shipping;

/// <summary>
/// Contenido de una opción de envío cotizada, firmada por el servidor.
/// El storefront la devuelve intacta al confirmar el checkout: el precio
/// NUNCA viaja suelto desde el cliente (mismo patrón que el preview token
/// del editor de temas). Se ata al tenant y a la CANTIDAD de unidades del
/// carrito — si el carrito cambia, el submit exige recotizar.
/// </summary>
public sealed record CorreoQuotePayload(
    Guid TenantId,
    int Units,
    string Kind,          // "D" domicilio | "S" sucursal
    long PriceMinorUnits,
    string Currency,
    string ServiceName,   // ej: "Correo Argentino Clásico (a domicilio)"
    string? EtaMin,
    string? EtaMax,
    string DestPostalCode);

public static class CorreoQuoteToken
{
    private const string Purpose = "Tiendafy.Shipping.CorreoQuote.v1";
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(30);

    public static string Protect(IDataProtectionProvider dp, CorreoQuotePayload payload) =>
        dp.CreateProtector(Purpose).ToTimeLimitedDataProtector()
            .Protect(JsonSerializer.Serialize(payload), Lifetime);

    /// <summary>null si el token es inválido, vencido o de otro tenant.</summary>
    public static CorreoQuotePayload? Unprotect(IDataProtectionProvider dp, string token, Guid tenantId)
    {
        try
        {
            var raw = dp.CreateProtector(Purpose).ToTimeLimitedDataProtector().Unprotect(token);
            var payload = JsonSerializer.Deserialize<CorreoQuotePayload>(raw);
            return payload is null || payload.TenantId != tenantId ? null : payload;
        }
        catch (Exception)
        {
            return null;
        }
    }
}
