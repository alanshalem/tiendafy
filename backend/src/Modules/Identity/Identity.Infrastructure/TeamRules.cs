namespace Identity.Infrastructure;

/// <summary>Por qué no se puede: código estable, texto para el panel y status HTTP.</summary>
public sealed record AccessDenial(string Code, string Detail, int Status = 403);

/// <summary>
/// Las reglas para gestionar el equipo, que impiden que alguien se dé más poder
/// del que tiene:
/// <list type="bullet">
/// <item>Nadie da ni quita algo que no puede hacer él mismo.</item>
/// <item>Nadie toca a alguien de su mismo rango o más (salvo el dueño).</item>
/// <item>Los dueños solo los nombra y los toca otro dueño; y tienen todo, siempre.</item>
/// <item>Nadie se cambia sus propias excepciones.</item>
/// </list>
/// Lógica pura: la base de datos (último dueño, existencia) la resuelve quien llama.
/// </summary>
public static class TeamRules
{
    public static AccessDenial? CanAssignRole(
        MemberAccess requester, string newRole, IReadOnlySet<Permission> newRolePermissions, string? targetRole, bool targetIsSelf)
    {
        if (!Roles.Exists(newRole))
            return new("Members.InvalidRole",
                $"Rol inválido. Roles: {string.Join(", ", Roles.All.Select(r => r.Key))}.", 400);
        if (newRole == Roles.Owner && !requester.IsOwner)
            return new("Members.OwnersOnly", "Solo el dueño puede nombrar dueños.");
        if (!requester.IsOwner)
        {
            if (Roles.Rank(newRole) > Roles.Rank(requester.Role))
                return new("Members.RoleTooHigh", "No podés asignar un rol por encima del tuyo.");
            if (!newRolePermissions.IsSubsetOf(requester.Permissions))
                return new("Members.RoleTooHigh", "Ese rol puede hacer cosas que vos no podés: no lo podés asignar.");
        }
        return targetRole is null || targetIsSelf ? null : CanTouch(requester, targetRole);
    }

    /// <summary>
    /// Abrir una tienda nueva es cosa de dueños: quien es vendedor (o cualquier
    /// otro rol) en una tienda no se arma una propia. La única excepción es la
    /// primera tienda de alguien que todavía no está en ninguna (el arranque).
    /// </summary>
    public static AccessDenial? CanCreateStore(int storesTheyBelongTo, int storesTheyOwn) =>
        storesTheyBelongTo == 0 || storesTheyOwn > 0
            ? null
            : new("Stores.OwnersOnly", "Solo el dueño de una tienda puede crear tiendas nuevas.");

    public static AccessDenial? CanRemove(MemberAccess requester, string targetRole, bool targetIsSelf) =>
        targetIsSelf ? null : CanTouch(requester, targetRole);

    public static AccessDenial? CanEditMember(
        MemberAccess requester, string targetRole, bool targetIsSelf, IReadOnlySet<Permission> changed)
    {
        if (targetIsSelf)
            return new("Members.Self", "No podés cambiar tus propios permisos: pedíselo a otro dueño o administrador.");
        if (targetRole == Roles.Owner)
            return new("Members.OwnerHasAll", "El dueño puede hacer todo, siempre: no lleva excepciones.", 400);
        return CanTouch(requester, targetRole) ?? CanChange(requester, changed);
    }

    public static AccessDenial? CanEditRole(MemberAccess requester, string role, IReadOnlySet<Permission> changed)
    {
        if (!Roles.Exists(role))
            return new("Roles.NotFound", "Ese rol no existe.", 404);
        if (role == Roles.Owner)
            return new("Members.OwnerHasAll", "El dueño puede hacer todo, siempre: su columna no se edita.", 400);
        if (!requester.IsOwner && Roles.Rank(role) >= Roles.Rank(requester.Role))
            return new("Members.RoleTooHigh", "Solo podés cambiar roles por debajo del tuyo.");
        return CanChange(requester, changed);
    }

    private static AccessDenial? CanTouch(MemberAccess requester, string targetRole)
    {
        if (requester.IsOwner) return null;
        if (targetRole == Roles.Owner)
            return new("Members.OwnersOnly", "Solo el dueño puede modificar a otro dueño.");
        // Rango >= (no solo >): un administrador no toca a otro administrador.
        return Roles.Rank(targetRole) >= Roles.Rank(requester.Role)
            ? new("Members.RoleTooHigh", "No podés modificar a alguien con un rol igual o superior al tuyo.")
            : null;
    }

    private static AccessDenial? CanChange(MemberAccess requester, IReadOnlySet<Permission> changed)
    {
        if (changed.Any(p => PermissionCatalog.Info(p).OwnerOnly))
            return new("Members.OwnerOnlyPermission", "Eso es solo del dueño: no se puede delegar.", 400);
        return requester.IsOwner || changed.IsSubsetOf(requester.Permissions)
            ? null
            : new("Members.NotYours", "Solo podés dar o quitar permisos que vos mismo tenés.");
    }
}
