using SharedKernel.Common;

namespace Payments.Core.Domain;

public interface IMercadoPagoConnectionRepository
{
    Task<MercadoPagoConnection?> GetByTenantAsync(TenantId tenantId, CancellationToken ct = default);
    Task AddAsync(MercadoPagoConnection connection, CancellationToken ct = default);
    Task RemoveAsync(MercadoPagoConnection connection, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
