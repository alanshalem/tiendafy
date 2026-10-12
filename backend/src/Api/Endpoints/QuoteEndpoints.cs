using Api.Auth;
using Api.Pricing;
using Catalog.Contracts;
using Identity.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Orders.Core.Domain;
using Orders.Infrastructure.Persistence;
using SharedKernel.Abstractions;
using SharedKernel.Common;

namespace Api.Endpoints;

/// <summary>
/// Presupuestos: los precios que se le pasan a un cliente antes de que compre.
///
/// Para una importadora que le vende a revendedores es el paso que faltaba: se
/// cotiza, el cliente piensa, y si acepta la venta se genera sola con los
/// precios que se cotizaron — no con los de hoy. Congelar el precio es la razón
/// de existir del documento.
///
/// Un presupuesto NO reserva stock. Es una propuesta, y reservar mercadería por
/// cada cotización dejaría el depósito trabado con ventas que nunca ocurrieron.
/// El stock se reserva al aceptarlo, que es cuando nace la venta, y ahí sí puede
/// faltar: la pantalla lo avisa en vez de vender lo que no hay.
/// </summary>
public static class QuoteEndpoints
{
    public static RouteGroupBuilder MapQuoteEndpoints(this RouteGroupBuilder group)
    {
        var quotes = group.MapGroup("/quotes").RequireTenant().RequirePermission(Permission.QuotesManage);

        quotes.MapGet("/", async (
            ITenantContext tenant, OrdersDbContext db, CancellationToken ct,
            string? status = null, string? q = null, int limit = 25, int offset = 0) =>
        {
            var tid = tenant.TenantId;
            var query = db.Quotes.AsNoTracking().Where(x => x.TenantId == tid);

            if (Enum.TryParse<QuoteStatus>(status, true, out var parsed))
                query = query.Where(x => x.Status == parsed);

            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = $"%{q.Trim()}%";
                query = query.Where(x => EF.Functions.ILike(x.CustomerName, term)
                                         || EF.Functions.ILike(x.Number, term));
            }

            var (rows, total) = await query
                .OrderByDescending(x => x.CreatedAtUtc)
                .PageAsync(offset, limit, ct, maxLimit: 100);

            return Results.Ok(new { total, items = rows.Select(ToListDto) });
        });

        // Cuánto se cotiza y cuánto se cierra. Es el número que dice si el
        // precio está bien puesto, y no sale de ninguna otra pantalla.
        quotes.MapGet("/summary", async (ITenantContext tenant, OrdersDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var rows = await db.Quotes.AsNoTracking().Where(x => x.TenantId == tid).ToListAsync(ct);
            var decided = rows.Count(x => x.Status is QuoteStatus.Accepted or QuoteStatus.Rejected);

            return Results.Ok(new
            {
                total = rows.Count,
                open = rows.Count(x => x.IsEditable && !x.IsExpired),
                expired = rows.Count(x => x.IsExpired),
                accepted = rows.Count(x => x.Status == QuoteStatus.Accepted),
                rejected = rows.Count(x => x.Status == QuoteStatus.Rejected),
                // Sobre los decididos, no sobre el total: los que siguen abiertos
                // todavía no ganaron ni perdieron, y meterlos hunde el número.
                conversionPercent = decided == 0
                    ? 0
                    : Math.Round(rows.Count(x => x.Status == QuoteStatus.Accepted) * 100d / decided, 1),
                openAmountMinor = rows.Where(x => x.IsEditable && !x.IsExpired).Sum(x => x.Total.AmountInMinorUnits),
                currency = rows.FirstOrDefault()?.Currency ?? Money.DefaultCurrency,
            });
        });

