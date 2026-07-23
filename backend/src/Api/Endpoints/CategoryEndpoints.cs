using Identity.Infrastructure;
using Catalog.Core.Domain;
using Catalog.Core.Features.CreateCategory;
using Catalog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;
using SharedKernel.Common;

using Api.Auth;

namespace Api.Endpoints;

public static class CategoryEndpoints
{
    public static RouteGroupBuilder MapCategoryEndpoints(this RouteGroupBuilder group)
    {
        var categories = group.MapGroup("/categories").RequireTenant().RequirePermissionForWrites(Permission.CatalogWrite);

        categories.MapPost("/", async (
            CreateCategoryRequest request,
            ITenantContext tenant,
            CreateCategoryHandler handler,
            CancellationToken ct) =>
        {
            var result = await handler.HandleAsync(
                new CreateCategoryCommand(tenant.TenantId, request.Name, request.ParentId), ct);

            return result.IsSuccess
                ? Results.Created($"/api/v1/categories/{result.Value.Id}", result.Value)
                : result.Error.ToProblem();
        });

        categories.MapGet("/", async (
            ITenantContext tenant,
            ICategoryRepository repository,
            CancellationToken ct) =>
        {
            var all = await repository.ListAsync(tenant.TenantId, ct);
            return Results.Ok(new { items = all.Select(c => c.ToDto()).ToList() });
        });

        // Renombrar (mantiene la URL/slug para no romper enlaces ni SEO).
        categories.MapPut("/{id:guid}", async (
            Guid id, RenameCategoryRequest request, ITenantContext tenant, CatalogDbContext db, CancellationToken ct) =>
        {
            var category = await db.Categories.FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId && c.Id == id, ct);
            if (category is null) return Results.NotFound();

            var result = category.Rename(request.Name);
            if (result.IsFailure) return result.Error.ToProblem();
            await db.SaveChangesAsync(ct);
            return Results.Ok(category.ToDto());
        });

        // Eliminar (bloquea si tiene subcategorías para no dejar huérfanas).
        categories.MapDelete("/{id:guid}", async (
            Guid id, ITenantContext tenant, CatalogDbContext db, CancellationToken ct) =>
        {
            var category = await db.Categories.FirstOrDefaultAsync(c => c.TenantId == tenant.TenantId && c.Id == id, ct);
            if (category is null) return Results.NoContent();

            var hasChildren = await db.Categories.AnyAsync(c => c.TenantId == tenant.TenantId && c.ParentId == id, ct);
            if (hasChildren)
                return Error.Conflict("Category.HasChildren", "Esta categoría tiene subcategorías. Eliminálas o movélas primero.").ToProblem();

            db.Categories.Remove(category);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        return group;
    }
}

public sealed record CreateCategoryRequest(string Name, Guid? ParentId);
public sealed record RenameCategoryRequest(string Name);
