using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using SharedKernel.Common;
using Social.Contracts;

namespace Api.Social;

/// <summary>
/// X (Twitter): OAuth2 con PKCE (el verifier viaja dentro del state cifrado) y
/// publicación por API v2. El access token dura ~2 h: se renueva antes de
/// publicar (offline.access) y el refresh token de X es de un solo uso, igual
/// que el de Mercado Libre: la renovación la serializa y la persiste
/// <see cref="SocialAccountTokens"/>, no este canal.
/// v1 publica texto (+link); el upload de media de X va por otro flujo y queda
/// como mejora declarada (MaxImages=0).
/// </summary>
public sealed class XSocialChannel(HttpClient http, IOptions<SocialOptions> options, ILogger<XSocialChannel> logger)
    : ISocialChannel, ISocialConnector, ISocialTokenRefresher
{
    /// <summary>Renovar con margen: nunca publicar con un token a segundos de vencer.</summary>
    private static readonly TimeSpan ExpiryMargin = TimeSpan.FromMinutes(5);

    private readonly SocialOptions.XSection _o = options.Value.X;

    public string Key => "x";
    public string DisplayName => "X (Twitter)";
    public SocialChannelLimits Limits => new(MaxChars: 280, MaxImages: 0, RequiresMedia: false);
    public bool Configured => _o.Configured;
    public bool UsesPkce => true;

    // ---------------------------------------------------------------- Connect

    public string BuildAuthUrl(string state, string? verifier)
    {
        ArgumentException.ThrowIfNullOrEmpty(verifier); // UsesPkce: el endpoint siempre lo genera
        var challenge = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        return OAuth2.BuildAuthorizationUrl(_o.AuthBaseUrl, new Dictionary<string, string>
        {
            ["response_type"] = "code",
            ["client_id"] = _o.ClientId,
            ["redirect_uri"] = _o.RedirectUri,
            ["state"] = state,
            ["scope"] = "tweet.read tweet.write users.read offline.access",
            ["code_challenge"] = challenge,
            ["code_challenge_method"] = "S256",
        });
    }

    public async Task<Result<IReadOnlyList<SocialAccountCandidate>>> CompleteConnectAsync(string code, string? verifier, CancellationToken ct)
    {
        ArgumentException.ThrowIfNullOrEmpty(verifier);
        var token = await RequestTokenAsync(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = _o.RedirectUri,
            ["code_verifier"] = verifier,
            ["client_id"] = _o.ClientId,
        }, ct);
        if (token is null)
            return Result.Failure<IReadOnlyList<SocialAccountCandidate>>(new Error("Social.XAuth", "X rechazó la autorización."));

        using var me = await SendAsync(HttpMethod.Get, "/users/me?user.fields=profile_image_url,username", token.Value.Access, null, ct);
        var meJson = await me.Content.ReadAsStringAsync(ct);
        if (!me.IsSuccessStatusCode)
            return Result.Failure<IReadOnlyList<SocialAccountCandidate>>(new Error("Social.XProfile", "No se pudo leer el perfil de X."));

        using var doc = JsonDocument.Parse(meJson);
        var data = doc.RootElement.GetProperty("data");
        var username = JsonRead.GetString(data, "username");
        return new List<SocialAccountCandidate>
        {
            new("x", JsonRead.GetString(data, "id") ?? "",
                JsonRead.GetString(data, "name") ?? username ?? "X",
                username,
                JsonRead.GetString(data, "profile_image_url"),
                TokenJson(token.Value.Access, token.Value.Refresh, token.Value.ExpiresAtUtc)),
        };
    }

    // ---------------------------------------------------------------- Publish

    public bool NeedsRenewal(string tokenJson)
    {
        var expiresAt = SocialTokenService.TokenField(tokenJson, "expires_at_utc");
        return !string.IsNullOrEmpty(SocialTokenService.TokenField(tokenJson, "refresh_token"))
            && DateTime.TryParse(expiresAt, null,
                System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal,
                out var exp)
            && exp <= DateTime.UtcNow.Add(ExpiryMargin);
    }

    public async Task<string?> RenewAsync(string tokenJson, CancellationToken ct)
    {
        var refresh = SocialTokenService.TokenField(tokenJson, "refresh_token");
        if (string.IsNullOrEmpty(refresh)) return null;
        var renewed = await RequestTokenAsync(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = refresh,
            ["client_id"] = _o.ClientId,
        }, ct);
        // Si X no devuelve un refresh token nuevo, se conserva el anterior.
        return renewed is { } r ? TokenJson(r.Access, r.Refresh ?? refresh, r.ExpiresAtUtc) : null;
    }

    public async Task<SocialPublishResult> PublishAsync(
        string tokenJson, string? dataJson, string text, IReadOnlyList<string> mediaUrls, CancellationToken ct)
    {
        var access = SocialTokenService.TokenField(tokenJson, "access_token");
        if (string.IsNullOrEmpty(access)) return SocialPublishResult.Unauthorized();

        using var resp = await SendAsync(HttpMethod.Post, "/tweets", access,
            JsonContent.Create(new { text }), ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (resp.StatusCode == System.Net.HttpStatusCode.Unauthorized) return SocialPublishResult.Unauthorized();
        if ((int)resp.StatusCode == 429)
            return new SocialPublishResult(SocialPublishStatus.RateLimited, Message: "Rate limit de X.", RetryAfter: TimeSpan.FromMinutes(15));
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogWarning("X publish error {Status}: {Body}", (int)resp.StatusCode, Text.Clip(json, 500));
            return SocialPublishResult.Fail($"X respondió {(int)resp.StatusCode}.");
        }

        using var doc = JsonDocument.Parse(json);
        var id = doc.RootElement.TryGetProperty("data", out var d) ? JsonRead.GetString(d, "id") : null;
        var username = SocialTokenService.TokenField(dataJson ?? "{}", "username");
        var url = id is not null && username is not null ? $"https://x.com/{username}/status/{id}" : null;
        return SocialPublishResult.Ok(id, url);
    }

    // ---------------------------------------------------------------- Helpers

    private async Task<(string Access, string? Refresh, DateTime ExpiresAtUtc)?> RequestTokenAsync(
        Dictionary<string, string> form, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{_o.ApiBaseUrl}/oauth2/token")
        {
            Content = new FormUrlEncodedContent(form),
        };
        // Apps confidenciales exigen Basic auth además del client_id del form.
        if (!string.IsNullOrEmpty(_o.ClientSecret))
            req.Headers.Authorization = new AuthenticationHeaderValue("Basic",
                Convert.ToBase64String(Encoding.ASCII.GetBytes($"{_o.ClientId}:{_o.ClientSecret}")));

        using var resp = await http.SendAsync(req, ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogError("X token error {Status}: {Body}", (int)resp.StatusCode, Text.Clip(json, 400));
            return null;
        }
        using var doc = JsonDocument.Parse(json);
        var access = JsonRead.GetString(doc.RootElement, "access_token");
        if (access is null) return null;
        var expires = doc.RootElement.TryGetProperty("expires_in", out var e) && e.ValueKind == JsonValueKind.Number
            ? DateTime.UtcNow.AddSeconds(e.GetInt64())
            : DateTime.UtcNow.AddHours(2);
        return (access, JsonRead.GetString(doc.RootElement, "refresh_token"), expires);
    }

    private Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, string accessToken, HttpContent? content, CancellationToken ct)
    {
        var req = new HttpRequestMessage(method, $"{_o.ApiBaseUrl}{path}") { Content = content };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return http.SendAsync(req, ct);
    }

    private static string TokenJson(string access, string? refresh, DateTime expiresAtUtc) =>
        JsonSerializer.Serialize(new
        {
            access_token = access,
            refresh_token = refresh,
            expires_at_utc = expiresAtUtc.ToString("O"),
        });

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
