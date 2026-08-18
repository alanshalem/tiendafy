using System.Text.Json;
using Api.MetaAds;
using Microsoft.Extensions.Options;
using SharedKernel.Common;

namespace Api.Social;

/// <summary>
/// Conector de Meta: UN flujo OAuth que devuelve todas las páginas de Facebook
/// del usuario (con su page token, ya long-lived) y los perfiles de Instagram
/// Business vinculados. Diseño Mixpost: exchange inmediato a long-lived y el
/// page token es el que publica; ante 401 se marca la cuenta y se reconecta
/// (sin refresh: los page tokens de long-lived no expiran en la práctica).
/// </summary>
public sealed class MetaSocialConnector(HttpClient http, IOptions<SocialOptions> options, ILogger<MetaSocialConnector> logger)
    : ISocialConnector
{
    private readonly SocialOptions.MetaSection _o = options.Value.Meta;

    public string Key => "meta";
    public string DisplayName => "Facebook / Instagram";
    public bool Configured => _o.Configured;
    public bool UsesPkce => false;

    public string BuildAuthUrl(string state, string? verifier) =>
        OAuth2.BuildAuthorizationUrl(_o.AuthBaseUrl, new Dictionary<string, string>
        {
            ["response_type"] = "code",
            ["client_id"] = _o.AppId,
            ["redirect_uri"] = _o.RedirectUri,
            ["state"] = state,
            ["scope"] = "pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish",
        });

    public async Task<Result<IReadOnlyList<SocialAccountCandidate>>> CompleteConnectAsync(string code, string? verifier, CancellationToken ct)
    {
        // code → user token → long-lived: mismo baile que Meta Ads, mismo helper.
        var pair = await MetaGraphTokens.ExchangeCodeAsync(
            http, logger, _o.ApiBaseUrl, _o.AppId, _o.AppSecret, _o.RedirectUri, code, ct);
        if (pair is null)
            return Result.Failure<IReadOnlyList<SocialAccountCandidate>>(new Error("Social.MetaAuth", "Meta rechazó la autorización."));
        var longLived = pair.Value.AccessToken;

        // Páginas con su page token + IG business vinculado.
        using var resp = await http.GetAsync(
            $"{_o.ApiBaseUrl}/me/accounts?fields=id,name,username,access_token,picture{{url}}," +
            $"instagram_business_account{{id,username,profile_picture_url}}&limit=50" +
            $"&access_token={Uri.EscapeDataString(longLived)}", ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogError("Meta pages error {Status}: {Body}", (int)resp.StatusCode, json);
            return Result.Failure<IReadOnlyList<SocialAccountCandidate>>(new Error("Social.MetaPages", "No se pudieron listar las páginas."));
        }

        var candidates = new List<SocialAccountCandidate>();
        using var doc = JsonDocument.Parse(json);
        if (doc.RootElement.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
        {
            foreach (var page in data.EnumerateArray())
            {
                var pageId = JsonRead.GetString(page, "id") ?? "";
                var pageToken = JsonRead.GetString(page, "access_token") ?? "";
                var pageName = JsonRead.GetString(page, "name") ?? "Página";
                if (pageId.Length == 0 || pageToken.Length == 0) continue;

                var avatar = page.TryGetProperty("picture", out var pic) && pic.TryGetProperty("data", out var picData)
                    ? JsonRead.GetString(picData, "url")
                    : null;
                var tokenJson = JsonSerializer.Serialize(new { page_token = pageToken });

                candidates.Add(new SocialAccountCandidate(
                    "meta_facebook", pageId, pageName, JsonRead.GetString(page, "username"), avatar, tokenJson));

                if (page.TryGetProperty("instagram_business_account", out var ig) && ig.ValueKind == JsonValueKind.Object)
                {
                    var igId = JsonRead.GetString(ig, "id") ?? "";
                    if (igId.Length > 0)
                        candidates.Add(new SocialAccountCandidate(
                            "meta_instagram", igId,
                            JsonRead.GetString(ig, "username") is { } u ? $"@{u}" : pageName,
                            JsonRead.GetString(ig, "username"),
                            JsonRead.GetString(ig, "profile_picture_url"),
                            tokenJson, // IG publica con el page token de su página
                            JsonSerializer.Serialize(new { page_id = pageId })));
                }
            }
        }

        return candidates.Count > 0
            ? candidates
            : Result.Failure<IReadOnlyList<SocialAccountCandidate>>(new Error(
                "Social.MetaNoPages", "Tu usuario de Meta no administra ninguna página."));
    }

}

/// <summary>Página de Facebook: /feed para texto, /photos (unpublished) + attached_media para imágenes.</summary>
public sealed class MetaFacebookChannel(HttpClient http, IOptions<SocialOptions> options, ILogger<MetaFacebookChannel> logger)
    : ISocialChannel
{
    private readonly SocialOptions.MetaSection _o = options.Value.Meta;

    public string Key => "meta_facebook";
    public string DisplayName => "Facebook";
    public SocialChannelLimits Limits => new(MaxChars: 5000, MaxImages: 10, RequiresMedia: false);

    public async Task<SocialPublishResult> PublishAsync(
        string tokenJson, string? dataJson, string text, IReadOnlyList<string> mediaUrls, CancellationToken ct)
    {
        var pageToken = SocialTokenService.TokenField(tokenJson, "page_token");
        // El worker siempre inyecta provider_id (acá: el id de la página) en dataJson.
        var pageId = SocialTokenService.TokenField(dataJson ?? "{}", "provider_id");
        if (string.IsNullOrEmpty(pageToken)) return SocialPublishResult.Unauthorized();
        if (string.IsNullOrEmpty(pageId)) return SocialPublishResult.Fail("Cuenta sin página asociada.");

        // Imágenes: subirlas unpublished y adjuntarlas al post del feed.
        var attached = new List<string>();
        foreach (var url in mediaUrls.Take(Limits.MaxImages))
        {
            var (photoId, error) = await UploadPhotoAsync(pageId, pageToken, url, ct);
            if (error is not null) return error;
            if (photoId is not null) attached.Add(photoId);
        }

        var form = new List<KeyValuePair<string, string>>
        {
            new("message", text),
            new("access_token", pageToken),
        };
        for (var i = 0; i < attached.Count; i++)
            form.Add(new($"attached_media[{i}]", $"{{\"media_fbid\":\"{attached[i]}\"}}"));

        using var resp = await http.PostAsync($"{_o.ApiBaseUrl}/{pageId}/feed", new FormUrlEncodedContent(form), ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode) return MetaErrors.Translate(resp, json, logger);

        using var doc = JsonDocument.Parse(json);
        var postId = JsonRead.GetString(doc.RootElement, "id");
        return SocialPublishResult.Ok(postId, postId is null ? null : $"https://www.facebook.com/{postId}");
    }

    private async Task<(string? PhotoId, SocialPublishResult? Error)> UploadPhotoAsync(
        string pageId, string pageToken, string url, CancellationToken ct)
    {
        using var resp = await http.PostAsync($"{_o.ApiBaseUrl}/{pageId}/photos", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["url"] = url,
            ["published"] = "false",
            ["access_token"] = pageToken,
        }), ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode) return (null, MetaErrors.Translate(resp, json, logger));
        using var doc = JsonDocument.Parse(json);
        return (JsonRead.GetString(doc.RootElement, "id"), null);
    }
}

