using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using System.Text.Json;
using Themes.Infrastructure;

namespace Api.Endpoints;

public static class ThemeEndpoints
{
    public static RouteGroupBuilder MapThemeEndpoints(this RouteGroupBuilder group)
    {
        var theme = group.MapGroup("/theme");

        // Config PUBLICADA — la que sirve el storefront al comprador.
        theme.MapGet("/", async (ITenantContext tenant, ThemesDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return MissingTenant();
            var doc = await GetOrCreateAsync(tenant.TenantId.Value, db, ct);
            return ConfigResult(doc.PublishedConfig);
        });

        // Config DRAFT — la que edita el panel (preview). Si no hay draft, cae a publicada.
        theme.MapGet("/draft", async (ITenantContext tenant, ThemesDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return MissingTenant();
            var doc = await GetOrCreateAsync(tenant.TenantId.Value, db, ct);
            return ConfigResult(string.IsNullOrWhiteSpace(doc.DraftConfig) ? doc.PublishedConfig : doc.DraftConfig);
        });

        // Autosave del borrador (no toca lo publicado).
        theme.MapPut("/draft", async (
            JsonElement body, ITenantContext tenant, ThemesDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return MissingTenant();
            if (!IsValidConfig(body))
                return Results.Problem(title: "Theme.InvalidConfig", detail: "Config must be a JSON object.", statusCode: 400);

            var doc = await GetOrCreateAsync(tenant.TenantId.Value, db, ct);
            doc.DraftConfig = body.GetRawText();
            doc.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Publicar: draft → published (y persiste el draft enviado en el mismo request).
        theme.MapPost("/publish", async (
            JsonElement body, ITenantContext tenant, ThemesDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return MissingTenant();
            if (!IsValidConfig(body))
                return Results.Problem(title: "Theme.InvalidConfig", detail: "Config must be a JSON object.", statusCode: 400);

            var doc = await GetOrCreateAsync(tenant.TenantId.Value, db, ct);
            doc.DraftConfig = body.GetRawText();
            doc.PublishedConfig = body.GetRawText();
            doc.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return ConfigResult(doc.PublishedConfig);
        });

        return group;
    }

    private static IResult MissingTenant() => Results.BadRequest(new { error = "Missing X-Tenant-Id header." });

    private static bool IsValidConfig(JsonElement body) => body.ValueKind == JsonValueKind.Object;

    private static IResult ConfigResult(string json) =>
        Results.Content(string.IsNullOrWhiteSpace(json) ? ThemeDocument.DefaultConfig : json, "application/json");

    private static async Task<ThemeDocument> GetOrCreateAsync(Guid tenantId, ThemesDbContext db, CancellationToken ct)
    {
        var doc = await db.Themes.FirstOrDefaultAsync(t => t.TenantId == tenantId, ct);
        if (doc is null)
        {
            doc = ThemeDocument.CreateDefault(tenantId);
            db.Themes.Add(doc);
            await db.SaveChangesAsync(ct);
        }
        // Backfill: docs viejos con config vacía o incompleta ({}) → default.
        var changed = false;
        if (!LooksLikeConfig(doc.PublishedConfig)) { doc.PublishedConfig = ThemeDocument.DefaultConfig; changed = true; }
        if (!LooksLikeConfig(doc.DraftConfig)) { doc.DraftConfig = doc.PublishedConfig; changed = true; }
        if (changed) await db.SaveChangesAsync(ct);
        return doc;
    }

    private static bool LooksLikeConfig(string? json) =>
        !string.IsNullOrWhiteSpace(json) && json.Contains("\"colors\"") && json.Contains("\"sections\"");
}
