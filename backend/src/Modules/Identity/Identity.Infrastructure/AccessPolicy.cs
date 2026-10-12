namespace Identity.Infrastructure;

/// <summary>Una excepción guardada: este permiso se da (true) o se quita (false).</summary>
public readonly record struct PermissionOverride(string Key, bool Granted);

/// <summary>Lo que una persona puede hacer en una tienda, ya resuelto.</summary>
/// <param name="Customized">Tiene excepciones propias, distintas de lo que da su rol.</param>
public sealed record MemberAccess(string Role, IReadOnlySet<Permission> Permissions, bool Customized = false)
{
    public bool IsOwner => Role == Roles.Owner;

    public bool Can(Permission permission) => Permissions.Contains(permission);
}

/// <summary>
/// Cómo se calcula lo que alguien puede hacer, en tres capas:
/// lo que trae el rol de fábrica, lo que la tienda le cambió a ese rol, y las
/// excepciones de esa persona. El dueño tiene todo, siempre: así una tienda
/// nunca queda sin nadie que pueda arreglar la matriz.
///
/// Lógica pura, sin base: la usan el chequeo de cada request y la pantalla que
/// edita la matriz, así que no pueden decir cosas distintas.
/// </summary>
public static class AccessPolicy
{
    private static readonly IReadOnlySet<Permission> Everything = Enum.GetValues<Permission>().ToHashSet();

    /// <summary>Lo que trae el rol de fábrica.</summary>
    public static IReadOnlySet<Permission> Defaults(string role) =>
        role == Roles.Owner
            ? Everything
            : PermissionCatalog.All.Where(p => p.DefaultRoles.Contains(role)).Select(p => p.Id).ToHashSet();

    /// <summary>Lo que puede el rol en esta tienda: fábrica + lo que la tienda le cambió.</summary>
    public static IReadOnlySet<Permission> ForRole(string role, IEnumerable<PermissionOverride> roleOverrides) =>
        role == Roles.Owner ? Everything : Apply(Defaults(role), roleOverrides);

    /// <summary>Lo que puede una persona: su rol en esta tienda + sus excepciones.</summary>
    public static IReadOnlySet<Permission> ForMember(
        string role, IEnumerable<PermissionOverride> roleOverrides, IEnumerable<PermissionOverride> memberOverrides) =>
        role == Roles.Owner ? Everything : Apply(ForRole(role, roleOverrides), memberOverrides);

    /// <summary>
    /// Lo que hay que guardar para pasar de <paramref name="baseline"/> a
    /// <paramref name="desired"/>: solo las diferencias. Así, si mañana cambia lo
    /// que trae un rol de fábrica, lo que nadie tocó acompaña el cambio.
    /// </summary>
    public static IReadOnlyList<PermissionOverride> Diff(IReadOnlySet<Permission> baseline, IReadOnlySet<Permission> desired)
    {
        var normalized = Normalize(desired);
        return [.. PermissionCatalog.All
            .Where(p => !p.OwnerOnly && baseline.Contains(p.Id) != normalized.Contains(p.Id))
            .Select(p => new PermissionOverride(p.Key, normalized.Contains(p.Id)))];
    }

    /// <summary>Los permisos que cambian entre dos conjuntos (para validar y para el registro).</summary>
    public static IReadOnlySet<Permission> Changed(IReadOnlySet<Permission> before, IReadOnlySet<Permission> after) =>
        before.Except(after).Concat(after.Except(before)).ToHashSet();

    private static HashSet<Permission> Apply(IReadOnlySet<Permission> start, IEnumerable<PermissionOverride> overrides)
    {
        var set = start.ToHashSet();
        foreach (var o in overrides)
        {
            // Claves que ya no existen (un permiso renombrado) se ignoran; lo que
            // es solo del dueño no se puede dar por excepción.
            if (PermissionCatalog.FromKey(o.Key) is not { } p || PermissionCatalog.Info(p).OwnerOnly) continue;
            if (o.Granted) set.Add(p); else set.Remove(p);
        }
        return Normalize(set);
    }

    /// <summary>
    /// Saca lo que no sirve sin su requisito (devolver plata sin poder ver las
    /// ventas): así la matriz nunca promete algo que el panel no deja usar.
    /// </summary>
    public static HashSet<Permission> Normalize(IReadOnlySet<Permission> set) =>
        set.Where(p => PermissionCatalog.Info(p).Requires is not { } r || set.Contains(r)).ToHashSet();
}