        quotes.MapGet("/{id:guid}", async (
            Guid id, ITenantContext tenant, OrdersDbContext db, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var quote = await db.Quotes.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tid, ct);
            return quote is null ? Results.NotFound() : Results.Ok(ToDetailDto(quote));
        });

        // Los precios que le tocan a ESTE cliente, para armar el presupuesto sin
        // tener que ir a buscarlos. Si tiene lista asignada, salen de ahí.
        quotes.MapGet("/prices", async (
            ITenantContext tenant, ICatalogCheckoutQuery catalog, PriceListService pricing,
            Customers.Infrastructure.CustomersDbContext customers, CancellationToken ct,
            Guid? customerId = null, string? variantIds = null) =>
        {
            var ids = (variantIds ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(s => Guid.TryParse(s, out var g) ? g : Guid.Empty)
                .Where(g => g != Guid.Empty).Distinct().Take(200).ToList();
            if (ids.Count == 0) return Results.Ok(new { items = Array.Empty<object>() });

            var tid = tenant.TenantId;
            var assigned = customerId is { } cid
                ? await customers.Customers.AsNoTracking()
                    .Where(c => c.Id == cid && c.TenantId == tid.Value)
                    .Select(c => c.PriceListId).FirstOrDefaultAsync(ct)
                : null;

            var listId = await pricing.ActiveListForAsync(tid, assigned, ct);
            var resolver = await pricing.LoadAsync(tid, ct);
            var variants = await catalog.GetVariantsAsync(tid.Value, ids, ct);

            return Results.Ok(new
            {
                priceListApplied = listId,
                items = variants.Select(v => new
                {
                    variantId = v.VariantId,
                    priceMinor = resolver.Resolve(listId, v.VariantId, v.Price.Amount),
                    currency = v.Price.Currency,
                }),
            });
        });

        quotes.MapPost("/", async (
            QuoteRequest req, ITenantContext tenant, OrdersDbContext db,
            ICatalogCheckoutQuery catalog, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var number = await NextNumberAsync(db, tid, ct);
            var currency = req.Currency ?? Money.DefaultCurrency;

            var created = Quote.Create(
                tid, number, req.CustomerName, req.CustomerId, req.CustomerEmail, currency,
                req.ValidUntilUtc ?? DateTime.UtcNow.Date.AddDays(15));
            if (created.IsFailure) return created.Error.ToProblem();

            var filled = await ApplyAsync(created.Value, req, catalog, tid, currency, ct);
            if (filled.IsFailure) return filled.Error.ToProblem();

            db.Quotes.Add(created.Value);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/quotes/{created.Value.Id}", ToDetailDto(created.Value));
        });

        quotes.MapPut("/{id:guid}", async (
            Guid id, QuoteRequest req, ITenantContext tenant, OrdersDbContext db,
            ICatalogCheckoutQuery catalog, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var quote = await db.Quotes.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tid, ct);
            if (quote is null) return Results.NotFound();

            var filled = await ApplyAsync(quote, req, catalog, tid, quote.Currency, ct);
            if (filled.IsFailure) return filled.Error.ToProblem();

            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDetailDto(quote));
        });

        quotes.MapPost("/{id:guid}/send", async (
            Guid id, ITenantContext tenant, OrdersDbContext db, CancellationToken ct) =>
        {
            var quote = await db.Quotes.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId, ct);
            if (quote is null) return Results.NotFound();

            var sent = quote.MarkSent();
            if (sent.IsFailure) return sent.Error.ToProblem();

            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDetailDto(quote));
        });

        quotes.MapPost("/{id:guid}/reject", async (
            Guid id, QuoteDecisionRequest? req, ITenantContext tenant, OrdersDbContext db, CancellationToken ct) =>
        {
            var quote = await db.Quotes.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId, ct);
            if (quote is null) return Results.NotFound();

            var rejected = quote.Reject(req?.Reason);
            if (rejected.IsFailure) return rejected.Error.ToProblem();

            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDetailDto(quote));
        });

        quotes.MapPost("/{id:guid}/reopen", async (
            Guid id, ITenantContext tenant, OrdersDbContext db, CancellationToken ct) =>
        {
            var quote = await db.Quotes.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId, ct);
            if (quote is null) return Results.NotFound();

            var reopened = quote.Reopen();
            if (reopened.IsFailure) return reopened.Error.ToProblem();

            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDetailDto(quote));
        });

        quotes.MapPost("/{id:guid}/extend", async (
            Guid id, QuoteExtendRequest req, ITenantContext tenant, OrdersDbContext db, CancellationToken ct) =>
        {
            var quote = await db.Quotes.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId, ct);
            if (quote is null) return Results.NotFound();

            var extended = quote.ExtendValidity(req.ValidUntilUtc);
            if (extended.IsFailure) return extended.Error.ToProblem();

            await db.SaveChangesAsync(ct);
            return Results.Ok(ToDetailDto(quote));
        });

        // Aceptar = convertir en venta. Los precios son los del presupuesto, no
        // los de hoy: es lo que se le prometió al cliente.
        quotes.MapPost("/{id:guid}/accept", async (
            Guid id, QuoteAcceptRequest req, ITenantContext tenant, OrdersDbContext db,
            Api.Orders.ManualOrderService manual, CancellationToken ct) =>
        {
            var tid = tenant.TenantId;
            var quote = await db.Quotes.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tid, ct);
            if (quote is null) return Results.NotFound();

            var method = req.PaymentMethod ?? "cash";
            if (method is not ("cash" or "transfer" or Api.Orders.ManualOrderService.CurrentAccountMethod))
                return Error.Validation(
                    "Quote.BadPayment",
                    "Un presupuesto se cierra en efectivo, por transferencia o en cuenta corriente.").ToProblem();

            // Se verifica ANTES de crear la venta: aceptar y que falle el guardado
            // del presupuesto dejaría una venta sin presupuesto que la explique.
            if (!quote.IsEditable)
                return Error.Validation(
                    "Quote.Closed",
                    quote.Status == QuoteStatus.Accepted
                        ? "Este presupuesto ya se convirtió en venta."
                        : "Este presupuesto figura como rechazado. Reabrilo antes de aceptarlo.").ToProblem();

            if (quote.IsExpired)
                return Error.Validation(
                    "Quote.Expired",
                    "El presupuesto está vencido. Revisá los precios y extendé la validez antes de aceptarlo.").ToProblem();

            var order = await manual.CreateAsync(tid, new ManualOrderRequest(
                Items: [.. quote.Items.Select(i => new ManualOrderItemRequest(
                    i.VariantId, i.Quantity, i.UnitPrice.AmountInMinorUnits))],
                PaymentMethod: method,
                BuyerEmail: quote.CustomerEmail,
                BuyerName: quote.CustomerName,
                Notes: $"Presupuesto {quote.Number}",
                DiscountMinor: quote.DiscountAmount.AmountInMinorUnits > 0
                    ? quote.DiscountAmount.AmountInMinorUnits
                    : null,
                CustomerId: quote.CustomerId), null, ct);
            if (order.IsFailure) return order.Error.ToProblem();

            var accepted = quote.Accept(order.Value.Order.Id);
            if (accepted.IsFailure) return accepted.Error.ToProblem();

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { quote = ToDetailDto(quote), orderId = order.Value.Order.Id });
        });

        return group;
    }

    /// <summary>
    /// Vuelca el request al presupuesto, resolviendo los productos contra el
    /// catálogo. El precio que manda es el del request: el vendedor ya lo
    /// decidió mirando la lista del cliente, y acá no se vuelve a calcular.
    /// </summary>
    private static async Task<Result> ApplyAsync(
        Quote quote, QuoteRequest req, ICatalogCheckoutQuery catalog, TenantId tenantId,
        string currency, CancellationToken ct)
    {
        if (req.Items is not { Count: > 0 })
            return Result.Failure(Error.Validation("Quote.Items", "Agregá al menos un producto."));

        var ids = req.Items.Select(i => i.VariantId).Distinct().ToList();
        var variants = (await catalog.GetVariantsAsync(tenantId.Value, ids, ct)).ToDictionary(v => v.VariantId);
        if (variants.Count != ids.Count)
            return Result.Failure(Error.Validation("Quote.UnknownVariant", "Algún producto ya no existe."));

        var lines = req.Items.Select(i =>
        {
            var v = variants[i.VariantId];
            var price = i.UnitPriceMinor is { } p and >= 0 ? p : v.Price.Amount;
            return (i.VariantId, v.ProductName, v.VariantDescription, v.Sku,
                new Money(price, currency), i.Quantity);
        }).ToList();

        return quote.Replace(
            req.CustomerName, req.CustomerId, req.CustomerEmail,
            req.ValidUntilUtc ?? quote.ValidUntilUtc,
            lines,
            req.DiscountMinor is { } d and > 0 ? new Money(d, currency) : null,
            req.Notes);
    }

    /// <summary>
    /// Numerador por tienda, con el índice único de (tenant, número) detrás: si
    /// dos presupuestos salen en el mismo instante, el segundo falla y se
    /// reintenta en vez de repetir número en silencio.
    /// </summary>
    private static async Task<string> NextNumberAsync(OrdersDbContext db, TenantId tenantId, CancellationToken ct)
    {
        var count = await db.Quotes.CountAsync(q => q.TenantId == tenantId, ct);
        return $"PRE-{count + 1:D4}";
    }

    private static object ToListDto(Quote q) => new
    {
        id = q.Id,
        number = q.Number,
        status = q.Status.ToString().ToLowerInvariant(),
        expired = q.IsExpired,
        customerId = q.CustomerId,
        customerName = q.CustomerName,
        validUntilUtc = q.ValidUntilUtc,
        totalMinor = q.Total.AmountInMinorUnits,
        currency = q.Currency,
        items = q.Items.Count,
        createdAtUtc = q.CreatedAtUtc,
        convertedOrderId = q.ConvertedOrderId,
    };

    private static object ToDetailDto(Quote q) => new
    {
        id = q.Id,
        number = q.Number,
        status = q.Status.ToString().ToLowerInvariant(),
        expired = q.IsExpired,
        editable = q.IsEditable,
        customerId = q.CustomerId,
        customerName = q.CustomerName,
        customerEmail = q.CustomerEmail,
        currency = q.Currency,
        validUntilUtc = q.ValidUntilUtc,
        notes = q.Notes,
        rejectionReason = q.RejectionReason,
        convertedOrderId = q.ConvertedOrderId,
        createdAtUtc = q.CreatedAtUtc,
        sentAtUtc = q.SentAtUtc,
        decidedAtUtc = q.DecidedAtUtc,
        subtotalMinor = q.Subtotal.AmountInMinorUnits,
        discountMinor = q.DiscountAmount.AmountInMinorUnits,
        totalMinor = q.Total.AmountInMinorUnits,
        items = q.Items.Select(i => new
        {
            variantId = i.VariantId,
            productName = i.ProductName,
            variantDescription = i.VariantDescription,
            sku = i.Sku,
            unitPriceMinor = i.UnitPrice.AmountInMinorUnits,
            quantity = i.Quantity,
            lineTotalMinor = i.LineTotal.AmountInMinorUnits,
        }),
    };
}

public sealed record QuoteItemRequest(Guid VariantId, int Quantity, long? UnitPriceMinor);

public sealed record QuoteRequest(
    string? CustomerName, Guid? CustomerId, string? CustomerEmail, string? Currency,
    DateTime? ValidUntilUtc, IReadOnlyList<QuoteItemRequest>? Items, long? DiscountMinor, string? Notes);

public sealed record QuoteDecisionRequest(string? Reason);

public sealed record QuoteExtendRequest(DateTime ValidUntilUtc);

public sealed record QuoteAcceptRequest(string? PaymentMethod);
