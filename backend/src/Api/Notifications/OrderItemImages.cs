using Catalog.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;

namespace Api.Notifications;

/// <summary>
/// Resuelve la foto principal de cada item de una orden (variantId → URL) para
/// los emails. Best-effort: sin fotos, el email sale igual sin imágenes.
/// </summary>
public sealed class OrderItemImages(CatalogDbContext catalog, ILogger<OrderItemImages> logger)
{
    public async Task<IReadOnlyDictionary<Guid, string>> ForOrderAsync(Order order, CancellationToken ct = default)
    {
        try
        {
            var variantIds = order.Items.Select(i => i.VariantId).Distinct().ToList();
            if (variantIds.Count == 0) return new Dictionary<Guid, string>();

            var products = await catalog.Products.AsNoTracking()
                .Where(p => p.TenantId == order.TenantId && p.Variants.Any(v => variantIds.Contains(v.Id)))
                .ToListAsync(ct);

            var map = new Dictionary<Guid, string>();
            foreach (var product in products)
            {
                var image = product.Images.OrderBy(i => i.Position).FirstOrDefault()?.Url;
                if (string.IsNullOrEmpty(image)) continue;
                foreach (var variant in product.Variants.Where(v => variantIds.Contains(v.Id)))
                    map[variant.Id] = image;
            }
            return map;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "No se pudieron resolver imágenes para el email de la orden {OrderId}.", order.Id);
            return new Dictionary<Guid, string>();
        }
    }
}
