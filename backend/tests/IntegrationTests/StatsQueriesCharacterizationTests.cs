using System.Globalization;
using System.Text.Json;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// Fija lo que responden hoy los endpoints de rentabilidad, más vendidos,
/// carritos abandonados, resumen de inventario, compras y agenda de clientes.
/// Son de caracterización: se escribieron ANTES de extraer esa lógica a clases
/// de consulta (las que usa el asistente de datos), para que el refactor no
/// cambie ni una respuesta. Si un número cambia, no es el test el que está mal.
/// </summary>
[Collection("api")]
public sealed class StatsQueriesCharacterizationTests(ApiFactory factory)
{
    private const string Orders = "/api/v1/purchasing/purchase-orders";

    private static string Today => ArgentinaTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static Task<JsonElement> SellAsync(Merchant merchant, Guid variantId, int quantity) =>
        merchant.PostAsync("/api/v1/orders/manual", new
        {
            items = new[] { new { variantId, quantity } },
            paymentMethod = "cash",
        });

    [Fact]
    public async Task Rentabilidad_separa_lo_que_tiene_costo()
    {
        var merchant = await Merchant.CreateAsync(factory, "scr");
        var (productA, variantA) = await merchant.CreateProductAsync("A", priceMinor: 10_000_00);
        var (_, variantB) = await merchant.CreateProductAsync("B", priceMinor: 5_000_00);
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/products/{productA}/costs",
            new { costs = new[] { new { variantId = variantA, costAmount = (long?)6_000_00 } }, currency = "ARS" });

        await SellAsync(merchant, variantA, 2);
        await SellAsync(merchant, variantB, 1);

        var report = await merchant.GetAsync($"/api/v1/stats/profitability?from={Today}&to={Today}");

        Assert.Equal(2_500_000, report.GetProperty("revenue").GetInt64());
        Assert.Equal(1_200_000, report.GetProperty("productCost").GetInt64());
        Assert.Equal(800_000, report.GetProperty("profit").GetInt64());
        Assert.Equal(40.0m, report.GetProperty("marginPct").GetDecimal());

        var coverage = report.GetProperty("coverage");
        Assert.Equal(1, coverage.GetProperty("ordersWithCost").GetInt32());
        Assert.Equal(2, coverage.GetProperty("ordersTotal").GetInt32());

        // Solo los ítems con costo entran al margen por producto.
        var byProduct = Assert.Single(report.GetProperty("byProduct").EnumerateArray());
        Assert.Equal("A", byProduct.GetProperty("product").GetString());
        Assert.Equal(40.0m, byProduct.GetProperty("marginPct").GetDecimal());
        Assert.Equal(1, report.GetProperty("productsTotal").GetInt32());

