using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// Dar de alta un producto desde el panel: lo que se rechaza (opción sin
/// nombre, variante inválida, publicar sin variantes) y el slug cuando el
/// nombre ya existe —sufijo numérico, y un tope para no quedar en un bucle—.
/// </summary>
[Collection("api")]
public sealed class ProductCreationTests(ApiFactory factory)
{
    private static object Variant(string sku, params string[] optionValues) =>
        new { sku, optionValues, priceAmount = 10_000_00L, currency = "ARS" };

    private static async Task<string?> CodeAsync(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString();

    [Fact]
    public async Task Rechaza_opciones_variantes_y_publicaciones_invalidas()
    {
        var merchant = await Merchant.CreateAsync(factory, "pcr");
        async Task<string?> Reject(object body)
        {
            var res = await merchant.SendAsync(HttpMethod.Post, "/api/v1/products", body);
            Assert.False(res.IsSuccessStatusCode);
            return await CodeAsync(res);
        }

        Assert.NotNull(await Reject(new
        {
            name = "Remera",
            options = new[] { new { name = "", values = new[] { "S" } } },
            variants = new[] { Variant($"REM-{merchant.Subdomain}", "S") },
        }));
        Assert.NotNull(await Reject(new
        {
            name = "Remera",
            variants = new[] { Variant($"DUP-{merchant.Subdomain}"), Variant($"DUP-{merchant.Subdomain}") },
        }));
        Assert.Equal("Product.NoVariants", await Reject(new { name = "Sin variantes", publish = true }));
    }

    [Fact]
    public async Task Un_nombre_repetido_lleva_sufijo_y_hay_un_tope()
    {
        var merchant = await Merchant.CreateAsync(factory, "psl");
        var name = $"Termo {merchant.Subdomain}";
        var slugs = new List<string>();
        for (var i = 0; i < 10; i++)
        {
            var created = await merchant.PostAsync("/api/v1/products", new { name, variants = new[] { Variant($"T{i}-{merchant.Subdomain}") } });
            slugs.Add(created.GetProperty("slug").GetString()!);
        }

        var baseSlug = slugs[0];
        Assert.Equal(10, slugs.Distinct().Count());
        Assert.Equal($"{baseSlug}-2", slugs[1]);
        Assert.Equal($"{baseSlug}-10", slugs[9]);

        // El undécimo ya no encuentra slug libre: se rechaza en vez de girar sin fin.
        var exhausted = await merchant.SendAsync(HttpMethod.Post, "/api/v1/products",
            new { name, variants = new[] { Variant($"T10-{merchant.Subdomain}") } });
        Assert.Equal(HttpStatusCode.Conflict, exhausted.StatusCode);
        Assert.Equal("Product.SlugExhausted", await CodeAsync(exhausted));
    }
}
