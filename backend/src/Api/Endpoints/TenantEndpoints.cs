using System.Security.Claims;
using Api.Auth;
using Identity.Infrastructure;
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

        // Crear tienda: el usuario autenticado queda como dueño (membresía).
        tenants.MapPost("/", async (CreateTenantRequest request, CreateTenantHandler handler, ClaimsPrincipal user, IMembershipService memberships, CancellationToken ct) =>
        {
            var userId = user.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var result = await handler.HandleAsync(new CreateTenantCommand(request.Name, request.Subdomain), ct);
            if (!result.IsSuccess) return result.Error.ToProblem();
            await memberships.AddOwnerAsync(userId.Value, result.Value.Id, ct);
            return Results.Created($"/api/v1/tenants/{result.Value.Id}", result.Value);
        }).RequireAuthorization();

        // Sólo las tiendas del usuario autenticado.
        tenants.MapGet("/", async (ITenancyService service, ClaimsPrincipal user, IMembershipService memberships, CancellationToken ct) =>
        {
            var userId = user.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var ids = await memberships.TenantIdsForUserAsync(userId.Value, ct);
            var items = new List<object>();
            foreach (var id in ids)
            {
                var t = await service.GetByIdAsync(id, ct);
                if (t is not null) items.Add(t);
            }
            return Results.Ok(new { items, nextCursor = (string?)null, hasMore = false });
        }).RequireAuthorization();

        tenants.MapGet("/{id:guid}", async (Guid id, ITenancyService service, ClaimsPrincipal user, IMembershipService memberships, CancellationToken ct) =>
        {
            if (await NotMember(user, id, memberships, ct)) return Forbidden();
            var tenant = await service.GetByIdAsync(id, ct);
            return tenant is null ? Results.NotFound() : Results.Ok(tenant);
        }).RequireAuthorization();

        // Disponibilidad de nombre/subdominio para el form de creación (admin).
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
        }).RequireAuthorization();

        // Cambiar nombre/subdominio/dominio: acción sensible → solo el dueño.
        tenants.MapPatch("/{id:guid}", async (Guid id, UpdateTenantRequest request, UpdateTenantHandler handler, ClaimsPrincipal user, IMembershipService memberships, CancellationToken ct) =>
        {
            if (await NotOwner(user, id, memberships, ct)) return OwnerOnly();
            var result = await handler.UpdateAsync(
                new UpdateTenantCommand(id, request.Name, request.Subdomain, request.CustomDomain), ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        }).RequireAuthorization();

        tenants.MapPost("/{id:guid}/archive", async (Guid id, UpdateTenantHandler handler, ClaimsPrincipal user, IMembershipService memberships, CancellationToken ct) =>
        {
            if (await NotOwner(user, id, memberships, ct)) return OwnerOnly();
            var result = await handler.ArchiveAsync(id, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        }).RequireAuthorization();

        tenants.MapPost("/{id:guid}/activate", async (Guid id, UpdateTenantHandler handler, ClaimsPrincipal user, IMembershipService memberships, CancellationToken ct) =>
        {
            if (await NotOwner(user, id, memberships, ct)) return OwnerOnly();
            var result = await handler.ActivateAsync(id, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        }).RequireAuthorization();

        // Soft-delete: marca CANCELED. No borra físico (productos/temas referencian el id).
        // Solo el dueño puede eliminar la tienda.
        tenants.MapDelete("/{id:guid}", async (Guid id, UpdateTenantHandler handler, ClaimsPrincipal user, IMembershipService memberships, CancellationToken ct) =>
        {
            if (await NotOwner(user, id, memberships, ct)) return OwnerOnly();
            var result = await handler.DeleteAsync(id, ct);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error.ToProblem();
        }).RequireAuthorization();

        // Resolución por host — pública (storefront + admin la usan para resolver tienda).
        tenants.MapGet("/resolve", async (string host, ITenancyService service, CancellationToken ct) =>
        {
            var tenant = await service.ResolveByHostAsync(host, ct);
            return tenant is null ? Results.NotFound() : Results.Ok(tenant);
        });

        return group;
    }

    private static async Task<bool> NotMember(ClaimsPrincipal user, Guid tenantId, IMembershipService memberships, CancellationToken ct)
    {
        var userId = user.GetUserId();
        return userId is null || !await memberships.IsMemberAsync(userId.Value, tenantId, ct);
    }

    /// <summary>Gestión sensible de la tienda (dominio, borrado): exige rol dueño.</summary>
    private static async Task<bool> NotOwner(ClaimsPrincipal user, Guid tenantId, IMembershipService memberships, CancellationToken ct)
    {
        var userId = user.GetUserId();
        return userId is null || !await memberships.IsOwnerAsync(userId.Value, tenantId, ct);
    }

    private static IResult Forbidden() =>
        Results.Problem(title: "Auth.Forbidden", detail: "No tenés acceso a esta tienda.", statusCode: StatusCodes.Status403Forbidden);

    private static IResult OwnerOnly() =>
        Results.Problem(title: "Auth.Forbidden", detail: "Solo el dueño de la tienda puede hacer esto.", statusCode: StatusCodes.Status403Forbidden);

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
