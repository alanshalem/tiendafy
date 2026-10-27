using Analytics.Infrastructure;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

public static class TrackEndpoints
{
    public static RouteGroupBuilder MapTrackEndpoints(this RouteGroupBuilder group)
    {
        // Beacon de page-view desde el storefront. Anónimo, no bloqueante.
        group.MapPost("/track", async (TrackRequest req, ITenantContext tenant, AnalyticsDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return Results.NoContent();
            db.PageViews.Add(PageView.Create(tenant.TenantId.Value, req.Path, req.Referrer, req.VisitorId, req.SessionId, req.UtmSource));
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequireRateLimiting("track");

        return group;
    }
}

public sealed record TrackRequest(string? Path, string? Referrer, string? VisitorId, string? SessionId, string? UtmSource = null);
