namespace Checkout.Core.Domain;

public interface ICorreoArgentinoConfigRepository
{
    Task<CorreoArgentinoConfig?> GetAsync(Guid tenantId, CancellationToken ct = default);
    Task AddAsync(CorreoArgentinoConfig config, CancellationToken ct = default);
    Task RemoveAsync(CorreoArgentinoConfig config, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
