namespace Api.MetaAds;

/// <summary>
/// Config de la app de PLATAFORMA en Meta for Developers (para leer insights
/// de pauta vía Marketing API). NO es por tenant: cada tienda autoriza su
/// usuario de Meta vía OAuth contra esta app. Sin AppId configurado, la
/// integración queda apagada (el panel lo informa).
/// </summary>
public sealed class MetaAdsOptions
{
    public const string SectionName = "MetaAds";

    public string AppId { get; set; } = string.Empty;
    public string AppSecret { get; set; } = string.Empty;

    /// <summary>Callback público OAuth registrado en la app de Meta. Dev = URL del túnel.</summary>
    public string RedirectUri { get; set; } = string.Empty;

    public string AuthBaseUrl { get; set; } = "https://www.facebook.com/v21.0/dialog/oauth";

    public string ApiBaseUrl { get; set; } = "https://graph.facebook.com/v21.0";

    /// <summary>A dónde vuelve el navegador del merchant tras autorizar.</summary>
    public string AdminReturnUrl { get; set; } = "http://localhost:3001/estadisticas/rentabilidad";

    public bool Configured => !string.IsNullOrWhiteSpace(AppId) && !string.IsNullOrWhiteSpace(AppSecret);
}
