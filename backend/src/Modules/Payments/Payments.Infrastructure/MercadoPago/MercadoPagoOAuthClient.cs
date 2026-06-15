using System.Text.Json;
using Microsoft.Extensions.Options;
using Payments.Core.Abstractions;

namespace Payments.Infrastructure.MercadoPago;

/// <summary>
/// Dance OAuth con MercadoPago. Modelo marketplace: la plataforma autoriza a
/// cada seller y obtiene su access_token (6 meses) + refresh_token.
/// </summary>
public sealed class MercadoPagoOAuthClient(HttpClient http, IOptions<MercadoPagoOptions> options) : IMercadoPagoOAuthClient
{
    private readonly MercadoPagoOptions _o = options.Value;

    public string BuildAuthorizationUrl(string state)
    {
        var query = new Dictionary<string, string?>
        {
            ["client_id"] = _o.ClientId,
            ["response_type"] = "code",
            ["platform_id"] = "mp",
            ["redirect_uri"] = _o.RedirectUri,
            ["state"] = state,
        };

        var qs = string.Join('&', query
            .Where(kv => !string.IsNullOrEmpty(kv.Value))
            .Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value!)}"));

        return $"{_o.AuthBaseUrl.TrimEnd('/')}/authorization?{qs}";
    }

    public Task<MercadoPagoTokens> ExchangeCodeAsync(string code, CancellationToken ct = default) =>
        PostTokenAsync(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["client_id"] = _o.ClientId,
            ["client_secret"] = _o.ClientSecret,
            ["code"] = code,
            ["redirect_uri"] = _o.RedirectUri,
        }, ct);

    public Task<MercadoPagoTokens> RefreshAsync(string refreshToken, CancellationToken ct = default) =>
        PostTokenAsync(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["client_id"] = _o.ClientId,
            ["client_secret"] = _o.ClientSecret,
            ["refresh_token"] = refreshToken,
        }, ct);

    private async Task<MercadoPagoTokens> PostTokenAsync(Dictionary<string, string> form, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{_o.ApiBaseUrl.TrimEnd('/')}/oauth/token")
        {
            Content = new FormUrlEncodedContent(form),
        };
        request.Headers.Accept.Add(new("application/json"));

        using var response = await http.SendAsync(request, ct);
        var json = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException($"MercadoPago OAuth error {(int)response.StatusCode}: {json}");

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        return new MercadoPagoTokens(
            UserId: root.TryGetProperty("user_id", out var uid) && uid.ValueKind == JsonValueKind.Number ? uid.GetInt64() : 0,
            AccessToken: root.GetProperty("access_token").GetString()
                ?? throw new InvalidOperationException("MercadoPago OAuth response missing access_token."),
            RefreshToken: root.TryGetProperty("refresh_token", out var rt) ? rt.GetString() ?? string.Empty : string.Empty,
            PublicKey: root.TryGetProperty("public_key", out var pk) ? pk.GetString() : null,
            Scope: root.TryGetProperty("scope", out var sc) ? sc.GetString() ?? string.Empty : string.Empty,
            ExpiresInSeconds: root.TryGetProperty("expires_in", out var ex) && ex.ValueKind == JsonValueKind.Number ? ex.GetInt32() : 15552000);
    }
}
