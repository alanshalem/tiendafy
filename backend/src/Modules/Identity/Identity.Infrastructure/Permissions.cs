namespace Identity.Infrastructure;

/// <summary>
/// Lo que se puede hacer en el panel de administración, una entrada por
/// funcionalidad. Las lecturas públicas del storefront (catálogo, tema
/// publicado, páginas publicadas) NO pasan por acá: esto gobierna solo la
/// superficie admin. El detalle de cada uno vive en <see cref="PermissionCatalog"/>.
/// </summary>
public enum Permission
{
    StatsRead,
    CostsRead,
    OrdersRead,
    OrdersCreate,
    OrdersFulfill,
    OrdersRefund,
    QuotesManage,
    MeliOperate,
    MeliPublish,
    MeliConfig,
    CatalogWrite,
    PricesManage,
    InventoryRead,
    InventoryWrite,
    PurchasingManage,
    CustomersRead,
    CustomersWrite,
    SupportChat,
    MessagesRead,
    DiscountsRead,
    DiscountsWrite,
    CampaignsManage,
    SocialPublish,
    AdsManage,
    ContentWrite,
    FinanceManage,
    FiscalEmit,
    FiscalConfig,
    PaymentsRead,
    PaymentsWrite,
    ShippingConfig,
    NotificationsConfig,
    StoreConfig,
    MembersRead,
    MembersManage,
    RolesManage,
    TenantAdmin,
}

/// <summary>
/// Un permiso tal como lo ve quien arma el equipo.
/// </summary>
/// <param name="Key">Clave estable que viaja al panel y se guarda en las excepciones ("orders.refund").</param>
/// <param name="Group">Sección del panel donde está la funcionalidad.</param>
/// <param name="Sensitive">Puede mover plata, obligaciones fiscales o dar más accesos: conviene pensarlo dos veces.</param>
/// <param name="OwnerOnly">Solo el dueño, siempre: no se puede dar a otro rol ni a otra persona.</param>
/// <param name="Requires">Permiso sin el cual este no sirve (despachar sin ver las ventas): sin él, no cuenta.</param>
/// <param name="DefaultRoles">Roles que lo traen de fábrica, además del dueño (que tiene todo).</param>
public sealed record PermissionInfo(
    Permission Id,
    string Key,
    string Group,
    string Label,
    string Description,
    string[] DefaultRoles,
    bool Sensitive = false,
    bool OwnerOnly = false,
    Permission? Requires = null);

/// <summary>
/// El catálogo de permisos: la ÚNICA lista. De acá salen la matriz que decide
/// cada request, lo que trae cada rol de fábrica y lo que el panel muestra para
/// editar. Agregar una funcionalidad al panel es agregar una línea acá.
/// </summary>
public static class PermissionCatalog
{
    private const string Admin = Roles.Admin;
    private const string Vendedor = Roles.Vendedor;
    private const string Catalogo = Roles.Catalogo;
    private const string Finanzas = Roles.Finanzas;
    private const string Soporte = Roles.Soporte;

