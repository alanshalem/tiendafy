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
        var (slug, small, medium) = await RemeraConTallesAsync(merchant);
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{small}", new { available = 3, reason = "test" });
        // M no tiene fila de stock: para la reserva del checkout eso es cero.

        var product = await new Shopper(merchant).ExpectJsonAsync(HttpMethod.Get, $"/api/v1/products/by-slug/{slug}");

        Assert.Equal(3, product.GetProperty("stock").GetInt32());
        Assert.Equal(3, AvailableOf(product, small));
        Assert.Equal(0, AvailableOf(product, medium));
    }

    // ---------------------------------------------------------------- helpers

    internal static async Task<(string Slug, Guid Small, Guid Medium)> RemeraConTallesAsync(Merchant merchant)
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
        return (created.GetProperty("slug").GetString()!,
            variants[0].GetProperty("id").GetGuid(),
            variants[1].GetProperty("id").GetGuid());
    }

    private static int AvailableOf(JsonElement product, Guid variantId) =>
        product.GetProperty("variants").EnumerateArray()
            .Single(v => v.GetProperty("id").GetGuid() == variantId)
            .GetProperty("available").GetInt32();
}
