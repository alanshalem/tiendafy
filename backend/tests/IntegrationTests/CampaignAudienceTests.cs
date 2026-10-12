using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// Audiencias de campaña por catálogo: "los que compraron este producto" (la
/// campaña de proteína, a los que compran proteína) y "los que lo tienen en
/// favoritos" (intención de compra sin compra todavía), sobre los datos reales
/// de ventas y cuentas de la tienda; y la selección a mano, que no se filtra.
/// </summary>
[Collection("api")]
public sealed class CampaignAudienceTests(ApiFactory factory)
{
    private static List<string?> Emails(JsonElement preview) =>
        [.. preview.GetProperty("sample").EnumerateArray().Select(m => m.GetProperty("email").GetString())];

    [Fact]
    public async Task Por_producto_comprado_y_por_favorito()
    {
        var merchant = await Merchant.CreateAsync(factory, "aud");
        var (protein, proteinVariant) = await merchant.CreateProductAsync("Proteína", priceMinor: 40_000_00);
        var (creatine, creatineVariant) = await merchant.CreateProductAsync("Creatina", priceMinor: 25_000_00);

        var ana = $"ana-{merchant.Subdomain}@mail.com";
        var beto = $"beto-{merchant.Subdomain}@mail.com";
        await merchant.PostAsync("/api/v1/orders/manual", new
        {
            items = new[] { new { variantId = proteinVariant, quantity = 1 } },
            paymentMethod = "cash",
            buyerEmail = ana,
            buyerName = "Ana",
        });
        await merchant.PostAsync("/api/v1/orders/manual", new
        {
            items = new[] { new { variantId = creatineVariant, quantity = 2 } },
            paymentMethod = "cash",
            buyerEmail = beto.ToUpperInvariant(), // el email se compara normalizado
            buyerName = "Beto",
        });

        // Compraron proteína: solo Ana.
        var bought = await merchant.PostAsync("/api/v1/admin/campaigns/audience/preview",
            new { type = "buyers", boughtProductIds = new[] { protein } });
        Assert.Equal([ana], Emails(bought));

        // Carla se hizo cuenta y guardó la creatina sin comprarla.
        var carla = $"carla-{merchant.Subdomain}@mail.com";
        var shopper = new Shopper(merchant);
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/auth/register",
            new { name = "Carla", email = carla, password = "una-clave-larga" });
        await shopper.ExpectOkAsync(HttpMethod.Put, $"/api/v1/shop/favorites/{creatine}");

        var favorited = await merchant.PostAsync("/api/v1/admin/campaigns/audience/preview",
            new { type = "customers", favoritedProductIds = new[] { creatine } });
        Assert.Equal([carla], Emails(favorited));

        // Las dos condiciones a la vez: nadie compró proteína Y guardó creatina.
        var both = await merchant.PostAsync("/api/v1/admin/campaigns/audience/preview",
            new { type = "customers", boughtProductIds = new[] { protein }, favoritedProductIds = new[] { creatine } });
        Assert.Equal(0, both.GetProperty("count").GetInt32());

        // Clientes de la tienda: compradores y cuentas, sin repetir.
        var customers = await merchant.PostAsync("/api/v1/admin/campaigns/audience/preview", new { type = "customers" });
        Assert.Equal(3, customers.GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task La_lista_a_mano_se_limpia_pero_no_se_filtra_por_compras()
    {
        var merchant = await Merchant.CreateAsync(factory, "aum");
        var manual = await merchant.PostAsync("/api/v1/admin/campaigns/audience/preview", new
        {
            type = "custom",
            emails = new[] { " Uno@X.com ", "uno@x.com", "sin-arroba", "", "dos@x.com" },
            minOrders = 5, // no aplica a la selección manual
        });
        Assert.Equal(["dos@x.com", "uno@x.com"], Emails(manual).Order(StringComparer.Ordinal));
    }
}
