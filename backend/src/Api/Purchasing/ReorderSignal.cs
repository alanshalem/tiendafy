using Catalog.Contracts;
using Catalog.Infrastructure.Persistence;
using Inventory.Core.Domain;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using Purchasing.Infrastructure;
using SharedKernel.Common;

namespace Api.Purchasing;

/// <summary>Una variante que se agota antes de que llegue la reposición.</summary>
public sealed record ReorderItem(
    Guid VariantId, Guid? ProductId, string Product, string Variant, string Sku,
    decimal UnitsPerDay, int Available, int CoverageDays, int SuggestedQty, int ReorderPoint);

public sealed record ReorderResult(int LeadTimeDays, int WindowDays, int BufferDays, IReadOnlyList<ReorderItem> Items);

/// <summary>
/// La señal de reposición de Compras: cobertura (stock / venta diaria de los
/// últimos 60 días) contra lead time + colchón. Para un importador, "stock
/// bajo" con un número fijo avisa tarde: lo que importa es si llega el
/// próximo embarque antes de quedarse sin.
///
/// <para>
/// Vivía adentro del endpoint de sugerencias; salió acá para que las alertas
/// de stock bajo usen EXACTAMENTE la misma cuenta que la pantalla de
/// Reposición (si no, el aviso y la pantalla discuten). La demanda suma todo
/// lo que consume stock: ventas de la tienda, de Mercado Libre (por vínculo)
/// y los componentes de los kits vendidos.
/// </para>
///
/// <para>
/// Filtra por tienda en cada consulta, sin depender del filtro global del
/// request: el worker de alertas la corre fuera de un request.
/// </para>
/// </summary>
public sealed class ReorderSignal(
    OrdersDbContext ordersDb,
    PurchasingDbContext purchasingDb,
    CatalogDbContext catalogDb,
    MeliDbContext meliDb,
    IStockRepository stock,
    ICatalogCheckoutQuery catalog)
{
    public const int WindowDays = 60;
    public const int BufferDays = 30;

    /// <summary>Lead time: el pedido, o el de la última OC recibida, o 60 días.</summary>
    public async Task<int> LeadTimeAsync(Guid tenantId, int? requested, CancellationToken ct) =>
        requested
        ?? await purchasingDb.PurchaseOrders.AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.LeadTimeDays != null && p.Status == PurchaseOrderStatus.Received)
            .OrderByDescending(p => p.ReceivedAtUtc)
            .Select(p => p.LeadTimeDays)
            .FirstOrDefaultAsync(ct)
        ?? 60;

    public async Task<ReorderResult> SuggestionsAsync(
        TenantId tenantId, int? leadTimeDays, CancellationToken ct, int take = 100)
    {
        var lead = await LeadTimeAsync(tenantId.Value, leadTimeDays, ct);
        var sold = await DemandAsync(tenantId, DateTime.UtcNow.AddDays(-WindowDays), ct);
        if (sold.Count == 0) return new ReorderResult(lead, WindowDays, BufferDays, []);

        var stockByVariant = (await stock.GetByVariantsAsync(tenantId, sold.Keys.ToList(), ct))
            .ToDictionary(s => s.VariantId, s => s.Available);
        var variants = (await catalog.GetVariantsAsync(tenantId.Value, sold.Keys.ToList(), ct))
            .ToDictionary(v => v.VariantId);

        var items = sold
            .Select(kv =>
            {
                var perDay = kv.Value / (decimal)WindowDays;
                var available = stockByVariant.GetValueOrDefault(kv.Key);
                var coverageDays = perDay > 0 ? (int)Math.Floor(available / perDay) : int.MaxValue;
                var reorderPoint = (int)Math.Ceiling(perDay * (lead + BufferDays));
                return new { kv.Key, perDay, available, coverageDays, reorderPoint, suggestedQty = reorderPoint - available };
            })
            .Where(x => x.coverageDays < lead + BufferDays && x.suggestedQty > 0)
            .OrderBy(x => x.coverageDays)
            .Take(take)
            .Select(x =>
            {
                var v = variants.GetValueOrDefault(x.Key);
                return new ReorderItem(
                    x.Key, v?.ProductId, v?.ProductName ?? "(producto)", v?.VariantDescription ?? "", v?.Sku ?? "",
                    Math.Round(x.perDay, 2), x.available, x.coverageDays, x.suggestedQty, x.reorderPoint);
            })
            .ToList();

        return new ReorderResult(lead, WindowDays, BufferDays, items);
    }

    /// <summary>Unidades consumidas por variante desde <paramref name="since"/>, todos los canales.</summary>
    private async Task<Dictionary<Guid, int>> DemandAsync(TenantId tenantId, DateTime since, CancellationToken ct)
    {
        var sold = (await ordersDb.Orders.AsNoTracking()
                .Where(o => o.TenantId == tenantId && OrderStatuses.Earning.Contains(o.Status) && o.CreatedAtUtc >= since)
                .ToListAsync(ct))
            .SelectMany(o => o.Items)
            .GroupBy(i => i.VariantId)
            .ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));

        // Ventas de Mercado Libre: descuentan el mismo stock (unificado),
        // así que son la misma demanda — mapeadas a variantes por vínculo.
        var tid = tenantId.Value;
        var links = await meliDb.ItemLinks.AsNoTracking().Where(l => l.TenantId == tid).ToListAsync(ct);
        if (links.Count > 0)
        {
            var resolver = MeliLinkResolver.From(links);
            var meliOrders = await meliDb.Orders.AsNoTracking()
                .Where(o => o.TenantId == tid && o.Status == "paid" && o.DateCreatedUtc >= since)
                .ToListAsync(ct);
            foreach (var order in meliOrders)
            {
                foreach (var item in Api.Meli.MeliSyncService.ParseSnapshot(order.ItemsJson))
                {
                    if (resolver.TryResolve(item.ItemId, item.VariationId, out var vid))
                        sold[vid] = sold.GetValueOrDefault(vid) + item.Quantity;
                }
            }
        }

        // Kits: vender el kit consume sus componentes, pero esa demanda no
        // figura como venta de la variante componente — se expande acá.
        var kitIds = sold.Keys.ToList();
        var kitComponents = await catalogDb.KitComponents.AsNoTracking()
            .Where(k => k.TenantId == tid && kitIds.Contains(k.KitVariantId))
            .ToListAsync(ct);
        if (kitComponents.Count > 0)
        {
            var kitQty = sold.ToDictionary(kv => kv.Key, kv => kv.Value); // snapshot pre-expansión
            foreach (var component in kitComponents)
                sold[component.ComponentVariantId] =
                    sold.GetValueOrDefault(component.ComponentVariantId)
                    + component.Quantity * kitQty[component.KitVariantId];
        }

        return sold;
    }
}
