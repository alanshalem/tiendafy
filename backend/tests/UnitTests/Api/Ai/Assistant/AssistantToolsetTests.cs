using System.Text.Json;
using System.Text.RegularExpressions;
using Api.Ai.Assistant;
using Identity.Infrastructure;
using Microsoft.Extensions.AI;

namespace UnitTests.Api.Ai.Assistant;

/// <summary>
/// Las herramientas que recibe el modelo: solo las que permite el rol, sin la tienda como parámetro, con los
/// límites y las fechas corregidos acá y los argumentos malos devueltos como error sin tocar los datos.
/// </summary>
public sealed partial class AssistantToolsetTests
{
    private static readonly Permission[] SellerPermissions =
        [Permission.StatsRead, Permission.OrdersRead, Permission.InventoryRead, Permission.CustomersRead];

    private readonly FakeAssistantData _data = new();
    private readonly ManualClock _clock = new();
    private readonly AssistantInvocationLog _log = new(budgetChars: 24_000);

    private IList<AITool> ToolsFor(params Permission[] permissions) =>
        new AssistantToolset(_data, _clock).For(new MemberAccess("vendedor", permissions.ToHashSet()), _log);

    private IList<AITool> AllTools() => ToolsFor(Enum.GetValues<Permission>());

    private static string[] Names(IEnumerable<AITool> tools) => [.. tools.Select(t => t.Name)];

    private static AIFunction Tool(IEnumerable<AITool> tools, string name) =>
        (AIFunction)tools.Single(t => t.Name == name);

    private static async Task<JsonElement> InvokeAsync(AIFunction tool, Dictionary<string, object?>? args = null)
    {
        var result = await tool.InvokeAsync(new AIFunctionArguments(args));
        return result is JsonElement element ? element : JsonSerializer.SerializeToElement(result, AIJsonUtilities.DefaultOptions);
    }

    [Fact]
    public void Vendedor_recibe_cinco()
    {
        Assert.Equal(
            ["resumen_ventas", "productos_mas_vendidos", "carritos_abandonados", "stock_bajo", "resumen_clientes"],
            Names(ToolsFor(SellerPermissions)));
    }

    [Fact]
    public void Sin_CostsRead_no_hay_rentabilidad() =>
        Assert.DoesNotContain("rentabilidad", Names(ToolsFor([.. Enum.GetValues<Permission>().Where(p => p != Permission.CostsRead)])));

    [Fact]
    public void Sin_OrdersRead_no_hay_carritos_abandonados() =>
        Assert.DoesNotContain("carritos_abandonados", Names(ToolsFor([.. Enum.GetValues<Permission>().Where(p => p != Permission.OrdersRead)])));

    [Fact]
    public void Sin_PurchasingManage_no_hay_ordenes_ni_reposicion()
    {
        var names = Names(ToolsFor([.. Enum.GetValues<Permission>().Where(p => p != Permission.PurchasingManage)]));

        Assert.DoesNotContain("ordenes_de_compra", names);
        Assert.DoesNotContain("sugerencias_de_reposicion", names);
    }

    [Fact]
    public void Duenio_recibe_las_ocho() => Assert.Equal(8, AllTools().Count);

    [Fact]
    public void Ninguna_herramienta_pide_la_tienda()
    {
        foreach (var tool in AllTools().Cast<AIFunction>())
        {
            var properties = tool.JsonSchema.GetProperty("properties").EnumerateObject().Select(p => p.Name).ToArray();
            Assert.DoesNotContain("tenant", properties);
            Assert.DoesNotContain("tenantId", properties);
            Assert.DoesNotContain("tienda", properties);
        }
    }

    [Fact]
    public async Task Los_limites_se_recortan()
    {
        var tools = AllTools();

        await InvokeAsync(Tool(tools, "productos_mas_vendidos"), new() { ["limite"] = 999 });
        await InvokeAsync(Tool(tools, "stock_bajo"));

        Assert.Equal([20, 20], _data.Limits);
    }

    [Fact]
    public async Task Rango_largo_se_acota()
    {
        var today = SharedKernel.Common.ArgentinaTime.DateOf(_clock.GetUtcNow().UtcDateTime);

        var result = await InvokeAsync(Tool(AllTools(), "resumen_ventas"),
            new() { ["desde"] = "2020-01-01", ["hasta"] = today.ToString("yyyy-MM-dd") });

        Assert.Equal(366, Assert.Single(_data.Periods).Days);
        Assert.True(result.GetProperty("period").GetProperty("clamped").GetBoolean());
    }

    [Fact]
    public async Task Fecha_invalida_no_llama_a_los_datos()
    {
        var result = await InvokeAsync(Tool(AllTools(), "resumen_ventas"), new() { ["desde"] = "ayer" });

        Assert.True(result.TryGetProperty("error", out _));
        Assert.Equal(0, _data.Calls);
    }

    [Fact]
    public async Task Estado_desconocido_explica_los_validos()
    {
        var result = await InvokeAsync(Tool(AllTools(), "ordenes_de_compra"), new() { ["estado"] = "pendiente" });

        Assert.Contains("abiertas", result.GetProperty("error").GetString());
        Assert.Equal(0, _data.Calls);
    }

    [Fact]
    public async Task Estado_por_defecto_es_abiertas()
    {
        await InvokeAsync(Tool(AllTools(), "ordenes_de_compra"));

        Assert.Equal([PurchaseOrderState.Abiertas], _data.States);
        Assert.Equal([10], _data.Limits);
    }

    [Fact]
    public async Task Registra_lo_usado()
    {
        await InvokeAsync(Tool(AllTools(), "stock_bajo"));

        Assert.Equal(["Stock bajo"], _log.Labels);
    }

    [Fact]
    public async Task Pasado_el_presupuesto_no_toca_los_datos()
    {
        var tools = new AssistantToolset(_data, _clock)
            .For(new MemberAccess("dueno", Enum.GetValues<Permission>().ToHashSet()), new AssistantInvocationLog(budgetChars: 10));

        await InvokeAsync(Tool(tools, "stock_bajo"));
        var second = await InvokeAsync(Tool(tools, "stock_bajo"));

        Assert.Equal(1, _data.Calls);
        Assert.Equal(AssistantToolset.OverBudgetMessage, second.GetProperty("error").GetString());
    }

    [Fact]
    public void Descripciones_constantes()
    {
        foreach (var def in AssistantToolCatalog.All)
            Assert.DoesNotMatch(FourDigits(), def.Description);
    }

    [GeneratedRegex(@"\d{4}")]
    private static partial Regex FourDigits();
}
