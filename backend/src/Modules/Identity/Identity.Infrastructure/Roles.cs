namespace Identity.Infrastructure;

/// <param name="Rank">Jerarquía para gestionar el equipo: nadie toca a alguien de su rango o más.</param>
public sealed record RoleInfo(string Key, string Label, string Summary, int Rank);

/// <summary>
/// Los roles de una tienda. Son fijos (lo que se edita es qué puede hacer cada
/// uno, en <see cref="PermissionCatalog"/> y en la matriz de cada tienda).
/// </summary>
public static class Roles
{
    public const string Owner = "owner";
    public const string Admin = "admin";
    public const string Vendedor = "vendedor";
    public const string Catalogo = "catalogo";
    public const string Finanzas = "finanzas";
    public const string Soporte = "soporte";

    public static readonly IReadOnlyList<RoleInfo> All =
    [
        new(Owner, "Dueño", "control total", 3),
        new(Admin, "Administrador", "todo lo operativo", 2),
        new(Vendedor, "Vendedor", "ventas, clientes y chat", 1),
        new(Catalogo, "Catálogo", "productos e inventario", 1),
        new(Finanzas, "Finanzas", "cobros, facturación y compras", 1),
        new(Soporte, "Soporte", "posventa y mensajes", 1),
    ];

    public static bool Exists(string? role) => All.Any(r => r.Key == role);

    public static int Rank(string? role) => All.FirstOrDefault(r => r.Key == role)?.Rank ?? 0;

    public static string Label(string role) => All.FirstOrDefault(r => r.Key == role)?.Label ?? role;
}
