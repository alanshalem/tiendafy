using System.Globalization;
using System.Text.Json;
using Api.Ai.Assistant;
using Api.Middleware;
using Api.Stats;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// Lo que ven las herramientas del asistente: agregados de la tienda del
/// request, en crudo y formateados, y nunca un dato personal.
/// </summary>
[Collection("api")]
public sealed class AssistantDataTests(ApiFactory factory)
{
    private const string Orders = "/api/v1/purchasing/purchase-orders";

    private static StatsPeriod Today() => StatsPeriod.FromDays(ArgentinaTime.Today, ArgentinaTime.Today);

    /// <summary>Corre algo con <see cref="AssistantData"/> armada en un scope con la tienda puesta, como en un request.</summary>
    private async Task<T> WithDataAsync<T>(Merchant store, Func<AssistantData, Task<T>> action)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        scope.ServiceProvider.GetRequiredService<TenantContextHolder>().Set(TenantId.From(store.TenantId));
        return await action(ActivatorUtilities.CreateInstance<AssistantData>(scope.ServiceProvider));
    }

    private static string Json(object result) => JsonSerializer.Serialize(result);

    [Fact]
    public async Task Resumen_de_ventas_en_crudo_y_formateado()
    {
        var store = await Merchant.CreateAsync(factory, "asv");
        await store.CreateSaleAsync(priceMinor: 15_000_00);

        var result = await WithDataAsync(store, d => d.SalesSummaryAsync(Today(), CancellationToken.None));

        Assert.Equal(1, result.Orders);
        Assert.Equal(1_500_000, result.Revenue.Minor);
        Assert.Equal("ARS 15.000", result.Revenue.Text);
        Assert.Contains(ArgentinaTime.Today.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture), result.Period.Text);
    }

    [Fact]
    public async Task Carritos_sin_datos_personales()
    {
        var store = await Merchant.CreateAsync(factory, "asc");
        var (_, variant) = await store.CreateProductAsync("Mochila", priceMinor: 40_000_00);
        var shopper = new Shopper(store);
        var mailA = $"indeciso-a-{store.Subdomain}@mail.com";
        var mailB = $"indeciso-b-{store.Subdomain}@mail.com";
        await shopper.CheckoutAsync(variant, email: mailA);
        await shopper.CheckoutAsync(variant, email: mailB);

        var result = await WithDataAsync(store, d => d.AbandonedCartsAsync(Today(), CancellationToken.None));

        Assert.Equal(2, result.Count);
        Assert.Equal(2, result.Recoverable);
        Assert.Equal(80_000_00, result.RecoverableValue.Minor);
        var json = Json(result);
        Assert.DoesNotContain("@", json);
        Assert.DoesNotContain(mailA, json);
        Assert.DoesNotContain(mailB, json);
    }

    [Fact]
    public async Task Clientes_solo_agregados()
    {
        var store = await Merchant.CreateAsync(factory, "asu");
        await store.PostAsync("/api/v1/customers", new { name = "Zulema Quiroga", email = "zulema@test.local", phone = "1144443333" });
        await store.CreateSaleAsync(buyerEmail: "comprador-asu@test.local");

        var result = await WithDataAsync(store, d => d.CustomersSummaryAsync(Today(), CancellationToken.None));

        Assert.True(result.Total >= 2);
        var json = Json(result);
        foreach (var personal in new[] { "Zulema", "Quiroga", "zulema@test.local", "1144443333", "comprador-asu", "Comprador de Test" })
            Assert.DoesNotContain(personal, json);
    }

    [Fact]
    public async Task Ordenes_de_compra_por_estado()
    {
        var store = await Merchant.CreateAsync(factory, "aso");
        var (_, variant) = await store.CreateProductAsync("Pesa", stock: 0);
        var open = await PurchaseOrderAsync(store, variant);
        var received = await PurchaseOrderAsync(store, variant, "Confirmed");
        await store.PostAsync($"{Orders}/{received}/receive",
            new { items = new[] { new { variantId = variant, receivedQuantity = 10 } } });
        await store.PutAsync($"{Orders}/{received}/invoice", new { supplierTaxId = "30-71234567-8", invoiceType = "A" });

        var abiertas = await WithDataAsync(store, d => d.PurchaseOrdersAsync(PurchaseOrderState.Abiertas, 20, CancellationToken.None));
        var todas = await WithDataAsync(store, d => d.PurchaseOrdersAsync(PurchaseOrderState.Todas, 20, CancellationToken.None));
        var sinFactura = await WithDataAsync(store, d => d.PurchaseOrdersAsync(PurchaseOrderState.SinFactura, 20, CancellationToken.None));

        Assert.Equal(1, abiertas.Total);
        Assert.Equal("Borrador", Assert.Single(abiertas.Items).Status);
        Assert.Equal(2, todas.Total);
        Assert.Equal(1, sinFactura.Total);
        Assert.Equal(1, todas.Open);
        Assert.Equal(1, todas.WithoutInvoice);
        Assert.Equal(10_000m, todas.CommittedFob.Value);
        Assert.Equal("Recibida", todas.Items.Single(i => i.ReceivedOn is not null).Status);
        Assert.DoesNotContain("30-71234567-8", Json(todas));
        Assert.DoesNotContain("30712345678", Json(todas));
        Assert.NotEqual(open, received);
    }

    [Fact]
    public async Task Rentabilidad_recorta_filas()
    {
        var store = await Merchant.CreateAsync(factory, "asr");
        for (var i = 1; i <= 15; i++)
        {
            var (product, variant) = await store.CreateProductAsync($"Producto {i:00}", priceMinor: 10_000_00);
            await store.ExpectOkAsync(HttpMethod.Put, $"/api/v1/products/{product}/costs",
                new { costs = new[] { new { variantId = variant, costAmount = (long?)(i * 400_00) } }, currency = "ARS" });
            await store.PostAsync("/api/v1/orders/manual", new
            {
                items = new[] { new { variantId = variant, quantity = 1 } },
                paymentMethod = "cash",
            });
        }

        var result = await WithDataAsync(store, d => d.ProfitabilityAsync(Today(), CancellationToken.None));

        Assert.Equal(10, result.TopByProfit.Count);
        Assert.Equal(5, result.LowestMargin.Count);
        Assert.Equal(15, result.OrdersWithCost);
        Assert.Equal("Producto 01", result.TopByProfit[0].Product);
        Assert.Equal("Producto 15", result.LowestMargin[0].Product);
    }

    [Fact]
    public async Task Stock_bajo_respeta_el_limite()
    {
        var store = await Merchant.CreateAsync(factory, "asl");
        for (var i = 0; i < 8; i++)
        {
            var (_, variant) = await store.CreateProductAsync($"Bajo {i}", stock: 1, sku: $"BAJ-{i}-{store.Subdomain}");
            await store.PutAsync($"/api/v1/stock-alerts/rules/{variant}", new { minUnits = 5, muted = false });
        }

        var result = await WithDataAsync(store, d => d.LowStockAsync(3, CancellationToken.None));

        Assert.Equal(8, result.Total);
        Assert.Equal(3, result.Items.Count);
        Assert.All(result.Items, i => Assert.Equal("mínimo", i.Reason));
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
