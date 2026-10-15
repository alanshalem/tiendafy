using Api.Auth;
using Api.Fulfillment;
using Catalog.Infrastructure.Persistence;
using Identity.Infrastructure;
using Inventory.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using SharedKernel.Abstractions;
using SharedKernel.Common;
using Tenancy.Infrastructure.Persistence;

namespace Api.Endpoints;

/// <summary>
/// Despacho: la cola de lo que hay que preparar, la lista de picking,
/// etiquetas y remitos en lote, y despachar escaneando. Todo pide "Despachar
/// pedidos", el permiso que ya cubre generar envíos y etiquetas.
///
/// <para>
/// Etiquetas y remitos son endpoints compartidos: los usa la pantalla de
/// Despacho y también las acciones en lote del listado de Ventas, para que
/// haya UNA manera de armar una etiqueta o un remito.
/// </para>
/// </summary>
public static class FulfillmentEndpoints
{
    public static RouteGroupBuilder MapFulfillmentEndpoints(this RouteGroupBuilder group)
    {
        var f = group.MapGroup("/fulfillment").RequireTenant().RequirePermission(Permission.OrdersFulfill);

        // Lo cobrado y sin despachar, lo más viejo primero. ?carrier=andreani|zipnova|correo|retiro|propio,
        // ?from/?to (fecha de cobro, inclusive/exclusiva).
        f.MapGet("/queue", async (
            ITenantContext tenant, FulfillmentService service, CancellationToken ct,
            string? carrier = null, DateTime? from = null, DateTime? to = null) =>
        {
            var items = await service.QueueAsync(tenant.TenantId, carrier,
                from?.ToUniversalTime(), to?.ToUniversalTime(), ct);
            return Results.Ok(new
            {
                items,
                total = items.Count,
                byCarrier = items.GroupBy(i => i.Carrier).ToDictionary(g => g.Key, g => g.Count()),
            });
        });

        f.MapPost("/pick-list", async (
            FulfillmentBatchRequest request, ITenantContext tenant, FulfillmentService service, CancellationToken ct) =>
        {
            if (BatchError(request) is { } error) return error.ToProblem();
            return Results.Ok(await service.PickListAsync(tenant.TenantId, request.OrderIds!, ct));
        });

        // Etiquetas de envío en UN pdf. Por defecto JSON con el resultado de cada
        // venta y el pdf en base64 (para contar "8 listas, 2 sin envío"); con
        // ?format=pdf, el pdf directo (y cuántas faltaron en X-Labels-Missing).
        f.MapPost("/labels", async (
            FulfillmentBatchRequest request, HttpContext http, ITenantContext tenant, CarrierLabels labels,
            CancellationToken ct, string? format = null) =>
        {
            if (BatchError(request) is { } error) return error.ToProblem();
            var batch = await labels.BuildAsync(tenant.TenantId, request.OrderIds!, ct);
            var fileName = $"etiquetas-{ArgentinaTime.Now:yyyy-MM-dd-HHmm}.pdf";

            if (string.Equals(format, "pdf", StringComparison.OrdinalIgnoreCase))
            {
                if (batch.Pdf is null)
                    return Results.Problem(title: "Fulfillment.NoLabels",
                        detail: "Ninguna de las ventas elegidas tiene etiqueta disponible.",
                        statusCode: StatusCodes.Status422UnprocessableEntity,
                        extensions: new Dictionary<string, object?> { ["results"] = batch.Results });
                http.Response.Headers["X-Labels-Missing"] = batch.Results.Count(r => r.Status != "ok").ToString();
                return Results.File(batch.Pdf, "application/pdf", fileName);
            }

            return Results.Ok(new
            {
                results = batch.Results,
                ok = batch.Results.Count(r => r.Status == "ok"),
                missing = batch.Results.Count(r => r.Status != "ok"),
                fileName = batch.Pdf is null ? null : fileName,
                pdfBase64 = batch.Pdf is null ? null : Convert.ToBase64String(batch.Pdf),
            });
        });

        // Remitos de preparación (una hoja por pedido, con QR para escanear en
        // Despacho). Sirven también para reimprimir los ya despachados.
        f.MapPost("/packing-slips", async (
            FulfillmentBatchRequest request, HttpContext http, ITenantContext tenant, OrdersDbContext ordersDb,
            IStockRepository stock, TenancyDbContext tenancy, CancellationToken ct) =>
        {
            if (BatchError(request) is { } error) return error.ToProblem();
            var ids = request.OrderIds!.Distinct().Take(FulfillmentService.MaxBatch).ToList();
            var orders = (await ordersDb.Orders.AsNoTracking()
                    .Where(o => o.TenantId == tenant.TenantId && ids.Contains(o.Id)
                        && (o.Status == OrderStatus.Paid || o.Status == OrderStatus.Fulfilled))
                    .ToListAsync(ct))
                .OrderBy(o => ids.IndexOf(o.Id))
                .ToList();
            if (orders.Count == 0)
                return Error.Validation("Fulfillment.NoSlips",
                    "Ninguna de las ventas elegidas está cobrada: no hay remitos para imprimir.").ToProblem();

            var variantIds = orders.SelectMany(o => o.Items.Select(i => i.VariantId)).Distinct().ToList();
            var locations = (await stock.GetByVariantsAsync(tenant.TenantId, variantIds, ct))
                .ToDictionary(s => s.VariantId, s => s.Location);
            var storeName = await tenancy.Tenants.AsNoTracking()
                .Where(t => t.Id == tenant.TenantId.Value).Select(t => t.Name).FirstOrDefaultAsync(ct) ?? "Tu tienda";

            var pdf = PackingSlipPdf.Render(storeName, [.. orders.Select(o => new PackingSlipPdf.Slip(o, locations))]);
            http.Response.Headers["X-Slips-Skipped"] = (ids.Count - orders.Count).ToString();
            return Results.File(pdf, "application/pdf", $"remitos-{ArgentinaTime.Now:yyyy-MM-dd-HHmm}.pdf");
        });

        // El pedido de un código escaneado (QR del remito o número corto), con
        // lo necesario para validar cada producto en el celular sin ir y volver
        // al servidor por cada pitido: SKU y código de barras de cada línea.
        f.MapGet("/orders/resolve", async (
            string code, ITenantContext tenant, FulfillmentService service, CatalogDbContext catalogDb,
            IStockRepository stock, CancellationToken ct) =>
        {
            var order = await service.ResolveOrderAsync(tenant.TenantId, code ?? string.Empty, ct);
            if (order is null)
                return Error.NotFound("Fulfillment.OrderNotFound", "No hay ninguna venta con ese código.").ToProblem();

            var variantIds = order.Items.Select(i => i.VariantId).Distinct().ToList();
            var barcodes = (await catalogDb.Products.AsNoTracking()
                    .Where(p => p.TenantId == tenant.TenantId && p.Variants.Any(v => variantIds.Contains(v.Id)))
                    .ToListAsync(ct))
                .SelectMany(p => p.Variants)
                .Where(v => variantIds.Contains(v.Id))
                .ToDictionary(v => v.Id, v => v.Barcode);
            var locations = (await stock.GetByVariantsAsync(tenant.TenantId, variantIds, ct))
                .ToDictionary(s => s.VariantId, s => s.Location);
            var shipment = (await service.ShipmentsAsync(tenant.TenantId.Value, [order.Id], ct)).GetValueOrDefault(order.Id);

            return Results.Ok(new
            {
                id = order.Id,
                number = FulfillmentService.Number(order),
                status = order.Status.ToString().ToUpperInvariant(),
                buyerEmail = order.BuyerEmail,
                buyerName = order.BuyerName,
                shippingMethodName = order.ShippingMethodName,
                shippingAddress = order.ShippingAddress,
                isPickup = order.IsPickup,
                carrier = shipment?.Carrier ?? Carrier.FromMethodName(order.ShippingMethodName, order.IsPickup),
                tracking = order.Tracking ?? shipment?.Tracking,
                items = order.Items.Select(i => new
                {
                    i.VariantId,
                    i.ProductName,
                    i.VariantDescription,
                    i.Sku,
                    barcode = barcodes.GetValueOrDefault(i.VariantId),
                    location = locations.GetValueOrDefault(i.VariantId),
                    i.Quantity,
                }),
            });
        });

        // Despachar escaneando: el servidor vuelve a contar lo escaneado contra
        // lo vendido (el celular puede equivocarse o quedarse con un pedido
        // viejo) y recién si coincide marca la venta enviada, con el mismo
        // aviso y la misma factura que el despacho desde el detalle. Sin
        // seguimiento escrito, va el del envío creado con el carrier.
        f.MapPost("/scan-dispatch", async (
            ScanDispatchRequest request, ITenantContext tenant, IOrderRepository orders,
            FulfillmentService service, Api.Orders.OrderFulfillment fulfillment, CancellationToken ct) =>
        {
            var order = await orders.GetByIdAsync(tenant.TenantId, request.OrderId, ct);
            if (order is null) return Results.NotFound();
            if (order.Status == OrderStatus.Fulfilled)
                return Error.Conflict("Fulfillment.AlreadyDispatched", "Este pedido ya estaba despachado.").ToProblem();
            if (order.Status != OrderStatus.Paid)
                return Error.Conflict("Fulfillment.NotPayable", "Este pedido no está cobrado y listo para despachar.").ToProblem();

            var check = await service.CheckScansAsync(tenant.TenantId, order, request.Scans ?? [], ct);
            if (!check.Ok)
                return Results.Problem(
                    title: "Fulfillment.ScanMismatch",
                    detail: $"Lo escaneado no coincide con el pedido: {check.Summary()}.",
                    statusCode: StatusCodes.Status422UnprocessableEntity,
                    extensions: new Dictionary<string, object?>
                    {
                        ["lines"] = check.Lines,
                        ["unknownCodes"] = check.UnknownCodes,
                    });

            var tracking = string.IsNullOrWhiteSpace(request.Tracking)
                ? (await service.ShipmentsAsync(tenant.TenantId.Value, [order.Id], ct)).GetValueOrDefault(order.Id)?.Tracking
                : request.Tracking.Trim();
            var result = await fulfillment.FulfillAsync(tenant.TenantId, order.Id, tracking, ct);
            if (result.IsFailure) return result.Error.ToProblem();

            var done = result.Value;
            return Results.Ok(new
            {
                id = done.Id,
                number = FulfillmentService.Number(done),
                status = done.Status.ToString().ToUpperInvariant(),
                tracking = done.Tracking,
                fulfilledAtUtc = done.FulfilledAtUtc,
            });
        });

        return group;
    }

    private static Error? BatchError(FulfillmentBatchRequest request)
    {
        var count = request.OrderIds?.Distinct().Count() ?? 0;
        if (count == 0) return Error.Validation("Fulfillment.Empty", "Elegí al menos un pedido.");
        if (count > FulfillmentService.MaxBatch)
            return Error.Validation("Fulfillment.TooMany", $"Se pueden procesar hasta {FulfillmentService.MaxBatch} pedidos por vez.");
        return null;
    }
}

/// <summary>Ventas elegidas para la lista de picking, las etiquetas o los remitos.</summary>
public sealed record FulfillmentBatchRequest(List<Guid>? OrderIds);

/// <summary>Lo escaneado de un pedido y el seguimiento (opcional) con el que se despacha.</summary>
public sealed record ScanDispatchRequest(Guid OrderId, List<ScanEntry>? Scans, string? Tracking);
