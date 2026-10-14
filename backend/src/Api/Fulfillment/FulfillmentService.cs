using Catalog.Infrastructure.Persistence;
using Checkout.Infrastructure.Persistence;
using Inventory.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using SharedKernel.Common;

namespace Api.Fulfillment;

/// <summary>
/// Con qué sale cada pedido. Lo decide el envío ya creado con el carrier; si
/// todavía no hay, el nombre del medio de envío que eligió el comprador.
/// </summary>
public static class Carrier
{
    public const string Andreani = "andreani";
    public const string Zipnova = "zipnova";
    public const string Correo = "correo";
    public const string Pickup = "retiro";
    public const string Own = "propio";

    public static string FromMethodName(string? methodName, bool isPickup)
    {
        if (isPickup) return Pickup;
        var name = methodName?.ToLowerInvariant() ?? string.Empty;
        if (name.Contains("andreani", StringComparison.Ordinal)) return Andreani;
        if (name.Contains("zipnova", StringComparison.Ordinal)) return Zipnova;
        if (name.Contains("correo", StringComparison.Ordinal)) return Correo;
        return Own;
    }
}

/// <summary>El envío creado con un carrier para una venta (si hay).</summary>
public sealed record CarrierShipment(string Carrier, string? Tracking, bool HasLabel);

public sealed record QueueOrder(
    Guid Id, string Number, DateTime CreatedAtUtc, DateTime? PaidAtUtc,
    string BuyerEmail, string? BuyerName, string? ShippingMethodName, string? ShippingAddress,
    bool IsPickup, string Carrier, CarrierShipment? Shipment, int Units, int Lines, string? Notes);

public sealed record PickOrderRef(Guid OrderId, string Number, int Quantity);

public sealed record PickLine(
    Guid VariantId, string Sku, string ProductName, string VariantDescription, string? Location,
    int Quantity, IReadOnlyList<PickOrderRef> Orders);

/// <summary>Un pedido que no entró a la lista, con el motivo en palabras del comercio.</summary>
public sealed record SkippedOrder(Guid OrderId, string Reason);

public sealed record PickList(IReadOnlyList<PickLine> Lines, int Orders, int Units, IReadOnlyList<SkippedOrder> Skipped);

/// <summary>Un escaneo: el código leído (barras o SKU) o la variante ya resuelta, y cuántas.</summary>
public sealed record ScanEntry(string? Code, Guid? VariantId, int Quantity = 1);

/// <summary>Cómo quedó una línea del pedido contra lo escaneado.</summary>
public sealed record ScanLineCheck(Guid VariantId, string Sku, string ProductName, int Expected, int Scanned)
{
    public bool Ok => Expected == Scanned;
}

public sealed record ScanCheck(IReadOnlyList<ScanLineCheck> Lines, IReadOnlyList<string> UnknownCodes)
{
    public bool Ok => UnknownCodes.Count == 0 && Lines.All(l => l.Ok);

    /// <summary>Lo que está mal, en una línea (para el cartel del panel).</summary>
    public string Summary()
    {
        var parts = new List<string>();
        foreach (var l in Lines.Where(l => !l.Ok))
            parts.Add(l.Expected == 0
                ? $"{l.ProductName} no va en este pedido ({l.Scanned} escaneada{(l.Scanned == 1 ? "" : "s")})"
                : l.Scanned < l.Expected
                    ? $"faltan {l.Expected - l.Scanned} de {l.ProductName}"
                    : $"sobran {l.Scanned - l.Expected} de {l.ProductName}");
        if (UnknownCodes.Count > 0) parts.Add($"códigos desconocidos: {string.Join(", ", UnknownCodes)}");
        return string.Join("; ", parts);
    }
}

