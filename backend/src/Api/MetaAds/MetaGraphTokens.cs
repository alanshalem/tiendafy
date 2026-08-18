using System.Text.Json;
using SharedKernel.Common;

namespace Api.MetaAds;

/// <summary>
/// Canje OAuth de la Graph API (code → token corto → token LARGO ~60 días),
/// compartido por Meta Ads y el conector social de Meta. Meta canjea por GET
/// con query params (no POST form como MP/ML). null = Meta rechazó (logueado).
/// </summary>
public static class MetaGraphTokens
{
    public static async Task<(string AccessToken, DateTime? ExpiresAtUtc)?> ExchangeCodeAsync(
        HttpClient http, ILogger logger, string apiBaseUrl, string appId, string appSecret,
        string redirectUri, string code, CancellationToken ct)
    {
        var shortLived = await GetTokenAsync(http, logger,
            $"{apiBaseUrl}/oauth/access_token?client_id={Uri.EscapeDataString(appId)}" +
            $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
            $"&client_secret={Uri.EscapeDataString(appSecret)}&code={Uri.EscapeDataString(code)}", ct);
        if (shortLived is null) return null;

        var longLived = await GetTokenAsync(http, logger,
            $"{apiBaseUrl}/oauth/access_token?grant_type=fb_exchange_token" +
            $"&client_id={Uri.EscapeDataString(appId)}&client_secret={Uri.EscapeDataString(appSecret)}" +
            $"&fb_exchange_token={Uri.EscapeDataString(shortLived.Value.AccessToken)}", ct);
        return longLived ?? shortLived;
    }

    private static async Task<(string AccessToken, DateTime? ExpiresAtUtc)?> GetTokenAsync(
        HttpClient http, ILogger logger, string url, CancellationToken ct)
    {
        using var resp = await http.GetAsync(url, ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogError("Meta token error {Status}: {Body}", (int)resp.StatusCode, Text.Clip(json, 400));
            return null;
        }
        using var doc = JsonDocument.Parse(json);
        var token = JsonRead.GetString(doc.RootElement, "access_token");
        if (string.IsNullOrEmpty(token)) return null;
        var expires = doc.RootElement.TryGetProperty("expires_in", out var e) && e.ValueKind == JsonValueKind.Number
            ? DateTime.UtcNow.AddSeconds(e.GetInt64())
            : (DateTime?)null;
        return (token, expires);
    }
}
