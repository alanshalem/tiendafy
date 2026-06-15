using Media.Infrastructure;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

public static class MediaEndpoints
{
    public static RouteGroupBuilder MapMediaEndpoints(this RouteGroupBuilder group)
    {
        var media = group.MapGroup("/media");

        // multipart/form-data con campo "file". Devuelve la URL pública.
        media.MapPost("/", async (
            IFormFile file,
            ITenantContext tenant,
            IMediaStorage storage,
            CancellationToken ct) =>
        {
            if (!tenant.HasTenant)
                return Results.BadRequest(new { error = "Missing X-Tenant-Id header." });

            await using var stream = file.OpenReadStream();
            var result = await storage.UploadAsync(
                tenant.TenantId.Value, stream, file.ContentType, file.Length, ct);

            return result.IsSuccess
                ? Results.Ok(new { url = result.Value })
                : result.Error.ToProblem();
        })
        .DisableAntiforgery(); // API stateless; auth de plataforma llega con Identity fase 2

        return group;
    }
}
