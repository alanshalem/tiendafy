using System.Net;
using System.Text.Json;
using Api.Startup;
using Catalog.Infrastructure.Persistence;
using Inventory.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Stock "sin límite" (la opción por defecto al crear un producto sin
/// variantes): se compra siempre, en cualquier cantidad, sin reservar ni
/// descontar; la tienda no lo muestra agotado ni ofrece "avisame"; y los
/// productos que se crearon así cuando eso no cargaba stock se arreglan solos
/// al migrar.
/// </summary>
[Collection("api")]
public sealed class UnlimitedStockTests(ApiFactory factory)
{
    [Fact]
    public async Task Sin_limite_se_compra_siempre_sin_reservar_ni_descontar()
    {
        var merchant = await Merchant.CreateAsync(factory, "sl");
        await merchant.PutAsync("/api/v1/admin/payments/options", new
        {
            transferEnabled = true,
            discountPercent = 0,
            bankName = "Banco Nación",
            accountHolder = "Tienda de Test SRL",
            holderTaxId = "30-71234567-8",
            cbu = "0110599520000012345678",
            alias = "TIENDA.TEST.PAGOS",
            holdHours = 48,
            cashOnPickupEnabled = true,
            installmentsMax = 0,
        });
        var (productId, variant) = await merchant.CreateProductAsync("Taza a pedido", stock: 0);
        var slug = (await merchant.GetAsync($"/api/v1/products/{productId}")).GetProperty("slug").GetString();

        var set = await merchant.PutAsync($"/api/v1/inventory/{variant}", new { available = 0, unlimited = true, reason = "Alta de producto" });
        Assert.True(set.GetProperty("unlimited").GetBoolean());

        // La tienda: ni agotado ni "quedan N" (null = sin límite).
        var shopper = new Shopper(merchant);
        var detail = await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/products/by-slug/{slug}");
        Assert.Equal(JsonValueKind.Null, detail.GetProperty("stock").ValueKind);
        Assert.Equal(JsonValueKind.Null, detail.GetProperty("variants")[0].GetProperty("available").ValueKind);
        var snapshot = await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/products/variants?ids={variant}");
        Assert.Equal(JsonValueKind.Null, snapshot.GetProperty("items")[0].GetProperty("available").ValueKind);
        var search = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/products/search?inStock=true");
        Assert.Contains(search.GetProperty("items").EnumerateArray(), p => p.GetProperty("id").GetGuid() == productId);

        // "Avisame cuando ingrese" no tiene sentido: siempre hay.
        var alert = await shopper.SendAsync(HttpMethod.Post, "/api/v1/back-in-stock",
            new { variantId = variant, email = "espera@test.local" });
        Assert.Equal(HttpStatusCode.Conflict, alert.StatusCode);

        // Se compra en cualquier cantidad, sin reserva, y la venta no descuenta nada.
        var checkoutId = await shopper.CheckoutAsync(variant, quantity: 7);
        var checkout = await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/checkout/{checkoutId}");
        Assert.Equal(JsonValueKind.Null, checkout.GetProperty("items")[0].GetProperty("reservationId").ValueKind);
        var order = await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/checkout/{checkoutId}/pay-offline", new { method = "transfer" });
        await merchant.PostAsync($"/api/v1/orders/{order.GetProperty("orderId").GetGuid()}/mark-paid", new { });

        var stock = (await merchant.GetAsync($"/api/v1/inventory?variantIds={variant}")).GetProperty("items")[0];
        Assert.True(stock.GetProperty("unlimited").GetBoolean());
        Assert.Equal(0, stock.GetProperty("reserved").GetInt32());
        var ledger = (await merchant.GetAsync($"/api/v1/inventory/{variant}/ledger")).GetProperty("items");
        Assert.DoesNotContain(ledger.EnumerateArray(), m => m.GetProperty("type").GetString() is "Reserved" or "Sold");

        // En el resumen del depósito no es "sin stock".
        var summary = await merchant.GetAsync("/api/v1/inventory/summary");
        Assert.Equal(1, summary.GetProperty("unlimited").GetInt32());
        Assert.Equal(0, summary.GetProperty("outOfStock").GetInt32());

        // Cargarle un número lo vuelve limitado; quedarse corto lo dice en castellano.
        var limited = await merchant.PutAsync($"/api/v1/inventory/{variant}", new { available = 3, reason = "Conteo" });
        Assert.False(limited.GetProperty("unlimited").GetBoolean());
        var session = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/checkout",
            new { lines = new[] { new { variantId = variant, quantity = 5 } } });
        var shortOf = await shopper.SendAsync(HttpMethod.Post, $"/api/v1/checkout/{session.GetProperty("id").GetGuid()}/submit",
            new { email = "comprador@test.local", name = "Ana", lastName = "Pérez", phone = "1155556666", docNumber = "30111222" });
        Assert.Equal(HttpStatusCode.Conflict, shortOf.StatusCode);
        var problem = await shortOf.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Checkout.OutOfStock", problem.GetProperty("title").GetString());
        Assert.StartsWith("Ya no queda stock suficiente de «Taza a pedido»", problem.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Los_productos_creados_sin_limite_cuando_no_cargaba_stock_se_arreglan_al_migrar()
    {
        var merchant = await Merchant.CreateAsync(factory, "slb");
        // Así quedaba un producto "Sin límite": sin fila de stock.
        var (_, single) = await merchant.CreateProductAsync("Llavero", stock: 0);
        var (_, counted) = await merchant.CreateProductAsync("Llavero contado", stock: 2);
        // Con variantes, una sin stock cargado puede ser una que de verdad no hay: no se toca.
        var withOptions = await merchant.PostAsync("/api/v1/products", new
        {
            name = "Remera",
            publish = true,
            options = new[] { new { name = "Talle", values = new[] { "S", "M" } } },
            variants = new[]
            {
                new { sku = $"REM-S-{merchant.Subdomain}", optionValues = new[] { "S" }, priceAmount = 100_000L, currency = "ARS" },
                new { sku = $"REM-M-{merchant.Subdomain}", optionValues = new[] { "M" }, priceAmount = 100_000L, currency = "ARS" },
            },
        });
        var remera = await merchant.GetAsync($"/api/v1/products/{withOptions.GetProperty("id").GetGuid()}");
        var remeraVariants = remera.GetProperty("variants").EnumerateArray().Select(v => v.GetProperty("id").GetGuid()).ToList();

        using (var scope = factory.Services.CreateScope())
        {
            var added = await UnlimitedStockBackfill.RunAsync(
                scope.ServiceProvider.GetRequiredService<CatalogDbContext>(),
                scope.ServiceProvider.GetRequiredService<InventoryDbContext>(),
                merchant.TenantId);
            Assert.Equal(1, added);
        }

        var rows = (await merchant.GetAsync($"/api/v1/inventory?variantIds={single},{counted},{string.Join(',', remeraVariants)}"))
            .GetProperty("items").EnumerateArray().ToDictionary(i => i.GetProperty("variantId").GetGuid());
        Assert.True(rows[single].GetProperty("unlimited").GetBoolean());
        Assert.False(rows[counted].GetProperty("unlimited").GetBoolean());
        Assert.Equal(2, rows[counted].GetProperty("available").GetInt32());
        Assert.DoesNotContain(remeraVariants, rows.ContainsKey);

        // Y ya se puede comprar.
        await new Shopper(merchant).CheckoutAsync(single, quantity: 2);
    }
}
