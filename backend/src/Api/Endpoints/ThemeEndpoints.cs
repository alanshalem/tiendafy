using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Api.Auth;
using Api.Storefront;
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
            return DraftResult(string.IsNullOrWhiteSpace(doc.DraftConfig) ? doc.PublishedConfig : doc.DraftConfig, doc);
        }).AddEndpointFilter(async (ctx, next) =>
        {
            var http = ctx.HttpContext;
            var tenant = http.RequestServices.GetRequiredService<ITenantContext>();
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

        // Autosave del borrador (no toca lo publicado). Con `draftVersion` (la que
        // devolvió el GET o el guardado anterior) se rechaza si el borrador cambió
        // mientras tanto: sin esto, dos pestañas o dos personas se pisaban en
        // silencio y ganaba la última en guardar.
        theme.MapPut("/draft", async (
            JsonElement body, ITenantContext tenant, ThemesDbContext db, CancellationToken ct) =>
        {
            if (Invalid(body) is { } invalid) return invalid;

            var doc = await GetOrCreateAsync(tenant.TenantId.Value, db, ct);
            if (VersionMismatch(body, doc) is { } conflict) return conflict;
            doc.DraftConfig = SanitizeConfig(body);
            doc.DraftVersion++;
            doc.UpdatedAtUtc = DateTime.UtcNow;
            if (!await TrySaveAsync(db, ct)) return Conflict(await CurrentVersionAsync(tenant.TenantId.Value, db, ct));
            return Results.Ok(new { draftVersion = doc.DraftVersion });
        });

        // Publicar: draft → published (y persiste el draft enviado en el mismo request).
        // También exige la versión: publicar desde una pestaña vieja pisaba lo último.
        theme.MapPost("/publish", async (
            JsonElement body, ITenantContext tenant, ThemesDbContext db, HttpContext http, CancellationToken ct) =>
        {
            if (Invalid(body) is { } invalid) return invalid;

            var doc = await GetOrCreateAsync(tenant.TenantId.Value, db, ct);
            if (VersionMismatch(body, doc) is { } conflict) return conflict;
            var clean = SanitizeConfig(body);
            // Foto de lo que ESTABA publicado, antes de pisarlo: el historial sirve
            // para volver a lo anterior, no para repetir lo que se acaba de hacer.
            if (LooksLikeConfig(doc.PublishedConfig) && doc.PublishedConfig != clean)
                db.ThemeVersions.Add(ThemeVersion.Create(tenant.TenantId.Value, doc.PublishedConfig, http.User.GetUserId()));
            doc.DraftConfig = clean;
            doc.PublishedConfig = clean;
            doc.DraftVersion++;
            doc.UpdatedAtUtc = DateTime.UtcNow;
            if (!await TrySaveAsync(db, ct)) return Conflict(await CurrentVersionAsync(tenant.TenantId.Value, db, ct));
            await TrimVersionsAsync(tenant.TenantId.Value, db, ct);
            return DraftResult(doc.PublishedConfig, doc);
        }).RevalidatesStorefront(StorefrontScope.Theme); // lo publicado se ve en la tienda al toque

        // Programar la publicación (Hot Sale a las 00:00 sin quedarse despierto).
        // Se congela la config en el momento de programar: entre hoy y la fecha
        // el comercio sigue editando, y lo que sale tiene que ser lo aprobado.
        theme.MapPost("/schedule", async (
            ScheduleRequest req, ITenantContext tenant, ThemesDbContext db, CancellationToken ct) =>
        {
            if (Invalid(req.Config) is { } invalid) return invalid;
            var at = req.AtUtc?.ToUniversalTime();
            if (at is null || at <= DateTime.UtcNow)
                return Results.Problem(title: "Theme.InvalidSchedule", detail: "La fecha tiene que ser futura.", statusCode: 400);
            if (at > DateTime.UtcNow.AddDays(365))
                return Results.Problem(title: "Theme.InvalidSchedule", detail: "No se puede programar a más de un año.", statusCode: 400);

            var doc = await GetOrCreateAsync(tenant.TenantId.Value, db, ct);
            doc.ScheduledConfig = SanitizeConfig(req.Config);
            doc.ScheduledAtUtc = at;
            doc.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { scheduledAtUtc = doc.ScheduledAtUtc });
        });

        // Qué hay programado (para mostrarlo en el editor).
        theme.MapGet("/schedule", async (ITenantContext tenant, ThemesDbContext db, CancellationToken ct) =>
        {
            var doc = await GetOrCreateAsync(tenant.TenantId.Value, db, ct);
            return Results.Ok(new { scheduledAtUtc = doc.ScheduledAtUtc });
        }).RequirePermission(Permission.ContentWrite);

        // Cancelar lo programado.
        theme.MapDelete("/schedule", async (ITenantContext tenant, ThemesDbContext db, CancellationToken ct) =>
        {
            var doc = await GetOrCreateAsync(tenant.TenantId.Value, db, ct);
            doc.ScheduledConfig = null;
            doc.ScheduledAtUtc = null;
            doc.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Historial: qué se publicó y cuándo. Sin la config entera (son documentos
        // grandes y el listado solo necesita la fecha).
        theme.MapGet("/history", async (ITenantContext tenant, ThemesDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var items = await db.ThemeVersions.AsNoTracking()
                .Where(v => v.TenantId == tid)
                .OrderByDescending(v => v.PublishedAtUtc)
                .Select(v => new { id = v.Id, publishedAtUtc = v.PublishedAtUtc })
                .ToListAsync(ct);
            return Results.Ok(new { items });
        }).RequirePermission(Permission.ContentWrite);

        // Volver a una versión: se carga en el BORRADOR, no se publica sola. El
        // comercio la mira en la vista previa y publica si es lo que quería.
        theme.MapPost("/history/{id:guid}/restore", async (
            Guid id, ITenantContext tenant, ThemesDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var version = await db.ThemeVersions.AsNoTracking()
                .FirstOrDefaultAsync(v => v.Id == id && v.TenantId == tid, ct);
            if (version is null) return Results.NotFound();

            var doc = await GetOrCreateAsync(tid, db, ct);
            doc.DraftConfig = version.Config;
            doc.DraftVersion++;
            doc.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return DraftResult(doc.DraftConfig, doc);
        });

        // Copiar el diseño publicado de OTRA tienda del mismo dueño al borrador de
        // esta. Es lo normal cuando una empresa tiene varias tiendas por rubro.
        theme.MapPost("/copy-from/{sourceTenantId:guid}", async (
            Guid sourceTenantId, ITenantContext tenant, ThemesDbContext db, HttpContext http,
            CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            if (sourceTenantId == tid) return Results.NoContent();

            // El permiso del grupo cubre la tienda destino. La ORIGEN hay que
            // verificarla acá: sin esto, cualquiera con una tienda propia podría
            // leer el diseño de una ajena pasando su id.
            if ((await http.GetAccessAsync(sourceTenantId))?.Can(Permission.ContentWrite) != true) return Results.Forbid();

            var source = await db.Themes.AsNoTracking().IgnoreQueryFilters()
                .FirstOrDefaultAsync(t => t.TenantId == sourceTenantId, ct);
            if (source is null || !LooksLikeConfig(source.PublishedConfig)) return Results.NotFound();

            var doc = await GetOrCreateAsync(tid, db, ct);
            doc.DraftConfig = source.PublishedConfig;
            doc.DraftVersion++;
            doc.UpdatedAtUtc = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return DraftResult(doc.DraftConfig, doc);
        });

        return group;
    }


    public sealed record ScheduleRequest(JsonElement Config, DateTime? AtUtc);

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

    /// <summary>
    /// El 400 de un tema que no se puede guardar, o null si está bien. Primero la
    /// forma general; después cada sección contra el contrato (tipos, datos,
    /// largos, links seguros). El detalle nombra la sección para que el comercio
    /// sepa qué arreglar; `errors` trae todos los problemas con su ruta.
    /// </summary>
    private static IResult? Invalid(JsonElement body)
    {
        if (!IsValidConfig(body))
            return Results.Problem(title: "Theme.InvalidConfig",
                detail: "El diseño tiene que ser un objeto con colores y secciones.", statusCode: 400);
        if (body.GetRawText().Length > ThemeConfigValidator.MaxConfigChars)
            return Results.Problem(title: "Theme.InvalidConfig", detail: "El diseño es demasiado grande.", statusCode: 400);
        var errors = ThemeConfigValidator.Validate(body);
        if (errors.Count == 0) return null;
        return Results.Problem(
            title: "Theme.InvalidSection",
            detail: errors[0].Message,
            statusCode: 400,
            extensions: new Dictionary<string, object?>
            {
                ["errors"] = errors.Select(e => new { path = e.Path, message = e.Message }).ToList(),
            });
    }

    private const string DraftVersionField = "draftVersion";

    /// <summary>409 si el pedido trae la versión del borrador y ya no es la actual.</summary>
    private static IResult? VersionMismatch(JsonElement body, ThemeDocument doc) =>
        body.TryGetProperty(DraftVersionField, out var v)
        && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var expected)
        && expected != doc.DraftVersion
            ? Conflict(doc.DraftVersion)
            : null;

    private static IResult Conflict(int currentVersion) => Results.Problem(
        title: "Theme.DraftConflict",
        detail: "El diseño cambió en otra pestaña o lo editó otra persona.",
        statusCode: 409,
        extensions: new Dictionary<string, object?> { ["currentVersion"] = currentVersion });

    /// <summary>Guarda; false si otro request cambió el borrador entre que se leyó y ahora.</summary>
    private static async Task<bool> TrySaveAsync(ThemesDbContext db, CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
            return true;
        }
        catch (DbUpdateConcurrencyException)
        {
            return false;
        }
    }

    private static async Task<int> CurrentVersionAsync(Guid tenantId, ThemesDbContext db, CancellationToken ct) =>
        await db.Themes.AsNoTracking().Where(t => t.TenantId == tenantId).Select(t => t.DraftVersion).FirstOrDefaultAsync(ct);

    /// <summary>Reserializa la config saneando `customCss` (el merchant lo inyecta crudo en un &lt;style&gt;).</summary>
    private static string SanitizeConfig(JsonElement body)
    {
        var node = JsonNode.Parse(body.GetRawText());
        if (node is JsonObject obj)
        {
            // La versión viaja con el pedido, no es parte del diseño.
            obj.Remove(DraftVersionField);
            if (obj.TryGetPropertyValue("customCss", out var css)
                && css is JsonValue v && v.TryGetValue<string>(out var s))
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

    /// <summary>
    /// Un tema que el editor va a seguir editando: lleva la versión del borrador
    /// (`draftVersion`), que el editor devuelve al guardar. El storefront la ignora.
    /// </summary>
    private static IResult DraftResult(string json, ThemeDocument doc)
    {
        var node = JsonNode.Parse(string.IsNullOrWhiteSpace(json) ? ThemeDocument.DefaultConfig : json);
        if (node is not JsonObject obj) return ConfigResult(json);
        obj[DraftVersionField] = doc.DraftVersion;
        return Results.Content(obj.ToJsonString(), "application/json");
    }

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
        if (!LooksLikeConfig(doc.DraftConfig)) { doc.DraftConfig = doc.PublishedConfig; doc.DraftVersion++; changed = true; }
        if (changed) await db.SaveChangesAsync(ct);
        return doc;
    }

    /// <summary>Deja solo las últimas N versiones por tienda (cada una es el tema entero).</summary>
    private static async Task TrimVersionsAsync(Guid tenantId, ThemesDbContext db, CancellationToken ct)
    {
        var extra = await db.ThemeVersions
            .Where(v => v.TenantId == tenantId)
            .OrderByDescending(v => v.PublishedAtUtc)
            .Skip(ThemeVersion.MaxPerTenant)
            .ToListAsync(ct);
        if (extra.Count == 0) return;
        db.ThemeVersions.RemoveRange(extra);
        await db.SaveChangesAsync(ct);
    }

    private static bool LooksLikeConfig(string? json) =>
        !string.IsNullOrWhiteSpace(json) && json.Contains("\"colors\"") && json.Contains("\"sections\"");
}
