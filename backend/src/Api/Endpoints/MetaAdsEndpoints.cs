using Analytics.Infrastructure;
using Api.Auth;
using Api.MetaAds;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Meta Ads: conectar la cuenta publicitaria y leer el GASTO de pauta para el
/// ROAS real del dashboard de Rentabilidad ("Meta te dice ROAS 4x cuando la
/// realidad suele ser 1.8x"). Sin credenciales de plataforma configuradas
/// (MetaAds:AppId/AppSecret) la integración queda apagada y el panel lo dice.
/// </summary>
public static class MetaAdsEndpoints
{
    public static RouteGroupBuilder MapMetaAdsEndpoints(this RouteGroupBuilder group)
    {
        // Ver el estado y el gasto es parte de las estadísticas; conectar la
        // cuenta publicitaria es otra decisión, con su propio permiso.
        var meta = group.MapGroup("/meta-ads").RequireTenant();

        meta.MapGet("/status", async (
            AnalyticsDbContext db, IOptions<MetaAdsOptions> options, CancellationToken ct) =>
        {
            var c = await db.MetaAdsConnections.AsNoTracking().FirstOrDefaultAsync(ct);
            return Results.Ok(new
            {
                configured = options.Value.Configured,
                connected = c is not null,
                expired = c?.TokenExpiresAtUtc is { } exp && exp <= DateTime.UtcNow,
                adAccountId = c?.AdAccountId,
                adAccountName = c?.AdAccountName,
                connectedAtUtc = c?.ConnectedAtUtc,
            });
        }).RequirePermission(Permission.StatsRead);

        meta.MapPost("/connect", (
            ITenantContext tenant, MetaAdsClient client, MetaAdsTokenService tokens, IOptions<MetaAdsOptions> options) =>
        {
            if (!options.Value.Configured)
                return Error.Validation("MetaAds.NotConfigured",
                    "La integración con Meta Ads no está configurada en esta plataforma (MetaAds:AppId/AppSecret).").ToProblem();
            return Results.Ok(new { authUrl = client.BuildAuthorizationUrl(tokens.ProtectState(tenant.TenantId.Value)) });
        }).RequirePermission(Permission.AdsManage);

        meta.MapDelete("/connection", async (AnalyticsDbContext db, CancellationToken ct) =>
        {
            var c = await db.MetaAdsConnections.FirstOrDefaultAsync(ct);
            if (c is null) return Results.NoContent();
            db.MetaAdsConnections.Remove(c);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequirePermission(Permission.AdsManage);

        meta.MapGet("/ad-accounts", async (
            ITenantContext tenant, MetaAdsClient client, MetaAdsTokenService tokens, CancellationToken ct) =>
        {
            var conn = await tokens.GetConnectionAsync(tenant.TenantId.Value, ct);
            if (conn is null)
                return Error.Conflict("MetaAds.NotConnected", "Conectá tu cuenta de Meta primero.").ToProblem();
            var accounts = await client.GetAdAccountsAsync(conn.Value.AccessToken, ct);
            return accounts.IsSuccess
                ? Results.Ok(new { items = accounts.Value.Select(a => new { id = a.Id, name = a.Name }) })
                : accounts.Error.ToProblem();
        }).RequirePermission(Permission.AdsManage);

        meta.MapPost("/ad-account", async (
            SelectAdAccountRequest request, AnalyticsDbContext db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.AdAccountId))
                return Error.Validation("MetaAds.InvalidAccount", "Elegí una cuenta publicitaria.").ToProblem();
            var c = await db.MetaAdsConnections.FirstOrDefaultAsync(ct);
            if (c is null)
                return Error.Conflict("MetaAds.NotConnected", "Conectá tu cuenta de Meta primero.").ToProblem();
            c.SelectAdAccount(request.AdAccountId.Trim(), request.Name?.Trim());
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { adAccountId = c.AdAccountId, adAccountName = c.AdAccountName });
        }).RequirePermission(Permission.AdsManage);

        // Gasto por campaña del rango. El front cruza contra la ganancia del
        // dashboard: ROAS real = ganancia / gasto (no facturación / gasto).
        meta.MapGet("/spend", async (
            ITenantContext tenant, MetaAdsClient client, MetaAdsTokenService tokens, CancellationToken ct,
            DateOnly? from = null, DateOnly? to = null) =>
        {
            var conn = await tokens.GetConnectionAsync(tenant.TenantId.Value, ct);
            if (conn is null)
                return Error.Conflict("MetaAds.NotConnected", "Conectá tu cuenta de Meta primero.").ToProblem();
            if (conn.Value.Connection.AdAccountId is not { } account)
                return Error.Conflict("MetaAds.NoAccount", "Elegí la cuenta publicitaria primero.").ToProblem();

            var until = to ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var since = from ?? until.AddDays(-30);
            var spend = await client.GetSpendAsync(conn.Value.AccessToken, account, since, until, ct);
            if (spend.IsFailure) return spend.Error.ToProblem();

            return Results.Ok(new
            {
                // Meta informa el gasto en la moneda de la cuenta (pesos acá) —
                // a centavos para operar con los montos del dashboard.
                spendTotal = (long)Math.Round(spend.Value.Sum(s => s.Spend) * 100m),
                campaigns = spend.Value.Select(s => new
                {
                    id = s.CampaignId,
                    name = s.CampaignName,
                    spend = (long)Math.Round(s.Spend * 100m),
                }),
            });
        }).RequirePermission(Permission.StatsRead);

        // Callback OAuth público: el tenant viaja firmado en el state.
        group.MapGet("/meta-ads/oauth/callback", async (
            string? code, string? state,
            MetaAdsClient client, MetaAdsTokenService tokens, AnalyticsDbContext db,
            IOptions<MetaAdsOptions> options, ILoggerFactory loggerFactory, CancellationToken ct) =>
        {
            var returnUrl = options.Value.AdminReturnUrl;
            if (string.IsNullOrEmpty(code) || string.IsNullOrEmpty(state)) return Back(returnUrl, ok: false);

            var tenantId = tokens.TryUnprotectState(state);
            if (tenantId is null) return Back(returnUrl, ok: false);

            try
            {
                var exchanged = await client.ExchangeCodeAsync(code, ct);
                if (exchanged.IsFailure) return Back(returnUrl, ok: false);

                var encrypted = tokens.Protect(exchanged.Value.AccessToken);
                var existing = await db.MetaAdsConnections.IgnoreQueryFilters()
                    .FirstOrDefaultAsync(c => c.TenantId == tenantId.Value, ct);
                if (existing is null)
                    db.MetaAdsConnections.Add(MetaAdsConnection.Create(tenantId.Value, encrypted, exchanged.Value.ExpiresAtUtc));
                else
                    existing.UpdateToken(encrypted, exchanged.Value.ExpiresAtUtc);
                await db.SaveChangesAsync(ct);

                return Back(returnUrl, ok: true);
            }
            catch (Exception ex)
            {
                // Como Meli/Social: el browser del merchant siempre vuelve al panel.
                loggerFactory.CreateLogger("MetaAdsOAuth")
                    .LogError(ex, "OAuth de Meta Ads falló para tenant {TenantId}.", tenantId);
                return Back(returnUrl, ok: false);
            }
        });

        return group;
    }

    private static IResult Back(string returnUrl, bool ok) =>
        Results.Redirect($"{returnUrl}?meta={(ok ? "connected" : "error")}");
}

public sealed record SelectAdAccountRequest(string? AdAccountId, string? Name);
