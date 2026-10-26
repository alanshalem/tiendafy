using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Api.Meli;

public abstract record MeliCategoryResolution
{
    public sealed record Resolved(MeliCategoryRef Category, MeliCategorySource Source) : MeliCategoryResolution;

    /// <summary>La predicción no es clara: una persona elige la categoría ("elegí la categoría") y mientras tanto no se gasta IA.</summary>
    public sealed record Unclear(IReadOnlyList<MeliCategorySuggestion> Suggestions) : MeliCategoryResolution;
}

/// <summary>
/// La categoría de ML de un producto, sin IA y en este orden: la guardada, la de una publicación vinculada y la que
/// predice ML por el nombre. Corre en el worker, sin tienda en el scope: toda consulta filtra por tienda a mano.
/// </summary>
public sealed class MeliCategoryResolver(MeliDbContext db, MeliCatalogReader reader)
{
    /// <summary>Cuántas publicaciones vinculadas se prueban antes de pasar a la predicción (una puede estar borrada).</summary>
    private const int MaxListingsTried = 3;

    public async Task<MeliCategoryResolution> ResolveAsync(
        MeliReaderConnection c, Guid productId, string productName, CancellationToken ct)
    {
        var saved = await db.ProductCategories.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(x => x.TenantId == c.TenantId && x.ProductId == productId, ct);
        if (saved is not null)
            return new MeliCategoryResolution.Resolved(new MeliCategoryRef(saved.CategoryId, saved.CategoryName), saved.Source);

        var itemIds = await db.ItemLinks.IgnoreQueryFilters().AsNoTracking()
            .Where(l => l.TenantId == c.TenantId && l.ProductId == productId)
            .OrderBy(l => l.CreatedAtUtc)
            .Select(l => l.MeliItemId)
            .Distinct()
            .ToListAsync(ct);
        foreach (var itemId in itemIds.Take(MaxListingsTried))
        {
            if (await reader.ItemCategoryIdAsync(c, itemId, ct) is not { Length: > 0 } categoryId) continue;
            var category = await reader.CategoryAsync(c, categoryId, ct) ?? new MeliCategoryRef(categoryId, categoryId);
            return new MeliCategoryResolution.Resolved(category, MeliCategorySource.Listing);
        }

        return FromPrediction(await reader.PredictAsync(c, productName, ct));
    }

    /// <summary>Clara = una sola sugerencia, o todas con el mismo nombre de categoría. Más de un nombre distinto, o ninguna → <c>Unclear</c>.</summary>
    public static MeliCategoryResolution FromPrediction(IReadOnlyList<MeliCategorySuggestion> suggestions)
    {
        if (suggestions.Count > 0 && suggestions.Select(s => s.CategoryName.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).Count() == 1)
        {
            var first = suggestions[0];
            return new MeliCategoryResolution.Resolved(new MeliCategoryRef(first.CategoryId, first.CategoryName), MeliCategorySource.Predicted);
        }
        return new MeliCategoryResolution.Unclear(suggestions);
    }
}
