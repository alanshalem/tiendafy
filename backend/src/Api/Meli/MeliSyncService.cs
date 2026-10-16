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
/// <param name="ItemId">
/// Publicación de Mercado Libre. Nullable porque el snapshot se deserializa de
/// lo que quedó guardado: si el campo no está, acá llega null igual —
/// declararlo no-nullable solo escondía el problema del compilador.
/// </param>
public sealed record MeliOrderItemSnapshot(
    string? ItemId, long? VariationId, string Title, int Quantity, decimal UnitPrice, string? Sku,
    decimal? SaleFee = null);

/// <summary>
/// Sincroniza ventas de Mercado Libre al cache local y aplica el descuento de
/// stock a las variantes vinculadas que sincronizan stock (una sola vez por
/// orden — idempotente vía StockApplied, porque los webhooks llegan repetidos).
/// </summary>
public sealed class MeliSyncService(
    MeliDbContext db, MeliClient client, MeliTokenService tokens,
    IStockRepository stock, Api.Orders.KitStockService kits,
    global::Fiscal.Core.Abstractions.IInvoiceEmitter emitter,
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
            row.MarkStockApplied(await DiscountStockAsync(tenantId, meliOrderId, items, ct));
        }
        else if (row.NeedsStockReversal)
        {
            // La venta se canceló: vuelve al disponible lo que ESTA venta había
            // descontado, ni más ni menos. Idempotente por el flag, igual que la ida.
            var deductions = row.StockDeductions ?? await LegacyDeductionsAsync(tenantId, items, ct);
            await ReturnStockAsync(tenantId, meliOrderId, deductions, ct);
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
        // anulada).
        //
        // La regla: la NC sale sola si alguien emite solo. Si la conexión de ML
        // tiene la auto-factura prendida, la NC sigue el mismo camino que su
        // factura aunque la emisión automática de la tienda esté apagada (antes
        // la cola la descartaba y la venta quedaba facturada para siempre). Si
        // no, decide la emisión automática de la tienda, como en una venta
        // propia. Va por la cola de emisión y no directo a ARCA como la factura:
        // así tiene reintentos y, si falla, queda a la vista en el panel.
        //
        // Se resuelve UNA vez: encolada, ya encolada o "no corresponde" (nadie
        // emite solo, o la factura es de otro ambiente) marcan la venta, y la
        // próxima sincronización no lo vuelve a intentar. Solo un error al
        // encolar (la base, por ejemplo) deja que se reintente.
        if (row.FiscalDocumentId is not null && !row.CreditNoteIssued
            && row.Status is "cancelled" or "refunded")
        {
            try
            {
                // Por lo que queda de la factura (si se acreditó algo antes, no
                // se duplica), con su clave: una sola NC por cancelación.
                var channelAuto = await AutoInvoiceEnabledAsync(tenantId, ct);
                var enqueued = await fiscalQueue.EnqueueCreditNoteAsync(new global::Fiscal.Core.Abstractions.CreditNoteRequest(
                    tenantId, row.Id, minor, global::Fiscal.Core.Domain.CreditNoteKeys.MeliCancellation,
                    Force: channelAuto), ct);
                if (enqueued.Value.Outcome == global::Fiscal.Core.Abstractions.CreditNoteEnqueueResult.NotApplicable)
                    logger.LogInformation("La venta ML {OrderId} se canceló facturada y la NC no sale sola: queda para emitirla a mano.", meliOrderId);
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
            if (!await AutoInvoiceEnabledAsync(tenantId, ct)) return;
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

    /// <summary>La conexión de Mercado Libre factura sola sus ventas.</summary>
    private async Task<bool> AutoInvoiceEnabledAsync(Guid tenantId, CancellationToken ct) =>
        await db.Connections.IgnoreQueryFilters().AsNoTracking()
            .Where(c => c.TenantId == tenantId)
            .Select(c => (bool?)c.AutoInvoiceEnabled)
            .FirstOrDefaultAsync(ct) == true;

    /// <summary>
    /// Descuenta el stock local de lo vendido, solo en las publicaciones cuyo
    /// stock se sincroniza (el interruptor de la cuenta Y el de la publicación,
    /// el mismo que decide si se empuja el stock a ML): con la sincronización
    /// apagada, ML maneja su stock por su lado y la venta no se lleva el de la
    /// tienda. Devuelve lo descontado, que es lo que una cancelación repone.
    /// Los kits descuentan además sus componentes, como una venta de la tienda.
    /// </summary>
    private async Task<List<MeliStockDeduction>> DiscountStockAsync(
        Guid tenantId, long meliOrderId, IReadOnlyList<MeliOrderItemSnapshot> items, CancellationToken ct)
    {
        var deductions = new List<MeliStockDeduction>();
        var connection = await db.Connections.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);
        if (connection is not { StockSyncEnabled: true }) return deductions;

        foreach (var item in items.Where(i => i.Quantity > 0))
        {
            var link = await LinkOfAsync(tenantId, item, ct);
            if (link is null || !connection.SyncsStockOf(link)) continue;
            deductions.Add(new MeliStockDeduction(link.VariantId, item.Quantity));
        }

        await MoveAsync(tenantId, deductions, reverse: false, $"Venta Mercado Libre #{meliOrderId}", ct);
        return deductions;
    }

    /// <summary>La cancelación devuelve lo que la venta descontó (y los componentes de kit).</summary>
    private Task ReturnStockAsync(
        Guid tenantId, long meliOrderId, IReadOnlyList<MeliStockDeduction> deductions, CancellationToken ct) =>
        MoveAsync(tenantId, deductions, reverse: true, $"Cancelación Mercado Libre #{meliOrderId}", ct);

    /// <summary>
    /// Un solo camino para los dos sentidos — con dos copias, la vuelta se
    /// olvida (y se olvidó).
    /// </summary>
    private async Task MoveAsync(
        Guid tenantId, IReadOnlyList<MeliStockDeduction> deductions, bool reverse, string reason, CancellationToken ct)
    {
        if (deductions.Count == 0) return;
        var tenant = TenantId.From(tenantId);
        foreach (var d in deductions)
        {
            var delta = reverse ? d.Quantity : -d.Quantity;
            var after = await stock.AdjustAvailableAsync(tenant, d.VariantId, delta, reason, ct);
            logger.LogInformation(
                "Stock ML {Action}: tenant {TenantId}, variante {VariantId}, {Delta} → queda {After}.",
                reverse ? "devuelto" : "aplicado", tenantId, d.VariantId, delta, after);
        }
        await kits.MoveAsync(tenantId, [.. deductions.Select(d => (d.VariantId, d.Quantity))], reverse, reason, ct);
    }

    /// <summary>
    /// Ventas procesadas antes de guardar qué descontaron: se reconstruye con
    /// la regla de entonces (vínculo con el stock de la publicación prendido).
    /// </summary>
    private async Task<List<MeliStockDeduction>> LegacyDeductionsAsync(
        Guid tenantId, IReadOnlyList<MeliOrderItemSnapshot> items, CancellationToken ct)
    {
        var deductions = new List<MeliStockDeduction>();
        foreach (var item in items)
        {
            var link = await LinkOfAsync(tenantId, item, ct);
            if (link is { SyncStock: true }) deductions.Add(new MeliStockDeduction(link.VariantId, item.Quantity));
        }
        return deductions;
    }

    /// <summary>Vínculo exacto (publicación + variación) o, si no hay, el de la publicación entera.</summary>
    private async Task<MeliItemLink?> LinkOfAsync(Guid tenantId, MeliOrderItemSnapshot item, CancellationToken ct) =>
        await db.ItemLinks.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(l => l.TenantId == tenantId && l.MeliItemId == item.ItemId
                && l.MeliVariationId == item.VariationId, ct)
        // Publicación con variaciones vendida pero vinculada a nivel item: fallback.
        ?? await db.ItemLinks.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(l => l.TenantId == tenantId && l.MeliItemId == item.ItemId
                && l.MeliVariationId == null, ct);

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
