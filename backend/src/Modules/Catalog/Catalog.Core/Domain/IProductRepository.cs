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

/// <summary>Orden del listado del panel (el del storefront es <see cref="ProductSort"/>).</summary>
public enum AdminProductSort
{
    Newest = 0,
    Oldest = 1,
    NameAsc = 2,
    NameDesc = 3,
}

/// <summary>
/// Filtro del listado de productos DEL PANEL. Distinto del storefront: acá se
/// ven todos los estados y se filtra por lo que falta completar.
/// </summary>
/// <param name="OnlyWithoutCost">
/// Solo productos con alguna variante sin costo cargado. El costo va serializado
/// en texto y no se puede sumar en SQL, pero "¿está cargado?" es la columna en
/// null y eso sí filtra la base.
/// </param>
/// <param name="HasPromoPrice">true = con precio tachado; false = sin promoción.</param>
/// <param name="VariantIdsInStock">
/// Variantes con disponible &gt; 0. Las resuelve el Api, no el repositorio:
/// el stock vive en otro módulo y el catálogo no lo conoce. Sin esta lista,
/// <paramref name="InStock"/> se ignora.
/// </param>
/// <param name="InStock">true = con stock; false = agotados; null = sin filtro.</param>
public sealed record AdminProductFilter(
    ProductStatus? Status = null,
    string? Search = null,
    Guid? CategoryId = null,
    bool OnlyWithoutCost = false,
    bool OnlyWithoutImage = false,
    bool? HasPromoPrice = null,
    IReadOnlyCollection<Guid>? VariantIdsInStock = null,
    bool? InStock = null,
    AdminProductSort Sort = AdminProductSort.Newest);

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
    Task<(IReadOnlyList<Product> Items, int Total)> ListPageAsync(
        TenantId tenantId, AdminProductFilter filter, int limit, int offset,
        CancellationToken ct = default);

    /// <summary>Busca productos ACTIVE con filtros, orden y paginado. Devuelve la página, el total y las facetas.</summary>
    Task<(IReadOnlyList<Product> Items, int Total, ProductFacets Facets)> SearchAsync(
        TenantId tenantId, ProductSearchFilter filter, CancellationToken ct = default);
}