/// <summary>
/// Instagram Business: container (/media con image_url) → /media_publish.
/// Exige imagen (RequiresMedia) — el composer lo valida con este descriptor.
/// </summary>
public sealed class MetaInstagramChannel(HttpClient http, IOptions<SocialOptions> options, ILogger<MetaInstagramChannel> logger)
    : ISocialChannel
{
    private readonly SocialOptions.MetaSection _o = options.Value.Meta;

    public string Key => "meta_instagram";
    public string DisplayName => "Instagram";
    public SocialChannelLimits Limits => new(MaxChars: 2200, MaxImages: 1, RequiresMedia: true);

    public async Task<SocialPublishResult> PublishAsync(
        string tokenJson, string? dataJson, string text, IReadOnlyList<string> mediaUrls, CancellationToken ct)
    {
        var pageToken = SocialTokenService.TokenField(tokenJson, "page_token");
        var igId = SocialTokenService.TokenField(dataJson ?? "{}", "provider_id");
        if (string.IsNullOrEmpty(pageToken)) return SocialPublishResult.Unauthorized();
        if (string.IsNullOrEmpty(igId)) return SocialPublishResult.Fail("Cuenta de Instagram sin id.");
        if (mediaUrls.Count == 0) return SocialPublishResult.Fail("Instagram exige al menos una imagen.");

        using var container = await http.PostAsync($"{_o.ApiBaseUrl}/{igId}/media", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["image_url"] = mediaUrls[0],
            ["caption"] = text,
            ["access_token"] = pageToken,
        }), ct);
        var containerJson = await container.Content.ReadAsStringAsync(ct);
        if (!container.IsSuccessStatusCode) return MetaErrors.Translate(container, containerJson, logger);
        string? creationId;
        using (var doc = JsonDocument.Parse(containerJson))
            creationId = JsonRead.GetString(doc.RootElement, "id");
        if (creationId is null) return SocialPublishResult.Fail("Meta no devolvió el contenedor.");

        using var publish = await http.PostAsync($"{_o.ApiBaseUrl}/{igId}/media_publish", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["creation_id"] = creationId,
            ["access_token"] = pageToken,
        }), ct);
        var publishJson = await publish.Content.ReadAsStringAsync(ct);
        if (!publish.IsSuccessStatusCode) return MetaErrors.Translate(publish, publishJson, logger);

        string? mediaId;
        using (var doc = JsonDocument.Parse(publishJson))
            mediaId = JsonRead.GetString(doc.RootElement, "id");

        // Permalink real (las URLs de IG no se derivan del id).
        string? permalink = null;
        if (mediaId is not null)
        {
            using var link = await http.GetAsync(
                $"{_o.ApiBaseUrl}/{mediaId}?fields=permalink&access_token={Uri.EscapeDataString(pageToken)}", ct);
            if (link.IsSuccessStatusCode)
            {
                using var doc = JsonDocument.Parse(await link.Content.ReadAsStringAsync(ct));
                permalink = JsonRead.GetString(doc.RootElement, "permalink");
            }
        }

        return SocialPublishResult.Ok(mediaId, permalink);
    }
}

/// <summary>Traducción de errores Graph → resultado normalizado (190 = token muerto; 4/17/613 = rate limit).</summary>
internal static class MetaErrors
{
    public static SocialPublishResult Translate(HttpResponseMessage resp, string json, ILogger logger)
    {
        logger.LogWarning("Meta publish error {Status}: {Body}", (int)resp.StatusCode, Text.Clip(json, 500));
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("error", out var error))
            {
                var code = error.TryGetProperty("code", out var c) && c.ValueKind == JsonValueKind.Number ? c.GetInt32() : 0;
                var message = JsonRead.GetString(error, "message") ?? "Error de Meta.";
                if (code == 190) return SocialPublishResult.Unauthorized();
                if (code is 4 or 17 or 613)
                    return new SocialPublishResult(SocialPublishStatus.RateLimited, Message: message, RetryAfter: TimeSpan.FromMinutes(30));
                return SocialPublishResult.Fail(message);
            }
        }
        catch (JsonException) { }
        return SocialPublishResult.Fail($"Meta respondió {(int)resp.StatusCode}.");
    }
}
