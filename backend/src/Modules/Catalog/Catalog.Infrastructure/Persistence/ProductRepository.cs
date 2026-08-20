using System.Linq.Expressions;
using Catalog.Core.Domain;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Catalog.Infrastructure.Persistence;

public sealed class ProductRepository(CatalogDbContext context) : IProductRepository
{
    // Precio mínimo entre las variantes de un producto. Se reutiliza SOLO en los
    // OrderBy/OrderByDescending (aceptan la Expression tal cual → mismo SQL).
    private static readonly Expression<Func<Product, long>> MinVariantPrice =
        p => p.Variants.Min(v => v.Price.AmountInMinorUnits);

    public Task<Product?> GetByIdAsync(TenantId tenantId, Guid id, CancellationToken ct = default) =>
        context.Products.FirstOrDefaultAsync(p => p.TenantId == tenantId && p.Id == id, ct);

    public Task<Product?> GetBySlugAsync(TenantId tenantId, string slug, CancellationToken ct = default)
    {
        var parsed = Slug.Create(slug);
        if (parsed.IsFailure)
            return Task.FromResult<Product?>(null);

        return context.Products.FirstOrDefaultAsync(
            p => p.TenantId == tenantId && p.Slug == parsed.Value, ct);
    }

    public Task<bool> SlugExistsAsync(TenantId tenantId, string slug, CancellationToken ct = default)
    {
        var parsed = Slug.Create(slug);
        if (parsed.IsFailure)
            return Task.FromResult(false);

        return context.Products.AnyAsync(
            p => p.TenantId == tenantId && p.Slug == parsed.Value, ct);
    }

    public async Task AddAsync(Product product, CancellationToken ct = default) =>
        await context.Products.AddAsync(product, ct);

    public async Task<IReadOnlyList<Product>> ListAsync(
        TenantId tenantId, ProductStatus? status, int limit, Guid? afterId, CancellationToken ct = default)
    {
        var query = context.Products.AsNoTracking().Where(p => p.TenantId == tenantId);

        if (status.HasValue)
            query = query.Where(p => p.Status == status.Value);

        query = query.OrderBy(p => p.Id);
        if (afterId.HasValue)
            query = query.Where(p => p.Id.CompareTo(afterId.Value) > 0);

        return await query.Take(limit).ToListAsync(ct);
    }

    public async Task<(IReadOnlyList<Product> Items, int Total)> ListPageAsync(
        TenantId tenantId, AdminProductFilter filter, int limit, int offset,
        CancellationToken ct = default)
    {
        var query = context.Products.Where(p => p.TenantId == tenantId);

        if (filter.Status is { } status) query = query.Where(p => p.Status == status);

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var term = $"%{filter.Search.Trim()}%";
            query = query.Where(p =>
                EF.Functions.ILike(p.Name, term)
                || p.Variants.Any(v => EF.Functions.ILike(v.Sku, term)));
        }

        if (filter.CategoryId is { } categoryId)
            query = await FilterBySubtreeAsync(query, tenantId, categoryId, ct);

        // Costo y precio tachado van serializados en texto: no se pueden sumar
        // ni comparar en SQL, pero "¿está cargado?" es la columna en null.
        if (filter.OnlyWithoutCost) query = query.Where(p => p.Variants.Any(v => v.Cost == null));
        if (filter.OnlyWithoutImage) query = query.Where(p => !p.Images.Any());
        if (filter.HasPromoPrice is { } promo)
        {
            query = promo
                ? query.Where(p => p.Variants.Any(v => v.CompareAtPrice != null))
                : query.Where(p => p.Variants.All(v => v.CompareAtPrice == null));
        }

        // El stock lo resuelve el Api (otro módulo): acá llega ya como la lista
        // de variantes disponibles. Npgsql la manda como array y filtra con ANY.
        if (filter.InStock is { } inStock && filter.VariantIdsInStock is { } withStock)
        {
            query = inStock
                ? query.Where(p => p.Variants.Any(v => withStock.Contains(v.Id)))
                : query.Where(p => !p.Variants.Any(v => withStock.Contains(v.Id)));
        }

        var total = await query.CountAsync(ct);

        query = filter.Sort switch
        {
            AdminProductSort.Oldest => query.OrderBy(p => p.CreatedAtUtc),
            AdminProductSort.NameAsc => query.OrderBy(p => p.Name),
            AdminProductSort.NameDesc => query.OrderByDescending(p => p.Name),
            _ => query.OrderByDescending(p => p.CreatedAtUtc),
        };

