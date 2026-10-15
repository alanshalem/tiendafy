namespace Api.MetaAds;

/// <summary>
/// La versión de la Graph API de Meta, UNA para todo lo que habla con Meta:
/// WhatsApp (Cloud API), redes (Facebook, Instagram) y Meta Ads. Meta
/// mantiene cada versión unos dos años y después la apaga: WhatsApp estaba
/// fijo en v20.0, que dejó de existir el 24-sep-2026. Al subirla, leé el
/// changelog (https://developers.facebook.com/docs/graph-api/changelog) por
/// los endpoints que usamos: /oauth/access_token, /me/accounts,
/// /{page}/photos y /feed, /{ig}/media y /media_publish, /me/adaccounts,
/// /{act}/insights y /{phone}/messages.
/// </summary>
public static class MetaGraph
{
    /// <summary>v26.0: salió el 29-jul-2026; Meta todavía no le puso fecha de baja.</summary>
    public const string Version = "v26.0";

    public const string ApiBaseUrl = "https://graph.facebook.com/" + Version;

    /// <summary>Diálogo de autorización (OAuth) de Facebook, misma versión.</summary>
    public const string DialogUrl = "https://www.facebook.com/" + Version + "/dialog/oauth";
}
