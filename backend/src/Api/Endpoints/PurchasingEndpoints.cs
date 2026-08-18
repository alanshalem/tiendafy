using Api.Auth;
using Catalog.Contracts;
using Catalog.Core.Features.UpdateProduct;
using Identity.Infrastructure;
using Inventory.Core.Domain;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using Purchasing.Infrastructure;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Compras a proveedores e importaciones (Bloque C del informe de features):
/// órdenes de compra con el ciclo del importador, landed cost prorrateado que
/// alimenta el costo por variante, recepción que sube stock, y sugerencias de
/// reposición que consideran el lead time (meses de tránsito ≠ "stock bajo").
/// </summary>
public static class PurchasingEndpoints
{
    public static RouteGroupBuilder MapPurchasingEndpoints(this RouteGroupBuilder group)
    {
        var purchasing = group.MapGroup("/purchasing").RequireTenant().RequirePermission(Permission.Purchasing);

        purchasing.MapGet("/purchase-orders", async (
            PurchasingDbContext db, CancellationToken ct, string? status = null) =>
        {
            var query = db.PurchaseOrders.AsNoTracking();
            if (Enum.TryParse<PurchaseOrderStatus>(status, true, out var st))
                query = query.Where(p => p.Status == st);
            var orders = await query.OrderByDescending(p => p.CreatedAtUtc).Take(200).ToListAsync(ct);
            return Results.Ok(new { items = orders.Select(ToListDto) });
        });

        purchasing.MapGet("/purchase-orders/{id:guid}", async (
            Guid id, PurchasingDbContext db, CancellationToken ct) =>
        {
            var po = await db.PurchaseOrders.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, ct);
            return po is null ? Results.NotFound() : Results.Ok(ToDetailDto(po));
        });

        purchasing.MapPost("/purchase-orders", async (
            SavePurchaseOrderRequest request, ITenantContext tenant, PurchasingDbContext db,
            ICatalogCheckoutQuery catalog, CancellationToken ct) =>
        {
            var created = PurchaseOrder.Create(tenant.TenantId.Value, request.SupplierName);
            if (created.IsFailure) return created.Error.ToProblem();
            var po = created.Value;

            var applied = await ApplyDraftAsync(po, request, tenant, catalog, ct);
            if (applied.IsFailure) return applied.Error.ToProblem();

            db.PurchaseOrders.Add(po);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/purchasing/purchase-orders/{po.Id}", ToDetailDto(po));
        });

