using Ai.Infrastructure;
using Catalog.Core.Domain;
using Catalog.Infrastructure.Persistence;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Api.Ai.Catalog;

/// <summary>
/// Los criterios del filtro. Las tres casillas se suman (alcanza con una); la categoría acota (incluye sus subcategorías).
/// </summary>
public sealed record AiCatalogFilter(Guid? CategoryId, bool MissingDescription, bool ShortDescription, bool MissingMeliData);

/// <summary>Exactamente uno de los dos: productos elegidos a mano o un filtro.</summary>
public sealed record AiCatalogSelectionRequest(Guid[]? ProductIds, AiCatalogFilter? Filter);

public sealed record AiCatalogSelected(IReadOnlyList<Guid> ProductIds, int Matched, bool Capped);

/// <summary>Qué productos entran en un trabajo de fichas: hasta 500, siempre de esta tienda.</summary>
public sealed class AiCatalogSelection(CatalogDbContext catalog, MeliDbContext meli)
{
    public const int ShortDescriptionChars = 300;

    private static Error TooMany(int max) => Error.Validation("AiCatalog.TooMany", $"Elegí hasta {max} productos.");

    private static readonly Error Empty = Error.Validation("AiCatalog.Empty", "No hay productos para mejorar con esa elección.");

    private static readonly Error BadSelection = Error.Validation("AiCatalog.BadSelection", "Elegí productos o armá un filtro, pero no las dos cosas.");

    private static readonly Error EmptyFilter = Error.Validation("AiCatalog.EmptyFilter", "Marcá al menos una condición del filtro o elegí una categoría.");

    /// <param name="max">Solo lo baja un test: en producción es el tope de un trabajo.</param>
    public async Task<Result<AiCatalogSelected>> ResolveAsync(
        TenantId tenantId, AiCatalogSelectionRequest request, CancellationToken ct, int max = AiCatalogJob.MaxItems)
    {
        if ((request.ProductIds is null) == (request.Filter is null))
            return Result.Failure<AiCatalogSelected>(BadSelection);

        return request.ProductIds is { } ids
            ? await ByIdsAsync(tenantId, ids, max, ct)
            : await ByFilterAsync(tenantId, request.Filter!, max, ct);
    }

    private async Task<Result<AiCatalogSelected>> ByIdsAsync(TenantId tenantId, Guid[] requested, int max, CancellationToken ct)
    {
        var wanted = requested.Where(id => id != Guid.Empty).Distinct().ToList();
        if (wanted.Count > max) return Result.Failure<AiCatalogSelected>(TooMany(max));

        // Los ids de otra tienda o inexistentes se descartan en silencio: cuentan como no elegidos.
        var found = await catalog.Products.AsNoTracking()
            .Where(p => p.TenantId == tenantId && wanted.Contains(p.Id))
            .OrderBy(p => p.Name).ThenBy(p => p.Id)
            .Select(p => p.Id)
            .ToListAsync(ct);
        return found.Count == 0
            ? Result.Failure<AiCatalogSelected>(Empty)
            : new AiCatalogSelected(found, found.Count, Capped: false);
    }

    private async Task<Result<AiCatalogSelected>> ByFilterAsync(TenantId tenantId, AiCatalogFilter filter, int max, CancellationToken ct)
    {
        var anyCondition = filter.MissingDescription || filter.ShortDescription || filter.MissingMeliData;
        if (!anyCondition && filter.CategoryId is null) return Result.Failure<AiCatalogSelected>(EmptyFilter);

        var query = catalog.Products.AsNoTracking().Where(p => p.TenantId == tenantId);

        if (filter.CategoryId is { } categoryId)
            query = await InSubtreeAsync(query, tenantId, categoryId, ct);

        if (anyCondition)
        {
            // "Sin datos de ML": ni categoría ni atributos guardados. El catálogo y Mercado Libre son módulos distintos,
            // así que primero se resuelven los ids de ML y después se filtra el catálogo (como el filtro de stock).
            var withMeliData = filter.MissingMeliData ? await ProductsWithMeliDataAsync(tenantId, ct) : [];
            var missing = filter.MissingDescription;
            var shortOne = filter.ShortDescription;
            var noMeli = filter.MissingMeliData;
            query = query.Where(p =>
                (missing && (p.Description == null || p.Description == ""))
                || (shortOne && (p.Description == null || p.Description.Length < ShortDescriptionChars))
                || (noMeli && !withMeliData.Contains(p.Id)));
        }

        var matched = await query.CountAsync(ct);
        if (matched == 0) return Result.Failure<AiCatalogSelected>(Empty);

        var ids = await query.OrderBy(p => p.Name).ThenBy(p => p.Id).Select(p => p.Id).Take(max).ToListAsync(ct);
        return new AiCatalogSelected(ids, matched, Capped: matched > max);
    }

    private async Task<List<Guid>> ProductsWithMeliDataAsync(TenantId tenantId, CancellationToken ct)
    {
        var tenant = tenantId.Value;
        var withCategory = await meli.ProductCategories.AsNoTracking()
            .Where(c => c.TenantId == tenant).Select(c => c.ProductId).ToListAsync(ct);
        var withAttributes = await meli.ProductAttributes.AsNoTracking()
            .Where(a => a.TenantId == tenant).Select(a => a.ProductId).Distinct().ToListAsync(ct);
        return [.. withCategory.Union(withAttributes)];
    }

    /// <summary>
    /// La categoría y las que cuelgan de ella: los productos se asignan a la hoja, así que filtrar por el padre sin bajar
    /// el árbol no devolvería nada (mismo criterio que el listado del panel).
    /// </summary>
    private async Task<IQueryable<Product>> InSubtreeAsync(
        IQueryable<Product> query, TenantId tenantId, Guid categoryId, CancellationToken ct)
    {
        var path = await catalog.Categories.AsNoTracking()
            .Where(c => c.TenantId == tenantId && c.Id == categoryId)
            .Select(c => c.Path).FirstOrDefaultAsync(ct);
        if (path is null)
            return query.Where(p => EF.Property<List<Guid>>(p, "_categoryIds").Contains(categoryId));

        var subtree = await catalog.Categories.AsNoTracking()
            .Where(c => c.TenantId == tenantId && (c.Path == path || c.Path.StartsWith(path + "/")))
            .Select(c => c.Id).ToListAsync(ct);
        return query.Where(p => EF.Property<List<Guid>>(p, "_categoryIds").Any(id => subtree.Contains(id)));
    }
}
