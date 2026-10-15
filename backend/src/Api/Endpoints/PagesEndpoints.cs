using Api.Auth;
using Content.Infrastructure;
using Ganss.Xss;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public static class PagesEndpoints
{
    // Sanitiza el HTML del editor: descarta <script>, on*=, javascript:, etc.
    // Defensa en profundidad (el storefront también sanitiza al renderizar).
    private static readonly HtmlSanitizer Sanitizer = new();

    public static RouteGroupBuilder MapPageEndpoints(this RouteGroupBuilder group)
    {
        MapRedirects(group);
        MapTracking(group);

        var pages = group.MapGroup("/pages").RequireTenant().RequirePermissionForWrites(Permission.ContentWrite);

        // Admin: las páginas del tenant (con borradores), de a una página y con
        // búsqueda por título o dirección. Cada una trae su cuerpo entero: antes
        // venían todas juntas.
        pages.MapGet("/", async (
            ITenantContext tenant, ContentDbContext db, CancellationToken ct,
            string? q = null, int? offset = null, int? limit = null) =>
        {
            var tid = tenant.TenantId.Value;
            var query = db.Pages.AsNoTracking().Where(p => p.TenantId == tid);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = $"%{q.Trim()}%";
                query = query.Where(p => EF.Functions.ILike(p.Title, term) || EF.Functions.ILike(p.Slug, term));
            }
            var (items, total) = await query
                .OrderByDescending(p => p.UpdatedAtUtc).ThenBy(p => p.Id)
                .PageAsync(offset, limit, ct);
            return Results.Ok(new { items = items.Select(ToDto), total });
        }).RequirePermission(Permission.ContentWrite); // incluye borradores

        // Storefront: lista liviana de páginas PUBLICADAS (para el navbar). Sin body ni borradores.
        pages.MapGet("/published", async (ITenantContext tenant, ContentDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var items = await db.Pages.AsNoTracking()
                .Where(p => p.TenantId == tid && p.Published)
                .OrderBy(p => p.Title)
                .Select(p => new { p.Id, p.Title, p.Slug })
                .ToListAsync(ct);
            return Results.Ok(new { items });
        });

        // Storefront: una página publicada por slug.
        pages.MapGet("/by-slug/{slug}", async (string slug, ITenantContext tenant, ContentDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var page = await db.Pages.AsNoTracking().FirstOrDefaultAsync(p => p.TenantId == tid && p.Slug == slug, ct);
            return page is null || !page.Published ? Results.NotFound() : Results.Ok(ToDto(page));
        });

        pages.MapPost("/", async (PageRequest req, ITenantContext tenant, ContentDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var created = Page.Create(tid, req.Title, req.Slug, Sanitizer.Sanitize(req.Body ?? string.Empty), req.Published);
            if (created.IsFailure) return created.Error.ToProblem();
            if (await db.Pages.AnyAsync(p => p.TenantId == tid && p.Slug == created.Value.Slug, ct))
                return Error.Conflict("Page.Duplicate", $"Ya existe una página con la URL '{created.Value.Slug}'.").ToProblem();
            db.Pages.Add(created.Value);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/pages/{created.Value.Id}", ToDto(created.Value));
        });

        pages.MapPut("/{id:guid}", async (Guid id, PageRequest req, ITenantContext tenant, ContentDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var page = await db.Pages.FirstOrDefaultAsync(p => p.TenantId == tid && p.Id == id, ct);
            if (page is null) return Results.NotFound();

            var newSlug = Page.Slugify(string.IsNullOrWhiteSpace(req.Slug) ? req.Title ?? "" : req.Slug);
            if (await db.Pages.AnyAsync(p => p.TenantId == tid && p.Slug == newSlug && p.Id != id, ct))
                return Error.Conflict("Page.Duplicate", $"Ya existe una página con la URL '{newSlug}'.").ToProblem();

            var result = page.Update(req.Title, req.Slug, Sanitizer.Sanitize(req.Body ?? string.Empty), req.Published);
            if (result.IsFailure) return result.Error.ToProblem();
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(page));
        });

        pages.MapDelete("/{id:guid}", async (Guid id, ITenantContext tenant, ContentDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId.Value;
            var page = await db.Pages.FirstOrDefaultAsync(p => p.TenantId == tid && p.Id == id, ct);
            if (page is null) return Results.NotFound();
            db.Pages.Remove(page);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        return group;
    }

    private static object ToDto(Page p) => new
    {
        p.Id,
        p.Title,
        p.Slug,
        p.Body,
        p.Published,
        p.CreatedAtUtc,
        p.UpdatedAtUtc,
    };
    // ------------------------------------------------ Redirecciones 301

    /// <summary>
    /// Reglas de "esta URL vieja ahora está en esta otra". El storefront las
    /// consulta recién cuando una página no existe, así que en el camino normal
    /// no cuestan nada.
    /// </summary>
    private static void MapRedirects(RouteGroupBuilder group)
    {
        var redirects = group.MapGroup("/redirects").RequireTenant();

        // Público: lo llama el storefront desde su pantalla de 404.
        redirects.MapGet("/resolve", async (
            string? path, ITenantContext tenant, ContentDbContext db, CancellationToken ct) =>
        {
            var from = UrlRedirect.NormalizeFrom(path);
            if (from is null) return Results.NotFound();

            var rule = await db.Redirects.FirstOrDefaultAsync(r => r.FromPath == from, ct);
            if (rule is null) return Results.NotFound();

            rule.RegisterHit();
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { to = rule.ToPath });
        });

        redirects.MapGet("/", async (ITenantContext tenant, ContentDbContext db, CancellationToken ct) =>
        {
            var items = await db.Redirects.AsNoTracking()
                .OrderByDescending(r => r.Hits).ThenByDescending(r => r.CreatedAtUtc)
                .Select(r => new { r.Id, from = r.FromPath, to = r.ToPath, r.Hits, r.LastHitAtUtc })
                .ToListAsync(ct);
            return Results.Ok(new { items });
        }).RequirePermission(Permission.StoreConfig);

        redirects.MapPost("/", async (
            RedirectRequest request, ITenantContext tenant, ContentDbContext db, CancellationToken ct) =>
        {
            var result = UrlRedirect.Create(tenant.TenantId.Value, request.From, request.To);
            if (result.IsFailure) return result.Error.ToProblem();

            var from = result.Value.FromPath;
            if (await db.Redirects.AnyAsync(r => r.FromPath == from, ct))
                return Error.Conflict("Redirect.Duplicate", $"Ya hay una redirección para {from}.").ToProblem();

            db.Redirects.Add(result.Value);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/redirects/{result.Value.Id}", new
            {
                result.Value.Id,
                from = result.Value.FromPath,
                to = result.Value.ToPath,
                result.Value.Hits,
                result.Value.LastHitAtUtc,
            });
        }).RequirePermission(Permission.StoreConfig);

        redirects.MapDelete("/{id:guid}", async (
            Guid id, ITenantContext tenant, ContentDbContext db, CancellationToken ct) =>
        {
            var rule = await db.Redirects.FirstOrDefaultAsync(r => r.Id == id, ct);
            if (rule is null) return Results.NoContent();
            db.Redirects.Remove(rule);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }).RequirePermission(Permission.StoreConfig);
    }

    // ------------------------------------------------ Medición y píxeles

    /// <summary>
    /// Identificadores de las herramientas de medición. Nunca HTML ni
    /// JavaScript: el storefront arma el cargador con su propia plantilla.
    /// </summary>
    private static void MapTracking(RouteGroupBuilder group)
    {
        var tracking = group.MapGroup("/tracking").RequireTenant();

        // Público: lo lee el storefront para decidir qué cargar.
        tracking.MapGet("/", async (ITenantContext tenant, ContentDbContext db, CancellationToken ct) =>
        {
            var t = await db.Tracking.AsNoTracking().FirstOrDefaultAsync(ct);
            // Apagado general: se responde como si no hubiera nada configurado,
            // así el storefront no necesita conocer la diferencia.
            if (t is null || !t.Enabled)
                return Results.Ok(new { requireConsent = true, ga4Id = (string?)null, googleAdsId = (string?)null, metaPixelId = (string?)null, clarityId = (string?)null });

            return Results.Ok(new
            {
                requireConsent = t.RequireConsent,
                ga4Id = t.Ga4Id,
                googleAdsId = t.GoogleAdsId,
                metaPixelId = t.MetaPixelId,
                clarityId = t.ClarityId,
            });
        });

        var admin = group.MapGroup("/admin/tracking")
            .RequireTenant()
            .RequirePermission(Permission.StoreConfig);

        admin.MapGet("/", async (ITenantContext tenant, ContentDbContext db, CancellationToken ct) =>
        {
            var t = await db.Tracking.AsNoTracking().FirstOrDefaultAsync(ct);
            return Results.Ok(AdminDto(t, tenant.TenantId.Value));
        });

        admin.MapPut("/", async (
            TrackingRequest request, HttpContext http, ITenantContext tenant,
            ContentDbContext db, CancellationToken ct) =>
        {
            var t = await db.Tracking.FirstOrDefaultAsync(ct);
            if (t is null)
            {
                t = TrackingSettings.CreateDefault(tenant.TenantId.Value);
                db.Tracking.Add(t);
            }

            var result = t.Update(
                request.Enabled, request.RequireConsent,
                request.Ga4Id, request.GoogleAdsId, request.MetaPixelId, request.ClarityId,
                http.User.GetUserId());
            if (result.IsFailure) return result.Error.ToProblem();

            await db.SaveChangesAsync(ct);
            return Results.Ok(AdminDto(t, tenant.TenantId.Value));
        });
    }

    private static object AdminDto(TrackingSettings? t, Guid tenantId)
    {
        t ??= TrackingSettings.CreateDefault(tenantId);
        return new
        {
            enabled = t.Enabled,
            requireConsent = t.RequireConsent,
            ga4Id = t.Ga4Id,
            googleAdsId = t.GoogleAdsId,
            metaPixelId = t.MetaPixelId,
            clarityId = t.ClarityId,
            updatedByUserId = t.UpdatedByUserId,
            updatedAtUtc = t.UpdatedAtUtc,
        };
    }
}

public sealed record PageRequest(string Title, string? Slug, string? Body, bool Published);

public sealed record RedirectRequest(string? From, string? To);

public sealed record TrackingRequest(
    bool Enabled,
    bool RequireConsent,
    string? Ga4Id,
    string? GoogleAdsId,
    string? MetaPixelId,
    string? ClarityId);
