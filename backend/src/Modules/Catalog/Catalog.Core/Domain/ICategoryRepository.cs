using SharedKernel.Common;

namespace Catalog.Core.Domain;

public interface ICategoryRepository
{
    Task<Category?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default);
    Task<bool> PathExistsAsync(TenantId tenantId, string path, CancellationToken ct = default);
    Task AddAsync(Category category, CancellationToken ct = default);
    /// <summary>Árbol completo del tenant, ordenado por path (padres antes que hijos).</summary>
    Task<IReadOnlyList<Category>> ListAsync(TenantId tenantId, CancellationToken ct = default);
}
