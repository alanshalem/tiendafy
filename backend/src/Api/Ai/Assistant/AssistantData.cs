using Api.Crm;
using Api.Purchasing;
using Api.Stats;
using Microsoft.EntityFrameworkCore;
using Purchasing.Infrastructure;
using SharedKernel.Abstractions;

namespace Api.Ai.Assistant;

/// <summary>
/// <see cref="IAssistantData"/> sobre las consultas que comparten el panel y el
/// asistente. La tienda sale de <see cref="ITenantContext"/> y se pasa explícita
/// a cada consulta. Ningún resultado lleva mail, teléfono, documento, dirección
/// ni nombre de comprador: solo nombres de productos y de proveedores.
/// </summary>
public sealed class AssistantData(
    ITenantContext tenant, SalesOverviewQuery sales, TopProductsQuery top, AbandonedCartsQuery carts,
    ProfitabilityQuery profit, StockAlertService lowStock, InventorySummaryQuery inventory,
    ReorderSignal reorder, PurchaseOrderQueries purchases, CustomerSummaryQuery customers,
    TimeProvider clock) : IAssistantData
{
    private const int MaxLimit = 50;
    private const int LowStockThreshold = 5;

    private static string DefaultCurrency => SharedKernel.Common.Money.DefaultCurrency;

    private static int Clamp(int limit) => Math.Clamp(limit, 1, MaxLimit);

    private static AiMoney Money(long minor, string currency) => AssistantFormat.Money(minor, currency);

    private static ProductRow Product(ProductSales p, string currency) =>
        new(p.Product, p.Units, Money(p.RevenueMinor, currency));

    public async Task<SalesSummaryResult> SalesSummaryAsync(StatsPeriod period, CancellationToken ct)
    {
        var o = await sales.RunAsync(tenant.TenantId, period.From, period.To, ct);
        var c = o.Currency;
        AiPercent? change = o.Previous.RevenueMinor > 0
            ? AssistantFormat.Percent(Math.Round((o.Current.RevenueMinor - o.Previous.RevenueMinor) * 100m / o.Previous.RevenueMinor, 1))
            : null;

        return new SalesSummaryResult(
            AssistantFormat.Period(period),
            o.Current.Orders, Money(o.Current.RevenueMinor, c), Money(o.Current.AverageMinor, c),
            o.Previous.Orders, Money(o.Previous.RevenueMinor, c), change,
            o.Meli.Orders, Money(o.Meli.RevenueMinor, c),
            o.NewCustomers,
            [.. o.BySource.Take(6).Select(s => new SourceRow(s.Source, s.Orders, Money(s.RevenueMinor, c)))],
            [.. o.TopProducts.Take(5).Select(p => Product(p, c))]);
    }

    public async Task<TopProductsResult> TopProductsAsync(StatsPeriod period, int limit, CancellationToken ct)
    {
        var take = Clamp(limit);
        var t = await top.RunAsync(tenant.TenantId, period.SinceUtc, period.UntilUtc, take, ct);
        var c = DefaultCurrency;
        return new TopProductsResult(
            AssistantFormat.Period(period),
            [.. t.ByUnits.Take(take).Select(p => Product(p, c))],
            [.. t.ByRevenue.Take(take).Select(p => Product(p, c))],
            t.TotalUnits, t.DistinctProducts, t.Idle.Count, [.. t.Idle.Take(10)]);
    }

    public async Task<AbandonedCartsResult> AbandonedCartsAsync(StatsPeriod period, CancellationToken ct)
    {
        var pending = await carts.PendingAsync(tenant.TenantId, period.SinceUtc, period.UntilUtc, ct);
        var currency = pending.Count > 0 ? pending[0].Subtotal.Currency : DefaultCurrency;
        var recoverable = pending.Where(s => s.Email != null).ToList();
        return new AbandonedCartsResult(
            AssistantFormat.Period(period), pending.Count, recoverable.Count,
            Money(recoverable.Sum(s => s.Subtotal.AmountInMinorUnits), currency),
            Money(pending.Sum(s => s.Subtotal.AmountInMinorUnits), currency));
    }

    public async Task<ProfitabilityResult> ProfitabilityAsync(StatsPeriod period, CancellationToken ct)
    {
        var p = await profit.RunAsync(tenant.TenantId, period.SinceUtc, period.UntilUtc, ct);
        var c = p.Currency;
        ProductProfitRow Row(ProductProfit x) =>
            new(x.Product, x.Units, Money(x.RevenueMinor, c), Money(x.ProfitMinor, c), AssistantFormat.Percent(x.MarginPct));

        return new ProfitabilityResult(
            AssistantFormat.Period(period),
            Money(p.RevenueMinor, c), Money(p.ProductCostMinor, c), Money(p.MpFeesMinor, c), Money(p.DiscountsMinor, c),
            Money(p.ProfitMinor, c), AssistantFormat.Percent(p.MarginPct),
            Money(p.Previous.ProfitMinor, c), AssistantFormat.Percent(p.Previous.MarginPct),
            p.OrdersWithCost, p.OrdersTotal,
            [.. p.ByProduct.OrderByDescending(x => x.ProfitMinor).Take(10).Select(Row)],
            [.. p.ByProduct.OrderBy(x => x.MarginPct).ThenBy(x => x.Product, StringComparer.Ordinal).Take(5).Select(Row)],
            p.Meli is { } m
                ? new MeliProfitRow(m.Orders, Money(m.RevenueMinor, c), Money(m.ProductCostMinor, c),
                    Money(m.MlFeesMinor, c), Money(m.NetProfitMinor, c))
                : null);
    }

    public async Task<LowStockResult> LowStockAsync(int limit, CancellationToken ct)
    {
        var low = await lowStock.LowAsync(tenant.TenantId, ct);
        var summary = await inventory.RunAsync(tenant.TenantId, LowStockThreshold, ct);
        return new LowStockResult(
            low.Count, summary.OutOfStock, summary.Units,
            [.. low.Take(Clamp(limit)).Select(i => new LowStockRow(
                i.Product, i.Variant, i.Sku, i.Available, i.CoverageDays, i.SuggestedQty,
                i.Reason == StockAlertState.ReasonMinimum ? "mínimo" : "reposición"))]);
    }

    public async Task<ReorderSuggestionsResult> ReorderSuggestionsAsync(int limit, CancellationToken ct)
    {
        // Se pide de más para poder decir cuántas hay en total y recortar acá.
        var r = await reorder.SuggestionsAsync(tenant.TenantId, null, ct, take: 1000);
        return new ReorderSuggestionsResult(
            r.LeadTimeDays, r.WindowDays, r.BufferDays, r.Items.Count,
            [.. r.Items.Take(Clamp(limit)).Select(i => new ReorderResultRow(
                i.Product, i.Variant, i.Sku, i.UnitsPerDay, i.Available, i.CoverageDays, i.SuggestedQty))]);
    }

    public async Task<PurchaseOrdersResult> PurchaseOrdersAsync(PurchaseOrderState state, int limit, CancellationToken ct)
    {
        var tid = tenant.TenantId.Value;
        var filter = state switch
        {
            PurchaseOrderState.Abiertas => new PurchaseOrderFilter(null, PurchaseOrderGroup.Open, null),
            PurchaseOrderState.EnTransito => new PurchaseOrderFilter(null, PurchaseOrderGroup.InTransit, null),
            PurchaseOrderState.Recibidas => new PurchaseOrderFilter(PurchaseOrderStatus.Received, PurchaseOrderGroup.All, null),
            PurchaseOrderState.Canceladas => new PurchaseOrderFilter(PurchaseOrderStatus.Cancelled, PurchaseOrderGroup.All, null),
            PurchaseOrderState.SinFactura => new PurchaseOrderFilter(null, PurchaseOrderGroup.InvoiceMissing, null),
            _ => new PurchaseOrderFilter(null, PurchaseOrderGroup.All, null),
        };

        var query = purchases.Filtered(tid, filter);
        var total = await query.CountAsync(ct);
        var orders = await query.OrderByDescending(p => p.CreatedAtUtc).Take(Clamp(limit)).ToListAsync(ct);
        var summary = await purchases.SummaryAsync(tid, ct);

        return new PurchaseOrdersResult(
            state.ToString(), total,
            [.. orders.Select(p => new PurchaseOrderRow(
                p.Reference, p.SupplierName, StatusText(p.Status),
                AssistantFormat.Amount(p.TotalFob, p.Currency), p.Items.Sum(i => i.Quantity),
                AssistantFormat.Date(p.CreatedAtUtc),
                p.ReceivedAtUtc is { } received ? AssistantFormat.Date(received) : null,
                p.LeadTimeDays))],
            summary.Open, summary.InTransit, AssistantFormat.Amount(summary.CommittedFob, summary.Currency),
            summary.WithoutInvoice);
    }

    public async Task<CustomersSummaryResult> CustomersSummaryAsync(StatsPeriod period, CancellationToken ct)
    {
        var s = await customers.RunAsync(
            tenant.TenantId.Value, period.SinceUtc, period.UntilUtc, clock.GetUtcNow().UtcDateTime, ct);
        return new CustomersSummaryResult(
            AssistantFormat.Period(period), s.Total, s.NewInPeriod, s.NewPrevious, s.WithPurchases,
            s.Repeat, s.NeverBought, s.Inactive90, Money(s.AverageSpentMinor, DefaultCurrency));
    }

    private static string StatusText(PurchaseOrderStatus status) => status switch
    {
        PurchaseOrderStatus.Draft => "Borrador",
        PurchaseOrderStatus.Confirmed => "Confirmada",
        PurchaseOrderStatus.InProduction => "En producción",
        PurchaseOrderStatus.InTransit => "En tránsito",
        PurchaseOrderStatus.InCustoms => "En aduana",
        PurchaseOrderStatus.Received => "Recibida",
        PurchaseOrderStatus.Cancelled => "Cancelada",
        _ => status.ToString(),
    };
}
