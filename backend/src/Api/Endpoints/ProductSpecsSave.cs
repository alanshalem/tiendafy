using Catalog.Core.Domain;
using Catalog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Lo que hace <c>PUT /products/{id}/specs</c> para guardar la ficha técnica de un producto, aparte del endpoint para
/// que lo use también la aprobación de fichas con IA: solo se aceptan campos que existan en esta tienda (un id inventado
/// dejaría un valor colgado que después nadie sabe leer) y la ficha se manda entera, porque <c>SetSpecs</c> la reemplaza.
/// </summary>
public static class ProductSpecsSave
{
    /// <summary>Los campos de ficha técnica que define esta tienda.</summary>
    public static async Task<HashSet<Guid>> KnownDefinitionIdsAsync(CatalogDbContext db, TenantId tenantId, CancellationToken ct) =>
        [.. await db.SpecDefinitions.AsNoTracking()
            .Where(d => d.TenantId == tenantId)
            .Select(d => d.Id).ToListAsync(ct)];

    /// <summary>Reemplaza la ficha del producto por <paramref name="values"/>, sin los campos que la tienda no define.</summary>
    public static void Apply(Product product, IEnumerable<(Guid DefinitionId, string? Value)> values, IReadOnlySet<Guid> known) =>
        product.SetSpecs(values.Where(v => known.Contains(v.DefinitionId)));
}
