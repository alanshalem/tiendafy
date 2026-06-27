using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
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
            doc.DraftConfig = SanitizeConfig(body);
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
            var clean = SanitizeConfig(body);
            doc.DraftConfig = clean;
            doc.PublishedConfig = clean;
            doc.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return ConfigResult(doc.PublishedConfig);
        });

        return group;
    }

    private static IResult MissingTenant() => Results.BadRequest(new { error = "Missing X-Tenant-Id header." });

    private static bool IsValidConfig(JsonElement body) => body.ValueKind == JsonValueKind.Object;

    /// <summary>Reserializa la config saneando `customCss` (el merchant lo inyecta crudo en un &lt;style&gt;).</summary>
    private static string SanitizeConfig(JsonElement body)
    {
        var node = JsonNode.Parse(body.GetRawText());
        if (node is JsonObject obj
            && obj.TryGetPropertyValue("customCss", out var css)
            && css is JsonValue v && v.TryGetValue<string>(out var s))
        {
            obj["customCss"] = SanitizeCss(s);
        }
        return node!.ToJsonString();
    }

    /// <summary>
    /// CSS del merchant: quita lo que permitiría romper el &lt;style&gt; e inyectar HTML/JS
    /// o ejecutar código. No hay CSS legítimo con '&lt;'. Las url() (fondos) quedan.
    /// </summary>
    private static string SanitizeCss(string css)
    {
        if (string.IsNullOrEmpty(css)) return css;
        var cleaned = css.Replace("<", string.Empty); // mata `</style>` y cualquier tag
        foreach (var bad in new[] { "expression(", "javascript:", "behavior:", "-moz-binding", "@import" })
            cleaned = Regex.Replace(cleaned, Regex.Escape(bad), string.Empty, RegexOptions.IgnoreCase);
        return cleaned;
    }

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
