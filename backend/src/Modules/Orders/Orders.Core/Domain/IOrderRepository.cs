using SharedKernel.Common;

namespace Orders.Core.Domain;

/// <summary>
/// Los filtros del listado de Ventas. Todos opcionales; los mismos valen para
/// la página, el export y los contadores, así lo que se cuenta es lo que se ve.
/// </summary>
/// <param name="Search">Email, nombre o número (#1042, o el id corto de las etiquetas viejas).</param>
/// <param name="Status">Estado tal como lo muestra la API (PAID, FULFILLED…).</param>
/// <param name="FromUtc">Creadas desde (inclusive).</param>
/// <param name="ToUtc">Creadas antes de (exclusivo).</param>
/// <param name="Channel">web, manual o quote (ver <see cref="Order.Channel"/>).</param>
/// <param name="Shipping">Ver <see cref="OrderShipping"/>.</param>
/// <param name="Payment">Ver <see cref="OrderPayment"/>.</param>
/// <param name="Ids">Solo estas ventas (exportar una selección).</param>
public sealed record OrderListFilter(
    string? Search = null,
    string? Status = null,
    DateTime? FromUtc = null,
    DateTime? ToUtc = null,
    string? Channel = null,
    string? Shipping = null,
    string? Payment = null,
    IReadOnlyCollection<Guid>? Ids = null,
    bool NeedsReview = false);

/// <summary>
/// En qué anda el envío de una venta. No es un estado propio: se deduce del
/// estado de la venta y de si se retira en el local, y por eso vive en un
/// solo lugar — el listado, su filtro y el export dicen lo mismo.
/// </summary>
public static class OrderShipping
{
    public const string ToDispatch = "por-despachar";
    public const string ToPrepareForPickup = "por-preparar";
    public const string Sent = "enviada";
    public const string ReadyForPickup = "lista-para-retirar";

    public static string? Of(Order o) =>
        o.FulfilledAtUtc is not null
            ? o.IsPickup ? ReadyForPickup : Sent
            : o.Status == OrderStatus.Paid
                ? o.IsPickup ? ToPrepareForPickup : ToDispatch
                : null;
}

/// <summary>
/// Con qué se cobró una venta. Las manuales guardan "manual-{forma}" como id
/// de pago; el resto pasó por la pasarela (o espera el link de pago).
/// </summary>
public static class OrderPayment
{
    public const string ManualPrefix = "manual-";
    public const string Gateway = "online";
    public const string Cash = "cash";
    public const string Transfer = "transfer";
    public const string CurrentAccount = "cuenta_corriente";

    public static string ManualPaymentId(string method) => ManualPrefix + method;

    public static string? Of(Order o) =>
        o.PaymentId is { Length: > 0 } id
            ? id.StartsWith(ManualPrefix, StringComparison.Ordinal) ? id[ManualPrefix.Length..] : Gateway
            : o.PreferenceId is not null ? Gateway
            // Transferencia o efectivo del checkout, todavía sin pago registrado.
            : o.IsOfflinePayment ? o.PaymentProvider : null;
}

public interface IOrderRepository
{
    Task<Order?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default);

    /// <summary>Busca por Id sin tenant (el webhook no trae tenant; el Id es el external_reference).</summary>
    Task<Order?> GetByIdAnyTenantAsync(Guid id, CancellationToken ct = default);

    /// <summary>La venta de la tienda con ese número (#1042), o null.</summary>
    Task<Order?> GetByNumberAsync(TenantId tenantId, int number, CancellationToken ct = default);

    Task<IReadOnlyList<Order>> ListAsync(TenantId tenantId, int limit, Guid? afterId, CancellationToken ct = default);

    /// <summary>
    /// Página de ventas con su total, buscando y filtrando en la base. Con
    /// miles de ventas, traerlas todas al navegador para buscar en memoria no
    /// es una opción: el filtro tiene que correr donde están los datos.
    /// </summary>
    Task<(IReadOnlyList<Order> Items, int Total)> ListPageAsync(
        TenantId tenantId, int limit, int offset, OrderListFilter filter, CancellationToken ct = default);

    /// <summary>
    /// Todas las ventas que cumplen la búsqueda y el filtro del listado, de a
    /// una y sin cargarlas todas en memoria: para exportarlas a un archivo.
    /// </summary>
    IAsyncEnumerable<Order> StreamAsync(TenantId tenantId, OrderListFilter filter);

    /// <summary>Cuántas ventas cumplen el filtro, sin traerlas (para los contadores del Inicio).</summary>
    Task<int> CountAsync(TenantId tenantId, OrderListFilter filter, CancellationToken ct = default);

    /// <summary>Pedidos de un comprador (por email) — para "Mis pedidos" del storefront.</summary>
    Task<IReadOnlyList<Order>> ListByBuyerEmailAsync(TenantId tenantId, string email, CancellationToken ct = default);

    /// <summary>La venta que nació de esa sesión de checkout, o null (hay como mucho una).</summary>
    Task<Order?> GetByCheckoutSessionAsync(TenantId tenantId, Guid checkoutSessionId, CancellationToken ct = default);

    /// <summary>
    /// Guarda la orden nueva de un checkout, salvo que otra ya haya nacido de
    /// la misma sesión (el índice único la frena aunque los dos pedidos lleguen
    /// en el mismo instante): entonces esta se descarta y se devuelve la que
    /// ya estaba. <c>IsNew</c> dice cuál de las dos es.
    /// </summary>
    Task<(Order Order, bool IsNew)> AddOncePerCheckoutAsync(Order order, CancellationToken ct = default);

    Task AddAsync(Order order, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