    public static readonly IReadOnlyList<PermissionInfo> All =
    [
        // Inicio y estadísticas
        new(Permission.StatsRead, "stats.read", "Estadísticas", "Ver estadísticas",
            "Ventas, productos más vendidos, visitas, tiempo real, cupones y gasto en publicidad.",
            [Admin, Vendedor, Finanzas]),
        new(Permission.CostsRead, "costs.read", "Estadísticas", "Ver costos y rentabilidad",
            "El costo de cada producto, los márgenes y la ganancia real.",
            [Admin, Catalogo, Finanzas]),

        // Ventas
        new(Permission.OrdersRead, "orders.read", "Ventas", "Ver las ventas",
            "Listado y detalle de ventas, carritos abandonados y comprobantes.",
            [Admin, Vendedor, Finanzas, Soporte]),
        new(Permission.OrdersCreate, "orders.create", "Ventas", "Registrar ventas a mano",
            "Ventas de mostrador, por teléfono o con link de pago.",
            [Admin, Vendedor], Requires: Permission.OrdersRead),
        new(Permission.OrdersFulfill, "orders.fulfill", "Ventas", "Despachar pedidos",
            "Marcar enviado o listo para retirar, generar envíos y etiquetas de los carriers.",
            [Admin, Vendedor], Requires: Permission.OrdersRead),
        new(Permission.OrdersRefund, "orders.refund", "Ventas", "Devolver plata",
            "Reembolsos totales o parciales. Mueven dinero real y no se deshacen.",
            [Admin, Finanzas], Sensitive: true, Requires: Permission.OrdersRead),
        new(Permission.QuotesManage, "quotes.manage", "Ventas", "Hacer presupuestos",
            "Crear, enviar, extender y convertir presupuestos en ventas.",
            [Admin, Vendedor]),

        // Mercado Libre
        new(Permission.MeliOperate, "meli.operate", "Mercado Libre", "Atender Mercado Libre",
            "Ventas, preguntas y mensajes de Mercado Libre.",
            [Admin, Vendedor, Soporte]),
        new(Permission.MeliPublish, "meli.publish", "Mercado Libre", "Publicar en Mercado Libre",
            "Crear y editar publicaciones, su precio y su stock.",
            [Admin, Catalogo]),
        new(Permission.MeliConfig, "meli.config", "Mercado Libre", "Conectar Mercado Libre",
            "Vincular la cuenta y elegir cómo se sincroniza y se factura.",
            [Admin], Sensitive: true),

        // Catálogo
        new(Permission.CatalogWrite, "catalog.write", "Catálogo", "Crear y editar productos",
            "Productos (con su precio), categorías, imágenes, ficha técnica, kits, importar y exportar.",
            [Admin, Catalogo]),
        new(Permission.PricesManage, "prices.manage", "Catálogo", "Listas de precios y repreciación",
            "Listas de precios mayoristas y subir o bajar precios en masa.",
            [Admin, Catalogo], Requires: Permission.CatalogWrite),
        new(Permission.InventoryRead, "inventory.read", "Catálogo", "Ver el stock",
            "Inventario, ubicación en el depósito, escáner e impresión de etiquetas.",
            [Admin, Vendedor, Catalogo, Finanzas]),
        new(Permission.InventoryWrite, "inventory.write", "Catálogo", "Ajustar el stock",
            "Cargar conteos y corregir el stock a mano.",
            [Admin, Catalogo], Requires: Permission.InventoryRead),
        new(Permission.PurchasingManage, "purchasing.manage", "Catálogo", "Compras e importaciones",
            "Órdenes de compra, proveedores, recepción y costo de importación.",
            [Admin, Finanzas]),

        // Clientes
        new(Permission.CustomersRead, "customers.read", "Clientes", "Ver clientes",
            "La agenda de clientes y su historial de compras.",
            [Admin, Vendedor, Finanzas, Soporte]),
        new(Permission.CustomersWrite, "customers.write", "Clientes", "Editar clientes",
            "Crear, editar y borrar clientes de la agenda.",
            [Admin], Requires: Permission.CustomersRead),
        new(Permission.SupportChat, "support.chat", "Clientes", "Responder el chat posventa",
            "Conversaciones con compradores después de la venta.",
            [Admin, Vendedor, Soporte]),
        new(Permission.MessagesRead, "messages.read", "Clientes", "Leer mensajes de contacto",
            "Lo que llega por el formulario de contacto de la tienda.",
            [Admin, Vendedor, Soporte]),

        // Marketing
        new(Permission.DiscountsRead, "discounts.read", "Marketing", "Ver cupones",
            "Los cupones de descuento y cuánto se usaron.",
            [Admin, Vendedor, Finanzas]),
        new(Permission.DiscountsWrite, "discounts.write", "Marketing", "Crear y editar cupones",
            "Armar, pausar y borrar cupones de descuento.",
            [Admin], Requires: Permission.DiscountsRead),
        new(Permission.CampaignsManage, "campaigns.manage", "Marketing", "Email marketing",
            "Armar, programar y enviar campañas a tus clientes.",
            [Admin]),
        new(Permission.SocialPublish, "social.publish", "Marketing", "Redes sociales",
            "Conectar cuentas, publicar y programar posts.",
            [Admin]),
        new(Permission.AdsManage, "ads.manage", "Marketing", "Conectar Meta Ads",
            "Vincular la cuenta publicitaria; el gasto después se ve en estadísticas.",
            [Admin]),

        // Tienda online
        new(Permission.ContentWrite, "content.write", "Tienda online", "Diseño y páginas de la tienda",
            "El editor de diseño, las páginas de contenido y su publicación.",
            [Admin]),

        // Finanzas y facturación
        new(Permission.FinanceManage, "finance.manage", "Finanzas y facturación", "Tesorería y cuentas corrientes",
            "Cajas, bancos, cobros y pagos, y las cuentas corrientes de clientes y proveedores.",
            [Admin, Finanzas], Sensitive: true),
        new(Permission.FiscalEmit, "fiscal.emit", "Finanzas y facturación", "Emitir y anular facturas",
            "Facturas y notas de crédito electrónicas ante ARCA.",
            [Admin, Finanzas], Sensitive: true),
        new(Permission.FiscalConfig, "fiscal.config", "Finanzas y facturación", "Configurar la facturación (ARCA)",
            "Certificado, CUIT, puntos de venta y cuándo se factura.",
            [Admin, Finanzas], Sensitive: true),

        // Configuración
        new(Permission.PaymentsRead, "payments.read", "Configuración", "Ver la configuración de cobros",
            "Qué medios de cobro están conectados y en qué modo.",
            [Admin, Finanzas]),
        new(Permission.PaymentsWrite, "payments.write", "Configuración", "Conectar y desconectar cobros",
            "Mercado Pago, Payway y el modo de cobro del checkout.",
            [Admin], Sensitive: true, Requires: Permission.PaymentsRead),
        new(Permission.ShippingConfig, "shipping.config", "Configuración", "Medios de envío",
            "Envíos y retiros propios, y las cuentas de Correo Argentino, Andreani y Zipnova.",
            [Admin]),
        new(Permission.NotificationsConfig, "notifications.config", "Configuración", "E-mails y WhatsApp automáticos",
            "Qué avisos le llegan al cliente y con qué texto.",
            [Admin]),
        new(Permission.StoreConfig, "store.config", "Configuración", "Checkout, redirecciones y medición",
            "Opciones del checkout, redirecciones de direcciones viejas y píxeles de medición.",
            [Admin]),

        // Equipo
        new(Permission.MembersRead, "members.read", "Equipo", "Ver el equipo",
            "Quién tiene acceso, con qué rol, y el registro de cambios.",
            [Admin]),
        new(Permission.MembersManage, "members.manage", "Equipo", "Sumar y sacar gente",
            "Invitar, cambiar el rol, dar excepciones y sacar personas del equipo.",
            [Admin], Sensitive: true, Requires: Permission.MembersRead),
        new(Permission.RolesManage, "roles.manage", "Equipo", "Cambiar qué puede hacer cada rol",
            "Editar esta matriz. Nadie da ni quita algo que no tiene.",
            [Admin], Sensitive: true, Requires: Permission.MembersRead),
        new(Permission.TenantAdmin, "tenant.admin", "Equipo", "Dominios, editar y borrar la tienda",
            "Siempre y solo del dueño: no se puede delegar.",
            [], Sensitive: true, OwnerOnly: true),
    ];

    private static readonly Dictionary<Permission, PermissionInfo> ById = All.ToDictionary(p => p.Id);
    private static readonly Dictionary<string, PermissionInfo> ByKey = All.ToDictionary(p => p.Key, StringComparer.Ordinal);

    /// <summary>Las secciones, en el orden del panel.</summary>
    public static readonly IReadOnlyList<string> Groups = [.. All.Select(p => p.Group).Distinct()];

    public static PermissionInfo Info(Permission p) => ById[p];

    public static string Key(Permission p) => ById[p].Key;

    /// <summary>El permiso de una clave, o null si no existe (claves viejas guardadas, typos del cliente).</summary>
    public static Permission? FromKey(string? key) =>
        key is not null && ByKey.TryGetValue(key, out var info) ? info.Id : null;
}
