using System.Text.Json;
using Microsoft.Extensions.Options;
using SharedKernel.Common;

namespace Api.MetaAds;

public sealed record MetaAdAccount(string Id, string Name);

public sealed record MetaCampaignSpend(string CampaignId, string CampaignName, decimal Spend);

/// <summary>
/// Cliente de la Graph/Marketing API de Meta para lo ÚNICO que necesita el
/// dashboard de rentabilidad: autorizar, listar cuentas publicitarias y leer
/// el gasto por campaña. Devuelve errores tolerantes (la pauta es opcional).
/// </summary>
public sealed class MetaAdsClient(HttpClient http, IOptions<MetaAdsOptions> options, ILogger<MetaAdsClient> logger)
{
    private readonly MetaAdsOptions _o = options.Value;

    public bool Configured => _o.Configured;

    public string BuildAuthorizationUrl(string state) =>
        OAuth2.BuildAuthorizationUrl(_o.AuthBaseUrl, new Dictionary<string, string>
        {
            ["response_type"] = "code",
            ["client_id"] = _o.AppId,
            ["redirect_uri"] = _o.RedirectUri,
            ["state"] = state,
            ["scope"] = "ads_read",
        });

    /// <summary>
    /// code → token corto → token LARGO (~60 días). Meta canjea por GET con
    /// query params (no POST form como MP/ML).
    /// </summary>
    public async Task<Result<(string AccessToken, DateTime? ExpiresAtUtc)>> ExchangeCodeAsync(string code, CancellationToken ct)
    {
        var shortLived = await GetTokenAsync(
            $"{_o.ApiBaseUrl}/oauth/access_token?client_id={Uri.EscapeDataString(_o.AppId)}" +
            $"&redirect_uri={Uri.EscapeDataString(_o.RedirectUri)}" +
            $"&client_secret={Uri.EscapeDataString(_o.AppSecret)}&code={Uri.EscapeDataString(code)}", ct);
        if (shortLived.IsFailure) return Result.Failure<(string, DateTime?)>(shortLived.Error);

        var longLived = await GetTokenAsync(
            $"{_o.ApiBaseUrl}/oauth/access_token?grant_type=fb_exchange_token" +
            $"&client_id={Uri.EscapeDataString(_o.AppId)}&client_secret={Uri.EscapeDataString(_o.AppSecret)}" +
            $"&fb_exchange_token={Uri.EscapeDataString(shortLived.Value.AccessToken)}", ct);
        return longLived.IsSuccess ? longLived : shortLived;
    }

    private async Task<Result<(string AccessToken, DateTime? ExpiresAtUtc)>> GetTokenAsync(string url, CancellationToken ct)
    {
        using var resp = await http.GetAsync(url, ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogError("Meta token error {Status}: {Body}", (int)resp.StatusCode, json);
            return Result.Failure<(string, DateTime?)>(new Error("MetaAds.TokenFailed", "Meta rechazó la autorización."));
        }
        using var doc = JsonDocument.Parse(json);
        var token = JsonRead.GetString(doc.RootElement, "access_token");
        if (string.IsNullOrEmpty(token))
            return Result.Failure<(string, DateTime?)>(new Error("MetaAds.TokenFailed", "Respuesta de Meta sin token."));
        var expires = doc.RootElement.TryGetProperty("expires_in", out var e) && e.ValueKind == JsonValueKind.Number
            ? DateTime.UtcNow.AddSeconds(e.GetInt64())
            : (DateTime?)null;
        return (token!, expires);
    }

    public async Task<Result<IReadOnlyList<MetaAdAccount>>> GetAdAccountsAsync(string accessToken, CancellationToken ct)
    {
        using var resp = await http.GetAsync(
            $"{_o.ApiBaseUrl}/me/adaccounts?fields=id,name&limit=50&access_token={Uri.EscapeDataString(accessToken)}", ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogError("Meta adaccounts error {Status}: {Body}", (int)resp.StatusCode, json);
            return Result.Failure<IReadOnlyList<MetaAdAccount>>(new Error("MetaAds.AccountsFailed", "No se pudieron listar las cuentas publicitarias."));
        }
        using var doc = JsonDocument.Parse(json);
        var list = new List<MetaAdAccount>();
        if (doc.RootElement.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
            foreach (var a in data.EnumerateArray())
                list.Add(new MetaAdAccount(
                    JsonRead.GetString(a, "id") ?? "",
                    JsonRead.GetString(a, "name") ?? ""));
        return list;
    }

    /// <summary>Gasto por campaña del rango (insights level=campaign).</summary>
    public async Task<Result<IReadOnlyList<MetaCampaignSpend>>> GetSpendAsync(
        string accessToken, string adAccountId, DateOnly since, DateOnly until, CancellationToken ct)
    {
        var timeRange = Uri.EscapeDataString($"{{\"since\":\"{since:yyyy-MM-dd}\",\"until\":\"{until:yyyy-MM-dd}\"}}");
        using var resp = await http.GetAsync(
            $"{_o.ApiBaseUrl}/{adAccountId}/insights?level=campaign&fields=campaign_id,campaign_name,spend" +
            $"&time_range={timeRange}&limit=100&access_token={Uri.EscapeDataString(accessToken)}", ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogError("Meta insights error {Status}: {Body}", (int)resp.StatusCode, json);
            return Result.Failure<IReadOnlyList<MetaCampaignSpend>>(new Error("MetaAds.InsightsFailed", "No se pudo leer el gasto de pauta."));
        }
        using var doc = JsonDocument.Parse(json);
        var list = new List<MetaCampaignSpend>();
        if (doc.RootElement.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
            foreach (var row in data.EnumerateArray())
                list.Add(new MetaCampaignSpend(
                    JsonRead.GetString(row, "campaign_id") ?? "",
                    JsonRead.GetString(row, "campaign_name") ?? "",
                    decimal.TryParse(JsonRead.GetString(row, "spend"), System.Globalization.CultureInfo.InvariantCulture, out var s) ? s : 0m));
        return list;
    }
}
