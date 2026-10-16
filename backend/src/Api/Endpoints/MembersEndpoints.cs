using Api.Auth;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Abstractions;

namespace Api.Endpoints;

/// <summary>
/// El equipo de cada tienda: quién entra, con qué rol, qué puede hacer cada rol
/// (la matriz, editable por tienda), las excepciones de cada persona y el
/// registro de quién cambió qué. Las reglas anti-escalada están en
/// <see cref="TeamRules"/>: nadie da ni quita algo que no tiene, nadie toca a
/// alguien de su rango o más, y la tienda nunca queda sin dueño.
/// </summary>
public static class MembersEndpoints
{
    public static RouteGroupBuilder MapMembersEndpoints(this RouteGroupBuilder group)
    {
        // Lo que puede el usuario logueado en la tienda del header. Lo usa el
        // panel para armar el menú y esconder lo que no puede usar.
        group.MapGet("/me/permissions", async (HttpContext http) =>
        {
            var access = await http.GetAccessAsync();
            if (access is null) return Results.Forbid();
            return Results.Ok(new { role = access.Role, permissions = Keys(access.Permissions), customized = access.Customized });
        }).RequireTenant().RequireAuthorization();

        var members = group.MapGroup("/members");

        // La matriz de la tienda, con el catálogo entero: el panel la muestra y
        // la edita tal cual. Es la misma que decide cada request; si el panel
        // tuviera su propia lista, tarde o temprano diría otra cosa.
        members.MapGet("/roles", async (ITenantContext tenant, IAccessService access, CancellationToken ct) =>
        {
            var roles = await access.RolesAsync(tenant.TenantId.Value, ct);
            return Results.Ok(new
            {
                groups = PermissionCatalog.Groups,
                permissions = PermissionCatalog.All.Select(p => new
                {
                    key = p.Key,
                    group = p.Group,
                    label = p.Label,
                    description = p.Description,
                    sensitive = p.Sensitive,
                    ownerOnly = p.OwnerOnly,
                    requires = p.Requires is { } r ? PermissionCatalog.Key(r) : null,
                }),
                roles = roles.Select(r => new
                {
                    role = r.Role.Key,
                    label = r.Role.Label,
                    summary = r.Role.Summary,
                    rank = r.Role.Rank,
                    permissions = Keys(r.Permissions),
                    defaults = Keys(r.Defaults),
                }),
            });
        }).RequirePermission(Permission.MembersRead);

        // Qué puede hacer un rol en esta tienda. Se manda la lista completa de
        // lo que tiene que poder; se guarda solo lo que difiere de fábrica.
        members.MapPut("/roles/{role}", async (string role, SetPermissionsRequest req, HttpContext http,
            ITenantContext tenant, IAccessService access, IAuditLog audit, CancellationToken ct) =>
        {
            if (ParseKeys(req.Permissions) is not { } desired) return UnknownPermissions(req.Permissions);
            return await EditRoleAsync(http, tenant.TenantId.Value, role, _ => desired, access, audit, ct);
        }).RequirePermission(Permission.RolesManage);

        // Volver un rol a lo que trae de fábrica.
        members.MapDelete("/roles/{role}", async (string role, HttpContext http,
            ITenantContext tenant, IAccessService access, IAuditLog audit, CancellationToken ct) =>
            await EditRoleAsync(http, tenant.TenantId.Value, role, AccessPolicy.Defaults, access, audit, ct))
            .RequirePermission(Permission.RolesManage);

        // Listado del equipo, con lo que puede cada uno.
        members.MapGet("/", async (
            ITenantContext tenant, IMembershipService memberships, IAccessService accessService, UserManager<AppUser> users,
            CancellationToken ct, int? limit = null, int? offset = null) =>
        {
            var all = await memberships.ListAsync(tenant.TenantId.Value, ct);
            var page = all
                .Skip(Math.Max(0, offset ?? 0))
                .Take(Math.Clamp(limit ?? 25, 1, 100))
                .ToList();
            var people = await PeopleAsync(users, [.. page.Select(m => m.UserId)], ct);
            var access = await accessService.MembersAsync(tenant.TenantId.Value, ct);

            return Results.Ok(new
            {
                items = page.Select(m => new
                {
                    userId = m.UserId,
                    role = m.Role,
                    email = people.GetValueOrDefault(m.UserId)?.Email,
                    name = people.GetValueOrDefault(m.UserId)?.DisplayName,
                    createdAtUtc = m.CreatedAtUtc,
                    permissions = Keys(access[m.UserId].Permissions),
                    customized = access[m.UserId].Customized,
                }),
                total = all.Count,
            });
        }).RequirePermission(Permission.MembersRead);

        // Sumar a alguien por email con un rol. Si todavía no tiene cuenta, se
        // la crea: el registro del panel está cerrado a propósito, así que el
        // alta la hace alguien del equipo y a la persona le llega un email para
        // poner su contraseña. Quien ya tenía cuenta (de otra tienda) no recibe
        // ningún email: entra con su contraseña de siempre y ve esta tienda.
        // A quien ya es del equipo, se le cambia el rol desde la
        // lista (con las reglas de ese cambio), no volviéndolo a sumar.
        members.MapPost("/", async (
            AddMemberRequest req, HttpContext http, ITenantContext tenant, IMembershipService memberships,
            IAccessService accessService, IAuditLog audit, UserManager<AppUser> users,
            Api.Notifications.IEmailSender mailer, IConfiguration cfg, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var role = (req.Role ?? string.Empty).Trim().ToLowerInvariant();
            var requester = await http.GetAccessAsync();
            if (requester is null) return AuthExtensions.NotAMember();
            if (await AssignDenialAsync(requester, role, targetRole: null, targetIsSelf: false, tenantId, accessService, ct) is { } denied)
                return Problem(denied);

            var email = (req.Email ?? string.Empty).Trim();
            if (email.Length == 0 || !email.Contains('@'))
                return Results.Problem(title: "Members.InvalidEmail", detail: "El email no es válido.", statusCode: 400);

            var user = await users.FindByEmailAsync(email);
            var accountCreated = user is null;
            if (user is null)
            {
                user = new AppUser
                {
                    UserName = email,
                    Email = email,
                    DisplayName = string.IsNullOrWhiteSpace(req.Name) ? email.Split('@')[0] : req.Name!.Trim(),
                    // La da de alta alguien de adentro: el email ya está validado
                    // por quien la suma y no hace falta el circuito de verificación.
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

            if (await memberships.AddAsync(user.Id, tenantId, role, ct) == MembershipChange.AlreadyMember)
                return Results.Problem(title: "Members.AlreadyMember",
                    detail: "Esa persona ya es del equipo: cambiale el rol desde la lista.", statusCode: 409);

            await RecordAsync(http, audit, tenantId, "member.add",
                $"Sumó a {Who(user.DisplayName, user.Email)} como {Roles.Label(role)}.", ct);
            // El panel avisa distinto: la cuenta nueva recibe el email para poner
            // su contraseña; quien ya tenía cuenta no recibe nada y entra con la suya.
            return Results.Ok(new { accountCreated });
        }).RequirePermission(Permission.MembersManage);

        // Cambiar el rol (jerarquía + no dejar la tienda sin dueño). Las
        // excepciones de la persona se borran: eran para el rol anterior.
        members.MapPatch("/{userId:guid}", async (Guid userId, ChangeRoleRequest req, HttpContext http,
            ITenantContext tenant, IMembershipService memberships, IAccessService accessService, IAuditLog audit,
            UserManager<AppUser> users, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var role = (req.Role ?? string.Empty).Trim().ToLowerInvariant();
            var requester = await http.GetAccessAsync();
            var target = await accessService.GetAsync(userId, tenantId, ct);
            if (requester is null) return AuthExtensions.NotAMember();
            if (target is null) return Results.NotFound();
            if (await AssignDenialAsync(requester, role, target.Role, IsSelf(http, userId), tenantId, accessService, ct) is { } denied)
                return Problem(denied);

            var result = await memberships.ChangeRoleAsync(userId, tenantId, role, ct);
            if (result == MembershipChange.LastOwner)
                return Results.Problem(title: "Members.LastOwner", detail: "No podés dejar la tienda sin dueño.", statusCode: 409);

            if (target.Role != role)
                await RecordAsync(http, audit, tenantId, "member.role",
                    $"Cambió el rol de {await WhoAsync(users, userId)}: {Roles.Label(target.Role)} → {Roles.Label(role)}."
                    + (target.Customized ? " Sus excepciones se borraron." : ""), ct);
            return Results.NoContent();
        }).RequirePermission(Permission.MembersManage);

        // Excepciones de una persona: lo que puede, distinto de lo que da su rol.
        members.MapPut("/{userId:guid}/permissions", async (Guid userId, SetPermissionsRequest req, HttpContext http,
            ITenantContext tenant, IAccessService access, IAuditLog audit, UserManager<AppUser> users, CancellationToken ct) =>
        {
            if (ParseKeys(req.Permissions) is not { } desired) return UnknownPermissions(req.Permissions);
            return await EditMemberAsync(http, tenant.TenantId.Value, userId, _ => desired, access, audit, users, ct);
        }).RequirePermission(Permission.MembersManage);

        // Sacarle todas las excepciones: vuelve a poder exactamente lo de su rol.
        members.MapDelete("/{userId:guid}/permissions", async (Guid userId, HttpContext http,
            ITenantContext tenant, IAccessService access, IAuditLog audit, UserManager<AppUser> users, CancellationToken ct) =>
        {
            var roles = await access.RolesAsync(tenant.TenantId.Value, ct);
            return await EditMemberAsync(http, tenant.TenantId.Value, userId,
                role => roles.First(r => r.Role.Key == role).Permissions, access, audit, users, ct);
        }).RequirePermission(Permission.MembersManage);

        // Sacar a alguien del equipo (jerarquía + no sacar al último dueño).
        members.MapDelete("/{userId:guid}", async (Guid userId, HttpContext http, ITenantContext tenant,
            IMembershipService memberships, IAccessService accessService, IAuditLog audit,
            UserManager<AppUser> users, CancellationToken ct) =>
        {
            var tenantId = tenant.TenantId.Value;
            var requester = await http.GetAccessAsync();
            var target = await accessService.GetAsync(userId, tenantId, ct);
            if (requester is null) return AuthExtensions.NotAMember();
            if (target is null) return Results.NotFound();
            if (TeamRules.CanRemove(requester, target.Role, IsSelf(http, userId)) is { } denied) return Problem(denied);

            var who = await WhoAsync(users, userId);
            if (await memberships.RemoveAsync(userId, tenantId, ct) == MembershipChange.LastOwner)
                return Results.Problem(title: "Members.LastOwner", detail: "No podés sacar al último dueño de la tienda.", statusCode: 409);

            await RecordAsync(http, audit, tenantId, "member.remove", $"Sacó a {who} del equipo.", ct);
            return Results.NoContent();
        }).RequirePermission(Permission.MembersManage);

        // Quién cambió qué en el equipo, lo más nuevo primero.
        members.MapGet("/activity", async (ITenantContext tenant, IAuditLog audit, CancellationToken ct,
            int? limit = null, int? offset = null) =>
        {
            var (items, total) = await audit.ListAsync(tenant.TenantId.Value,
                Math.Clamp(limit ?? 20, 1, 100), Math.Max(0, offset ?? 0), ct);
            return Results.Ok(new
            {
                items = items.Select(e => new
                {
                    id = e.Id,
                    action = e.Action,
                    actorName = e.ActorName,
                    summary = e.Summary,
                    createdAtUtc = e.CreatedAtUtc,
                }),
                total,
            });
        }).RequirePermission(Permission.MembersRead);

        return group;
    }

    /// <summary>Aplica las reglas, guarda la matriz del rol y lo deja en el registro.</summary>
    private static async Task<IResult> EditRoleAsync(
        HttpContext http, Guid tenantId, string role, Func<string, IReadOnlySet<Permission>> desiredFor,
        IAccessService access, IAuditLog audit, CancellationToken ct)
    {
        var requester = await http.GetAccessAsync();
        if (requester is null) return AuthExtensions.NotAMember();

        var current = (await access.RolesAsync(tenantId, ct)).FirstOrDefault(r => r.Role.Key == role);
        var desired = AccessPolicy.Normalize(desiredFor(role));
        var changed = current is null ? desired : AccessPolicy.Changed(current.Permissions, desired);
        if (TeamRules.CanEditRole(requester, role, changed) is { } denied) return Problem(denied);

        var change = await access.SetRoleAsync(tenantId, role, desired, ct);
        if (!change.IsEmpty)
            await RecordAsync(http, audit, tenantId, "role.permissions",
                $"Cambió lo que puede {Roles.Label(role)}{Describe(change)}", ct);
        return Results.NoContent();
    }

    /// <summary>Aplica las reglas, guarda las excepciones de la persona y lo deja en el registro.</summary>
    private static async Task<IResult> EditMemberAsync(
        HttpContext http, Guid tenantId, Guid userId, Func<string, IReadOnlySet<Permission>> desiredFor,
        IAccessService access, IAuditLog audit, UserManager<AppUser> users, CancellationToken ct)
    {
        var requester = await http.GetAccessAsync();
        var target = await access.GetAsync(userId, tenantId, ct);
        if (requester is null) return AuthExtensions.NotAMember();
        if (target is null) return Results.NotFound();

        var desired = AccessPolicy.Normalize(desiredFor(target.Role));
        var changed = AccessPolicy.Changed(target.Permissions, desired);
        if (TeamRules.CanEditMember(requester, target.Role, IsSelf(http, userId), changed) is { } denied)
            return Problem(denied);

        var change = await access.SetMemberAsync(tenantId, userId, desired, ct);
        if (change is { IsEmpty: false })
            await RecordAsync(http, audit, tenantId, "member.permissions",
                $"Cambió los permisos de {await WhoAsync(users, userId)}{Describe(change)}", ct);
        return Results.NoContent();
    }

    /// <summary>
    /// Las reglas de asignar un rol, con lo que ese rol puede EN ESTA TIENDA:
    /// si la tienda le sumó algo a un rol, quien no lo tiene no lo puede repartir.
    /// </summary>
    private static async Task<AccessDenial?> AssignDenialAsync(
        MemberAccess requester, string role, string? targetRole, bool targetIsSelf,
        Guid tenantId, IAccessService access, CancellationToken ct)
    {
        var rolePermissions = (await access.RolesAsync(tenantId, ct)).FirstOrDefault(r => r.Role.Key == role)?.Permissions
            ?? new HashSet<Permission>();
        return TeamRules.CanAssignRole(requester, role, rolePermissions, targetRole, targetIsSelf);
    }

    private static IEnumerable<string> Keys(IEnumerable<Permission> permissions) =>
        permissions.Select(PermissionCatalog.Key).Order(StringComparer.Ordinal);

    /// <summary>Las claves del panel, o null si alguna no existe (mejor 400 que guardar algo a medias).</summary>
    private static HashSet<Permission>? ParseKeys(IReadOnlyList<string>? keys)
    {
        var parsed = (keys ?? []).Select(PermissionCatalog.FromKey).ToList();
        return parsed.Any(p => p is null) ? null : parsed.Select(p => p!.Value).ToHashSet();
    }

    private static IResult UnknownPermissions(IReadOnlyList<string>? keys) =>
        Results.Problem(title: "Members.UnknownPermission",
            detail: $"Permisos que no existen: {string.Join(", ", (keys ?? []).Where(k => PermissionCatalog.FromKey(k) is null))}.",
            statusCode: 400);

    /// <summary>" : le dio X e Y; le quitó Z." — en el idioma del panel, con los nombres de los permisos.</summary>
    private static string Describe(PermissionChange change)
    {
        static string Labels(IReadOnlySet<Permission> set) =>
            string.Join(", ", PermissionCatalog.All.Where(p => set.Contains(p.Id)).Select(p => p.Label));

        var parts = new List<string>();
        if (change.Added.Count > 0) parts.Add($"le dio {Labels(change.Added)}");
        if (change.Removed.Count > 0) parts.Add($"le quitó {Labels(change.Removed)}");
        return $": {string.Join("; ", parts)}.";
    }

    private static bool IsSelf(HttpContext http, Guid userId) => http.User.GetUserId() == userId;

    private static IResult Problem(AccessDenial denial) =>
        Results.Problem(title: denial.Code, detail: denial.Detail, statusCode: denial.Status);

    private static Task RecordAsync(HttpContext http, IAuditLog audit, Guid tenantId, string action, string summary, CancellationToken ct) =>
        audit.RecordAsync(tenantId, http.User.GetUserId(), http.User.Identity?.Name ?? "—", action, summary, ct);

    private static async Task<Dictionary<Guid, AppUser>> PeopleAsync(
        UserManager<AppUser> users, IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        await users.Users.AsNoTracking().Where(u => ids.Contains(u.Id)).ToDictionaryAsync(u => u.Id, ct);

    private static async Task<string> WhoAsync(UserManager<AppUser> users, Guid userId)
    {
        var user = await users.FindByIdAsync(userId.ToString());
        return Who(user?.DisplayName, user?.Email);
    }

    private static string Who(string? name, string? email) =>
        string.IsNullOrWhiteSpace(name) ? email ?? "alguien" : email is null ? name : $"{name} ({email})";

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
public sealed record ChangeRoleRequest(string? Role);
public sealed record SetPermissionsRequest(IReadOnlyList<string>? Permissions);
