using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Api.Auth;
using Identity.Infrastructure;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using Themes.Infrastructure;

namespace Api.Endpoints;

public static class ThemeEndpoints
{
    public static RouteGroupBuilder MapThemeEndpoints(this RouteGroupBuilder group)
    {
        var theme = group.MapGroup("/theme").RequireTenant().RequirePermissionForWrites(Permission.ContentWrite);

        // Config PUBLICADA — la que sirve el storefront al comprador.
        theme.MapGet("/", async (ITenantContext tenant, ThemesDbContext db, CancellationToken ct) =>
        {
            var doc = await GetOrCreateAsync(tenant.TenantId.Value, db, ct);
            return ConfigResult(doc.PublishedConfig);
        });

        // Config DRAFT — la que edita el panel (preview). Si no hay draft, cae a publicada.
        // Acceso: sesión admin con ContentWrite, O token de preview firmado (lo pide el
        // SSR del storefront, que no tiene la cookie del admin — sin esto el iframe del
        // editor recibía 401 y quedaba en blanco).
        theme.MapGet("/draft", async (ITenantContext tenant, ThemesDbContext db, CancellationToken ct) =>
        {
            var doc = await GetOrCreateAsync(tenant.TenantId.Value, db, ct);
            return ConfigResult(string.IsNullOrWhiteSpace(doc.DraftConfig) ? doc.PublishedConfig : doc.DraftConfig);
        }).AddEndpointFilter(async (ctx, next) =>
        {
            var http = ctx.HttpContext;
            var tenant = http.RequestServices.GetRequiredService<ITenantContext>();
            if (!tenant.HasTenant) return AuthExtensions.MissingTenant();
            if (HasValidPreviewToken(http, tenant.TenantId!.Value)) return await next(ctx);
            var denied = await AuthExtensions.CheckPermissionAsync(http, Permission.ContentWrite);
            return denied is not null ? denied : await next(ctx);
        });

        // Token de preview: el editor lo pide (con sesión + permiso, es un POST → lo
        // protege RequirePermissionForWrites del grupo) y lo pasa en la URL del iframe.
        // Firmado con DataProtection, atado al tenant y con vencimiento — no expone el
        // draft públicamente ni requiere compartir secretos con el storefront.
        theme.MapPost("/preview-token", (ITenantContext tenant, IDataProtectionProvider dp) =>
        {
            var token = PreviewTokenProtector(dp)
                .Protect(tenant.TenantId!.Value.ToString(), TimeSpan.FromHours(12));
            return Results.Ok(new { token });
        });

        // Autosave del borrador (no toca lo publicado).
        theme.MapPut("/draft", async (
            JsonElement body, ITenantContext tenant, ThemesDbContext db, CancellationToken ct) =>
        {
            if (!IsValidConfig(body))
                return Results.Problem(title: "Theme.InvalidConfig", detail: "Config must be a JSON object with colors and sections.", statusCode: 400);

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
            if (!IsValidConfig(body))
                return Results.Problem(title: "Theme.InvalidConfig", detail: "Config must be a JSON object with colors and sections.", statusCode: 400);

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


    private const string PreviewTokenPurpose = "Themes.PreviewToken";

    private static ITimeLimitedDataProtector PreviewTokenProtector(IDataProtectionProvider dp) =>
        dp.CreateProtector(PreviewTokenPurpose).ToTimeLimitedDataProtector();

    /// <summary>Token de preview válido (firma + no vencido) y del tenant del request.</summary>
    private static bool HasValidPreviewToken(HttpContext http, Guid tenantId)
    {
        var token = http.Request.Headers["X-Preview-Token"].ToString();
        if (string.IsNullOrEmpty(token)) return false;
        try
        {
            var raw = PreviewTokenProtector(http.RequestServices.GetRequiredService<IDataProtectionProvider>())
                .Unprotect(token);
            return Guid.TryParse(raw, out var g) && g == tenantId;
        }
        catch
        {
            return false; // firma inválida o vencido
        }
    }

    // Shape mínimo: objeto con colors (objeto) y sections (array). Evita persistir
    // drafts corruptos que después rompen el render (el resto lo rellena normalizeTheme).
    private static bool IsValidConfig(JsonElement body) =>
        body.ValueKind == JsonValueKind.Object
        && body.TryGetProperty("colors", out var colors) && colors.ValueKind == JsonValueKind.Object
        && body.TryGetProperty("sections", out var sections) && sections.ValueKind == JsonValueKind.Array;

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