        Assert.Equal(JsonValueKind.Null, report.GetProperty("meli").ValueKind);
    }

    [Fact]
    public async Task Mas_vendidos_por_unidades_por_facturacion_y_quietos()
    {
        var merchant = await Merchant.CreateAsync(factory, "smv");
        var (_, variantA) = await merchant.CreateProductAsync("A", priceMinor: 1_000_00);
        var (_, variantB) = await merchant.CreateProductAsync("B", priceMinor: 10_000_00);
        await merchant.CreateProductAsync("C", priceMinor: 2_000_00); // publicado, sin ventas

        await SellAsync(merchant, variantA, 3);
        await SellAsync(merchant, variantB, 1);

        var top = await merchant.GetAsync($"/api/v1/stats/products/top?from={Today}&to={Today}");

        Assert.Equal("A", top.GetProperty("items")[0].GetProperty("product").GetString());
        Assert.Equal("B", top.GetProperty("byRevenue")[0].GetProperty("product").GetString());
        Assert.Equal(4, top.GetProperty("totalUnits").GetInt32());
        Assert.Equal(2, top.GetProperty("distinctProducts").GetInt32());
        Assert.Equal(1, top.GetProperty("idleCount").GetInt32());
        Assert.Equal(["C"], top.GetProperty("idleSample").EnumerateArray().Select(n => n.GetString()!).ToArray());
    }

    [Fact]
    public async Task Carritos_abandonados_cuenta_y_valor_recuperable()
    {
        var merchant = await Merchant.CreateAsync(factory, "sca");
        var (_, variant) = await merchant.CreateProductAsync("Mochila", priceMinor: 40_000_00);
        var shopper = new Shopper(merchant);

        // Sin mail (se creó primero) y con mail (después): ninguno pagó.
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/checkout",
            new { lines = new[] { new { variantId = variant, quantity = 1 } } });
        await shopper.CheckoutAsync(variant, quantity: 2, email: $"indeciso-{merchant.Subdomain}@mail.com");

        var carts = await merchant.GetAsync("/api/v1/stats/abandoned-carts");

        Assert.Equal(2, carts.GetProperty("count").GetInt32());
        Assert.Equal(2, carts.GetProperty("total").GetInt32());
        Assert.Equal(80_000_00, carts.GetProperty("recoverableValue").GetInt64());
        // Más nuevo primero: el que dejó mail, y después el anónimo.
        Assert.Equal([true, false],
            carts.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("recoverable").GetBoolean()).ToArray());
    }

    [Fact]
    public async Task Resumen_de_inventario()
    {
        var merchant = await Merchant.CreateAsync(factory, "sri");
        await merchant.CreateProductAsync("Agotado", stock: 0);
        await merchant.CreateProductAsync("Por agotarse", stock: 3);
        var (_, unlimited) = await merchant.CreateProductAsync("Sin limite", stock: 0);
        await merchant.PutAsync($"/api/v1/inventory/{unlimited}", new { available = 0, unlimited = true, reason = "Alta" });

        var summary = await merchant.GetAsync("/api/v1/inventory/summary?lowStockThreshold=5");

        Assert.Equal(1, summary.GetProperty("outOfStock").GetInt32());
        Assert.Equal(1, summary.GetProperty("lowStock").GetInt32());
        Assert.Equal(1, summary.GetProperty("unlimited").GetInt32());
    }

    [Fact]
    public async Task Compras_resumen_y_listado_por_grupo()
    {
        var merchant = await Merchant.CreateAsync(factory, "scp");
        var (_, variant) = await merchant.CreateProductAsync("Pesa", stock: 0);

        await PurchaseOrderAsync(merchant, variant);                         // borrador
        var received = await PurchaseOrderAsync(merchant, variant, "Confirmed");
        await merchant.PostAsync($"{Orders}/{received}/receive",
            new { items = new[] { new { variantId = variant, receivedQuantity = 10 } } });

        var summary = await merchant.GetAsync("/api/v1/purchasing/summary");
        Assert.Equal(1, summary.GetProperty("open").GetInt32());
        Assert.Equal(1, summary.GetProperty("received").GetInt32());
        Assert.Equal(1, summary.GetProperty("withoutInvoice").GetInt32());

        var missing = await merchant.GetAsync($"{Orders}?group=invoicemissing");
        Assert.Equal(1, missing.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Segmentos_de_la_agenda()
    {
        var merchant = await Merchant.CreateAsync(factory, "ssa");
        await merchant.PostAsync("/api/v1/customers", new { name = "Nunca compró", email = "nunca@test.local" });
        await merchant.CreateSaleAsync(buyerEmail: "una@test.local");
        for (var i = 0; i < 3; i++)
            await merchant.CreateSaleAsync(buyerEmail: "tres@test.local");

        Assert.Equal(1, (await merchant.GetAsync("/api/v1/customers?minOrders=2")).GetProperty("total").GetInt32());
        Assert.Equal(1, (await merchant.GetAsync("/api/v1/customers?neverBought=true")).GetProperty("total").GetInt32());
    }

    private static async Task<Guid> PurchaseOrderAsync(Merchant merchant, Guid variantId, params string[] statuses)
    {
        var po = await merchant.PostAsync(Orders, new
        {
            supplierName = "Proveedor",
            currency = "ARS",
            exchangeRate = 1m,
            items = new[] { new { variantId, quantity = 10, unitCost = 1_000m } },
        });
        var id = po.GetProperty("id").GetGuid();
        foreach (var status in statuses)
            await merchant.PostAsync($"{Orders}/{id}/status", new { status });
        return id;
    }
}
