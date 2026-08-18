using System.Net;
using System.Net.Http.Headers;

namespace SharedKernel.Common;

/// <summary>
/// Piezas del authorization-code flow OAuth2 que Mercado Libre y MercadoPago
/// comparten línea por línea: URL de autorización, forms de los grants y el
/// POST del token. El parseo de la respuesta y el manejo de errores quedan en
/// cada cliente (tipos, defaults y excepciones propias).
/// </summary>
public static class OAuth2
{
    /// <summary>
    /// URL de autorización: el caller pasa la URL COMPLETA del endpoint de
    /// authorize (cada proveedor tiene su propio path: /authorization en ML,
    /// /dialog/oauth en Meta, /i/oauth2/authorize en X) + query escapada.
    /// </summary>
    public static string BuildAuthorizationUrl(string authorizeUrl, IEnumerable<KeyValuePair<string, string>> query)
    {
        var qs = string.Join('&', query.Select(kv =>
            $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value)}"));
        return $"{authorizeUrl.TrimEnd('/')}?{qs}";
    }

    public static Dictionary<string, string> AuthorizationCodeGrant(
        string clientId, string clientSecret, string code, string redirectUri) => new()
        {
            ["grant_type"] = "authorization_code",
            ["client_id"] = clientId,
            ["client_secret"] = clientSecret,
            ["code"] = code,
            ["redirect_uri"] = redirectUri,
        };

    public static Dictionary<string, string> RefreshTokenGrant(
        string clientId, string clientSecret, string refreshToken) => new()
        {
            ["grant_type"] = "refresh_token",
            ["client_id"] = clientId,
            ["client_secret"] = clientSecret,
            ["refresh_token"] = refreshToken,
        };

    /// <summary>POST {apiBase}/oauth/token con el form. No lanza: cada cliente interpreta status+body.</summary>
    public static async Task<(HttpStatusCode Status, bool IsSuccess, string Body)> PostTokenAsync(
        HttpClient http, string apiBaseUrl, Dictionary<string, string> form, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{apiBaseUrl.TrimEnd('/')}/oauth/token")
        {
            Content = new FormUrlEncodedContent(form),
        };
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);
        return (response.StatusCode, response.IsSuccessStatusCode, body);
    }
}
