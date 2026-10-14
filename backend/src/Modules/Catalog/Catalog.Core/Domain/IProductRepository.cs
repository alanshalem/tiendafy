using SharedKernel.Common;

namespace Catalog.Core.Domain;

public enum ProductSort
{
    Newest = 0,
    PriceAsc = 1,
    PriceDesc = 2,
    NameAsc = 3,
    /// <summary>
    /// Lo más vendido primero (en el orden de <see cref="ProductSearchFilter.Ranking"/>),
    /// después el resto, de lo más nuevo a lo más viejo. El ranking lo arma el Api:
    /// cruza ventas y catálogo.
    /// </summary>
    BestSellers = 4,
}

/// <summary>Filtro de búsqueda del catálogo (storefront): texto, categoría, orden, página + filtros de precio/marca/opciones.</summary>
/// <param name="OnSale">Solo los que tienen alguna variante con precio tachado mayor al de venta.</param>
/// <param name="Ranking">Para <see cref="ProductSort.BestSellers"/>: ids del más vendido al menos.</param>
public sealed record ProductSearchFilter(
    string? Query,
    Guid? CategoryId,
    ProductSort Sort,
    int Page,
    int PageSize,
    long? PriceMin = null,          // en unidades menores (centavos), como se guarda
    long? PriceMax = null,
    string? Brand = null,
    IReadOnlyList<string>? OptionValues = null,    // valores de opción seleccionados (Color/Talle/…); AND entre ellos
    IReadOnlyList<SpecFilter>? Specs = null,       // campos de ficha técnica; OR adentro de cada campo, AND entre campos
    bool OnSale = false,
    IReadOnlyList<Guid>? Ranking = null);

/// <summary>
/// Un campo de ficha técnica con los valores elegidos. Dentro de un campo la
/// relación es O —"Honda o Yamaha"—; entre campos es Y. Es lo que espera
/// cualquiera que haya usado un filtro de catálogo.
/// </summary>
public sealed record SpecFilter(Guid DefinitionId, IReadOnlyList<string> Values);

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
/// <param name="MatchingVariantIds">
/// Variantes que cumplen un filtro que el catálogo no sabe evaluar (hoy, el
/// stock: vive en otro módulo). Las resuelve el Api y las manda ya calculadas.
/// </param>
/// <param name="HasMatchingVariant">
/// true = productos con alguna de esas variantes; false = productos sin
/// ninguna; null = sin filtro. Sirve tanto para "agotados" (ninguna con stock)
/// como para "por agotarse" (alguna con poco).
/// </param>
public sealed record AdminProductFilter(
    ProductStatus? Status = null,
    string? Search = null,
    Guid? CategoryId = null,
    bool OnlyWithoutCost = false,
    bool OnlyWithoutImage = false,
    bool? HasPromoPrice = null,
    IReadOnlyCollection<Guid>? MatchingVariantIds = null,
    bool? HasMatchingVariant = null,
    AdminProductSort Sort = AdminProductSort.Newest);

/// <summary>
/// De dónde sale la lista de una sección de productos de la portada. "Más
/// vendidos" no está: cruza ventas y catálogo, así que la arma el Api y le
/// pide al catálogo los ids ya rankeados como <see cref="Manual"/>.
/// </summary>
public enum SectionProductKind
{
    /// <summary>Los ids que eligió el comercio, en su orden.</summary>
    Manual = 0,
    Category = 1,
    Brand = 2,
    /// <summary>Lo último que se cargó (fecha de alta, más nuevo primero).</summary>
    Newest = 3,
    /// <summary>Con alguna variante cuyo precio tachado supera al de venta.</summary>
    OnSale = 4,
}

/// <summary>
/// Pedido de productos para una sección del storefront. Siempre solo ACTIVE y
/// con al menos una variante: lo demás no se puede vender, y ocupaba lugares
/// del tope de la sección.
/// </summary>
/// <param name="Ids">Para <see cref="SectionProductKind.Manual"/>: el orden pedido se respeta.</param>
/// <param name="IncludeChildren">Para categoría: también los productos de sus subcategorías.</param>
/// <param name="Sort">Orden para categoría, marca y ofertas; las demás tienen el suyo propio.</param>
public sealed record SectionProductQuery(
    SectionProductKind Kind,
    int Limit,
    IReadOnlyList<Guid>? Ids = null,
    Guid? CategoryId = null,
    bool IncludeChildren = true,
    string? Brand = null,
    ProductSort Sort = ProductSort.Newest);

/// <summary>Un filtro de opción con sus valores disponibles (ej: "Color" → ["Rojo","Azul"]).</summary>
public sealed record OptionFacet(string Name, IReadOnlyList<string> Values);

/// <summary>Un campo de ficha técnica con los valores que existen en el set actual.</summary>
public sealed record SpecFacet(Guid DefinitionId, string Key, string Name, string? Unit, IReadOnlyList<string> Values);

/// <summary>Valores disponibles para armar la barra de filtros del storefront (marcas, opciones, rango de precio, ficha técnica).</summary>
/// <param name="OnSale">
/// Cuántos productos de la búsqueda están en oferta (sin contar el filtro de
/// ofertas): la tienda muestra "Solo ofertas" únicamente si hay alguno.
/// </param>
public sealed record ProductFacets(
    IReadOnlyList<string> Brands,
    IReadOnlyList<OptionFacet> Options,
    long? PriceMin,
    long? PriceMax,
    IReadOnlyList<SpecFacet> Specs,
    int OnSale = 0);

/// <summary>
/// Puerto de persistencia del catálogo. Filtra por tenant explícitamente
/// (RLS de Postgres se suma como segunda capa cuando aterrice en estas tablas).
/// </summary>
public interface IProductRepository
{
    Task<Product?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default);

    /// <summary>
    /// Varios productos por id, en una sola consulta y en el orden pedido. Los
    /// que no existen —o son de otra tienda— no vuelven. Solo lectura.
    /// </summary>
    Task<IReadOnlyList<Product>> ListByIdsAsync(TenantId tenantId, IReadOnlyList<Guid> ids, CancellationToken ct = default);
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

    /// <summary>
    /// Los productos de una sección de la portada (destacados, ofertas, una
    /// categoría…): solo publicados, hasta <see cref="SectionProductQuery.Limit"/>.
    /// </summary>
    Task<IReadOnlyList<Product>> ListForSectionAsync(
        TenantId tenantId, SectionProductQuery query, CancellationToken ct = default);

    /// <summary>
    /// A qué producto PUBLICADO pertenece cada variante. Las de productos en
    /// borrador o archivados, o de otra tienda, no vuelven. Lo usa "más
    /// vendidos", que suma ventas por variante y muestra productos.
    /// </summary>
    Task<IReadOnlyDictionary<Guid, Guid>> ActiveProductIdsByVariantAsync(
        TenantId tenantId, IReadOnlyCollection<Guid> variantIds, CancellationToken ct = default);
}
