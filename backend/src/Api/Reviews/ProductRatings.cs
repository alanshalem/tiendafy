using Catalog.Contracts;
using Microsoft.EntityFrameworkCore;
using Reviews.Infrastructure;

namespace Api.Reviews;

/// <summary>
/// El promedio y la cantidad de reseñas aprobadas de cada producto, para las
/// cards y la ficha. Solo cuentan las aprobadas: una pendiente o una oculta no
/// existe para el comprador, tampoco en el promedio. Si la tienda apagó las
/// reseñas, no hay estrellas en ningún lado.
/// </summary>
public static class ProductRatings
{
    public static async Task<IReadOnlyDictionary<Guid, ProductRatingDto>> ForAsync(
        ReviewsDbContext db, Guid tenantId, IReadOnlyCollection<Guid> productIds, CancellationToken ct)
    {
        if (productIds.Count == 0 || !await ShowOnStoreAsync(db, tenantId, ct))
            return new Dictionary<Guid, ProductRatingDto>();

        var rows = await db.Reviews.AsNoTracking()
            .Where(r => r.TenantId == tenantId && productIds.Contains(r.ProductId) && r.Status == ReviewStatus.Approved)
            .GroupBy(r => r.ProductId)
            .Select(g => new { ProductId = g.Key, Count = g.Count(), Sum = g.Sum(r => r.Rating) })
            .ToListAsync(ct);

        return rows.ToDictionary(
            r => r.ProductId,
            r => new ProductRatingDto(Math.Round((decimal)r.Sum / r.Count, 1), r.Count));
    }

    /// <summary>Sin fila de configuración, la tienda muestra las reseñas (el default).</summary>
    public static async Task<bool> ShowOnStoreAsync(ReviewsDbContext db, Guid tenantId, CancellationToken ct) =>
        await db.Settings.AsNoTracking()
            .Where(s => s.TenantId == tenantId)
            .Select(s => (bool?)s.ShowOnStore)
            .FirstOrDefaultAsync(ct) ?? true;

    public static async Task<ReviewSettings> SettingsAsync(ReviewsDbContext db, Guid tenantId, CancellationToken ct) =>
        await db.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == tenantId, ct)
        ?? ReviewSettings.Defaults(tenantId);
}
