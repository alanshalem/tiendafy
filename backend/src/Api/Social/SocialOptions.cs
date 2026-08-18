namespace Api.Social;

/// <summary>
/// Credenciales de PLATAFORMA para las redes sociales (sección "Social").
/// Sin credenciales de una red, ese conector queda apagado y el panel lo dice
/// — mismo criterio que Mercado Libre y Meta Ads. Telegram no necesita app:
/// cada tienda usa su propio bot.
/// </summary>
public sealed class SocialOptions
{
    public const string SectionName = "Social";

    public MetaSection Meta { get; set; } = new();
    public XSection X { get; set; } = new();
    public TelegramSection Telegram { get; set; } = new();

    /// <summary>A dónde vuelve el navegador del merchant tras autorizar.</summary>
    public string AdminReturnUrl { get; set; } = "http://localhost:5173/redes";

    public sealed class MetaSection
    {
        /// <summary>Puede ser la MISMA app de Meta Ads, sumando los scopes de páginas/IG.</summary>
        public string AppId { get; set; } = string.Empty;
        public string AppSecret { get; set; } = string.Empty;
        public string RedirectUri { get; set; } = string.Empty;
        public string ApiBaseUrl { get; set; } = "https://graph.facebook.com/v21.0";
        public string AuthBaseUrl { get; set; } = "https://www.facebook.com/v21.0/dialog/oauth";
        public bool Configured => !string.IsNullOrWhiteSpace(AppId) && !string.IsNullOrWhiteSpace(AppSecret);
    }

    /// <summary>Telegram no lleva credenciales: el bot es del merchant. Solo la base (tests).</summary>
    public sealed class TelegramSection
    {
        public string ApiBaseUrl { get; set; } = "https://api.telegram.org";
    }

    public sealed class XSection
    {
        public string ClientId { get; set; } = string.Empty;
        public string ClientSecret { get; set; } = string.Empty;
        public string RedirectUri { get; set; } = string.Empty;
        public string AuthBaseUrl { get; set; } = "https://x.com/i/oauth2/authorize";
        public string ApiBaseUrl { get; set; } = "https://api.x.com/2";
        public bool Configured => !string.IsNullOrWhiteSpace(ClientId);
    }
}
