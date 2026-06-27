using Api.Auth;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

/// <summary>
/// Gestión de staff de la tienda (owner/staff). Todo el grupo es owner-only.
/// El tenant sale del header X-Tenant-Id; el rol staff puede operar la tienda
/// (escrituras vía middleware) pero no entra acá.
/// </summary>
public static class MembersEndpoints
{
    public static RouteGroupBuilder MapMembersEndpoints(this RouteGroupBuilder group)
    {
        var members = group.MapGroup("/members").RequireTenantOwner();

        // Listado de miembros con su email/nombre.
        members.MapGet("/", async (ITenantContext tenant, IMembershipService memberships, UserManager<AppUser> users, CancellationToken ct) =>
        {
            var list = await memberships.ListAsync(tenant.TenantId.Value, ct);
            var ids = list.Select(m => m.UserId).ToList();
            var byId = await users.Users.AsNoTracking()
                .Where(u => ids.Contains(u.Id))
                .Select(u => new { u.Id, u.Email, u.DisplayName })
                .ToDictionaryAsync(u => u.Id, ct);

            return Results.Ok(new
            {
                items = list.Select(m => new
                {
                    userId = m.UserId,
                    role = m.Role,
                    email = byId.TryGetValue(m.UserId, out var u) ? u.Email : null,
                    name = byId.TryGetValue(m.UserId, out var u2) ? u2.DisplayName : null,
                    createdAtUtc = m.CreatedAtUtc,
                }),
            });
        });

        // Sumar staff por email (la persona debe tener cuenta de Tiendafy).
        members.MapPost("/", async (AddMemberRequest req, ITenantContext tenant, IMembershipService memberships, UserManager<AppUser> users, CancellationToken ct) =>
        {
            var user = await users.FindByEmailAsync(req.Email ?? string.Empty);
            if (user is null)
                return Results.Problem(title: "Members.UserNotFound", detail: "Esa persona todavía no tiene cuenta. Pedile que se registre primero.", statusCode: 404);
            var role = req.Role == TenantMembership.RoleOwner ? TenantMembership.RoleOwner : TenantMembership.RoleStaff;
            await memberships.UpsertAsync(user.Id, tenant.TenantId.Value, role, ct);
            return Results.NoContent();
        });

        // Cambiar rol (no se puede degradar al último owner).
        members.MapPatch("/{userId:guid}", async (Guid userId, ChangeRoleRequest req, ITenantContext tenant, IMembershipService memberships, CancellationToken ct) =>
        {
            var role = req.Role == TenantMembership.RoleOwner ? TenantMembership.RoleOwner : TenantMembership.RoleStaff;
            var ok = await memberships.UpsertAsync(userId, tenant.TenantId.Value, role, ct);
            return ok ? Results.NoContent()
                : Results.Problem(title: "Members.LastOwner", detail: "No podés dejar la tienda sin dueño.", statusCode: 409);
        });

        // Sacar miembro (no se puede sacar al último owner).
        members.MapDelete("/{userId:guid}", async (Guid userId, ITenantContext tenant, IMembershipService memberships, CancellationToken ct) =>
        {
            var ok = await memberships.RemoveAsync(userId, tenant.TenantId.Value, ct);
            return ok ? Results.NoContent()
                : Results.Problem(title: "Members.LastOwner", detail: "No podés sacar al último dueño de la tienda.", statusCode: 409);
        });

        return group;
    }
}

public sealed record AddMemberRequest(string Email, string? Role);
public sealed record ChangeRoleRequest(string Role);
