using System.Text.Json;
using Microsoft.Extensions.Options;
using Payments.Core.Abstractions;
using SharedKernel.Common;

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
        PostTokenAsync(OAuth2.AuthorizationCodeGrant(_o.ClientId, _o.ClientSecret, code, _o.RedirectUri), ct);

    public Task<MercadoPagoTokens> RefreshAsync(string refreshToken, CancellationToken ct = default) =>
        PostTokenAsync(OAuth2.RefreshTokenGrant(_o.ClientId, _o.ClientSecret, refreshToken), ct);

    private async Task<MercadoPagoTokens> PostTokenAsync(Dictionary<string, string> form, CancellationToken ct)
    {
        var (status, ok, json) = await OAuth2.PostTokenAsync(http, _o.ApiBaseUrl, form, ct);
        if (!ok)
            throw new InvalidOperationException($"MercadoPago OAuth error {(int)status}: {json}");

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        return new MercadoPagoTokens(
            UserId: JsonRead.GetLong(root, "user_id"),
            AccessToken: root.GetProperty("access_token").GetString()
                ?? throw new InvalidOperationException("MercadoPago OAuth response missing access_token."),
            RefreshToken: JsonRead.GetString(root, "refresh_token") ?? string.Empty,
            PublicKey: JsonRead.GetString(root, "public_key"),
            Scope: JsonRead.GetString(root, "scope") ?? string.Empty,
            ExpiresInSeconds: root.TryGetProperty("expires_in", out var ex) && ex.ValueKind == JsonValueKind.Number ? ex.GetInt32() : 15552000);
    }
}
