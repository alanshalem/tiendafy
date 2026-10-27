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

    public string BuildAuthorizationUrl(string state) =>
        OAuth2.BuildAuthorizationUrl(_o.AuthBaseUrl, new Dictionary<string, string>
        {
            ["response_type"] = "code",
            ["client_id"] = _o.AppId,
            ["redirect_uri"] = _o.RedirectUri,
            ["state"] = state,
            ["scope"] = "ads_read",
        });

    public async Task<Result<(string AccessToken, DateTime? ExpiresAtUtc)>> ExchangeCodeAsync(string code, CancellationToken ct)
    {
        var pair = await MetaGraphTokens.ExchangeCodeAsync(
            http, logger, _o.ApiBaseUrl, _o.AppId, _o.AppSecret, _o.RedirectUri, code, ct);
        return pair is { } p
            ? (p.AccessToken, p.ExpiresAtUtc)
            : Result.Failure<(string, DateTime?)>(new Error("MetaAds.TokenFailed", "Meta rechazó la autorización."));
    }

    public async Task<Result<IReadOnlyList<MetaAdAccount>>> GetAdAccountsAsync(string accessToken, CancellationToken ct)
    {
        using var resp = await http.GetAsync(
            $"{_o.ApiBaseUrl}/me/adaccounts?fields=id,name&limit=50&access_token={Uri.EscapeDataString(accessToken)}", ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            logger.LogError("Meta adaccounts error {Status}: {Body}", (int)resp.StatusCode, LogValue.Body(json));
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
            logger.LogError("Meta insights error {Status}: {Body}", (int)resp.StatusCode, LogValue.Body(json));
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
