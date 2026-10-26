using Api.Auth;
using Api.Endpoints;
using Api.Storefront;
using Identity.Infrastructure;
using SharedKernel.Common;

namespace Api.Ai.Catalog;

/// <summary>
/// Fichas del catálogo en lote. Todo el grupo pide "Crear y editar productos". El cupo de IA se cuenta endpoint por
/// endpoint, después del permiso: la tienda del header ya es de la persona. Los errores del gateway vuelven tal cual.
/// </summary>
public static class AiCatalogEndpoints
{
    public static RouteGroupBuilder MapAiCatalogEndpoints(this RouteGroupBuilder apiV1)
    {
        var catalog = apiV1.MapGroup("/ai/catalog").RequireTenant().RequirePermission(Permission.CatalogWrite);

        catalog.MapPost("/jobs/preview", async (AiCatalogSelectionRequest request, AiCatalogJobs jobs, CancellationToken ct) =>
        {
            var preview = await jobs.PreviewAsync(request, ct);
            return preview.IsSuccess ? Results.Ok(preview.Value) : preview.Error.ToProblem();
        });

        catalog.MapPost("/jobs", async (AiCatalogSelectionRequest request, AiCatalogJobs jobs, HttpContext http, CancellationToken ct) =>
        {
            // RequirePermission ya probó que hay sesión y tienda.
            var userId = http.User.GetUserId();
            if (userId is null) return Results.Unauthorized();

            var created = await jobs.CreateAsync(request, userId.Value, ct);
            return created.IsSuccess
                ? Results.Created($"/api/v1/ai/catalog/jobs/{created.Value.Id}", new { jobId = created.Value.Id, total = created.Value.Total })
                : created.Error.ToProblem();
        }).RequireAiRateLimit(AiRateLimitKind.JobsPerTenant);

        catalog.MapGet("/jobs", async (AiCatalogJobs jobs, CancellationToken ct) =>
            Results.Ok(new { items = await jobs.ListAsync(ct) }));

        catalog.MapGet("/jobs/{jobId:guid}", async (Guid jobId, AiCatalogJobs jobs, CancellationToken ct) =>
            await jobs.GetAsync(jobId, ct) is { } job ? Results.Ok(job) : JobNotFound.ToProblem());

        catalog.MapPost("/jobs/{jobId:guid}/resume", async (Guid jobId, AiCatalogJobs jobs, CancellationToken ct) =>
        {
            var resumed = await jobs.ResumeAsync(jobId, ct);
            return resumed.IsSuccess ? Results.Ok(resumed.Value) : resumed.Error.ToProblem();
        });

        catalog.MapPost("/jobs/{jobId:guid}/cancel", async (Guid jobId, AiCatalogJobs jobs, CancellationToken ct) =>
        {
            var cancelled = await jobs.CancelAsync(jobId, ct);
            return cancelled.IsSuccess ? Results.Ok(cancelled.Value) : cancelled.Error.ToProblem();
        });

        // ---- Revisión

        catalog.MapGet("/jobs/{jobId:guid}/items", async (
            Guid jobId, AiCatalogReview review, CancellationToken ct, string? status = null, int? offset = null, int? limit = null) =>
        {
            var page = await review.ListAsync(jobId, status, offset, limit, ct);
            return page.IsSuccess ? Results.Ok(new { items = page.Value.Items, total = page.Value.Total }) : page.Error.ToProblem();
        });

        // Aprobar guarda en la tienda y no toca Mercado Libre: se avisa al storefront como en cualquier edición del catálogo.
        catalog.MapPost("/items/{itemId:guid}/approve", async (
            Guid itemId, AiCatalogReview review, CancellationToken ct, AiCatalogApproveRequest? request = null) =>
        {
            var approved = await review.ApproveAsync(itemId, request, ct);
            return approved.IsSuccess ? Results.Ok(approved.Value) : approved.Error.ToProblem();
        }).RevalidatesStorefront(StorefrontScope.Catalog);

        catalog.MapPost("/items/{itemId:guid}/discard", async (Guid itemId, AiCatalogReview review, CancellationToken ct) =>
        {
            var discarded = await review.DiscardAsync(itemId, ct);
            return discarded.IsSuccess ? Results.Ok(discarded.Value) : discarded.Error.ToProblem();
        });

        catalog.MapPost("/jobs/{jobId:guid}/approve-passed", async (Guid jobId, AiCatalogReview review, CancellationToken ct) =>
        {
            var result = await review.ApprovePassedAsync(jobId, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        }).RevalidatesStorefront(StorefrontScope.Catalog);

        catalog.MapPut("/items/{itemId:guid}/category", async (
            Guid itemId, AiCatalogSetCategoryRequest request, AiCatalogReview review, CancellationToken ct) =>
        {
            var updated = await review.SetCategoryAsync(itemId, request.CategoryId ?? "", ct);
            return updated.IsSuccess ? Results.Ok(updated.Value) : updated.Error.ToProblem();
        });

        catalog.MapGet("/categories/search", async (AiCatalogReview review, CancellationToken ct, string? q = null) =>
        {
            var found = await review.SearchCategoriesAsync(q, ct);
            return found.IsSuccess
                ? Results.Ok(new
                {
                    suggestions = found.Value.Select(s => new { categoryId = s.CategoryId, categoryName = s.CategoryName, domainName = s.DomainName }),
                })
                : found.Error.ToProblem();
        });

        return apiV1;
    }

    public static readonly Error JobNotFound = Error.NotFound("AiCatalog.JobNotFound", "Ese trabajo de fichas no existe.");
}
