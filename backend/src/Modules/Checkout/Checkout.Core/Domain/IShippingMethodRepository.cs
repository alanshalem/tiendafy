using SharedKernel.Common;

namespace Checkout.Core.Domain;

public interface IShippingMethodRepository
{
    Task<ShippingMethod?> GetActiveByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default);
    Task<ShippingMethod?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<ShippingMethod>> ListAsync(TenantId tenantId, bool onlyActive, CancellationToken ct = default);
    Task AddAsync(ShippingMethod method, CancellationToken ct = default);
    Task RemoveAsync(ShippingMethod method, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
