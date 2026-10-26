using System.ComponentModel;
using System.Text.Json;
using Api.Stats;
using Identity.Infrastructure;
using Microsoft.Extensions.AI;
using SharedKernel.Common;

namespace Api.Ai.Assistant;

/// <summary>
/// Lo que pasó en una corrida del asistente: qué herramientas se usaron (para mostrar "Consulté: …") y cuánto
/// devolvieron en total. Pasado el presupuesto, las herramientas dejan de traer datos: el peor caso de lo que
/// entra al modelo queda dentro de lo que se reservó.
/// </summary>
public sealed class AssistantInvocationLog(int budgetChars)
{
    private readonly List<string> _labels = [];
    private int _resultChars;

    public IReadOnlyList<string> Labels => _labels;

    public bool OverBudget => _resultChars > budgetChars;

    internal void Record(string label, int resultChars)
    {
        _labels.Add(label);
        _resultChars += resultChars;
    }
}

/// <summary>
/// Las herramientas del asistente como <see cref="AITool"/>: solo las que permite el rol de quien pregunta, sin
/// la tienda como parámetro (sale del request). Los límites y las fechas se corrigen acá, no en el modelo, y un
/// argumento malo vuelve como <see cref="AssistantToolError"/> sin tocar los datos.
/// </summary>
public sealed class AssistantToolset(IAssistantData data, TimeProvider clock)
{
    public const string OverBudgetMessage =
        "Ya junté todos los datos que puedo para esta pregunta: respondé con lo que tenés.";

    private const string DateHelp = "Fecha AAAA-MM-DD, opcional.";

    private static readonly Dictionary<string, PurchaseOrderState> States = new()
    {
        ["abiertas"] = PurchaseOrderState.Abiertas,
        ["en_transito"] = PurchaseOrderState.EnTransito,
        ["recibidas"] = PurchaseOrderState.Recibidas,
        ["canceladas"] = PurchaseOrderState.Canceladas,
        ["sin_factura"] = PurchaseOrderState.SinFactura,
        ["todas"] = PurchaseOrderState.Todas,
    };

    public IList<AITool> For(MemberAccess access, AssistantInvocationLog log)
    {
        var tools = new List<AITool>();
        foreach (var def in AssistantToolCatalog.Allowed(access))
        {
            var function = Build(def, log);
            tools.Add(function);
        }
        return tools;
    }

    private AIFunction Build(AssistantToolDef def, AssistantInvocationLog log)
    {
        Delegate body = def.Name switch
        {
            "resumen_ventas" => ([Description(DateHelp)] string? desde = null, [Description(DateHelp)] string? hasta = null,
                CancellationToken ct = default) =>
                Period(def, log, desde, hasta, p => data.SalesSummaryAsync(p, ct)),
            "productos_mas_vendidos" => ([Description(DateHelp)] string? desde = null, [Description(DateHelp)] string? hasta = null,
                [Description("Cuántos productos traer (hasta 20, 10 si no lo decís).")] int? limite = null,
                CancellationToken ct = default) =>
                Period(def, log, desde, hasta, p => data.TopProductsAsync(p, AssistantArgs.Limit(limite, 20, 10), ct)),
            "carritos_abandonados" => ([Description(DateHelp)] string? desde = null, [Description(DateHelp)] string? hasta = null,
                CancellationToken ct = default) =>
                Period(def, log, desde, hasta, p => data.AbandonedCartsAsync(p, ct)),
            "rentabilidad" => ([Description(DateHelp)] string? desde = null, [Description(DateHelp)] string? hasta = null,
                CancellationToken ct = default) =>
                Period(def, log, desde, hasta, p => data.ProfitabilityAsync(p, ct)),
            "stock_bajo" => ([Description("Cuántas variantes traer (hasta 50, 20 si no lo decís).")] int? limite = null,
                CancellationToken ct = default) =>
                Run(def, log, () => data.LowStockAsync(AssistantArgs.Limit(limite, 50, 20), ct)),
            "sugerencias_de_reposicion" => ([Description("Cuántas variantes traer (hasta 50, 20 si no lo decís).")] int? limite = null,
                CancellationToken ct = default) =>
                Run(def, log, () => data.ReorderSuggestionsAsync(AssistantArgs.Limit(limite, 50, 20), ct)),
            "ordenes_de_compra" => (
                [Description("abiertas, en_transito, recibidas, canceladas, sin_factura o todas. Si no lo decís, abiertas.")] string? estado = null,
                [Description("Cuántas órdenes traer (hasta 20, 10 si no lo decís).")] int? limite = null,
                CancellationToken ct = default) => PurchaseOrders(def, log, estado, limite, ct),
            "resumen_clientes" => ([Description(DateHelp)] string? desde = null, [Description(DateHelp)] string? hasta = null,
                CancellationToken ct = default) =>
                Period(def, log, desde, hasta, p => data.CustomersSummaryAsync(p, ct)),
            _ => throw new InvalidOperationException($"Herramienta sin implementar: {def.Name}"),
        };
        return AIFunctionFactory.Create(body, def.Name, def.Description);
    }

    private Task<object> Period<T>(
        AssistantToolDef def, AssistantInvocationLog log, string? desde, string? hasta, Func<StatsPeriod, Task<T>> call)
    {
        if (log.OverBudget) return Task.FromResult<object>(new AssistantToolError(OverBudgetMessage));
        var today = ArgentinaTime.DateOf(clock.GetUtcNow().UtcDateTime);
        var period = StatsPeriod.Parse(desde, hasta, today);
        if (period.IsFailure) return Task.FromResult<object>(new AssistantToolError(period.Error.Message));
        return Execute(def, log, () => call(period.Value));
    }

    private Task<object> Run<T>(AssistantToolDef def, AssistantInvocationLog log, Func<Task<T>> call) =>
        log.OverBudget
            ? Task.FromResult<object>(new AssistantToolError(OverBudgetMessage))
            : Execute(def, log, call);

    private Task<object> PurchaseOrders(
        AssistantToolDef def, AssistantInvocationLog log, string? estado, int? limite, CancellationToken ct)
    {
        if (log.OverBudget) return Task.FromResult<object>(new AssistantToolError(OverBudgetMessage));
        var state = PurchaseOrderState.Abiertas;
        if (!string.IsNullOrWhiteSpace(estado) && !States.TryGetValue(estado.Trim().ToLowerInvariant(), out state))
            return Task.FromResult<object>(new AssistantToolError(
                $"Estado desconocido. Los válidos son: {string.Join(", ", States.Keys)}."));
        return Execute(def, log, () => data.PurchaseOrdersAsync(state, AssistantArgs.Limit(limite, 20, 10), ct));
    }

    private static async Task<object> Execute<T>(AssistantToolDef def, AssistantInvocationLog log, Func<Task<T>> call)
    {
        var result = await call();
        log.Record(def.Label, JsonSerializer.Serialize(result, AIJsonUtilities.DefaultOptions).Length);
        return result!;
    }
}
