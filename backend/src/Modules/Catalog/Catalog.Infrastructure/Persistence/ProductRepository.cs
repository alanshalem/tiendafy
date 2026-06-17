using Catalog.Core.Domain;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Catalog.Infrastructure.Persistence;

public sealed class ProductRepository(CatalogDbContext context) : IProductRepository
{
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

    public async Task<(IReadOnlyList<Product> Items, int Total)> SearchAsync(
        TenantId tenantId, ProductSearchFilter filter, CancellationToken ct = default)
    {
        var query = context.Products.AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.Status == ProductStatus.Active);

        if (!string.IsNullOrWhiteSpace(filter.Query))
            query = query.Where(p => EF.Functions.ILike(p.Name, $"%{filter.Query.Trim()}%"));

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
                query = query.Where(p => EF.Property<List<Guid>>(p, "_categoryIds").Any(id => subtreeIds.Contains(id)));
            }
            else
            {
                query = query.Where(p => EF.Property<List<Guid>>(p, "_categoryIds").Contains(categoryId));
            }
        }

        var total = await query.CountAsync(ct);

        // Orden por precio = mínimo precio entre las variantes (subconsulta correlacionada).
        query = filter.Sort switch
        {
            ProductSort.PriceAsc => query.OrderBy(p => p.Variants.Min(v => v.Price.AmountInMinorUnits)),
            ProductSort.PriceDesc => query.OrderByDescending(p => p.Variants.Min(v => v.Price.AmountInMinorUnits)),
            ProductSort.NameAsc => query.OrderBy(p => p.Name),
            _ => query.OrderByDescending(p => p.CreatedAtUtc).ThenBy(p => p.Id),
        };

        var items = await query
            .Skip((filter.Page - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToListAsync(ct);

        return (items, total);
    }
}
