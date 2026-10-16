namespace Payments.Infrastructure.MercadoPago;

/// <summary>
/// Config de la app de PLATAFORMA (Tiendafy) en MercadoPago. NO es por tenant.
/// Se lee de la sección "MercadoPago" (appsettings y variables de entorno;
/// user-secrets no sirve: Api.csproj no tiene UserSecretsId).
/// Los secretos (ClientSecret, WebhookSecret) jamás se commitean.
/// </summary>
public sealed class MercadoPagoOptions
{
    public const string SectionName = "MercadoPago";

    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;

    /// <summary>Callback público OAuth. En dev = URL del túnel (cloudflared/ngrok).</summary>
    public string RedirectUri { get; set; } = string.Empty;

    public string AuthBaseUrl { get; set; } = "https://auth.mercadopago.com.ar";
    public string ApiBaseUrl { get; set; } = "https://api.mercadopago.com";

    public string WebhookSecret { get; set; } = string.Empty;

    /// <summary>A dónde volvemos el navegador del merchant tras el OAuth.</summary>
    public string AdminReturnUrl { get; set; } = "http://localhost:5173/configuracion/medios-de-pago";

    /// <summary>
    /// Base pública de la API (la URL del túnel en dev). MercadoPago la usa como
    /// notification_url de los webhooks. Si está vacía, no se mandan webhooks
    /// (el redirect sigue andando, pero la orden no se concilia sola).
    /// </summary>
    public string PublicApiBaseUrl { get; set; } = string.Empty;
}