        purchasing.MapPut("/purchase-orders/{id:guid}", async (
            Guid id, SavePurchaseOrderRequest request, ITenantContext tenant, PurchasingDbContext db,
            ICatalogCheckoutQuery catalog, CancellationToken ct) =>
        {
            var po = await db.PurchaseOrders.FirstOrDefaultAsync(p => p.Id == id, ct);
            if (po is null) return Results.NotFound();

            var applied = await ApplyDraftAsync(po, request, tenant, catalog, ct);
            if (applied.IsFailure) return applied.Error.ToProblem();

            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDetailDto(po));
        });

        // Avanza el estado del ciclo (Confirmed/InProduction/InTransit/InCustoms)
        // o cancela. Recibir NO pasa por acá: va por /receive (stock + costos).
        purchasing.MapPost("/purchase-orders/{id:guid}/status", async (
            Guid id, SetPurchaseStatusRequest request, PurchasingDbContext db, CancellationToken ct) =>
        {
            var po = await db.PurchaseOrders.FirstOrDefaultAsync(p => p.Id == id, ct);
            if (po is null) return Results.NotFound();

            Result result;
            if (string.Equals(request.Status, "cancelled", StringComparison.OrdinalIgnoreCase))
                result = po.Cancel();
            else if (Enum.TryParse<PurchaseOrderStatus>(request.Status, true, out var next))
                result = po.AdvanceTo(next);
            else
                result = Result.Failure(Error.Validation("Purchase.UnknownStatus", "Estado desconocido."));

            if (result.IsFailure) return result.Error.ToProblem();
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDetailDto(po));
        });

        // Recepción: cierra la OC, sube el stock de lo recibido y fija el costo
        // por variante al LANDED COST (FOB×TC + prorrateo de gastos) — de acá se
        // alimenta el dashboard de Rentabilidad con el costo real "en depósito".
        purchasing.MapPost("/purchase-orders/{id:guid}/receive", async (
            Guid id, ReceivePurchaseRequest request, ITenantContext tenant, PurchasingDbContext db,
            IStockRepository stock, ICatalogCheckoutQuery catalog, UpdateProductHandler products,
            CancellationToken ct) =>
        {
            var po = await db.PurchaseOrders.FirstOrDefaultAsync(p => p.Id == id, ct);
            if (po is null) return Results.NotFound();

            var received = (request.Items ?? []).ToDictionary(i => i.VariantId, i => i.ReceivedQuantity);
            var result = po.Receive(received, request.ExchangeRate);
            if (result.IsFailure) return result.Error.ToProblem();

            // Landed cost por variante ANTES de guardar (con el TC definitivo).
            var landed = po.Items
                .Where(i => (i.ReceivedQuantity ?? 0) > 0)
                .ToDictionary(i => i.VariantId, i => (Received: i.ReceivedQuantity!.Value, CostMinor: po.LandedUnitCostArsMinor(i)));

            await db.SaveChangesAsync(ct);

            // Stock: sube lo recibido (best effort por variante; una falla no
            // frena el resto — queda logueada en el resultado).
            var reason = $"Recepción de compra {(po.Reference is { Length: > 0 } r ? r : po.SupplierName)}";
            var stockErrors = new List<string>();
            var currentByVariant = (await stock.GetByVariantsAsync(tenant.TenantId, landed.Keys.ToList(), ct))
                .ToDictionary(s => s.VariantId, s => s.Available);
            foreach (var (variantId, info) in landed)
            {
                var available = currentByVariant.GetValueOrDefault(variantId);
                try
                {
                    await stock.SetAvailableAsync(tenant.TenantId, variantId, available + info.Received, reason, ct);
                }
                catch (Exception)
                {
                    stockErrors.Add(variantId.ToString());
                }
            }

            // Costos: agrupar por producto y fijar el landed unitario en ARS.
            var variantIds = landed.Keys.ToList();
            var byProduct = (await catalog.GetVariantsAsync(tenant.TenantId.Value, variantIds, ct))
                .GroupBy(v => v.ProductId);
            foreach (var g in byProduct)
            {
                var costs = g.Select(v => (v.VariantId, (long?)landed[v.VariantId].CostMinor)).ToList();
                await products.SetVariantCostsAsync(
                    new SetVariantCostsCommand(tenant.TenantId, g.Key, costs, Money.DefaultCurrency), ct);
            }

            return Results.Ok(new
            {
                order = ToDetailDto(po),
                stockErrors,
                costsUpdated = landed.Count,
            });
        });

        // Reposición con lead time: para un importador, "stock bajo" avisa tarde.
        // Cobertura (stock / venta diaria de 60 días) vs lead time + colchón.
        purchasing.MapGet("/reorder-suggestions", async (
            ITenantContext tenant, OrdersDbContext ordersDb, PurchasingDbContext purchasingDb,
            IStockRepository stock, ICatalogCheckoutQuery catalog, CancellationToken ct,
            int? leadTimeDays = null) =>
        {
            const int windowDays = 60;
            const int bufferDays = 30;
            var since = DateTime.UtcNow.AddDays(-windowDays);

            // Lead time: el pedido explícito, o el de la última OC recibida, o 60.
            var lead = leadTimeDays
                ?? await purchasingDb.PurchaseOrders.AsNoTracking()
                    .Where(p => p.LeadTimeDays != null && p.Status == PurchaseOrderStatus.Received)
                    .OrderByDescending(p => p.ReceivedAtUtc)
                    .Select(p => p.LeadTimeDays)
                    .FirstOrDefaultAsync(ct)
                ?? 60;

            var sold = (await ordersDb.Orders.AsNoTracking()
                    .Where(o => o.TenantId == tenant.TenantId && o.Status == OrderStatus.Paid && o.CreatedAtUtc >= since)
                    .ToListAsync(ct))
                .SelectMany(o => o.Items)
                .GroupBy(i => i.VariantId)
                .ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));
            if (sold.Count == 0) return Results.Ok(new { leadTimeDays = lead, items = Array.Empty<object>() });

            var stockByVariant = (await stock.GetByVariantsAsync(tenant.TenantId, sold.Keys.ToList(), ct))
                .ToDictionary(s => s.VariantId, s => s.Available);
            var variants = (await catalog.GetVariantsAsync(tenant.TenantId.Value, sold.Keys.ToList(), ct))
                .ToDictionary(v => v.VariantId);

            var suggestions = sold
                .Select(kv =>
                {
                    var perDay = kv.Value / (decimal)windowDays;
                    var available = stockByVariant.GetValueOrDefault(kv.Key);
                    var coverageDays = perDay > 0 ? (int)Math.Floor(available / perDay) : int.MaxValue;
                    var suggestedQty = (int)Math.Ceiling(perDay * (lead + bufferDays)) - available;
                    return new { kv.Key, perDay, available, coverageDays, suggestedQty };
                })
                .Where(x => x.coverageDays < lead + bufferDays && x.suggestedQty > 0)
                .OrderBy(x => x.coverageDays)
                .Take(100)
                .Select(x => new
                {
                    variantId = x.Key,
                    product = variants.TryGetValue(x.Key, out var v) ? v.ProductName : "(producto)",
                    variant = variants.TryGetValue(x.Key, out var v2) ? v2.VariantDescription : "",
                    sku = variants.TryGetValue(x.Key, out var v3) ? v3.Sku : "",
                    unitsPerDay = Math.Round(x.perDay, 2),
                    available = x.available,
                    coverageDays = x.coverageDays,
                    suggestedQty = x.suggestedQty,
                })
                .ToList();

            return Results.Ok(new { leadTimeDays = lead, windowDays, bufferDays, items = suggestions });
        });

        return group;
    }

    /// <summary>Aplica los campos de un borrador, resolviendo los datos de variantes desde el catálogo.</summary>
    private static async Task<Result> ApplyDraftAsync(
        PurchaseOrder po, SavePurchaseOrderRequest request, ITenantContext tenant,
        ICatalogCheckoutQuery catalog, CancellationToken ct)
    {
        var updated = po.UpdateDraft(
            request.SupplierName, request.Reference, request.Notes,
            request.Currency ?? "USD", request.ExchangeRate ?? 1m, request.LeadTimeDays);
        if (updated.IsFailure) return updated;

        var itemRequests = request.Items ?? [];
        var variantIds = itemRequests.Select(i => i.VariantId).Distinct().ToList();
        var snapshots = variantIds.Count == 0
            ? []
            : (await catalog.GetVariantsAsync(tenant.TenantId.Value, variantIds, ct)).ToDictionary(v => v.VariantId);

        var lines = new List<(Guid, string, string, string, int, decimal)>();
        foreach (var item in itemRequests)
        {
            if (!snapshots.TryGetValue(item.VariantId, out var v))
                return Result.Failure(Error.NotFound("Purchase.VariantNotFound", $"Variante {item.VariantId} inexistente."));
            lines.Add((v.VariantId, v.ProductName, v.VariantDescription, v.Sku, item.Quantity, item.UnitCost));
        }

        var items = po.SetItems(lines);
        if (items.IsFailure) return items;

        return po.SetExpenses((request.Expenses ?? []).Select(e => (e.Label, e.Amount, e.IsLocal)).ToList());
    }

    private static object ToListDto(PurchaseOrder po) => new
    {
        id = po.Id,
        supplierName = po.SupplierName,
        reference = po.Reference,
        status = po.Status.ToString().ToUpperInvariant(),
        currency = po.Currency,
        totalFob = po.TotalFob,
        items = po.Items.Count,
        units = po.Items.Sum(i => i.Quantity),
        createdAtUtc = po.CreatedAtUtc,
        receivedAtUtc = po.ReceivedAtUtc,
        leadTimeDays = po.LeadTimeDays,
    };

    private static object ToDetailDto(PurchaseOrder po) => new
    {
        id = po.Id,
        supplierName = po.SupplierName,
        reference = po.Reference,
        notes = po.Notes,
        status = po.Status.ToString().ToUpperInvariant(),
        currency = po.Currency,
        exchangeRate = po.ExchangeRate,
        leadTimeDays = po.LeadTimeDays,
        createdAtUtc = po.CreatedAtUtc,
        confirmedAtUtc = po.ConfirmedAtUtc,
        receivedAtUtc = po.ReceivedAtUtc,
        totalFob = po.TotalFob,
        totalExpensesArs = po.TotalExpensesArs,
        items = po.Items.Select(i => new
        {
            variantId = i.VariantId,
            productName = i.ProductName,
            variantDescription = i.VariantDescription,
            sku = i.Sku,
            quantity = i.Quantity,
            unitCost = i.UnitCost,
            receivedQuantity = i.ReceivedQuantity,
            landedUnitCostArsMinor = po.LandedUnitCostArsMinor(i),
        }),
        expenses = po.Expenses.Select(e => new { label = e.Label, amount = e.Amount, isLocal = e.IsLocal }),
    };
}

public sealed record PurchaseItemRequest(Guid VariantId, int Quantity, decimal UnitCost);

public sealed record PurchaseExpenseRequest(string Label, decimal Amount, bool IsLocal);

public sealed record SavePurchaseOrderRequest(
    string? SupplierName, string? Reference, string? Notes, string? Currency,
    decimal? ExchangeRate, int? LeadTimeDays,
    List<PurchaseItemRequest>? Items, List<PurchaseExpenseRequest>? Expenses);

public sealed record SetPurchaseStatusRequest(string Status);

public sealed record ReceiveItemRequest(Guid VariantId, int ReceivedQuantity);

public sealed record ReceivePurchaseRequest(List<ReceiveItemRequest>? Items, decimal? ExchangeRate);
