using SharedKernel.Common;

namespace Catalog.Core.Domain;

public enum ProductSort
{
    Newest = 0,
    PriceAsc = 1,
    PriceDesc = 2,
    NameAsc = 3,
}

/// <summary>Filtro de búsqueda del catálogo (storefront): texto, categoría, orden, página + filtros de precio/marca/opciones.</summary>
public sealed record ProductSearchFilter(
    string? Query,
    Guid? CategoryId,
    ProductSort Sort,
    int Page,
    int PageSize,
    long? PriceMin = null,          // en unidades menores (centavos), como se guarda
    long? PriceMax = null,
    string? Brand = null,
    IReadOnlyList<string>? OptionValues = null);   // valores de opción seleccionados (Color/Talle/…); AND entre ellos

/// <summary>Un filtro de opción con sus valores disponibles (ej: "Color" → ["Rojo","Azul"]).</summary>
public sealed record OptionFacet(string Name, IReadOnlyList<string> Values);

/// <summary>Valores disponibles para armar la barra de filtros del storefront (marcas, opciones, rango de precio).</summary>
public sealed record ProductFacets(
    IReadOnlyList<string> Brands,
    IReadOnlyList<OptionFacet> Options,
    long? PriceMin,
    long? PriceMax);

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

    /// <summary>
    /// Página del catálogo para el panel: cualquier estado, búsqueda por nombre
    /// o SKU y total. Las pantallas de costos, inventario y los buscadores de
    /// variantes traían el catálogo COMPLETO para filtrar en el navegador.
    /// </summary>
    /// <param name="onlyWithoutCost">
    /// Solo productos con alguna variante sin costo cargado. Es el filtro que
    /// abre la métrica "sin costo cargado": llevarla a una pantalla que igual
    /// muestra el catálogo entero deja el trabajo de encontrarlos sin hacer.
    /// </param>
    Task<(IReadOnlyList<Product> Items, int Total)> ListPageAsync(
        TenantId tenantId, ProductStatus? status, string? search, int limit, int offset,
        bool onlyWithoutCost = false, CancellationToken ct = default);

    /// <summary>Busca productos ACTIVE con filtros, orden y paginado. Devuelve la página, el total y las facetas.</summary>
    Task<(IReadOnlyList<Product> Items, int Total, ProductFacets Facets)> SearchAsync(
        TenantId tenantId, ProductSearchFilter filter, CancellationToken ct = default);
}
