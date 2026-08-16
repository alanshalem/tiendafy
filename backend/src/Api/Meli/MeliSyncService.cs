using System.Text.Json;
using Inventory.Core.Domain;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Api.Meli;

/// <summary>Item de una venta ML tal como se guarda en meli_orders.items_json.</summary>
public sealed record MeliOrderItemSnapshot(
    string ItemId, long? VariationId, string Title, int Quantity, decimal UnitPrice, string? Sku);

/// <summary>
/// Sincroniza ventas de Mercado Libre al cache local y aplica el descuento de
/// stock a las variantes vinculadas (una sola vez por orden — idempotente vía
/// StockApplied, porque los webhooks llegan repetidos).
/// </summary>
public sealed class MeliSyncService(
    MeliDbContext db, MeliClient client, MeliTokenService tokens,
    IStockRepository stock, ILogger<MeliSyncService> logger)
{
    private static readonly JsonSerializerOptions Json = ApiJson.Web;

    /// <summary>Trae la orden de la API y la proyecta al cache. Null si no hay token.</summary>
    public async Task<MeliOrder?> UpsertOrderAsync(Guid tenantId, long meliOrderId, CancellationToken ct)
    {
        var token = await tokens.GetValidTokenAsync(tenantId, ct);
        if (token is null) return null;

        using var doc = await client.GetAsync(token, $"/orders/{meliOrderId}", ct);
        return await ApplyOrderAsync(tenantId, doc.RootElement, ct);
    }

    /// <summary>Backfill: últimas ventas del vendedor (para la conexión inicial).</summary>
    public async Task<int> BackfillOrdersAsync(Guid tenantId, long meliUserId, CancellationToken ct)
    {
        var token = await tokens.GetValidTokenAsync(tenantId, ct);
        if (token is null) return 0;

        using var doc = await client.GetAsync(token,
            $"/orders/search?seller={meliUserId}&sort=date_desc&limit=50", ct);
        if (!doc.RootElement.TryGetProperty("results", out var results) || results.ValueKind != JsonValueKind.Array)
            return 0;

        var count = 0;
        foreach (var order in results.EnumerateArray())
        {
            await ApplyOrderAsync(tenantId, order, ct);
            count++;
        }
        return count;
    }

    /// <summary>Upsert del cache + descuento de stock si corresponde.</summary>
    public async Task<MeliOrder> ApplyOrderAsync(Guid tenantId, JsonElement order, CancellationToken ct)
    {
        var meliOrderId = order.GetProperty("id").GetInt64();

        var row = await db.Orders.IgnoreQueryFilters()
            .FirstOrDefaultAsync(o => o.TenantId == tenantId && o.MeliOrderId == meliOrderId, ct);
        if (row is null)
        {
            row = MeliOrder.Create(tenantId, meliOrderId);
            db.Orders.Add(row);
        }

        var items = ParseItems(order);
        row.Apply(
            status: JsonRead.GetString(order, "status") ?? "unknown",
            dateCreatedUtc: JsonRead.GetDate(order, "date_created") ?? DateTime.UtcNow,
            dateClosedUtc: JsonRead.GetDate(order, "date_closed"),
            totalAmount: JsonRead.GetDecimal(order, "total_amount"),
            paidAmount: JsonRead.GetDecimal(order, "paid_amount"),
            currencyId: JsonRead.GetString(order, "currency_id") ?? "ARS",
            buyerId: order.TryGetProperty("buyer", out var buyer) ? JsonRead.GetLong(buyer, "id") : 0,
            buyerNickname: order.TryGetProperty("buyer", out var b2) ? JsonRead.GetString(b2, "nickname") ?? "" : "",
            itemsJson: JsonSerializer.Serialize(items, Json),
            packId: order.TryGetProperty("pack_id", out var pack) && pack.ValueKind == JsonValueKind.Number ? pack.GetInt64() : null,
            shipmentId: order.TryGetProperty("shipping", out var ship) && ship.ValueKind == JsonValueKind.Object
                && ship.TryGetProperty("id", out var sid) && sid.ValueKind == JsonValueKind.Number ? sid.GetInt64() : null,
            shipmentStatus: null);

        if (row.IsPaid && !row.StockApplied)
        {
            await ApplyStockAsync(tenantId, meliOrderId, items, ct);
            row.MarkStockApplied();
        }

        await db.SaveChangesAsync(ct);
        return row;
    }

    /// <summary>
    /// Descuenta stock local para los items vinculados. Best-effort por item:
    /// una publicación sin vincular simplemente no toca stock.
    /// </summary>
    private async Task ApplyStockAsync(
        Guid tenantId, long meliOrderId, IReadOnlyList<MeliOrderItemSnapshot> items, CancellationToken ct)
    {
        foreach (var item in items)
        {
            var link = await db.ItemLinks.IgnoreQueryFilters().AsNoTracking()
                .FirstOrDefaultAsync(l => l.TenantId == tenantId && l.MeliItemId == item.ItemId
                    && l.MeliVariationId == item.VariationId, ct);
            // Publicación con variaciones vendida pero vinculada a nivel item: fallback.
            link ??= await db.ItemLinks.IgnoreQueryFilters().AsNoTracking()
                .FirstOrDefaultAsync(l => l.TenantId == tenantId && l.MeliItemId == item.ItemId
                    && l.MeliVariationId == null, ct);
            if (link is null || !link.SyncStock) continue;

            var tenant = TenantId.From(tenantId);
            var current = await stock.GetByVariantsAsync(tenant, [link.VariantId], ct);
            var available = current.Count > 0 ? current[0].Available : 0;
            var next = Math.Max(0, available - item.Quantity);
            await stock.SetAvailableAsync(tenant, link.VariantId, next,
                $"Venta Mercado Libre #{meliOrderId}", ct);
            logger.LogInformation(
                "Stock ML aplicado: tenant {TenantId}, variante {VariantId}, {Before} → {After}.",
                tenantId, link.VariantId, available, next);
        }
    }

    public static List<MeliOrderItemSnapshot> ParseItems(JsonElement order)
    {
        var list = new List<MeliOrderItemSnapshot>();
        if (!order.TryGetProperty("order_items", out var items) || items.ValueKind != JsonValueKind.Array)
            return list;

        foreach (var oi in items.EnumerateArray())
        {
            if (!oi.TryGetProperty("item", out var item)) continue;
            list.Add(new MeliOrderItemSnapshot(
                ItemId: JsonRead.GetString(item, "id") ?? "",
                VariationId: item.TryGetProperty("variation_id", out var v) && v.ValueKind == JsonValueKind.Number
                    ? v.GetInt64() : null,
                Title: JsonRead.GetString(item, "title") ?? "",
                Quantity: oi.TryGetProperty("quantity", out var q) && q.ValueKind == JsonValueKind.Number ? q.GetInt32() : 1,
                UnitPrice: JsonRead.GetDecimal(oi, "unit_price"),
                Sku: JsonRead.GetString(item, "seller_sku") ?? JsonRead.GetString(item, "seller_custom_field")));
        }
        return list;
    }




}
