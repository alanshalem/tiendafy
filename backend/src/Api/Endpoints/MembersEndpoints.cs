using Api.Auth;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

/// <summary>
/// Gestión de usuarios de la tienda con roles RBAC. Reglas de jerarquía:
/// nadie asigna un rol por encima del propio; solo el owner gestiona owners;
/// no se puede dejar la tienda sin dueño.
/// </summary>
public static class MembersEndpoints
{
    public static RouteGroupBuilder MapMembersEndpoints(this RouteGroupBuilder group)
    {
        // Rol y permisos efectivos del usuario logueado en la tienda del header.
        // Lo consume el admin para armar el menú y esconder acciones.
        group.MapGet("/me/permissions", async (
            HttpContext http, ITenantContext tenant, IMembershipService memberships, CancellationToken ct) =>
        {
            var userId = http.User.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var role = await memberships.RoleAsync(userId.Value, tenant.TenantId.Value, ct);
            if (role is null) return Results.Forbid();
            return Results.Ok(new
            {
                role,
                permissions = RolePermissions.For(role).Select(RolePermissions.WireKey).OrderBy(p => p),
            });
        }).RequireTenant().RequireAuthorization();

        var members = group.MapGroup("/members");

        // Listado de miembros con su email/nombre.
        members.MapGet("/", async (
            ITenantContext tenant, IMembershipService memberships, UserManager<AppUser> users,
            CancellationToken ct, int? limit = null, int? offset = null) =>
        {
            var all = await memberships.ListAsync(tenant.TenantId.Value, ct);
            var total = all.Count;
            var list = all
                .Skip(Math.Max(0, offset ?? 0))
                .Take(Math.Clamp(limit ?? 25, 1, 100))
                .ToList();
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
                total,
            });
        }).RequirePermission(Permission.MembersRead);

        // Sumar miembro por email con rol (la persona debe tener cuenta de Tiendafy).
        members.MapPost("/", async (
            AddMemberRequest req, HttpContext http, ITenantContext tenant, IMembershipService memberships,
            UserManager<AppUser> users, Api.Notifications.IEmailSender mailer, IConfiguration cfg,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(req.Role))
                return Results.Problem(title: "Members.InvalidRole", detail: "Falta el rol.", statusCode: 400);
            var check = await CheckHierarchyAsync(http, tenant, memberships, req.Role, targetUserId: null, ct);
            if (check is not null) return check;

            var email = (req.Email ?? string.Empty).Trim();
            if (email.Length == 0 || !email.Contains('@'))
                return Results.Problem(title: "Members.InvalidEmail", detail: "El email no es válido.", statusCode: 400);

            // Si la persona todavía no tiene cuenta, se la crea acá: el registro
            // del panel está cerrado a propósito (esto no es un SaaS con alta
            // pública), así que el alta del equipo la hace un dueño y a la
            // persona le llega un email para poner su contraseña.
            var user = await users.FindByEmailAsync(email);
            if (user is null)
            {
                user = new AppUser
                {
                    UserName = email,
                    Email = email,
                    DisplayName = string.IsNullOrWhiteSpace(req.Name) ? email.Split('@')[0] : req.Name!.Trim(),
                    // La da de alta alguien de adentro: el email ya está validado
                    // por el dueño y no hace falta el circuito de verificación.
                    EmailConfirmed = true,
                };

                // Contraseña de un solo uso que nadie conoce: la real la define
                // la persona con el link del email.
                var created = await users.CreateAsync(user, Guid.NewGuid().ToString("N") + "aA1!");
                if (!created.Succeeded)
                    return Results.ValidationProblem(created.Errors
                        .GroupBy(e => e.Code)
                        .ToDictionary(g => g.Key, g => g.Select(e => e.Description).ToArray()));

                await SendWelcomeAsync(user, http, users, mailer, cfg, ct);
            }

            await memberships.UpsertAsync(user.Id, tenant.TenantId.Value, req.Role!.ToLowerInvariant(), ct);
            return Results.NoContent();
        }).RequirePermission(Permission.MembersManage);

        // Cambiar rol (jerarquía + no degradar al último owner).
        members.MapPatch("/{userId:guid}", async (Guid userId, ChangeRoleRequest req, HttpContext http, ITenantContext tenant, IMembershipService memberships, CancellationToken ct) =>
        {
            var check = await CheckHierarchyAsync(http, tenant, memberships, req.Role, userId, ct);
            if (check is not null) return check;

            var ok = await memberships.UpsertAsync(userId, tenant.TenantId.Value, req.Role.ToLowerInvariant(), ct);
            return ok ? Results.NoContent()
                : Results.Problem(title: "Members.LastOwner", detail: "No podés dejar la tienda sin dueño.", statusCode: 409);
        }).RequirePermission(Permission.MembersManage);

        // Sacar miembro (jerarquía + no sacar al último owner).
        members.MapDelete("/{userId:guid}", async (Guid userId, HttpContext http, ITenantContext tenant, IMembershipService memberships, CancellationToken ct) =>
        {
            var check = await CheckHierarchyAsync(http, tenant, memberships, newRole: null, userId, ct);
            if (check is not null) return check;

            var ok = await memberships.RemoveAsync(userId, tenant.TenantId.Value, ct);
            return ok ? Results.NoContent()
                : Results.Problem(title: "Members.LastOwner", detail: "No podés sacar al último dueño de la tienda.", statusCode: 409);
        }).RequirePermission(Permission.MembersManage);

        return group;
    }

    /// <summary>
    /// Reglas anti-escalación: el rol asignado debe existir y no superar el del
    /// que lo asigna; a un miembro de rango igual o mayor solo lo toca un owner.
    /// Devuelve el Problem si algo falla, null si pasa.
    /// </summary>
    private static async Task<IResult?> CheckHierarchyAsync(
        HttpContext http, ITenantContext tenant, IMembershipService memberships,
        string? newRole, Guid? targetUserId, CancellationToken ct)
    {
        var requesterId = http.User.GetUserId();
        if (requesterId is null) return Results.Unauthorized();
        var requesterRole = await memberships.RoleAsync(requesterId.Value, tenant.TenantId.Value, ct);
        var requesterRank = RolePermissions.Rank(requesterRole);

        if (newRole is not null)
        {
            var normalized = newRole.Trim().ToLowerInvariant();
            if (!RolePermissions.AssignableRoles.Contains(normalized))
                return Results.Problem(title: "Members.InvalidRole",
                    detail: $"Rol inválido. Roles: {string.Join(", ", RolePermissions.AssignableRoles)}.", statusCode: 400);
            if (RolePermissions.Rank(normalized) > requesterRank)
                return Results.Problem(title: "Members.RoleTooHigh",
                    detail: "No podés asignar un rol por encima del tuyo.", statusCode: 403);
            if (normalized == RolePermissions.Owner && requesterRole != RolePermissions.Owner)
                return Results.Problem(title: "Members.OwnersOnly",
                    detail: "Solo el dueño puede nombrar dueños.", statusCode: 403);
        }

        if (targetUserId is { } tid && tid != requesterId.Value)
        {
            var targetRole = await memberships.RoleAsync(tid, tenant.TenantId.Value, ct);
            if (targetRole is not null)
            {
                if (targetRole == RolePermissions.Owner && requesterRole != RolePermissions.Owner)
                    return Results.Problem(title: "Members.OwnersOnly",
                        detail: "Solo el dueño puede modificar a otro dueño.", statusCode: 403);
                // Rango >= (no solo >): un admin no puede tocar a otro admin (par).
                // El caso "a sí mismo" ya se excluyó arriba (tid != requesterId).
                if (RolePermissions.Rank(targetRole) >= RolePermissions.Rank(requesterRole))
                    return Results.Problem(title: "Members.RoleTooHigh",
                        detail: "No podés modificar a alguien con un rol igual o superior al tuyo.", statusCode: 403);
            }
        }

        return null;
    }
    /// <summary>
    /// Le avisa a la persona que la sumaron y le da el link para definir su
    /// contraseña. Reusa el token de restablecer: es el mismo trámite, y así no
    /// existe ninguna contraseña provisoria dando vueltas por email.
    /// </summary>
    private static async Task SendWelcomeAsync(
        AppUser user, HttpContext http, UserManager<AppUser> users,
        Api.Notifications.IEmailSender mailer, IConfiguration cfg, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(user.Email)) return;

        var token = await users.GeneratePasswordResetTokenAsync(user);
        var origin = http.Request.Headers.Origin.ToString();
        var baseUrl = AuthEndpoints.SafeAdminBaseUrl(origin, cfg);
        var link = $"{baseUrl}/restablecer?email={Uri.EscapeDataString(user.Email)}&token={Uri.EscapeDataString(token)}";

        await mailer.SendAsync(user.Email, "Te sumaron al panel de tu tienda",
            $"""<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px"><h2>Ya tenés acceso al panel</h2><p>Definí tu contraseña para entrar.</p><p><a href="{link}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px">Crear mi contraseña</a></p><p style="color:#888;font-size:12px;word-break:break-all">{link}</p></div>""", ct: ct);
    }
}

public sealed record AddMemberRequest(string Email, string? Role, string? Name = null);
public sealed record ChangeRoleRequest(string Role);
