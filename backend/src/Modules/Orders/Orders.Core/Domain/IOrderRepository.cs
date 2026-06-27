using SharedKernel.Common;

namespace Orders.Core.Domain;

public interface IOrderRepository
{
    Task<Order?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default);

    /// <summary>Busca por Id sin tenant (el webhook no trae tenant; el Id es el external_reference).</summary>
    Task<Order?> GetByIdAnyTenantAsync(Guid id, CancellationToken ct = default);

    Task<IReadOnlyList<Order>> ListAsync(TenantId tenantId, int limit, Guid? afterId, CancellationToken ct = default);

    /// <summary>Pedidos de un comprador (por email) — para "Mis pedidos" del storefront.</summary>
    Task<IReadOnlyList<Order>> ListByBuyerEmailAsync(TenantId tenantId, string email, CancellationToken ct = default);

    Task AddAsync(Order order, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
