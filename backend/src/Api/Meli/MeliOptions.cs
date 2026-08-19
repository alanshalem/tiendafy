namespace Api.Meli;

/// <summary>
/// Config de la app de PLATAFORMA (Tiendafy) en Mercado Libre. NO es por
/// tenant: cada tienda autoriza su cuenta vía OAuth contra esta app.
/// Sección "MercadoLibre" (user-secrets en dev, env en prod). Sin ClientId
/// configurado, la integración queda apagada (el panel lo informa).
/// </summary>
public sealed class MeliOptions
{
    public const string SectionName = "MercadoLibre";

    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;

    /// <summary>Callback público OAuth registrado en la app de ML. Dev = URL del túnel.</summary>
    public string RedirectUri { get; set; } = string.Empty;

    /// <summary>Auth por país del vendedor; AR por defecto.</summary>
    public string AuthBaseUrl { get; set; } = "https://auth.mercadolibre.com.ar";

    public string ApiBaseUrl { get; set; } = "https://api.mercadolibre.com";

    /// <summary>A dónde vuelve el navegador del merchant tras autorizar.</summary>
    public string AdminReturnUrl { get; set; } = "http://localhost:5173/configuracion/mercadolibre";

    public bool Configured => !string.IsNullOrWhiteSpace(ClientId) && !string.IsNullOrWhiteSpace(ClientSecret);
}
