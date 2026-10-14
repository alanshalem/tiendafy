using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// Lo que la tienda necesita saber del stock para no vender lo que no hay: la
/// ficha de producto vende UNA variante, así que tiene que conocer el stock de
/// cada una (antes solo llegaba el total y un talle agotado se veía "en stock").
/// </summary>
[Collection("api")]
public sealed class StorefrontStockTests
{
    private readonly ApiFactory _factory;

    public StorefrontStockTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task La_ficha_trae_el_stock_de_cada_variante()
    {
        var merchant = await Merchant.CreateAsync(_factory, "stk");
        var (_, slug, small, medium) = await RemeraConTallesAsync(merchant);
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{small}", new { available = 3, reason = "test" });
        // M no tiene fila de stock: para la reserva del checkout eso es cero.

        var product = await new Shopper(merchant).ExpectJsonAsync(HttpMethod.Get, $"/api/v1/products/by-slug/{slug}");

        Assert.Equal(3, product.GetProperty("stock").GetInt32());
        Assert.Equal(3, AvailableOf(product, small));
        Assert.Equal(0, AvailableOf(product, medium));
    }

    [Fact]
    public async Task El_carrito_consulta_el_precio_y_el_stock_vigentes()
    {
        var merchant = await Merchant.CreateAsync(_factory, "stv");
        var (productId, _, small, medium) = await RemeraConTallesAsync(merchant);
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{small}", new { available = 2, reason = "test" });
        // Subió el precio después de que el comprador lo agregó al carrito.
        await merchant.PatchAsync($"/api/v1/products/{productId}/variants/{small}/price",
            new { priceAmount = 12_000_00L, currency = "ARS" });

        // Una variante de otra tienda, un id que no existe y basura no aparecen.
        var other = await Merchant.CreateAsync(_factory, "stv2");
        var (_, foreign) = await other.CreateProductAsync("Ajeno");
        var shopper = new Shopper(merchant);
        var res = await shopper.ExpectJsonAsync(HttpMethod.Get,
            $"/api/v1/products/variants?ids={small},{medium},{foreign},{Guid.NewGuid()},basura");

        var items = res.GetProperty("items").EnumerateArray().ToDictionary(i => i.GetProperty("variantId").GetGuid());
        Assert.Equal(2, items.Count);
        Assert.Contains(small, items.Keys);
        Assert.Contains(medium, items.Keys);
        Assert.Equal(12_000_00, items[small].GetProperty("price").GetProperty("amount").GetInt64());
        Assert.Equal("ARS", items[small].GetProperty("price").GetProperty("currency").GetString());
        Assert.Equal(2, items[small].GetProperty("available").GetInt32());
        Assert.Equal(0, items[medium].GetProperty("available").GetInt32());
        Assert.Equal("S", items[small].GetProperty("variantLabel").GetString());
        // El costo del comerciante nunca sale al navegador.
        Assert.False(items[small].TryGetProperty("cost", out _));

        // Un producto que dejó de venderse desaparece del todo.
        await merchant.PostAsync($"/api/v1/products/{productId}/archive", new { });
        var archived = await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/products/variants?ids={small}");
        Assert.Equal(0, archived.GetProperty("items").GetArrayLength());

        // Sin ids no hay nada que buscar.
        var empty = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/products/variants");
        Assert.Equal(0, empty.GetProperty("items").GetArrayLength());
    }

    // ---------------------------------------------------------------- helpers

    internal static async Task<(Guid ProductId, string Slug, Guid Small, Guid Medium)> RemeraConTallesAsync(Merchant merchant)
    {
        var created = await merchant.PostAsync("/api/v1/products", new
        {
            name = $"Remera stock {merchant.Subdomain}",
            description = "test",
            publish = true,
            options = new[] { new { name = "Talle", values = new[] { "S", "M" } } },
            variants = new[]
            {
                new { sku = $"STK-S-{merchant.Subdomain}", optionValues = new[] { "S" }, priceAmount = 10_000_00L, currency = "ARS" },
                new { sku = $"STK-M-{merchant.Subdomain}", optionValues = new[] { "M" }, priceAmount = 10_000_00L, currency = "ARS" },
            },
        });
        var variants = created.GetProperty("variants");
        return (created.GetProperty("id").GetGuid(),
            created.GetProperty("slug").GetString()!,
            variants[0].GetProperty("id").GetGuid(),
            variants[1].GetProperty("id").GetGuid());
    }

    private static int AvailableOf(JsonElement product, Guid variantId) =>
        product.GetProperty("variants").EnumerateArray()
            .Single(v => v.GetProperty("id").GetGuid() == variantId)
            .GetProperty("available").GetInt32();
}
