using System.Text.RegularExpressions;
using SharedKernel.Common;

namespace Content.Infrastructure;

/// <summary>
/// Herramientas de medición de la tienda (Google, Meta, Clarity).
///
/// Acá NO se guarda ni una etiqueta de HTML ni una línea de JavaScript: solo
/// el identificador de cada servicio. El cargador lo escribe el storefront a
/// partir de una plantilla propia, y el identificador viaja como argumento,
/// nunca como código.
///
/// La razón es concreta: el formulario de tarjeta de Payway está embebido en
/// el checkout, así que la página de pago es del comercio. Una caja donde se
/// pega un &lt;script&gt; ahí es exactamente el ataque con el que se roban las
/// tarjetas en el comercio electrónico, y además hace imposible cumplir el
/// requisito de PCI DSS de tener inventariado y autorizado cada script de una
/// página de pago.
///
/// Cada identificador se valida contra un patrón cerrado. Lo importante no es
/// que el formato sea exacto sino el conjunto de caracteres: sin comillas, sin
/// &lt; &gt;, sin barras, sin paréntesis y sin espacios, no hay forma de que un
/// valor se escape de donde lo ponemos.
/// </summary>
public sealed class TrackingSettings
{
    // Ojo con tocar estos patrones: son el límite entre "un identificador" y
    // "algo que se ejecuta". Ampliar el conjunto de caracteres permitido es un
    // cambio de seguridad, no de validación.
    private static readonly Regex Ga4 = new("^G-[A-Z0-9]{4,20}$", RegexOptions.Compiled);
    private static readonly Regex GoogleAds = new(@"^AW-\d{6,15}$", RegexOptions.Compiled);
    private static readonly Regex MetaPixel = new(@"^\d{10,20}$", RegexOptions.Compiled);
    private static readonly Regex Clarity = new("^[a-z0-9]{5,20}$", RegexOptions.Compiled);

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    /// <summary>Apagado general: deja todo sin cargar sin perder la configuración.</summary>
    public bool Enabled { get; private set; } = true;

    /// <summary>No cargar nada hasta que el visitante lo acepte.</summary>
    public bool RequireConsent { get; private set; } = true;

    public string? Ga4Id { get; private set; }
    public string? GoogleAdsId { get; private set; }
    public string? MetaPixelId { get; private set; }
    public string? ClarityId { get; private set; }

    /// <summary>Quién tocó esto por última vez y cuándo: es el registro que pide PCI.</summary>
    public Guid? UpdatedByUserId { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private TrackingSettings() { } // EF Core

    public static TrackingSettings CreateDefault(Guid tenantId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    public Result Update(
        bool enabled,
        bool requireConsent,
        string? ga4Id,
        string? googleAdsId,
        string? metaPixelId,
        string? clarityId,
        Guid? updatedBy)
    {
        var ga4 = Clean(ga4Id, upper: true);
        var ads = Clean(googleAdsId, upper: true);
        var meta = Clean(metaPixelId, upper: false);
        var clarity = Clean(clarityId, upper: false);

        if (ga4 is not null && !Ga4.IsMatch(ga4))
            return Invalid("Google Analytics", "empieza con G- seguido de letras y números, como G-ABCD123456");
        if (ads is not null && !GoogleAds.IsMatch(ads))
            return Invalid("Google Ads", "empieza con AW- seguido de números, como AW-123456789");
        if (meta is not null && !MetaPixel.IsMatch(meta))
            return Invalid("el píxel de Meta", "son solo números, como 123456789012345");
        if (clarity is not null && !Clarity.IsMatch(clarity.ToLowerInvariant()))
            return Invalid("Microsoft Clarity", "son letras minúsculas y números, como abcd1efg2h");

        Enabled = enabled;
        RequireConsent = requireConsent;
        Ga4Id = ga4;
        GoogleAdsId = ads;
        MetaPixelId = meta;
        ClarityId = clarity?.ToLowerInvariant();
        UpdatedByUserId = updatedBy;
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>Vacío = apagado. Se recorta y se normaliza antes de validar.</summary>
    private static string? Clean(string? raw, bool upper)
    {
        var value = (raw ?? string.Empty).Trim();
        if (value.Length == 0) return null;
        if (value.Length > 40) return value; // que falle la validación, no que se corte
        return upper ? value.ToUpperInvariant() : value;
    }

    private static Result Invalid(string what, string shape) =>
        Result.Failure(Error.Validation("Tracking.Id", $"El identificador de {what} no tiene el formato esperado: {shape}."));
}
