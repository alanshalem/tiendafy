using SharedKernel.Common;
using Tenancy.Contracts;
using Tenancy.Core;
using Tenancy.Core.Domain;
using Tenancy.Core.Features.CreateTenant;
using Tenancy.Core.Features.UpdateTenant;

namespace Api.Endpoints;

public static class TenantEndpoints
{
    public static RouteGroupBuilder MapTenantEndpoints(this RouteGroupBuilder group)
    {
        var tenants = group.MapGroup("/tenants");

        // TODO: proteger con auth de plataforma cuando Identity exista.
        tenants.MapPost("/", async (CreateTenantRequest request, CreateTenantHandler handler, CancellationToken ct) =>
        {
            var result = await handler.HandleAsync(new CreateTenantCommand(request.Name, request.Subdomain), ct);
            return result.IsSuccess
                ? Results.Created($"/api/v1/tenants/{result.Value.Id}", result.Value)
                : result.Error.ToProblem();
        });

        // Paginado por cursor: ?limit=20&after=<último id de la página anterior>
        tenants.MapGet("/", async (Tenancy.Core.Domain.ITenantRepository repository, CancellationToken ct, int limit = 20, Guid? after = null) =>
        {
            limit = Math.Clamp(limit, 1, 100);
            var page = await repository.ListAsync(limit + 1, after, ct);
            var hasMore = page.Count > limit;
            var items = page.Take(limit).Select(t => t.ToDto()).ToList();

            return Results.Ok(new
            {
                items,
                nextCursor = hasMore ? items[^1].Id.ToString() : null,
                hasMore,
            });
        });

        tenants.MapGet("/{id:guid}", async (Guid id, ITenancyService service, CancellationToken ct) =>
        {
            var tenant = await service.GetByIdAsync(id, ct);
            return tenant is null ? Results.NotFound() : Results.Ok(tenant);
        });

        // Disponibilidad de nombre/subdominio para validar en vivo en el form.
        // excludeId = id de la tienda que se está editando (no choca consigo misma).
        tenants.MapGet("/check", async (
            ITenantRepository repository,
            CancellationToken ct,
            string? subdomain = null,
            string? name = null,
            Guid? excludeId = null) =>
        {
            var subdomainValid = string.IsNullOrWhiteSpace(subdomain) || Subdomain.Create(subdomain).IsSuccess;
            var subdomainAvailable = string.IsNullOrWhiteSpace(subdomain)
                || (subdomainValid && !await repository.SubdomainExistsAsync(subdomain, excludeId, ct));
            var nameAvailable = string.IsNullOrWhiteSpace(name)
                || !await repository.NameExistsAsync(name, excludeId, ct);

            return Results.Ok(new { subdomainValid, subdomainAvailable, nameAvailable });
        });

        tenants.MapPatch("/{id:guid}", async (Guid id, UpdateTenantRequest request, UpdateTenantHandler handler, CancellationToken ct) =>
        {
            var result = await handler.UpdateAsync(
                new UpdateTenantCommand(id, request.Name, request.Subdomain, request.CustomDomain), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        });

        tenants.MapPost("/{id:guid}/archive", async (Guid id, UpdateTenantHandler handler, CancellationToken ct) =>
        {
            var result = await handler.ArchiveAsync(id, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        });

        tenants.MapPost("/{id:guid}/activate", async (Guid id, UpdateTenantHandler handler, CancellationToken ct) =>
        {
            var result = await handler.ActivateAsync(id, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        });

        // Soft-delete: marca CANCELED. No borra físico (productos/temas referencian el id).
        tenants.MapDelete("/{id:guid}", async (Guid id, UpdateTenantHandler handler, CancellationToken ct) =>
        {
            var result = await handler.DeleteAsync(id, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        });

        // Resolución por host — lo usan storefront y admin para saber qué tienda servir.
        tenants.MapGet("/resolve", async (string host, ITenancyService service, CancellationToken ct) =>
        {
            var tenant = await service.ResolveByHostAsync(host, ct);
            return tenant is null ? Results.NotFound() : Results.Ok(tenant);
        });

        return group;
    }

    /// <summary>RFC 7807 problem+json desde un Error del dominio.</summary>
    public static IResult ToProblem(this Error error)
    {
        var status = error.Type switch
        {
            ErrorType.Validation => StatusCodes.Status400BadRequest,
            ErrorType.NotFound => StatusCodes.Status404NotFound,
            ErrorType.Conflict => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status500InternalServerError,
        };

        return Results.Problem(
            title: error.Code,
            detail: error.Message,
            statusCode: status);
    }
}

public sealed record CreateTenantRequest(string Name, string Subdomain);

public sealed record UpdateTenantRequest(string Name, string Subdomain, string? CustomDomain);
