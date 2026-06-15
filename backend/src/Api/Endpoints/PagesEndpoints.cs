using Content.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

public static class PagesEndpoints
{
    public static RouteGroupBuilder MapPageEndpoints(this RouteGroupBuilder group)
    {
        var pages = group.MapGroup("/pages");

        // Admin: todas las páginas del tenant.
        pages.MapGet("/", async (ITenantContext tenant, ContentDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return Bad();
            var tid = tenant.TenantId.Value;
            var items = await db.Pages.AsNoTracking().Where(p => p.TenantId == tid)
                .OrderByDescending(p => p.UpdatedAtUtc).ToListAsync(ct);
            return Results.Ok(new { items = items.Select(ToDto) });
        });

        // Storefront: una página publicada por slug.
        pages.MapGet("/by-slug/{slug}", async (string slug, ITenantContext tenant, ContentDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return Bad();
            var tid = tenant.TenantId.Value;
            var page = await db.Pages.AsNoTracking().FirstOrDefaultAsync(p => p.TenantId == tid && p.Slug == slug, ct);
            return page is null || !page.Published ? Results.NotFound() : Results.Ok(ToDto(page));
        });

        pages.MapPost("/", async (PageRequest req, ITenantContext tenant, ContentDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return Bad();
            var tid = tenant.TenantId.Value;
            var created = Page.Create(tid, req.Title, req.Slug, req.Body, req.Published);
            if (created.IsFailure) return created.Error.ToProblem();
            if (await db.Pages.AnyAsync(p => p.TenantId == tid && p.Slug == created.Value.Slug, ct))
                return Error.Conflict("Page.Duplicate", $"Ya existe una página con la URL '{created.Value.Slug}'.").ToProblem();
            db.Pages.Add(created.Value);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/pages/{created.Value.Id}", ToDto(created.Value));
        });

        pages.MapPut("/{id:guid}", async (Guid id, PageRequest req, ITenantContext tenant, ContentDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return Bad();
            var tid = tenant.TenantId.Value;
            var page = await db.Pages.FirstOrDefaultAsync(p => p.TenantId == tid && p.Id == id, ct);
            if (page is null) return Results.NotFound();

            var newSlug = Page.Slugify(string.IsNullOrWhiteSpace(req.Slug) ? req.Title ?? "" : req.Slug);
            if (await db.Pages.AnyAsync(p => p.TenantId == tid && p.Slug == newSlug && p.Id != id, ct))
                return Error.Conflict("Page.Duplicate", $"Ya existe una página con la URL '{newSlug}'.").ToProblem();

            var result = page.Update(req.Title, req.Slug, req.Body, req.Published);
            if (result.IsFailure) return result.Error.ToProblem();
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDto(page));
        });

        pages.MapDelete("/{id:guid}", async (Guid id, ITenantContext tenant, ContentDbContext db, CancellationToken ct) =>
        {
            if (!tenant.HasTenant) return Bad();
            var tid = tenant.TenantId.Value;
            var page = await db.Pages.FirstOrDefaultAsync(p => p.TenantId == tid && p.Id == id, ct);
            if (page is null) return Results.NotFound();
            db.Pages.Remove(page);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        return group;
    }

    private static IResult Bad() => Results.BadRequest(new { error = "Missing X-Tenant-Id header." });

    private static object ToDto(Page p) => new
    {
        p.Id, p.Title, p.Slug, p.Body, p.Published, p.CreatedAtUtc, p.UpdatedAtUtc,
    };
}

public sealed record PageRequest(string Title, string? Slug, string? Body, bool Published);
