using SharedKernel.Common;

namespace Checkout.Core.Domain;

public interface ICheckoutRepository
{
    Task<CheckoutSession?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default);
    Task AddAsync(CheckoutSession session, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
