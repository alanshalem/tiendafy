using SharedKernel.Common;

namespace Catalog.Core.Domain;

public interface ICategoryRepository
{
    Task<Category?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default);
    Task<bool> PathExistsAsync(TenantId tenantId, string path, CancellationToken ct = default);
    Task AddAsync(Category category, CancellationToken ct = default);
    /// <summary>
    /// Árbol completo del tenant en el orden del comercio: cada padre seguido
    /// de sus hijas, las hermanas por posición (ver Category.InTreeOrder).
    /// </summary>
    Task<IReadOnlyList<Category>> ListAsync(TenantId tenantId, CancellationToken ct = default);

    /// <summary>La posición de una categoría nueva bajo ese padre: al final de sus hermanas.</summary>
    Task<int> NextPositionAsync(TenantId tenantId, Guid? parentId, CancellationToken ct = default);
}
