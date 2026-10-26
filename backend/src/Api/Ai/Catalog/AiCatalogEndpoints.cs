using Api.Auth;
using Api.Endpoints;
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

        return apiV1;
    }

    public static readonly Error JobNotFound = Error.NotFound("AiCatalog.JobNotFound", "Ese trabajo de fichas no existe.");
}
