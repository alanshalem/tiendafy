namespace Identity.Infrastructure;

/// <summary>
/// Permisos del panel de administración. Las lecturas públicas del storefront
/// (catálogo, tema publicado, páginas publicadas) NO pasan por acá — esto
/// gobierna exclusivamente la superficie admin.
/// </summary>
public enum Permission
{
    CatalogWrite,        // productos, categorías, media, import/export CSV
    InventoryRead,
    InventoryWrite,
    OrdersRead,
    OrdersFulfill,
    OrdersRefund,        // sensible: mueve plata
    CustomersRead,
    CustomersWrite,
    SupportChat,         // chat posventa (lado staff)
    MessagesRead,        // mensajes de contacto
    DiscountsRead,
    DiscountsWrite,
    StatsRead,
    ContentWrite,        // páginas CMS + editor de tema
    PaymentsConfigRead,
    PaymentsConfigWrite, // sensible: conectar/desconectar MP, modo de cobro
    SettingsWrite,       // envíos, emails automáticos, opciones de checkout
    MembersRead,
    MembersManage,       // sensible: vía de escalación
    FiscalConfig,        // sensible: cert/CUIT/punto de venta de ARCA
    FiscalEmit,          // emitir / anular comprobantes (mueve obligaciones fiscales)
    Purchasing,          // compras a proveedores e importaciones (landed cost)
    Finance,             // sensible: tesorería, cuentas corrientes, cobros y pagos
    Social,              // redes sociales: cuentas, posts y calendario
    TenantAdmin,         // dominios / borrar tienda — solo owner
}

/// <summary>
/// Matriz rol → permisos (docs/rbac.md). Deny by default: lo que no
/// está acá, no se puede. La matriz es política de producto, vive en código.
/// </summary>
public static class RolePermissions
{
    public const string Owner = "owner";
    public const string Admin = "admin";
    public const string Vendedor = "vendedor";
    public const string Catalogo = "catalogo";
    public const string Finanzas = "finanzas";
    public const string Soporte = "soporte";
    /// <summary>Legacy: los "staff" existentes operaban todo el panel → equivalen a admin.</summary>
    public const string LegacyStaff = "staff";

    public static readonly IReadOnlyList<string> AssignableRoles =
        [Owner, Admin, Vendedor, Catalogo, Finanzas, Soporte];

    private static readonly Permission[] AllButTenantAdminAndOwners =
        [.. Enum.GetValues<Permission>().Where(p => p != Permission.TenantAdmin)];

    private static readonly Dictionary<string, HashSet<Permission>> Matrix = new(StringComparer.OrdinalIgnoreCase)
    {
        [Owner] = [.. Enum.GetValues<Permission>()],
        [Admin] = [.. AllButTenantAdminAndOwners],
        [LegacyStaff] = [.. AllButTenantAdminAndOwners],
        [Vendedor] =
        [
            Permission.OrdersRead, Permission.OrdersFulfill,
            Permission.CustomersRead, Permission.SupportChat, Permission.MessagesRead,
            Permission.DiscountsRead, Permission.StatsRead, Permission.InventoryRead,
        ],
        [Catalogo] =
        [
            Permission.CatalogWrite, Permission.InventoryRead, Permission.InventoryWrite,
        ],
        [Finanzas] =
        [
            Permission.OrdersRead, Permission.OrdersRefund,
            Permission.CustomersRead, Permission.DiscountsRead, Permission.StatsRead,
            Permission.PaymentsConfigRead, Permission.InventoryRead,
            Permission.FiscalConfig, Permission.FiscalEmit, // finanzas maneja la facturación
            Permission.Purchasing, // compras/importaciones: costos y pagos a proveedores
            Permission.Finance, // tesorería y cuentas corrientes: es exactamente su trabajo
        ],
        [Soporte] =
        [
            Permission.OrdersRead, Permission.CustomersRead,
            Permission.SupportChat, Permission.MessagesRead,
        ],
    };

    public static bool Has(string? role, Permission permission) =>
        role is not null && Matrix.TryGetValue(role, out var set) && set.Contains(permission);

    public static IReadOnlyCollection<Permission> For(string? role) =>
        role is not null && Matrix.TryGetValue(role, out var set) ? set : [];

    /// <summary>Jerarquía para gestión de miembros: nadie asigna un rol por encima del propio.</summary>
    public static int Rank(string? role) => role?.ToLowerInvariant() switch
    {
        Owner => 3,
        Admin or LegacyStaff => 2,
        Vendedor or Catalogo or Finanzas or Soporte => 1,
        _ => 0,
    };

    /// <summary>Clave wire estable para el front: "orders.refund", "catalog.write"…</summary>
    public static string WireKey(Permission p) => p switch
    {
        Permission.CatalogWrite => "catalog.write",
        Permission.InventoryRead => "inventory.read",
        Permission.InventoryWrite => "inventory.write",
        Permission.OrdersRead => "orders.read",
        Permission.OrdersFulfill => "orders.fulfill",
        Permission.OrdersRefund => "orders.refund",
        Permission.CustomersRead => "customers.read",
        Permission.CustomersWrite => "customers.write",
        Permission.SupportChat => "support.chat",
        Permission.MessagesRead => "messages.read",
        Permission.DiscountsRead => "discounts.read",
        Permission.DiscountsWrite => "discounts.write",
        Permission.StatsRead => "stats.read",
        Permission.ContentWrite => "content.write",
        Permission.PaymentsConfigRead => "payments.read",
        Permission.PaymentsConfigWrite => "payments.write",
        Permission.SettingsWrite => "settings.write",
        Permission.MembersRead => "members.read",
        Permission.MembersManage => "members.manage",
        Permission.FiscalConfig => "fiscal.config",
        Permission.FiscalEmit => "fiscal.emit",
        Permission.Purchasing => "purchasing",
        Permission.Finance => "finance",
        Permission.Social => "social",
        Permission.TenantAdmin => "tenant.admin",
        _ => p.ToString().ToLowerInvariant(),
    };
}
