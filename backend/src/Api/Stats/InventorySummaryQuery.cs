using Catalog.Infrastructure.Persistence;
using Inventory.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Api.Stats;

/// <summary>El estado del depósito de una tienda, de un vistazo.</summary>
public sealed record InventorySummary(
    int Variants, int Units, int OutOfStock, int LowStock, int Unlimited, int Reserved,
    long StockValueMinor, string Currency, int WithoutCost);

/// <summary>
/// El resumen del depósito de <c>/inventory/summary</c> y del asistente —cuántas
/// unidades hay, cuánta plata inmovilizan y qué está en cero o por agotarse—.
/// Movida tal cual desde el endpoint; el stock filtra por tienda explícita
/// además del filtro global de EF. Solo proyecta dos columnas por variante: el
/// costo está serializado en texto, así que la valorización se suma en memoria
/// sí o sí.
/// </summary>
public sealed class InventorySummaryQuery(CatalogDbContext catalog, InventoryDbContext inventory)
{
    public async Task<InventorySummary> RunAsync(TenantId tenant, int lowStockThreshold, CancellationToken ct)
    {
        var tid = tenant;
        var low = lowStockThreshold;

        var variants = await catalog.Products.AsNoTracking()
            .Where(p => p.TenantId == tid)
            .SelectMany(p => p.Variants)
            .Select(v => new { v.Id, v.Cost })
            .ToListAsync(ct);

        var stock = await inventory.StockItems.AsNoTracking()
            .Where(s => s.TenantId == tid)
            .Select(s => new { s.VariantId, s.Available, s.Reserved, s.Unlimited })
            .ToListAsync(ct);
        var available = stock
            .GroupBy(s => s.VariantId)
            .ToDictionary(g => g.Key, g => g.Sum(s => s.Available));
        var unlimitedIds = stock.Where(s => s.Unlimited).Select(s => s.VariantId).ToHashSet();

        var units = 0;
        var outOfStock = 0;
        var lowStock = 0;
        var unlimited = 0;
        long stockValue = 0;
        var currency = Money.DefaultCurrency;

        foreach (var v in variants)
        {
            // Sin límite no son unidades en depósito ni puede agotarse.
            if (unlimitedIds.Contains(v.Id))
            {
                unlimited++;
                continue;
            }

            var qty = available.GetValueOrDefault(v.Id, 0);
            units += qty;
            if (qty <= 0) outOfStock++;
            else if (qty <= low) lowStock++;

            // Valorización A COSTO, no a precio de venta: es la plata parada
            // en el depósito, no lo que se espera facturar por ella.
            if (v.Cost is { } cost)
            {
                stockValue += cost.AmountInMinorUnits * Math.Max(0, qty);
                currency = cost.Currency;
            }
        }

        return new InventorySummary(
            variants.Count, units, outOfStock, lowStock, unlimited,
            stock.Sum(s => s.Reserved), stockValue, currency,
            variants.Count(v => v.Cost is null));
    }
}
