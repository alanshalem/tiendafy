using Catalog.Core.Domain;
using Catalog.Core.Features.CreateCategory;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

public static class CategoryEndpoints
{
    public static RouteGroupBuilder MapCategoryEndpoints(this RouteGroupBuilder group)
    {
        var categories = group.MapGroup("/categories");

        categories.MapPost("/", async (
            CreateCategoryRequest request,
            ITenantContext tenant,
            CreateCategoryHandler handler,
            CancellationToken ct) =>
        {
            if (!tenant.HasTenant)
                return Results.BadRequest(new { error = "Missing X-Tenant-Id header." });

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
            if (!tenant.HasTenant)
                return Results.BadRequest(new { error = "Missing X-Tenant-Id header." });

            var all = await repository.ListAsync(tenant.TenantId, ct);
            return Results.Ok(new { items = all.Select(c => c.ToDto()).ToList() });
        });

        return group;
    }
}

public sealed record CreateCategoryRequest(string Name, Guid? ParentId);
