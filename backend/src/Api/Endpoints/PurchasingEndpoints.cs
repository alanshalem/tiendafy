using Api.Ai;
using Api.Auth;
using Catalog.Contracts;
using Catalog.Core.Features.UpdateProduct;
using Identity.Infrastructure;
using Inventory.Core.Domain;
using Microsoft.EntityFrameworkCore;
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
        var purchasing = group.MapGroup("/purchasing").RequireTenant().RequirePermission(Permission.PurchasingManage);

        purchasing.MapGet("/purchase-orders", async (
            ITenantContext tenant, Api.Purchasing.PurchaseOrderQueries queries, CancellationToken ct,
            string? status = null, string? q = null, string? group = null,
            int? limit = null, int? offset = null) =>
        {
            PurchaseOrderStatus? st = Enum.TryParse<PurchaseOrderStatus>(status, true, out var parsed) ? parsed : null;
            var filter = new Api.Purchasing.PurchaseOrderFilter(st, Api.Purchasing.PurchaseOrderQueries.ParseGroup(group), q);

            var (orders, total) = await queries.Filtered(tenant.TenantId.Value, filter)
                .OrderByDescending(p => p.CreatedAtUtc)
                .PageAsync(offset, limit, ct);
            return Results.Ok(new { items = orders.Select(ToListDto), total });
        });

        // Resumen de compras: qué hay en camino y cuánta plata está comprometida.
        purchasing.MapGet("/summary", async (
            ITenantContext tenant, Api.Purchasing.PurchaseOrderQueries queries, CancellationToken ct) =>
        {
            var s = await queries.SummaryAsync(tenant.TenantId.Value, ct);

            return Results.Ok(new
            {
                total = s.Total,
                open = s.Open,
                inTransit = s.InTransit,
                received = s.Received,
                committedFob = s.CommittedFob,
                currency = s.Currency,
                withoutInvoice = s.WithoutInvoice,
            });
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

            var applied = await ApplyDraftAsync(po, request, tenant, db, catalog, ct);
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

            var applied = await ApplyDraftAsync(po, request, tenant, db, catalog, ct);
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
            foreach (var (variantId, info) in landed)
            {
                try
                {
                    await stock.AdjustAvailableAsync(tenant.TenantId, variantId, info.Received, reason, ct);
                }
                catch (Exception)
                {
                    stockErrors.Add(variantId.ToString());
                }
            }

            // Costos: agrupar por producto y fijar el landed unitario en ARS.
            var variantIds = landed.Keys.ToList();
            var variantInfos = await catalog.GetVariantsAsync(tenant.TenantId.Value, variantIds, ct);
            foreach (var g in variantInfos.GroupBy(v => v.ProductId))
            {
                var costs = g.Select(v => (v.VariantId, (long?)landed[v.VariantId].CostMinor)).ToList();
                await products.SetVariantCostsAsync(
                    new SetVariantCostsCommand(tenant.TenantId, g.Key, costs, Money.DefaultCurrency), ct);
            }

            // Cierre del loop costo→precio: qué variantes quedaron con margen
            // aplastado al costo nuevo (el panel lo muestra al terminar — sin
            // esto, el merchant se entera solo si se le ocurre entrar a Costos).
            var lowMargin = variantInfos
                .Where(v => v.Price.Amount > 0)
                .Select(v => new
                {
                    variantId = v.VariantId,
                    product = v.ProductName,
                    variant = v.VariantDescription,
                    marginPct = Math.Round(
                        (v.Price.Amount - landed[v.VariantId].CostMinor) * 100m / v.Price.Amount, 1),
                })
                .Where(x => x.marginPct < 15m)
                .OrderBy(x => x.marginPct)
                .ToList();

            return Results.Ok(new
            {
                order = ToDetailDto(po),
                stockErrors,
                costsUpdated = landed.Count,
                lowMargin,
            });
        });

        // Comprobante del proveedor. Se puede cargar en cualquier estado: la
        // factura suele llegar después de la mercadería, y el contador la
        // necesita igual.
        purchasing.MapPut("/purchase-orders/{id:guid}/invoice", async (
            Guid id, SupplierInvoiceRequest request, ITenantContext tenant, PurchasingDbContext db,
            Api.Finance.LedgerPoster ledger, CancellationToken ct) =>
        {
            var po = await db.PurchaseOrders.FirstOrDefaultAsync(p => p.Id == id, ct);
            if (po is null) return Results.NotFound();

            var result = po.SetSupplierInvoice(
                request.SupplierTaxId, request.InvoiceType, request.InvoiceNumber,
                request.InvoiceDateUtc, request.InvoiceNetArs, request.InvoiceVatArs);
            if (result.IsFailure) return result.Error.ToProblem();

            await db.SaveChangesAsync(ct);

            // La factura del proveedor es el momento en que la deuda existe: antes
            // había una orden, no una obligación de pago. Solo se asienta si la
            // orden tiene ficha de proveedor — sin alguien a quien deberle, no hay
            // cuenta corriente que mover.
            if (po.SupplierId is { } supplierId && po.HasSupplierInvoice)
            {
                var totalArs = (po.InvoiceNetArs ?? 0m) + (po.InvoiceVatArs ?? 0m);
                await ledger.PostPurchaseAsync(
                    tenant.TenantId.Value, supplierId, po.Id,
                    $"{po.InvoiceType ?? "Factura"} {po.InvoiceNumber}".Trim(),
                    (long)Math.Round(totalArs * 100m), "ARS",
                    po.InvoiceDateUtc ?? DateTime.UtcNow, ct);
            }

            return Results.Ok(ToDetailDto(po));
        });

        // Leer la factura del proveedor y PROPONER los datos. No guarda nada: la
        // persona revisa la propuesta y confirma con el PUT de arriba. Un número
        // mal leído entra derecho al libro de IVA y a la cuenta corriente.
        purchasing.MapPost("/purchase-orders/{id:guid}/invoice/scan", async (
            Guid id, IFormFile file, PurchasingDbContext db,
            Api.Purchasing.InvoiceScanner scanner, CancellationToken ct) =>
        {
            if (file.Length > Api.Purchasing.InvoiceScanner.MaxBytes)
                return Error.Validation(
                    "Invoice.TooLarge", "El archivo supera los 10 MB.").ToProblem();

            var po = await db.PurchaseOrders.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, ct);
            if (po is null) return Results.NotFound();

            // A memoria y no a disco: el archivo no se guarda en ningún lado, y
            // el tope de 10 MB ya está verificado.
            using var buffer = new MemoryStream();
            await file.CopyToAsync(buffer, ct);

            var scanned = await scanner.ScanAsync(buffer.ToArray(), file.ContentType, po, ct);
            if (scanned.IsFailure) return scanned.Error.ToProblem();

            var proposal = scanned.Value;
            var s = proposal.Invoice;
            return Results.Ok(new
            {
                supplierName = s.SupplierName,
                supplierTaxId = s.SupplierTaxId,
                invoiceType = s.InvoiceType,
                invoiceNumber = s.InvoiceNumber,
                invoiceDateUtc = s.InvoiceDate,
                currency = s.Currency,
                netAmount = s.NetAmount,
                vatAmount = s.VatAmount,
                otherAmount = s.OtherAmount,
                totalAmount = s.TotalAmount,
                confidence = s.Confidence,
                warnings = proposal.Warnings,
                // Lo que no cierra después de la corrección, con los números tal cual se leyeron.
                checks = proposal.Checks.Select(c => new { c.Code, c.Message }),
                correctionRound = proposal.CorrectionRound,
                // El emparejamiento es una ayuda para revisar: no viaja en el PUT ni se guarda.
                lines = s.Lines.Select((l, i) =>
                {
                    var m = proposal.Matches[i];
                    return new
                    {
                        l.Description,
                        l.Code,
                        l.Quantity,
                        l.UnitPrice,
                        match = new
                        {
                            m.VariantId,
                            method = m.Method.ToString().ToLowerInvariant(),
                            m.Confidence,
                            m.Candidates,
                        },
                    };
                }),
                // Si la factura está en otra moneda que la orden, los importes
                // del comprobante van en pesos igual (es lo que pide el libro de
                // IVA) y hay que convertir a mano: mejor decirlo que suponerlo.
                currencyMismatch = !string.Equals(s.Currency, "ARS", StringComparison.OrdinalIgnoreCase),
            });
        }).DisableAntiforgery().RequireAiRateLimit(AiRateLimitKind.PerUser);

        // Libro de IVA compras del mes, en el mismo formato que el de ventas:
        // el crédito fiscal de las compras que hasta ahora no salía del sistema.
        purchasing.MapGet("/vat-book", async (
            int year, int month, PurchasingDbContext db, CancellationToken ct) =>
        {
            if (year < 2020 || month is < 1 or > 12)
                return Error.Validation("Purchase.BadPeriod", "Período inválido.").ToProblem();
            var from = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
            var to = from.AddMonths(1);

            var orders = (await db.PurchaseOrders.AsNoTracking()
                    .Where(p => p.InvoiceDateUtc >= from && p.InvoiceDateUtc < to)
                    .ToListAsync(ct))
                .Where(p => p.HasSupplierInvoice)
                .OrderBy(p => p.InvoiceDateUtc)
                .ToList();

            var bytes = Api.Fiscal.VatBookCsv.Build(
                "Fecha;Tipo;Numero;CUIT proveedor;Proveedor;Neto;IVA;Total",
                orders.Select(p =>
                {
                    var net = p.InvoiceNetArs ?? 0m;
                    var vat = p.InvoiceVatArs ?? 0m;
                    return new[]
                    {
                        Api.Fiscal.VatBookCsv.Date(p.InvoiceDateUtc!.Value),
                        p.InvoiceType ?? "",
                        p.InvoiceNumber ?? "",
                        p.SupplierTaxId ?? "",
                        p.SupplierName,
                        Api.Fiscal.VatBookCsv.Amount(net),
                        Api.Fiscal.VatBookCsv.Amount(vat),
                        Api.Fiscal.VatBookCsv.Amount(net + vat),
                    };
                }));
            return Results.File(bytes, "text/csv", $"libro-iva-compras-{year}-{month:00}.csv");
        });

        // Reposición con lead time (ver ReorderSignal): la misma cuenta que usan
        // las alertas de stock bajo, para que el aviso y esta pantalla coincidan.
        purchasing.MapGet("/reorder-suggestions", async (
            ITenantContext tenant, Api.Purchasing.ReorderSignal signal, CancellationToken ct,
            int? leadTimeDays = null) =>
        {
            var result = await signal.SuggestionsAsync(tenant.TenantId, leadTimeDays, ct);
            return Results.Ok(new
            {
                leadTimeDays = result.LeadTimeDays,
                windowDays = result.WindowDays,
                bufferDays = result.BufferDays,
                items = result.Items,
            });
        });

        return group;
    }

    /// <summary>Aplica los campos de un borrador, resolviendo los datos de variantes desde el catálogo.</summary>
    private static async Task<Result> ApplyDraftAsync(
        PurchaseOrder po, SavePurchaseOrderRequest request, ITenantContext tenant,
        PurchasingDbContext db, ICatalogCheckoutQuery catalog, CancellationToken ct)
    {
        var updated = po.UpdateDraft(
            request.SupplierName, request.Reference, request.Notes,
            request.Currency ?? "USD", request.ExchangeRate ?? 1m, request.LeadTimeDays);
        if (updated.IsFailure) return updated;

        // El proveedor escrito a mano también queda en Proveedores: si no, la
        // ficha (sus compras, su saldo) nunca se enteraba de esta compra.
        var supplier = await Api.Purchasing.SupplierLinker.ResolveAsync(
            db, tenant.TenantId.Value, request.SupplierId, request.SupplierName, ct);
        po.LinkSupplier(supplier?.Id);

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
        supplierId = po.SupplierId,
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
        supplierTaxId = po.SupplierTaxId,
        invoiceType = po.InvoiceType,
        invoiceNumber = po.InvoiceNumber,
        invoiceDateUtc = po.InvoiceDateUtc,
        invoiceNetArs = po.InvoiceNetArs,
        invoiceVatArs = po.InvoiceVatArs,
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
    List<PurchaseItemRequest>? Items, List<PurchaseExpenseRequest>? Expenses,
    // Ficha del proveedor. Opcional: las órdenes viejas y las de un proveedor
    // ocasional siguen funcionando solo con el nombre escrito a mano.
    Guid? SupplierId = null);

public sealed record SupplierInvoiceRequest(
    string? SupplierTaxId, string? InvoiceType, string? InvoiceNumber,
    DateTime? InvoiceDateUtc, decimal? InvoiceNetArs, decimal? InvoiceVatArs);

public sealed record SetPurchaseStatusRequest(string Status);

public sealed record ReceiveItemRequest(Guid VariantId, int ReceivedQuantity);

public sealed record ReceivePurchaseRequest(List<ReceiveItemRequest>? Items, decimal? ExchangeRate);
