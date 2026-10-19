using Catalog.Infrastructure.Persistence;
using Inventory.Core.Domain;
using Inventory.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Api.Startup;

/// <summary>
/// Relleno de una sola vez, al aplicar la migración que crea el stock sin
/// límite (<c>AddUnlimitedStock</c>). Antes, "Sin límite" —la opción por
/// defecto al crear un producto sin variantes— no cargaba ninguna fila de
/// stock: el producto quedaba agotado y nadie lo podía comprar. Esos productos
/// se reconocen así: sin variantes (sin opciones, una sola variante) y sin
/// fila de stock. Pasan a sin límite, como el comercio había elegido.
///
/// Los productos con variantes no se tocan: ahí una variante sin stock cargado
/// puede ser una que de verdad no hay, y venderla sin límite sería sobrevender.
/// </summary>
public static class UnlimitedStockBackfill
{
    public const string Migration = "_AddUnlimitedStock";

    /// <param name="tenantId">Solo esa tienda (los tests); null = todas.</param>
    /// <returns>Cuántas variantes pasaron a sin límite.</returns>
    public static async Task<int> RunAsync(
        CatalogDbContext catalog, InventoryDbContext inventory, Guid? tenantId = null, CancellationToken ct = default)
    {
        var products = catalog.Products.IgnoreQueryFilters().AsNoTracking();
        if (tenantId is { } only) products = products.Where(p => p.TenantId == SharedKernel.Common.TenantId.From(only));
        var candidates = await products
            .Where(p => !p.Options.Any() && p.Variants.Count == 1)
            .Select(p => new { p.TenantId, VariantId = p.Variants.Select(v => v.Id).First() })
            .ToListAsync(ct);
        if (candidates.Count == 0) return 0;

        var ids = candidates.Select(c => c.VariantId).ToList();
        var withRow = (await inventory.StockItems.IgnoreQueryFilters().AsNoTracking()
                .Where(s => ids.Contains(s.VariantId))
                .Select(s => s.VariantId)
                .ToListAsync(ct))
            .ToHashSet();

        var added = 0;
        foreach (var c in candidates.Where(c => !withRow.Contains(c.VariantId)))
        {
            inventory.StockItems.Add(new StockItem(c.TenantId, c.VariantId, 0, unlimited: true));
            inventory.Movements.Add(new StockMovement(
                c.TenantId, c.VariantId, MovementType.Adjustment, 0, reason: "Stock sin límite (elegido al crear el producto)"));
            added++;
        }

        await inventory.SaveChangesAsync(ct);
        return added;
    }
}
