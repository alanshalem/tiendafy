using System.Text.Json;
using Inventory.Core.Domain;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SharedKernel.Common;

namespace Api.Meli;

/// <summary>
/// Item de una venta ML tal como se guarda en meli_orders.items_json.
/// SaleFee = comisión de ML POR UNIDAD (order_items[].sale_fee) — null en
/// snapshots viejos (pre-campo); un resync la trae.
/// </summary>
public sealed record MeliOrderItemSnapshot(
    string ItemId, long? VariationId, string Title, int Quantity, decimal UnitPrice, string? Sku,
    decimal? SaleFee = null);

/// <summary>
/// Sincroniza ventas de Mercado Libre al cache local y aplica el descuento de
/// stock a las variantes vinculadas (una sola vez por orden — idempotente vía
/// StockApplied, porque los webhooks llegan repetidos).
/// </summary>
public sealed class MeliSyncService(
    MeliDbContext db, MeliClient client, MeliTokenService tokens,
    IStockRepository stock, global::Fiscal.Core.Abstractions.IInvoiceEmitter emitter,
    global::Fiscal.Core.Abstractions.IFiscalEmissionQueue fiscalQueue,
    ILogger<MeliSyncService> logger)
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
            await MoveStockAsync(tenantId, meliOrderId, items, reverse: false, ct);
            row.MarkStockApplied();
        }
        else if (row.NeedsStockReversal)
        {
            // La venta se canceló: la mercadería que se había descontado vuelve
            // al disponible. Idempotente por el flag, igual que la ida.
            await MoveStockAsync(tenantId, meliOrderId, items, reverse: true, ct);
            row.MarkStockReverted();
        }

        await ApplyFiscalAsync(tenantId, row, meliOrderId, ct);

        await db.SaveChangesAsync(ct);
        return row;
    }

    /// <summary>
    /// Ciclo fiscal de una venta ML: nota de crédito si se canceló estando
    /// facturada, y auto-factura si la conexión la tiene activada. Best-effort:
    /// ARCA caído no puede frenar la importación de la venta.
    /// </summary>
    private async Task ApplyFiscalAsync(Guid tenantId, MeliOrder row, long meliOrderId, CancellationToken ct)
    {
        var minor = row.BillableMinorUnits;
        if (minor <= 0) return;

        // Venta facturada que se cancela/reembolsa: nota de crédito, igual que
        // en la tienda propia (sin esto quedaba una factura viva de una venta
        // anulada). Solo se marca si REALMENTE se encoló: si no, se reintenta.
        if (row.FiscalDocumentId is not null && !row.CreditNoteIssued
            && row.Status is "cancelled" or "refunded")
        {
            try
            {
                if (await fiscalQueue.EnqueueCreditNoteAsync(tenantId, row.Id, minor, null, ct))
                    row.MarkCreditNoteIssued();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "No se pudo encolar la NC de la venta ML {OrderId}.", meliOrderId);
            }
            return;
        }

        // Auto-facturación (opt-in por conexión) a consumidor final. Si ARCA
        // rechaza, queda el botón manual "Facturar" en el panel.
        if (row.IsPaid && row.FiscalDocumentId is null)
        {
            var conn = await db.Connections.IgnoreQueryFilters().AsNoTracking()
                .FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);
            if (conn?.AutoInvoiceEnabled != true) return;
            try
            {
                var emitted = await emitter.EmitAsync(
                    new global::Fiscal.Core.Abstractions.EmitInvoiceCommand(tenantId, row.Id, minor), ct);
                if (emitted is { IsSuccess: true, Value.Authorized: true })
                    row.MarkInvoiced(emitted.Value.DocumentId);
                else
                    logger.LogWarning("Auto-factura ML rechazada (venta {OrderId}).", meliOrderId);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Auto-factura ML falló (venta {OrderId}).", meliOrderId);
            }
        }
    }

    /// <summary>
    /// Mueve el stock local de los items vinculados: lo descuenta al venderse
    /// y lo devuelve si la venta se cancela. Un solo camino para los dos
    /// sentidos — con dos copias, la vuelta se olvida (y se olvidó).
    /// Best-effort por item: una publicación sin vincular no toca stock.
    /// </summary>
    private async Task MoveStockAsync(
        Guid tenantId, long meliOrderId, IReadOnlyList<MeliOrderItemSnapshot> items,
        bool reverse, CancellationToken ct)
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
            var delta = reverse ? item.Quantity : -item.Quantity;
            var reason = reverse
                ? $"Cancelación Mercado Libre #{meliOrderId}"
                : $"Venta Mercado Libre #{meliOrderId}";
            var after = await stock.AdjustAvailableAsync(tenant, link.VariantId, delta, reason, ct);
            logger.LogInformation(
                "Stock ML {Action}: tenant {TenantId}, variante {VariantId}, {Delta} → queda {After}.",
                reverse ? "devuelto" : "aplicado", tenantId, link.VariantId, delta, after);
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
                Sku: JsonRead.GetString(item, "seller_sku") ?? JsonRead.GetString(item, "seller_custom_field"),
                SaleFee: oi.TryGetProperty("sale_fee", out var fee) && fee.ValueKind == JsonValueKind.Number
                    ? fee.GetDecimal() : null));
        }
        return list;
    }

    /// <summary>
    /// Snapshot cacheado (ItemsJson) → items. SIEMPRE por acá: el cache se
    /// escribe camelCase (Web defaults) y leerlo con otras opciones devuelve
    /// cantidades en 0 y títulos null.
    /// </summary>
    public static List<MeliOrderItemSnapshot> ParseSnapshot(string itemsJson) =>
        JsonSerializer.Deserialize<List<MeliOrderItemSnapshot>>(itemsJson, ApiJson.Web) ?? [];
}