/// <summary>
/// El despacho del depósito: la cola de lo que hay que preparar, la lista de
/// picking de varios pedidos juntos y la validación de "despachar
/// escaneando". Las etiquetas de los carriers van por <see cref="CarrierLabels"/>.
///
/// <para>
/// Vive en la Api porque cruza ventas, envíos (Checkout), catálogo y stock.
/// Lo que pasa al despachar (aviso al comprador, factura) NO se repite acá:
/// va por <see cref="Api.Orders.OrderFulfillment"/>, el mismo camino del
/// detalle de la venta y del despacho en lote.
/// </para>
/// </summary>
public sealed class FulfillmentService(
    OrdersDbContext ordersDb,
    CheckoutDbContext checkoutDb,
    CatalogDbContext catalogDb,
    IStockRepository stock)
{
    /// <summary>Tope de pedidos por lista de picking, etiquetas o remitos.</summary>
    public const int MaxBatch = 100;

    /// <summary>Tope de la cola: más de esto pendiente es otro problema.</summary>
    private const int QueueLimit = 300;

    public static string Number(Guid orderId) => $"#{Api.Orders.OrderCsv.ShortNumber(orderId)}";

    /// <summary>
    /// Lo cobrado y todavía sin despachar, lo más viejo primero (es lo que
    /// más espera el comprador). Filtra por carrier y por fecha de cobro.
    /// </summary>
    public async Task<IReadOnlyList<QueueOrder>> QueueAsync(
        TenantId tenantId, string? carrier, DateTime? fromUtc, DateTime? toUtc, CancellationToken ct)
    {
        var query = ordersDb.Orders.AsNoTracking()
            .Where(o => o.TenantId == tenantId && o.Status == OrderStatus.Paid);
        if (fromUtc is { } from) query = query.Where(o => (o.PaidAtUtc ?? o.CreatedAtUtc) >= from);
        if (toUtc is { } to) query = query.Where(o => (o.PaidAtUtc ?? o.CreatedAtUtc) < to);

        var orders = await query
            .OrderBy(o => o.PaidAtUtc ?? o.CreatedAtUtc)
            .Take(QueueLimit)
            .ToListAsync(ct);

        var shipments = await ShipmentsAsync(tenantId.Value, [.. orders.Select(o => o.Id)], ct);
        var items = orders.Select(o =>
        {
            var shipment = shipments.GetValueOrDefault(o.Id);
            return new QueueOrder(
                o.Id, Number(o.Id), o.CreatedAtUtc, o.PaidAtUtc,
                o.BuyerEmail, o.BuyerName, o.ShippingMethodName, o.ShippingAddress, o.IsPickup,
                shipment?.Carrier ?? Carrier.FromMethodName(o.ShippingMethodName, o.IsPickup),
                shipment,
                o.Items.Sum(i => i.Quantity), o.Items.Count, o.Notes);
        });

        return string.IsNullOrWhiteSpace(carrier)
            ? [.. items]
            : [.. items.Where(i => string.Equals(i.Carrier, carrier.Trim(), StringComparison.OrdinalIgnoreCase))];
    }

    /// <summary>Los envíos ya creados con Andreani o Zipnova, por venta.</summary>
    public async Task<Dictionary<Guid, CarrierShipment>> ShipmentsAsync(
        Guid tenantId, IReadOnlyCollection<Guid> orderIds, CancellationToken ct)
    {
        if (orderIds.Count == 0) return [];
        var result = new Dictionary<Guid, CarrierShipment>();

        var andreani = await checkoutDb.AndreaniShipments.AsNoTracking()
            .Where(s => s.TenantId == tenantId && orderIds.Contains(s.OrderId))
            .Select(s => new { s.OrderId, s.TrackingNumber, s.LabelUrl })
            .ToListAsync(ct);
        foreach (var s in andreani)
            result[s.OrderId] = new CarrierShipment(Carrier.Andreani, s.TrackingNumber,
                !string.IsNullOrWhiteSpace(s.LabelUrl));

        var zipnova = await checkoutDb.ZipnovaShipments.AsNoTracking()
            .Where(s => s.TenantId == tenantId && orderIds.Contains(s.OrderId))
            .Select(s => new { s.OrderId, s.CarrierTrackingId })
            .ToListAsync(ct);
        foreach (var s in zipnova)
            result.TryAdd(s.OrderId, new CarrierShipment(Carrier.Zipnova, s.CarrierTrackingId, HasLabel: true));

        return result;
    }

    /// <summary>
    /// Lista de picking de varios pedidos juntos: cada variante UNA vez, con
    /// cuánto llevar en total, de qué estante y para qué pedidos. Ordenada por
    /// ubicación, que es el recorrido por el depósito (lo sin ubicación, al
    /// final). Los pedidos que no están para despachar quedan afuera con el
    /// motivo, en vez de colarse en la lista.
    /// </summary>
    public async Task<PickList> PickListAsync(TenantId tenantId, IReadOnlyList<Guid> orderIds, CancellationToken ct)
    {
        var ids = orderIds.Distinct().Take(MaxBatch).ToList();
        var orders = await ordersDb.Orders.AsNoTracking()
            .Where(o => o.TenantId == tenantId && ids.Contains(o.Id))
            .ToListAsync(ct);

        var skipped = new List<SkippedOrder>();
        foreach (var id in ids.Where(id => orders.All(o => o.Id != id)))
            skipped.Add(new SkippedOrder(id, "La venta no existe en esta tienda."));
        foreach (var o in orders.Where(o => o.Status != OrderStatus.Paid))
            skipped.Add(new SkippedOrder(o.Id, o.Status == OrderStatus.Fulfilled
                ? "Ya está despachada."
                : "No está cobrada y lista para despachar."));

        var pickable = orders.Where(o => o.Status == OrderStatus.Paid)
            .OrderBy(o => ids.IndexOf(o.Id))
            .ToList();
        var variantIds = pickable.SelectMany(o => o.Items.Select(i => i.VariantId)).Distinct().ToList();
        var locations = (await stock.GetByVariantsAsync(tenantId, variantIds, ct))
            .ToDictionary(s => s.VariantId, s => s.Location);

        var lines = pickable
            .SelectMany(o => o.Items.Select(i => (Order: o, Item: i)))
            .GroupBy(x => x.Item.VariantId)
            .Select(g =>
            {
                var first = g.First().Item;
                return new PickLine(
                    g.Key, first.Sku, first.ProductName, first.VariantDescription,
                    locations.GetValueOrDefault(g.Key),
                    g.Sum(x => x.Item.Quantity),
                    [.. g.GroupBy(x => x.Order.Id)
                        .Select(og => new PickOrderRef(og.Key, Number(og.Key), og.Sum(x => x.Item.Quantity)))]);
            })
            .OrderBy(l => l.Location is null)
            .ThenBy(l => l.Location, StringComparer.OrdinalIgnoreCase)
            .ThenBy(l => l.Sku, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new PickList(lines, pickable.Count, lines.Sum(l => l.Quantity), skipped);
    }

    /// <summary>
    /// El pedido de un código escaneado: el QR del remito (el id completo), o
    /// el número corto que se lee en la etiqueta ("#A1B2C3D4" o sin el #).
    /// </summary>
    public async Task<Order?> ResolveOrderAsync(TenantId tenantId, string code, CancellationToken ct)
    {
        var needle = code.Trim().TrimStart('#');
        if (Guid.TryParse(needle, out var id))
            return await ordersDb.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.TenantId == tenantId && o.Id == id, ct);

        if (needle.Length != 8 || !needle.All(Uri.IsHexDigit)) return null;
        var prefix = needle.ToLowerInvariant();
        // Ocho hex del id: entre ventas cobradas de la misma tienda no se repiten
        // en la práctica; si se repitieran, mejor no adivinar cuál era.
        var matches = await ordersDb.Orders.AsNoTracking()
            .Where(o => o.TenantId == tenantId && o.Id.ToString().StartsWith(prefix))
            .Take(2)
            .ToListAsync(ct);
        return matches.Count == 1 ? matches[0] : null;
    }

    /// <summary>
    /// Contrasta lo escaneado con lo vendido, variante por variante: cada línea
    /// tiene que estar completa, sin sobrantes ni productos de otro pedido, y
    /// todos los códigos tienen que ser de esta tienda. Es lo que evita
    /// despachar la remera roja en vez de la azul.
    /// </summary>
    public async Task<ScanCheck> CheckScansAsync(
        TenantId tenantId, Order order, IReadOnlyList<ScanEntry> scans, CancellationToken ct)
    {
        var codes = scans.Where(s => s.VariantId is null && !string.IsNullOrWhiteSpace(s.Code))
            .Select(s => s.Code!.Trim()).Distinct().ToList();
        var byCode = new Dictionary<string, (Guid VariantId, string Sku, string Name)>(StringComparer.Ordinal);
        if (codes.Count > 0)
        {
            var products = await catalogDb.Products.AsNoTracking()
                .Where(p => p.TenantId == tenantId
                    && p.Variants.Any(v => (v.Barcode != null && codes.Contains(v.Barcode)) || codes.Contains(v.Sku)))
                .ToListAsync(ct);
            foreach (var p in products)
                foreach (var v in p.Variants)
                {
                    if (v.Barcode is { } barcode && codes.Contains(barcode)) byCode.TryAdd(barcode, (v.Id, v.Sku, p.Name));
                    if (codes.Contains(v.Sku)) byCode.TryAdd(v.Sku, (v.Id, v.Sku, p.Name));
                }
        }

        var scanned = new Dictionary<Guid, int>();
        var names = new Dictionary<Guid, (string Sku, string Name)>();
        var unknown = new List<string>();
        foreach (var s in scans)
        {
            var qty = Math.Clamp(s.Quantity, 0, 10_000);
            Guid? variant = s.VariantId;
            if (variant is null && s.Code is { } raw && byCode.TryGetValue(raw.Trim(), out var hit))
            {
                variant = hit.VariantId;
                names.TryAdd(hit.VariantId, (hit.Sku, hit.Name));
            }
            if (variant is null)
            {
                if (!string.IsNullOrWhiteSpace(s.Code)) unknown.Add(s.Code.Trim());
                continue;
            }
            scanned[variant.Value] = scanned.GetValueOrDefault(variant.Value) + qty;
        }

        var expected = order.Items.GroupBy(i => i.VariantId)
            .ToDictionary(g => g.Key, g => (Qty: g.Sum(i => i.Quantity), g.First().Sku, g.First().ProductName));
        var lines = expected
            .Select(e => new ScanLineCheck(e.Key, e.Value.Sku, e.Value.ProductName, e.Value.Qty, scanned.GetValueOrDefault(e.Key)))
            .Concat(scanned.Where(s => !expected.ContainsKey(s.Key)).Select(s =>
            {
                var known = names.GetValueOrDefault(s.Key);
                return new ScanLineCheck(s.Key, known.Sku ?? "", known.Name ?? "Un producto", 0, s.Value);
            }))
            .ToList();
        return new ScanCheck(lines, [.. unknown.Distinct()]);
    }
}
