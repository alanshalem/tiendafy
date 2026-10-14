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

    public async Task<IReadOnlyList<Product>> ListByIdsAsync(
        TenantId tenantId, IReadOnlyList<Guid> ids, CancellationToken ct = default)
    {
        if (ids.Count == 0) return [];

        var found = await context.Products.AsNoTracking()
            .Where(p => p.TenantId == tenantId && ids.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, ct);

        // La base devuelve en cualquier orden; quien pidió los ids eligió uno.
        return [.. ids.Where(found.ContainsKey).Select(id => found[id])];
    }

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

        query = ProductTextSearch.Matching(query, filter.Search, includeSku: true);

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
        // de variantes que cumplen. Npgsql la manda como array y filtra con ANY.
        if (filter.HasMatchingVariant is { } wanted && filter.MatchingVariantIds is { } ids)
        {
            query = wanted
                ? query.Where(p => p.Variants.Any(v => ids.Contains(v.Id)))
                : query.Where(p => !p.Variants.Any(v => ids.Contains(v.Id)));
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

        var synonyms = await SearchRepository.LoadSynonymsAsync(context, tenantId, ct);
        baseQuery = ProductTextSearch.Matching(baseQuery, filter.Query, includeSku: false, synonyms.Groups);

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

        // Stock: sin la lista de variantes con stock no se sabe nada, y no se
        // mueve ni se filtra nada (es lo que pasaba antes con todo).
        var stocked = filter.InStockVariantIds is { } known ? (known as List<Guid> ?? [.. known]) : null;
        var onlyInStock = filter.OnlyInStock && stocked is not null;

        // Ofertas y stock acotan la base, como la categoría (las marcas y los
        // precios del costado son los de lo que se ve). Cada conteo es SIN su
        // propio filtro y CON el otro: "Solo ofertas (3)" con el stock ya
        // filtrado dice cuántas ofertas con stock hay.
        var onSaleIds = await OnSaleIdsAsync(onlyInStock ? baseQuery.Where(InStock(stocked!)) : baseQuery, ct);
        if (filter.OnSale)
            baseQuery = baseQuery.Where(p => onSaleIds.Contains(p.Id));

        var inStockCount = stocked is not null ? await baseQuery.CountAsync(InStock(stocked), ct) : 0;
        if (onlyInStock)
            baseQuery = baseQuery.Where(InStock(stocked!));

        var built = await BuildFacetsAsync(context, tenantId, baseQuery, ct);
        var facets = built with { OnSale = onSaleIds.Count, InStock = inStockCount };

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

        // Ficha técnica: un Where por campo, con los valores de ese campo en un
        // Contains. Así "Honda o Yamaha" suma resultados y "Honda + disco de
        // freno" los recorta, que es como se espera que funcione un filtro.
        if (filter.Specs is { Count: > 0 })
        {
            foreach (var spec in filter.Specs.Where(s => s.Values.Count > 0))
            {
                var definitionId = spec.DefinitionId;
                var values = spec.Values;
                query = query.Where(p => p.Specs.Any(x => x.DefinitionId == definitionId && values.Contains(x.Value)));
            }
        }

        var total = await query.CountAsync(ct);
        var skip = (filter.Page - 1) * filter.PageSize;

        // Lo agotado, al final y en el mismo orden: primero la página dentro
        // de lo que tiene stock, y si no alcanza, se completa con lo agotado
        // desde donde corresponde. Dos tramos en vez de un ORDER BY por stock
        // porque "Más vendidos" ordena en memoria (ver BestSellersSliceAsync).
        // Antes, con "Más nuevos", las 24 cards de la página 1 decían "Sin
        // stock" teniendo 297 de 424 productos para vender.
        if (stocked is not null && !onlyInStock)
        {
            var withStock = query.Where(InStock(stocked));
            var withStockTotal = await withStock.CountAsync(ct);
            if (withStockTotal < total)
            {
                var head = skip < withStockTotal
                    ? await SliceAsync(withStock, filter, skip, filter.PageSize, ct)
                    : [];
                var restTake = filter.PageSize - head.Count;
                var tail = restTake > 0
                    ? await SliceAsync(query.Where(OutOfStock(stocked)), filter, Math.Max(0, skip - withStockTotal), restTake, ct)
                    : [];
                return ([.. head, .. tail], total, facets);
            }
        }

        return (await SliceAsync(query, filter, skip, filter.PageSize, ct), total, facets);
    }

    /// <summary>Con alguna variante en la lista de las que tienen stock.</summary>
    private static Expression<Func<Product, bool>> InStock(List<Guid> stocked) =>
        p => p.Variants.Any(v => stocked.Contains(v.Id));

    /// <summary>
    /// Ninguna variante con stock. Incluye a los productos sin variantes: no
    /// se pueden comprar, así que van con lo agotado.
    /// </summary>
    private static Expression<Func<Product, bool>> OutOfStock(List<Guid> stocked) =>
        p => !p.Variants.Any(v => stocked.Contains(v.Id));

    /// <summary>Un tramo de <paramref name="query"/> en el orden pedido.</summary>
    private static async Task<IReadOnlyList<Product>> SliceAsync(
        IQueryable<Product> query, ProductSearchFilter filter, int skip, int take, CancellationToken ct)
    {
        if (filter.Sort == ProductSort.BestSellers && filter.Ranking is { Count: > 0 } ranking)
            return await BestSellersSliceAsync(query, ranking, skip, take, ct);

        // Orden por precio = mínimo precio entre las variantes (subconsulta
        // correlacionada). El id desempata: sin él, dos productos del mismo
        // precio podían aparecer en dos páginas, o en ninguna.
        query = filter.Sort switch
        {
            ProductSort.PriceAsc => query.OrderBy(MinVariantPrice).ThenBy(p => p.Id),
            ProductSort.PriceDesc => query.OrderByDescending(MinVariantPrice).ThenBy(p => p.Id),
            ProductSort.NameAsc => query.OrderBy(p => p.Name).ThenBy(p => p.Id),
            _ => query.OrderByDescending(p => p.CreatedAtUtc).ThenBy(p => p.Id),
        };

        return await query.Skip(skip).Take(take).ToListAsync(ct);
    }

    /// <summary>
    /// Un tramo con lo más vendido primero, en el orden del ranking, y
    /// después el resto de lo más nuevo a lo más viejo. El orden por posición
    /// en una lista no se traduce a SQL: de lo rankeado se traen solo los ids
    /// que pasan los filtros (el ranking tiene un tope), se ordenan acá, y el
    /// tramo se completa con una consulta del resto si hace falta.
    /// </summary>
    private static async Task<IReadOnlyList<Product>> BestSellersSliceAsync(
        IQueryable<Product> query, IReadOnlyList<Guid> ranking, int skip, int take, CancellationToken ct)
    {
        var position = new Dictionary<Guid, int>();
        foreach (var id in ranking) position.TryAdd(id, position.Count);
        var rankedIds = position.Keys.ToList();

        var matching = await query.Where(p => rankedIds.Contains(p.Id)).Select(p => p.Id).ToListAsync(ct);
        var ordered = matching.OrderBy(id => position[id]).ToList();

        var headIds = ordered.Skip(skip).Take(take).ToList();
        var head = headIds.Count > 0
            ? (await query.Where(p => headIds.Contains(p.Id)).ToListAsync(ct)).ToDictionary(p => p.Id)
            : [];

        var restTake = take - headIds.Count;
        var tail = restTake > 0
            ? await query.Where(p => !rankedIds.Contains(p.Id))
                .OrderByDescending(p => p.CreatedAtUtc).ThenBy(p => p.Id)
                .Skip(Math.Max(0, skip - ordered.Count)).Take(restTake)
                .ToListAsync(ct)
            : [];

        return [.. headIds.Where(head.ContainsKey).Select(id => head[id]), .. tail];
    }

    public async Task<ProductSuggestions> SuggestAsync(
        TenantId tenantId, string text, IReadOnlyCollection<Guid>? inStockVariantIds, int limit,
        CancellationToken ct = default)
    {
        var synonyms = await SearchRepository.LoadSynonymsAsync(context, tenantId, ct);
        var matching = ProductTextSearch.Matching(
            context.Products.AsNoTracking()
                .Where(p => p.TenantId == tenantId && p.Status == ProductStatus.Active && p.Variants.Any()),
            text, includeSku: false, synonyms.Groups);

        var total = await matching.CountAsync(ct);

        // Primero lo que se puede comprar, después lo que empieza con lo que se
        // escribió ("pesa" → "Pesa rusa 8 kg" antes que "Set de pesas"), y
        // después lo más nuevo. Sin la lista de stock, nadie sube por stock.
        var stocked = inStockVariantIds?.ToList() ?? [];
        var prefix = $"{text.Trim()}%";
        var products = total == 0
            ? []
            : await matching
                .OrderByDescending(p => p.Variants.Any(v => stocked.Contains(v.Id)))
                .ThenByDescending(p => EF.Functions.ILike(EF.Functions.Unaccent(p.Name), EF.Functions.Unaccent(prefix)))
                .ThenByDescending(p => p.CreatedAtUtc).ThenBy(p => p.Id)
                .Take(Math.Clamp(limit, 1, 12))
                .ToListAsync(ct);

        // Las categorías primero las de arriba del árbol: "Pesas" antes que
        // "Pesas / Rusas / Competición".
        var categories = await ProductTextSearch.MatchingName(
                context.Categories.AsNoTracking().Where(c => c.TenantId == tenantId),
                c => c.Name, text, synonyms.Groups)
            .OrderBy(c => c.Path.Length).ThenBy(c => c.Name)
            .Take(4)
            .ToListAsync(ct);

        return new ProductSuggestions(products, total, categories);
    }

    public async Task<int> CountMatchingAsync(TenantId tenantId, string text, CancellationToken ct = default)
    {
        var synonyms = await SearchRepository.LoadSynonymsAsync(context, tenantId, ct);
        return await ProductTextSearch.Matching(
                context.Products.AsNoTracking().Where(p => p.TenantId == tenantId && p.Status == ProductStatus.Active),
                text, includeSku: false, synonyms.Groups)
            .CountAsync(ct);
    }

    public async Task<IReadOnlyList<Product>> ListRelatedAsync(
        TenantId tenantId, RelatedProductsQuery query, CancellationToken ct = default)
    {
        var exclude = query.ExcludeIds.ToList();
        var related = context.Products.AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.Status == ProductStatus.Active && p.Variants.Any()
                && !exclude.Contains(p.Id));

        if (query.InStockVariantIds is { } known)
            related = related.Where(InStock(known as List<Guid> ?? [.. known]));
        if (query.CategoryIds is { Count: > 0 } categories)
        {
            var categoryIds = categories.ToList();
            related = related.Where(p => EF.Property<List<Guid>>(p, "_categoryIds").Any(id => categoryIds.Contains(id)));
        }
        if (query.Ids is { } only)
        {
            var ids = only.ToList();
            related = related.Where(p => ids.Contains(p.Id));
        }

        return await related
            .OrderByDescending(p => p.CreatedAtUtc).ThenBy(p => p.Id)
            .Take(Math.Clamp(query.Limit, 1, 100))
            .ToListAsync(ct);
    }

    /// <summary>
    /// Ids de los productos de <paramref name="products"/> con alguna variante
    /// en oferta (precio tachado mayor al de venta). El tachado va serializado
    /// en texto ("monto|moneda") y no se compara en SQL: se traen solo las
    /// variantes que lo tienen cargado (id, precio y tachado, nada más) y se
    /// compara acá.
    /// </summary>
    private static async Task<List<Guid>> OnSaleIdsAsync(IQueryable<Product> products, CancellationToken ct)
    {
        var priced = await products
            .SelectMany(p => p.Variants
                .Where(v => v.CompareAtPrice != null)
                .Select(v => new { ProductId = p.Id, Price = v.Price.AmountInMinorUnits, v.CompareAtPrice }))
            .ToListAsync(ct);
        return
        [
            .. priced
                .Where(v => v.CompareAtPrice is { } cmp && cmp.AmountInMinorUnits > v.Price)
                .Select(v => v.ProductId)
                .Distinct(),
        ];
    }

    public async Task<IReadOnlyList<Product>> ListForSectionAsync(
        TenantId tenantId, SectionProductQuery query, CancellationToken ct = default)
    {
        var limit = Math.Max(1, query.Limit);

        // Solo lo que se puede comprar: publicado y con alguna variante. Un
        // producto sin variantes la tienda lo descarta al mapear, y antes
        // ocupaba uno de los lugares de la sección.
        var sellable = context.Products.AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.Status == ProductStatus.Active && p.Variants.Any());

        switch (query.Kind)
        {
            case SectionProductKind.Manual:
                {
                    var ids = query.Ids ?? [];
                    if (ids.Count == 0) return [];
                    var found = await sellable.Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id, ct);
                    // El orden es el que eligió el comercio; lo que se archivó, se
                    // pasó a borrador o se borró desaparece sin dejar hueco.
                    return [.. ids.Distinct().Where(found.ContainsKey).Select(id => found[id]).Take(limit)];
                }

            case SectionProductKind.Newest:
                return await sellable
                    .OrderByDescending(p => p.CreatedAtUtc).ThenBy(p => p.Id)
                    .Take(limit).ToListAsync(ct);

            case SectionProductKind.Category when query.CategoryId is { } categoryId:
                sellable = query.IncludeChildren
                    ? await FilterBySubtreeAsync(sellable, tenantId, categoryId, ct)
                    : sellable.Where(p => EF.Property<List<Guid>>(p, "_categoryIds").Contains(categoryId));
                break;

            case SectionProductKind.Brand when !string.IsNullOrWhiteSpace(query.Brand):
                {
                    // Sin distinguir mayúsculas: la marca se escribe a mano en cada
                    // producto y "Nike" y "NIKE" son la misma para el comprador.
                    var brand = query.Brand.Trim().ToLower();
                    sellable = sellable.Where(p => p.Brand != null && p.Brand.ToLower() == brand);
                    break;
                }

            case SectionProductKind.OnSale:
                {
                    // De todo el catálogo: antes la tienda filtraba entre los 24
                    // más nuevos, así que una oferta vieja nunca aparecía en "Ofertas".
                    var onSale = await OnSaleIdsAsync(sellable, ct);
                    if (onSale.Count == 0) return [];
                    sellable = sellable.Where(p => onSale.Contains(p.Id));
                    break;
                }

            default:
                // Categoría sin id o marca vacía: no hay nada que mostrar.
                return [];
        }

        var sorted = query.Sort switch
        {
            ProductSort.PriceAsc => sellable.OrderBy(MinVariantPrice).ThenBy(p => p.Id),
            ProductSort.PriceDesc => sellable.OrderByDescending(MinVariantPrice).ThenBy(p => p.Id),
            ProductSort.NameAsc => sellable.OrderBy(p => p.Name).ThenBy(p => p.Id),
            _ => sellable.OrderByDescending(p => p.CreatedAtUtc).ThenBy(p => p.Id),
        };
        return await sorted.Take(limit).ToListAsync(ct);
    }

    public async Task<IReadOnlyDictionary<Guid, Guid>> ActiveProductIdsByVariantAsync(
        TenantId tenantId, IReadOnlyCollection<Guid> variantIds, CancellationToken ct = default)
    {
        if (variantIds.Count == 0) return new Dictionary<Guid, Guid>();

        // Solo los dos ids: no hace falta traer los productos enteros para
        // saber de cuál es cada variante.
        var pairs = await context.Products.AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.Status == ProductStatus.Active)
            .SelectMany(p => p.Variants
                .Where(v => variantIds.Contains(v.Id))
                .Select(v => new { VariantId = v.Id, ProductId = p.Id }))
            .ToListAsync(ct);
        return pairs.ToDictionary(x => x.VariantId, x => x.ProductId);
    }

    /// <summary>Marcas, opciones, rango de precio y ficha técnica disponibles en el set base.</summary>
    private static async Task<ProductFacets> BuildFacetsAsync(
        CatalogDbContext context, TenantId tenantId, IQueryable<Product> baseQuery, CancellationToken ct)
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

        return new ProductFacets(brands, options, priceMin, priceMax, await SpecFacetsAsync(context, tenantId, baseQuery, ct));
    }

    /// <summary>
    /// Campos de ficha técnica marcados como filtrables, con los valores que de
    /// verdad existen en el set. Un filtro que ofrece un valor sin resultados es
    /// peor que no ofrecerlo.
    /// </summary>
    private static async Task<IReadOnlyList<SpecFacet>> SpecFacetsAsync(
        CatalogDbContext context, TenantId tenantId, IQueryable<Product> baseQuery, CancellationToken ct)
    {
        var definitions = await context.SpecDefinitions.AsNoTracking()
            .Where(d => d.TenantId == tenantId && d.Filterable)
            .OrderBy(d => d.SortOrder).ThenBy(d => d.Name)
            .Take(20)
            .ToListAsync(ct);
        if (definitions.Count == 0) return [];

        var ids = definitions.Select(d => d.Id).ToList();
        var pairs = await baseQuery
            .SelectMany(p => p.Specs)
            .Where(x => ids.Contains(x.DefinitionId))
            .Select(x => new { x.DefinitionId, x.Value })
            .Distinct()
            .Take(2000)
            .ToListAsync(ct);

        var byDefinition = pairs.GroupBy(x => x.DefinitionId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.Value).OrderBy(v => v, StringComparer.OrdinalIgnoreCase).Take(60).ToList());

        return definitions
            .Where(d => byDefinition.ContainsKey(d.Id))
            .Select(d => new SpecFacet(d.Id, d.Key, d.Name, d.Unit, byDefinition[d.Id]))
            .ToList();
    }
}
