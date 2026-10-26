using Api.Stats;

namespace Api.Ai.Assistant;

/// <summary>Qué órdenes de compra pide la herramienta (los nombres los lee el modelo).</summary>
public enum PurchaseOrderState { Abiertas, EnTransito, Recibidas, Canceladas, SinFactura, Todas }

public sealed record SourceRow(string Source, int Orders, AiMoney Revenue);

public sealed record ProductRow(string Product, int Units, AiMoney Revenue);

public sealed record SalesSummaryResult(
    AiPeriod Period, int Orders, AiMoney Revenue, AiMoney AverageOrder,
    int PreviousOrders, AiMoney PreviousRevenue, AiPercent? RevenueChange, int MeliOrders, AiMoney MeliRevenue,
    int NewCustomers, IReadOnlyList<SourceRow> BySource, IReadOnlyList<ProductRow> TopProducts);

public sealed record TopProductsResult(
    AiPeriod Period, IReadOnlyList<ProductRow> ByUnits, IReadOnlyList<ProductRow> ByRevenue,
    int TotalUnits, int DistinctProducts, int IdleCount, IReadOnlyList<string> IdleSample);

public sealed record AbandonedCartsResult(
    AiPeriod Period, int Count, int Recoverable, AiMoney RecoverableValue, AiMoney TotalValue);

public sealed record ProductProfitRow(string Product, int Units, AiMoney Revenue, AiMoney Profit, AiPercent Margin);

public sealed record MeliProfitRow(int Orders, AiMoney Revenue, AiMoney ProductCost, AiMoney MlFees, AiMoney NetProfit);

public sealed record ProfitabilityResult(
    AiPeriod Period, AiMoney Revenue, AiMoney ProductCost, AiMoney MpFees, AiMoney Discounts,
    AiMoney Profit, AiPercent Margin, AiMoney PreviousProfit, AiPercent PreviousMargin, int OrdersWithCost, int OrdersTotal,
    IReadOnlyList<ProductProfitRow> TopByProfit, IReadOnlyList<ProductProfitRow> LowestMargin, MeliProfitRow? Meli);

/// <summary>Sin valorización a costo: es un dato de la tienda que el asistente no necesita.</summary>
public sealed record LowStockResult(int Total, int OutOfStock, int Units, IReadOnlyList<LowStockRow> Items);

public sealed record LowStockRow(
    string Product, string Variant, string Sku, int Available, int? CoverageDays, int SuggestedQty, string Reason);

public sealed record ReorderResultRow(
    string Product, string Variant, string Sku, decimal UnitsPerDay, int Available, int CoverageDays, int SuggestedQty);

public sealed record ReorderSuggestionsResult(
    int LeadTimeDays, int WindowDays, int BufferDays, int Total, IReadOnlyList<ReorderResultRow> Items);

public sealed record PurchaseOrderRow(
    string? Reference, string Supplier, string Status, AiAmount TotalFob, int Units,
    string CreatedOn, string? ReceivedOn, int? LeadTimeDays);

public sealed record PurchaseOrdersResult(
    string State, int Total, IReadOnlyList<PurchaseOrderRow> Items,
    int Open, int InTransit, AiAmount CommittedFob, int WithoutInvoice);

public sealed record CustomersSummaryResult(
    AiPeriod Period, int Total, int NewInPeriod, int NewPrevious, int WithPurchases,
    int Repeat, int NeverBought, int Inactive90, AiMoney AverageSpent);

/// <summary>
/// Lo que ven las herramientas del asistente: agregados de la tienda del request
/// y nunca un dato personal. La tienda NO es parámetro: sale de <c>ITenantContext</c>.
/// Los recortes de filas se hacen acá, no en el modelo.
/// </summary>
public interface IAssistantData
{
    Task<SalesSummaryResult> SalesSummaryAsync(StatsPeriod period, CancellationToken ct);
    Task<TopProductsResult> TopProductsAsync(StatsPeriod period, int limit, CancellationToken ct);
    Task<AbandonedCartsResult> AbandonedCartsAsync(StatsPeriod period, CancellationToken ct);
    Task<ProfitabilityResult> ProfitabilityAsync(StatsPeriod period, CancellationToken ct);
    Task<LowStockResult> LowStockAsync(int limit, CancellationToken ct);
    Task<ReorderSuggestionsResult> ReorderSuggestionsAsync(int limit, CancellationToken ct);
    Task<PurchaseOrdersResult> PurchaseOrdersAsync(PurchaseOrderState state, int limit, CancellationToken ct);
    Task<CustomersSummaryResult> CustomersSummaryAsync(StatsPeriod period, CancellationToken ct);
}
