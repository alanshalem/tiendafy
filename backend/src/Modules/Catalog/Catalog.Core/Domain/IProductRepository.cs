using SharedKernel.Common;

namespace Catalog.Core.Domain;

public enum ProductSort
{
    Newest = 0,
    PriceAsc = 1,
    PriceDesc = 2,
    NameAsc = 3,
}

/// <summary>Filtro de búsqueda del catálogo (storefront): texto, categoría, orden, página.</summary>
public sealed record ProductSearchFilter(
    string? Query,
    Guid? CategoryId,
    ProductSort Sort,
    int Page,
    int PageSize);

/// <summary>
/// Puerto de persistencia del catálogo. Filtra por tenant explícitamente
/// (RLS de Postgres se suma como segunda capa cuando aterrice en estas tablas).
/// </summary>
public interface IProductRepository
{
    Task<Product?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default);
    Task<Product?> GetBySlugAsync(TenantId tenantId, string slug, CancellationToken ct = default);
    Task<bool> SlugExistsAsync(TenantId tenantId, string slug, CancellationToken ct = default);
    Task AddAsync(Product product, CancellationToken ct = default);
    Task<IReadOnlyList<Product>> ListAsync(
        TenantId tenantId, ProductStatus? status, int limit, Guid? afterId, CancellationToken ct = default);

    /// <summary>Busca productos ACTIVE con filtros, orden y paginado por página. Devuelve la página + el total.</summary>
    Task<(IReadOnlyList<Product> Items, int Total)> SearchAsync(
        TenantId tenantId, ProductSearchFilter filter, CancellationToken ct = default);
}
