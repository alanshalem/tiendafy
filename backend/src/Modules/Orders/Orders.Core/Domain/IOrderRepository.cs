using SharedKernel.Common;

namespace Orders.Core.Domain;

public interface IOrderRepository
{
    Task<Order?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default);

    /// <summary>Busca por Id sin tenant (el webhook no trae tenant; el Id es el external_reference).</summary>
    Task<Order?> GetByIdAnyTenantAsync(Guid id, CancellationToken ct = default);

    Task<IReadOnlyList<Order>> ListAsync(TenantId tenantId, int limit, Guid? afterId, CancellationToken ct = default);

    /// <summary>
    /// Página de ventas con su total, buscando y filtrando en la base. Con
    /// miles de ventas, traerlas todas al navegador para buscar en memoria no
    /// es una opción: el filtro tiene que correr donde están los datos.
    /// </summary>
    Task<(IReadOnlyList<Order> Items, int Total)> ListPageAsync(
        TenantId tenantId, int limit, int offset, string? search, string? status, CancellationToken ct = default);

    /// <summary>
    /// Todas las ventas que cumplen la búsqueda y el filtro del listado, de a
    /// una y sin cargarlas todas en memoria: para exportarlas a un archivo.
    /// </summary>
    IAsyncEnumerable<Order> StreamAsync(TenantId tenantId, string? search, string? status);

    /// <summary>Pedidos de un comprador (por email) — para "Mis pedidos" del storefront.</summary>
    Task<IReadOnlyList<Order>> ListByBuyerEmailAsync(TenantId tenantId, string email, CancellationToken ct = default);

    Task AddAsync(Order order, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
