using Api.Ai.Assistant;
using Api.Stats;

namespace UnitTests.Api.Ai.Assistant;

/// <summary>Datos del asistente de prueba: devuelve resultados vacíos y registra los argumentos que recibe.</summary>
public sealed class FakeAssistantData : IAssistantData
{
    public List<StatsPeriod> Periods { get; } = [];
    public List<int> Limits { get; } = [];
    public List<PurchaseOrderState> States { get; } = [];

    /// <summary>Cuántas veces se le pidió algo, de cualquier tipo.</summary>
    public int Calls { get; private set; }

    private static AiMoney Zero => AssistantFormat.Money(0, "ARS");

    private void Seen(StatsPeriod? period = null, int? limit = null)
    {
        Calls++;
        if (period is not null) Periods.Add(period);
        if (limit is { } l) Limits.Add(l);
    }

    public Task<SalesSummaryResult> SalesSummaryAsync(StatsPeriod period, CancellationToken ct)
    {
        Seen(period);
        return Task.FromResult(new SalesSummaryResult(AssistantFormat.Period(period), 0, Zero, Zero, 0, Zero, null, 0, Zero, 0, [], []));
    }

    public Task<TopProductsResult> TopProductsAsync(StatsPeriod period, int limit, CancellationToken ct)
    {
        Seen(period, limit);
        return Task.FromResult(new TopProductsResult(AssistantFormat.Period(period), [], [], 0, 0, 0, []));
    }

    public Task<AbandonedCartsResult> AbandonedCartsAsync(StatsPeriod period, CancellationToken ct)
    {
        Seen(period);
        return Task.FromResult(new AbandonedCartsResult(AssistantFormat.Period(period), 0, 0, Zero, Zero));
    }

    public Task<ProfitabilityResult> ProfitabilityAsync(StatsPeriod period, CancellationToken ct)
    {
        Seen(period);
        var pct = AssistantFormat.Percent(0);
        return Task.FromResult(new ProfitabilityResult(
            AssistantFormat.Period(period), Zero, Zero, Zero, Zero, Zero, pct, Zero, pct, 0, 0, [], [], null));
    }

    public Task<LowStockResult> LowStockAsync(int limit, CancellationToken ct)
    {
        Seen(limit: limit);
        return Task.FromResult(new LowStockResult(0, 0, 0, []));
    }

    public Task<ReorderSuggestionsResult> ReorderSuggestionsAsync(int limit, CancellationToken ct)
    {
        Seen(limit: limit);
        return Task.FromResult(new ReorderSuggestionsResult(60, 60, 30, 0, []));
    }

    public Task<PurchaseOrdersResult> PurchaseOrdersAsync(PurchaseOrderState state, int limit, CancellationToken ct)
    {
        Seen(limit: limit);
        States.Add(state);
        return Task.FromResult(new PurchaseOrdersResult(state.ToString(), 0, [], 0, 0, AssistantFormat.Amount(0, "USD"), 0));
    }

    public Task<CustomersSummaryResult> CustomersSummaryAsync(StatsPeriod period, CancellationToken ct)
    {
        Seen(period);
        return Task.FromResult(new CustomersSummaryResult(AssistantFormat.Period(period), 0, 0, 0, 0, 0, 0, 0, Zero));
    }
}
