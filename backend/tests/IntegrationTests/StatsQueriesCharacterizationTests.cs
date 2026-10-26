using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Orders.Infrastructure.Persistence;
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

    private static Task<JsonElement> SellAsync(Merchant merchant, Guid variantId, int quantity) =>
        merchant.PostAsync("/api/v1/orders/manual", new
        {
            items = new[] { new { variantId, quantity } },
            paymentMethod = "cash",
        });

    [Fact]
    public async Task Rentabilidad_separa_lo_que_tiene_costo()
    {
        var today = ArgentinaTime.Today;
        var merchant = await Merchant.CreateAsync(factory, "scr");
        var (productA, variantA) = await merchant.CreateProductAsync("A", priceMinor: 10_000_00);
        var (_, variantB) = await merchant.CreateProductAsync("B", priceMinor: 5_000_00);
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/products/{productA}/costs",
            new { costs = new[] { new { variantId = variantA, costAmount = (long?)6_000_00 } }, currency = "ARS" });

        await SellAsync(merchant, variantA, 2);
        // La venta sin costo lleva descuento y envío: el ingreso es neto de cupón y sin el envío (480.000 en vez de 500.000).
        await merchant.PostAsync("/api/v1/orders/manual", new
        {
            items = new[] { new { variantId = variantB, quantity = 1 } },
            paymentMethod = "cash",
            discountMinor = 20_000L,
            shippingCostMinor = 50_000L,
        });
        // Una venta de A de ayer: es el período anterior de un rango de un día.
        var yesterdaySale = await SellAsync(merchant, variantA, 1);
        await MoveAsync(yesterdaySale.GetProperty("id").GetGuid(), NoonOf(today.AddDays(-1)));

        var report = await merchant.GetAsync($"/api/v1/stats/profitability?from={Iso(today)}&to={Iso(today)}");

        Assert.Equal("ARS", report.GetProperty("currency").GetString());
        Assert.Equal(2_480_000, report.GetProperty("revenue").GetInt64());
        Assert.Equal(1_200_000, report.GetProperty("productCost").GetInt64());
        Assert.Equal(0, report.GetProperty("mpFees").GetInt64());
        Assert.Equal(20_000, report.GetProperty("discounts").GetInt64());
        Assert.Equal(50_000, report.GetProperty("shippingCharged").GetInt64());
        Assert.Equal(800_000, report.GetProperty("profit").GetInt64());
        Assert.Equal(40.0m, report.GetProperty("marginPct").GetDecimal());

        var previous = report.GetProperty("previous");
        Assert.Equal(1_000_000, previous.GetProperty("revenue").GetInt64());
        Assert.Equal(400_000, previous.GetProperty("profit").GetInt64());
        Assert.Equal(40.0m, previous.GetProperty("marginPct").GetDecimal());

        var coverage = report.GetProperty("coverage");
        Assert.Equal(1, coverage.GetProperty("ordersWithCost").GetInt32());
        Assert.Equal(2, coverage.GetProperty("ordersTotal").GetInt32());

        // La serie es solo de las ventas con costo, por día de Argentina.
        var point = Assert.Single(report.GetProperty("series").EnumerateArray());
        Assert.StartsWith(Iso(today), point.GetProperty("date").GetString());
        Assert.Equal(800_000, point.GetProperty("profit").GetInt64());
        Assert.Equal(2_000_000, point.GetProperty("revenue").GetInt64());

        var channel = Assert.Single(report.GetProperty("byChannel").EnumerateArray());
        Assert.Equal("directo", channel.GetProperty("source").GetString());
        Assert.Equal(2, channel.GetProperty("orders").GetInt32());
        Assert.Equal(2_480_000, channel.GetProperty("revenue").GetInt64());
        Assert.Equal(800_000, channel.GetProperty("profit").GetInt64());
        Assert.Equal(1, channel.GetProperty("ordersWithCost").GetInt32());

        // Solo los ítems con costo entran al margen por producto.
        var byProduct = Assert.Single(report.GetProperty("byProduct").EnumerateArray());
        Assert.Equal("A", byProduct.GetProperty("product").GetString());
        Assert.Equal(2, byProduct.GetProperty("units").GetInt32());
        Assert.Equal(2_000_000, byProduct.GetProperty("revenue").GetInt64());
        Assert.Equal(1_200_000, byProduct.GetProperty("cost").GetInt64());
        Assert.Equal(800_000, byProduct.GetProperty("profit").GetInt64());
        Assert.Equal(40.0m, byProduct.GetProperty("marginPct").GetDecimal());
        Assert.Equal(1, report.GetProperty("productsTotal").GetInt32());

        Assert.Equal(JsonValueKind.Null, report.GetProperty("meli").ValueKind);
    }

    [Fact]
    public async Task Mas_vendidos_por_unidades_por_facturacion_y_quietos()
    {
        var today = Iso(ArgentinaTime.Today);
        var merchant = await Merchant.CreateAsync(factory, "smv");
        var (_, variantA) = await merchant.CreateProductAsync("A", priceMinor: 1_000_00);
        var (_, variantB) = await merchant.CreateProductAsync("B", priceMinor: 10_000_00);
        await merchant.CreateProductAsync("C", priceMinor: 2_000_00); // publicado, sin ventas

        await SellAsync(merchant, variantA, 3);
        await SellAsync(merchant, variantB, 1);

        var top = await merchant.GetAsync($"/api/v1/stats/products/top?from={today}&to={today}");

        Assert.Equal([("A", 3, 300_000L), ("B", 1, 1_000_000L)], Ranking(top, "items"));
        Assert.Equal([("B", 1, 1_000_000L), ("A", 3, 300_000L)], Ranking(top, "byRevenue"));
        Assert.Equal(4, top.GetProperty("totalUnits").GetInt32());
        Assert.Equal(2, top.GetProperty("distinctProducts").GetInt32());
        Assert.Equal(3, top.GetProperty("publishedProducts").GetInt32());
        Assert.Equal(1, top.GetProperty("idleCount").GetInt32());
        Assert.Equal(["C"], top.GetProperty("idleSample").EnumerateArray().Select(n => n.GetString()!).ToArray());
    }

    [Fact]
    public async Task Carritos_abandonados_cuenta_y_valor_recuperable()
    {
        var merchant = await Merchant.CreateAsync(factory, "sca");
        var (_, variant) = await merchant.CreateProductAsync("Mochila", priceMinor: 40_000_00);
        var shopper = new Shopper(merchant);
        var email = $"indeciso-{merchant.Subdomain}@mail.com";

        // Sin mail (se creó primero) y con mail (después): ninguno pagó.
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/checkout",
            new { lines = new[] { new { variantId = variant, quantity = 1 } } });
        await shopper.CheckoutAsync(variant, quantity: 2, email: email);

        var carts = await merchant.GetAsync("/api/v1/stats/abandoned-carts");

        Assert.Equal(2, carts.GetProperty("count").GetInt32());
        Assert.Equal(2, carts.GetProperty("total").GetInt32());
        Assert.Equal(80_000_00, carts.GetProperty("recoverableValue").GetInt64());

        // Más nuevo primero: el que dejó mail, y después el anónimo.
        var items = carts.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(2, items.Count);
        Assert.Equal(email, items[0].GetProperty("email").GetString());
        Assert.Equal(1, items[0].GetProperty("items").GetInt32());
        Assert.Equal(80_000_00, items[0].GetProperty("total").GetProperty("amount").GetInt64());
        Assert.Equal("ARS", items[0].GetProperty("total").GetProperty("currency").GetString());
        Assert.True(items[0].GetProperty("recoverable").GetBoolean());
        Assert.Equal(JsonValueKind.Null, items[1].GetProperty("email").ValueKind);
        Assert.Equal(1, items[1].GetProperty("items").GetInt32());
        Assert.Equal(40_000_00, items[1].GetProperty("total").GetProperty("amount").GetInt64());
        Assert.Equal("ARS", items[1].GetProperty("total").GetProperty("currency").GetString());
        Assert.False(items[1].GetProperty("recoverable").GetBoolean());

        // El límite recorta la página, no la cuenta.
        var limited = await merchant.GetAsync("/api/v1/stats/abandoned-carts?limit=1");
        Assert.Equal(1, limited.GetProperty("items").GetArrayLength());
        Assert.Equal(2, limited.GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task Resumen_de_inventario()
    {
        var merchant = await Merchant.CreateAsync(factory, "sri");
        await merchant.CreateProductAsync("Agotado", stock: 0);
        var (lowProduct, low) = await merchant.CreateProductAsync("Por agotarse", stock: 3);
        var (_, unlimited) = await merchant.CreateProductAsync("Sin limite", stock: 0);
        await merchant.PutAsync($"/api/v1/inventory/{unlimited}", new { available = 0, unlimited = true, reason = "Alta" });
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/products/{lowProduct}/costs",
            new { costs = new[] { new { variantId = low, costAmount = (long?)2_000_00 } }, currency = "ARS" });

        // El depósito de otra tienda no se mezcla.
        var other = await Merchant.CreateAsync(factory, "sro");
        var (otherProduct, otherVariant) = await other.CreateProductAsync("Ajeno", stock: 50);
        await other.ExpectOkAsync(HttpMethod.Put, $"/api/v1/products/{otherProduct}/costs",
            new { costs = new[] { new { variantId = otherVariant, costAmount = (long?)1_000_00 } }, currency = "ARS" });

        var summary = await merchant.GetAsync("/api/v1/inventory/summary?lowStockThreshold=5");

        Assert.Equal(3, summary.GetProperty("variants").GetInt32());
        Assert.Equal(3, summary.GetProperty("units").GetInt32());
        Assert.Equal(1, summary.GetProperty("outOfStock").GetInt32());
        Assert.Equal(1, summary.GetProperty("lowStock").GetInt32());
        Assert.Equal(1, summary.GetProperty("unlimited").GetInt32());
        Assert.Equal(0, summary.GetProperty("reserved").GetInt32());
        Assert.Equal(600_000, summary.GetProperty("stockValueMinor").GetInt64());
        Assert.Equal("ARS", summary.GetProperty("currency").GetString());
        Assert.Equal(2, summary.GetProperty("withoutCost").GetInt32());
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

        // Una orden de otra tienda no cuenta ni se lista.
        var other = await Merchant.CreateAsync(factory, "scpo");
        var (_, otherVariant) = await other.CreateProductAsync("Ajena", stock: 0);
        await PurchaseOrderAsync(other, otherVariant);

        var summary = await merchant.GetAsync("/api/v1/purchasing/summary");
        Assert.Equal(2, summary.GetProperty("total").GetInt32());
        Assert.Equal(1, summary.GetProperty("open").GetInt32());
        Assert.Equal(0, summary.GetProperty("inTransit").GetInt32());
        Assert.Equal(1, summary.GetProperty("received").GetInt32());
        Assert.Equal(10_000m, summary.GetProperty("committedFob").GetDecimal());
        Assert.Equal("ARS", summary.GetProperty("currency").GetString());
        Assert.Equal(1, summary.GetProperty("withoutInvoice").GetInt32());

        var missing = await merchant.GetAsync($"{Orders}?group=invoicemissing");
        Assert.Equal(1, missing.GetProperty("total").GetInt32());
        Assert.Equal(received, Assert.Single(missing.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());

        Assert.Equal(1, (await merchant.GetAsync($"{Orders}?group=open")).GetProperty("total").GetInt32());
        Assert.Equal(0, (await merchant.GetAsync($"{Orders}?group=intransit")).GetProperty("total").GetInt32());
        Assert.Equal(2, (await merchant.GetAsync(Orders)).GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Segmentos_de_la_agenda()
    {
        var merchant = await Merchant.CreateAsync(factory, "ssa");
        await merchant.PostAsync("/api/v1/customers", new { name = "Nunca compró", email = "nunca@test.local" });
        await merchant.CreateSaleAsync(buyerEmail: "una@test.local");
        for (var i = 0; i < 3; i++)
            await merchant.CreateSaleAsync(buyerEmail: "tres@test.local");

        async Task<string[]> EmailsAsync(string query)
        {
            var page = await merchant.GetAsync($"/api/v1/customers?{query}");
            var emails = page.GetProperty("items").EnumerateArray().Select(c => c.GetProperty("email").GetString()!).Order().ToArray();
            Assert.Equal(emails.Length, page.GetProperty("total").GetInt32());
            return emails;
        }

        Assert.Equal(["tres@test.local"], await EmailsAsync("minOrders=2"));
        Assert.Equal(["nunca@test.local"], await EmailsAsync("neverBought=true"));
        Assert.Equal(["tres@test.local", "una@test.local"], await EmailsAsync("minOrders=1"));
        Assert.Equal(["tres@test.local"], await EmailsAsync("minOrders=3"));
    }

    private static string Iso(DateOnly d) => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    private static DateTime NoonOf(DateOnly day) => ArgentinaTime.ToUtc(day.ToDateTime(new TimeOnly(12, 0)));

    private static (string Product, int Units, long Revenue)[] Ranking(JsonElement top, string list) =>
        [.. top.GetProperty(list).EnumerateArray().Select(i =>
            (i.GetProperty("product").GetString()!, i.GetProperty("units").GetInt32(), i.GetProperty("revenue").GetInt64()))];

    private async Task MoveAsync(Guid orderId, DateTime at)
    {
        using var scope = factory.Services.CreateScope();
        var orders = scope.ServiceProvider.GetRequiredService<OrdersDbContext>();
        await orders.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE orders SET paid_at_utc = {at}, created_at_utc = {at} WHERE id = {orderId}");
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
