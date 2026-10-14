using System.Text.RegularExpressions;

namespace Api.Shipping;

/// <summary>El seguimiento de un envío como lo ve el comprador: quién lo lleva, el número y adónde mirarlo.</summary>
public sealed record CarrierTracking(string? Carrier, string? Number, string? Url);

/// <summary>
/// Arma el link de seguimiento del correo que lleva el paquete.
///
/// Antes el comprador recibía un número suelto ("Seguimiento: CP123…") y
/// tenía que adivinar en qué sitio pegarlo. Con los envíos creados desde el
/// panel se sabe el correo con certeza (Andreani y Zipnova dejan su fila); con
/// un número cargado a mano se deduce del medio de envío o del formato.
/// </summary>
public static partial class CarrierTrackingLink
{
    /// <summary>Correo Argentino: el formulario público acepta el número por query.</summary>
    public static string CorreoArgentino(string number) =>
        $"https://www.correoargentino.com.ar/formularios/e-commerce?id={Uri.EscapeDataString(number)}";

    /// <summary>Andreani: la página pública de un envío.</summary>
    public static string Andreani(string number) =>
        $"https://www.andreani.com/envio/{Uri.EscapeDataString(number)}";

    /// <summary>
    /// El seguimiento de un pedido. Gana lo que se sabe con certeza: el envío
    /// de Zipnova (trae su propia URL) o el de Andreani; después, el número que
    /// cargó el comercio al despachar.
    /// </summary>
    public static CarrierTracking? For(
        string? manualTracking, string? shippingMethodName,
        string? andreaniNumber = null,
        (string? Carrier, string? Number, string? Url)? zipnova = null)
    {
        if (zipnova is { } z && (!string.IsNullOrWhiteSpace(z.Url) || !string.IsNullOrWhiteSpace(z.Number)))
            return new CarrierTracking(
                string.IsNullOrWhiteSpace(z.Carrier) ? "Zipnova" : z.Carrier.Trim(),
                Clean(z.Number) ?? Clean(manualTracking),
                SafeUrl(z.Url));

        if (!string.IsNullOrWhiteSpace(andreaniNumber))
            return new CarrierTracking("Andreani", andreaniNumber.Trim(), Andreani(andreaniNumber.Trim()));

        var tracking = Clean(manualTracking);
        if (tracking is null) return null;

        // El comercio pegó directamente el link del correo: se usa tal cual.
        if (SafeUrl(tracking) is { } url) return new CarrierTracking(null, null, url);

        var method = shippingMethodName?.ToLowerInvariant() ?? string.Empty;
        if (method.Contains("andreani"))
            return new CarrierTracking("Andreani", tracking, Andreani(tracking));
        if (method.Contains("correo") || CorreoNumber().IsMatch(tracking))
            return new CarrierTracking("Correo Argentino", tracking, CorreoArgentino(tracking));

        // Un número de un correo que no conocemos: se muestra, sin link inventado.
        return new CarrierTracking(null, tracking, null);
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    /// <summary>Solo links http(s): un "javascript:" cargado en el panel no llega a la tienda.</summary>
    private static string? SafeUrl(string? s) =>
        Uri.TryCreate(s?.Trim(), UriKind.Absolute, out var u) && (u.Scheme == Uri.UriSchemeHttps || u.Scheme == Uri.UriSchemeHttp)
            ? u.ToString()
            : null;

    /// <summary>Formato de la UPU que usa Correo Argentino: dos letras, nueve dígitos, "AR".</summary>
    [GeneratedRegex(@"^[A-Z]{2}\d{9}AR$", RegexOptions.IgnoreCase)]
    private static partial Regex CorreoNumber();
}