        var items = await query.Skip(offset).Take(limit).ToListAsync(ct);
        return (items, total);
    }

    /// <summary>
    /// Filtra por categoría incluyendo sus descendientes: los productos se
    /// asignan a la hoja, así que filtrar por el padre sin bajar el árbol no
    /// devolvería nada. Mismo criterio que la búsqueda del storefront.
    /// </summary>
    private async Task<IQueryable<Product>> FilterBySubtreeAsync(
        IQueryable<Product> query, TenantId tenantId, Guid categoryId, CancellationToken ct)
    {
        var path = await context.Categories.AsNoTracking()
            .Where(c => c.TenantId == tenantId && c.Id == categoryId)
            .Select(c => c.Path).FirstOrDefaultAsync(ct);

        if (path is null)
            return query.Where(p => EF.Property<List<Guid>>(p, "_categoryIds").Contains(categoryId));

        var subtree = await context.Categories.AsNoTracking()
            .Where(c => c.TenantId == tenantId && (c.Path == path || c.Path.StartsWith(path + "/")))
            .Select(c => c.Id).ToListAsync(ct);

        return query.Where(p => EF.Property<List<Guid>>(p, "_categoryIds").Any(id => subtree.Contains(id)));
    }

    public async Task<(IReadOnlyList<Product> Items, int Total, ProductFacets Facets)> SearchAsync(
        TenantId tenantId, ProductSearchFilter filter, CancellationToken ct = default)
    {
        // Base = tenant + ACTIVE + texto + categoría. Las facetas se calculan sobre
        // esta base (no sobre precio/marca/opciones) para que las opciones no se
        // "vacíen" a medida que el usuario filtra.
        var baseQuery = context.Products.AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.Status == ProductStatus.Active);

        if (!string.IsNullOrWhiteSpace(filter.Query))
            baseQuery = baseQuery.Where(p => EF.Functions.ILike(p.Name, $"%{filter.Query.Trim()}%"));

        if (filter.CategoryId is { } categoryId)
        {
            // Filtro por subárbol: una categoría padre trae los productos de sus
            // descendientes (los productos se asignan a la hoja). Resolvemos la
            // categoría + todas las que cuelgan de su path.
            var selectedPath = await context.Categories.AsNoTracking()
                .Where(c => c.TenantId == tenantId && c.Id == categoryId)
                .Select(c => c.Path).FirstOrDefaultAsync(ct);

            if (selectedPath is not null)
            {
                var subtreeIds = await context.Categories.AsNoTracking()
                    .Where(c => c.TenantId == tenantId && (c.Path == selectedPath || c.Path.StartsWith(selectedPath + "/")))
                    .Select(c => c.Id).ToListAsync(ct);
                baseQuery = baseQuery.Where(p => EF.Property<List<Guid>>(p, "_categoryIds").Any(id => subtreeIds.Contains(id)));
            }
            else
            {
                baseQuery = baseQuery.Where(p => EF.Property<List<Guid>>(p, "_categoryIds").Contains(categoryId));
            }
        }

        var facets = await BuildFacetsAsync(baseQuery, ct);

        // Filtros que SÍ recortan el set mostrado.
        var query = baseQuery;

        if (filter.PriceMin is { } min)
            query = query.Where(p => p.Variants.Min(v => v.Price.AmountInMinorUnits) >= min);
        if (filter.PriceMax is { } max)
            query = query.Where(p => p.Variants.Min(v => v.Price.AmountInMinorUnits) <= max);
        if (!string.IsNullOrWhiteSpace(filter.Brand))
            query = query.Where(p => p.Brand == filter.Brand);
        if (filter.OptionValues is { Count: > 0 })
            foreach (var val in filter.OptionValues)
                query = query.Where(p => p.Options.Any(o => EF.Property<List<string>>(o, "_values").Contains(val)));

        var total = await query.CountAsync(ct);

        // Orden por precio = mínimo precio entre las variantes (subconsulta correlacionada).
        query = filter.Sort switch
        {
            ProductSort.PriceAsc => query.OrderBy(MinVariantPrice),
            ProductSort.PriceDesc => query.OrderByDescending(MinVariantPrice),
            ProductSort.NameAsc => query.OrderBy(p => p.Name),
            _ => query.OrderByDescending(p => p.CreatedAtUtc).ThenBy(p => p.Id),
        };

        var items = await query
            .Skip((filter.Page - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToListAsync(ct);

        return (items, total, facets);
    }

    /// <summary>Marcas, opciones (nombre→valores) y rango de precio disponibles en el set base.</summary>
    private static async Task<ProductFacets> BuildFacetsAsync(IQueryable<Product> baseQuery, CancellationToken ct)
    {
        var brands = await baseQuery
            .Where(p => p.Brand != null)
            .Select(p => p.Brand!)
            .Distinct().OrderBy(b => b).Take(300).ToListAsync(ct);

        // Rango de precio = min/max del precio mínimo por producto.
        long? priceMin = null, priceMax = null;
        var withVariants = baseQuery.Where(p => p.Variants.Any());
        if (await withVariants.AnyAsync(ct))
        {
            var mins = withVariants.Select(p => p.Variants.Min(v => v.Price.AmountInMinorUnits));
            priceMin = await mins.MinAsync(ct);
            priceMax = await mins.MaxAsync(ct);
        }

        // Opciones: traemos (nombre, valores) de los productos del set y agrupamos en memoria.
        // Cada producto tiene ≤3 opciones con pocos valores → volumen chico aunque haya muchos productos.
        var rawOptions = await baseQuery
            .SelectMany(p => p.Options)
            .Select(o => new { o.Name, Values = EF.Property<List<string>>(o, "_values") })
            .ToListAsync(ct);

        var options = rawOptions
            .GroupBy(o => o.Name, StringComparer.OrdinalIgnoreCase)
            .Select(g => new OptionFacet(
                g.Key,
                g.SelectMany(o => o.Values).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(v => v).Take(50).ToList()))
            .OrderBy(o => o.Name)
            .Take(10)
            .ToList();

        return new ProductFacets(brands, options, priceMin, priceMax);
    }
}
