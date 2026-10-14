using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// Lo que ayuda a un comprador a encontrar algo para comprar: lo agotado al
/// final del listado (y el filtro "Solo con stock"), los sinónimos del
/// buscador, el predictivo del encabezado, las sugerencias del carrito y las
/// búsquedas populares.
/// </summary>
[Collection("api")]
public sealed class StorefrontFindingTests(ApiFactory factory)
{
    private static List<string> Names(JsonElement page) =>
        [.. page.GetProperty("items").EnumerateArray().Select(p => p.GetProperty("name").GetString()!)];

    private static async Task<(Guid ProductId, Guid VariantId)> ProductAsync(
        Merchant merchant, string name, long priceMinor, int stock, Guid? category = null)
    {
        var created = await merchant.CreateProductAsync(name, priceMinor, stock);
        if (category is { } c)
            await merchant.PutAsync($"/api/v1/products/{created.ProductId}/categories", new { categoryIds = new[] { c } });
        return created;
    }

    private static Task SellAsync(Merchant merchant, Guid variantId, int quantity = 1) =>
        merchant.PostAsync("/api/v1/orders/manual", new
        {
            items = new[] { new { variantId, quantity } },
            paymentMethod = "cash",
            buyerEmail = "comprador@test.local",
            buyerName = "Comprador de Test",
        });

    [Fact]
    public async Task Lo_agotado_va_al_final_en_cualquier_orden_y_el_paginado_sigue_exacto()
    {
        var merchant = await Merchant.CreateAsync(factory, "agot");
        var shopper = new Shopper(merchant);

        // Del más viejo al más nuevo. Con "Más nuevos" sin stock en cuenta, la
        // página 1 eran los agotados.
        await ProductAsync(merchant, "Alfa", 5_000_00, stock: 0);
        var beta = await ProductAsync(merchant, "Beta", 1_000_00, stock: 5);
        await ProductAsync(merchant, "Gama", 2_000_00, stock: 0);
        await ProductAsync(merchant, "Delta", 4_000_00, stock: 5);
        var epsilon = await ProductAsync(merchant, "Epsilon", 3_000_00, stock: 1);
        // Epsilon se vende entera: queda agotada, pero es lo más vendido.
        await SellAsync(merchant, epsilon.VariantId);
        await SellAsync(merchant, beta.VariantId);

        async Task<List<string>> AllPages(string sort)
        {
            var seen = new List<string>();
            for (var page = 1; page <= 3; page++)
            {
                var body = await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/products/search?pageSize=2&page={page}&sort={sort}");
                Assert.Equal(5, body.GetProperty("total").GetInt32());
                seen.AddRange(Names(body));
            }
            return seen;
        }

        // Cada orden, entero, primero con stock y después sin; ni repetidos ni huecos.
        Assert.Equal(["Delta", "Beta", "Epsilon", "Gama", "Alfa"], await AllPages("newest"));
        Assert.Equal(["Beta", "Delta", "Gama", "Epsilon", "Alfa"], await AllPages("price_asc"));
        Assert.Equal(["Delta", "Beta", "Alfa", "Epsilon", "Gama"], await AllPages("price_desc"));
        Assert.Equal(["Beta", "Delta", "Alfa", "Epsilon", "Gama"], await AllPages("name"));
        // Más vendidos: lo vendido con stock, el resto con stock, lo vendido agotado, el resto.
        Assert.Equal(["Beta", "Delta", "Epsilon", "Gama", "Alfa"], await AllPages("best_sellers"));

        // "Solo con stock": recorta el total; el conteo de la faceta es sin el filtro.
        var all = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/products/search");
        Assert.Equal(2, all.GetProperty("facets").GetProperty("inStock").GetInt32());
        var onlyStock = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/products/search?inStock=true&sort=name");
        Assert.Equal(["Beta", "Delta"], Names(onlyStock));
        Assert.Equal(2, onlyStock.GetProperty("total").GetInt32());
        Assert.Equal(2, onlyStock.GetProperty("facets").GetProperty("inStock").GetInt32());
    }

    [Fact]
    public async Task Los_sinonimos_de_fabrica_se_pueden_cambiar_vaciar_y_restaurar()
    {
        var merchant = await Merchant.CreateAsync(factory, "sino");
        var shopper = new Shopper(merchant);
        await ProductAsync(merchant, "DUMBBELLS HEXAGONALES 5KG", 1_000_00, 5);
        await ProductAsync(merchant, "Mancuerna cromada", 1_000_00, 5);
        await ProductAsync(merchant, "KETTLEBELL 8KG", 1_000_00, 5);
        await ProductAsync(merchant, "Pesas rusas vinílicas", 1_000_00, 5);

        async Task<List<string>> Search(string q) =>
            [.. Names(await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/products/search?sort=name&q={Uri.EscapeDataString(q)}"))];

        // De fábrica: el comprador escribe en castellano, el importador carga en inglés.
        Assert.Equal(["DUMBBELLS HEXAGONALES 5KG", "Mancuerna cromada"], await Search("mancuernas"));
        Assert.Equal(["KETTLEBELL 8KG", "Pesas rusas vinílicas"], await Search("pesa rusa"));
        Assert.Equal(["DUMBBELLS HEXAGONALES 5KG"], await Search("mancuerna 5kg"));

        var settings = await merchant.GetAsync("/api/v1/search/settings");
        Assert.True(settings.GetProperty("isDefault").GetBoolean());
        Assert.NotEmpty(settings.GetProperty("defaults").EnumerateArray());

        // Los suyos reemplazan a los de fábrica.
        var saved = await merchant.PutAsync("/api/v1/search/settings", new { synonyms = new[] { new[] { "Mancuerna", "hexagonal" } } });
        Assert.False(saved.GetProperty("isDefault").GetBoolean());
        Assert.Equal("mancuerna", saved.GetProperty("synonyms")[0][0].GetString());
        Assert.Equal(["DUMBBELLS HEXAGONALES 5KG", "Mancuerna cromada"], await Search("mancuerna"));
        Assert.Equal(["Pesas rusas vinílicas"], await Search("pesa rusa"));

        // Vaciar es no tener sinónimos (no volver a los de fábrica).
        await merchant.PutAsync("/api/v1/search/settings", new { synonyms = Array.Empty<string[]>() });
        Assert.Equal(["Mancuerna cromada"], await Search("mancuerna"));

        // Restaurar sí vuelve.
        var reset = await merchant.SendAsync(HttpMethod.Delete, "/api/v1/search/settings");
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);
        Assert.Equal(2, (await Search("mancuerna")).Count);

        // Validación, y el panel es solo del equipo.
        var invalid = await merchant.SendAsync(HttpMethod.Put, "/api/v1/search/settings",
            new { synonyms = new[] { new[] { "corto", new string('x', 61) } } });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        var anonymous = await shopper.SendAsync(HttpMethod.Get, "/api/v1/search/settings");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
    }

    [Fact]
    public async Task El_predictivo_trae_productos_con_stock_primero_y_categorias()
    {
        var merchant = await Merchant.CreateAsync(factory, "pred");
        var shopper = new Shopper(merchant);
        var pesas = await merchant.PostAsync("/api/v1/categories", new { name = "Pesas rusas" });
        await ProductAsync(merchant, "Kettlebell de hierro 12 kg", 3_000_00, 5, pesas.GetProperty("id").GetGuid());
        await ProductAsync(merchant, "Kettlebell agotada", 3_000_00, 0); // más nueva, pero sin stock
        await ProductAsync(merchant, "Soga de saltar", 1_000_00, 5);

        var found = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/products/suggest?q=kettlebell");
        Assert.Equal(["Kettlebell de hierro 12 kg", "Kettlebell agotada"], Names(found));
        Assert.Equal(2, found.GetProperty("total").GetInt32());
        // La categoría se llama distinto, pero es un sinónimo de lo que se escribió.
        Assert.Equal("Pesas rusas", found.GetProperty("categories")[0].GetProperty("name").GetString());
        Assert.Equal(5, found.GetProperty("items")[0].GetProperty("stock").GetInt32());

        var limited = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/products/suggest?q=kettle&limit=1");
        Assert.Single(limited.GetProperty("items").EnumerateArray());
        Assert.Equal(2, limited.GetProperty("total").GetInt32());

        // Una letra no busca nada (aparecería medio catálogo).
        var tooShort = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/products/suggest?q=k");
        Assert.Empty(tooShort.GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task El_carrito_sugiere_de_sus_categorias_y_despues_lo_mas_vendido()
    {
        var merchant = await Merchant.CreateAsync(factory, "sugc");
        var shopper = new Shopper(merchant);
        var pesas = (await merchant.PostAsync("/api/v1/categories", new { name = "Pesas" })).GetProperty("id").GetGuid();
        var yoga = (await merchant.PostAsync("/api/v1/categories", new { name = "Yoga" })).GetProperty("id").GetGuid();

        var enCarrito = await ProductAsync(merchant, "Mancuerna 5 kg", 1_000_00, 5, pesas);
        await ProductAsync(merchant, "Mancuerna 10 kg", 1_000_00, 5, pesas);
        await ProductAsync(merchant, "Mancuerna agotada", 1_000_00, 0, pesas);
        var masVendido = await ProductAsync(merchant, "Colchoneta", 1_000_00, 5, yoga);
        await ProductAsync(merchant, "Bloque de yoga", 1_000_00, 5, yoga);
        await SellAsync(merchant, masVendido.VariantId, 2);

        async Task<List<string>> Suggest(string query) =>
            Names(await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/products/cart-suggestions?{query}"));

        // Primero lo de su categoría (sin lo agotado ni lo que ya lleva), después lo más vendido, después lo nuevo.
        Assert.Equal(["Mancuerna 10 kg", "Colchoneta", "Bloque de yoga"], await Suggest($"variants={enCarrito.VariantId}&limit=3"));
        // Sin carrito: lo más vendido primero.
        Assert.Equal("Colchoneta", (await Suggest("limit=2"))[0]);
        Assert.DoesNotContain("Mancuerna agotada", await Suggest("limit=12"));
    }

    [Fact]
    public async Task Las_busquedas_se_cuentan_y_las_populares_son_las_que_encuentran_algo()
    {
        var merchant = await Merchant.CreateAsync(factory, "pop");
        var shopper = new Shopper(merchant);
        await ProductAsync(merchant, "DUMBBELL 5KG", 1_000_00, 5);

        foreach (var q in new[] { "Mancuerna", "mancuerna ", "zzz", "zzz", "unico" })
            await shopper.ExpectOkAsync(HttpMethod.Post, "/api/v1/search/log", new { q });
        await shopper.ExpectOkAsync(HttpMethod.Post, "/api/v1/search/log", new { q = "x" }); // muy corta: no cuenta

        var popular = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/search/popular");
        Assert.Equal(["mancuerna"], popular.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("term").GetString()));

        var queries = await merchant.GetAsync("/api/v1/search/queries");
        var top = queries.GetProperty("top").EnumerateArray().ToList();
        Assert.Equal(2, top.Single(q => q.GetProperty("term").GetString() == "mancuerna").GetProperty("count").GetInt32());
        Assert.Equal(1, top.Single(q => q.GetProperty("term").GetString() == "mancuerna").GetProperty("results").GetInt32());
        var withoutResults = queries.GetProperty("withoutResults").EnumerateArray().Select(q => q.GetProperty("term").GetString()).ToList();
        Assert.Contains("zzz", withoutResults);
        Assert.DoesNotContain("mancuerna", withoutResults);
        Assert.DoesNotContain(top, q => q.GetProperty("term").GetString() == "x");
    }

    [Fact]
    public async Task Cambiar_una_variante_actualiza_la_fecha_del_producto()
    {
        var merchant = await Merchant.CreateAsync(factory, "upd");
        var (productId, variantId) = await merchant.CreateProductAsync("Producto con fecha");

        var before = (await merchant.GetAsync($"/api/v1/products/{productId}")).GetProperty("updatedAtUtc").GetDateTime();
        await Task.Delay(20);
        await merchant.PatchAsync($"/api/v1/products/{productId}/variants/{variantId}/price", new { priceAmount = 2_000_00 });
        var after = (await merchant.GetAsync($"/api/v1/products/{productId}")).GetProperty("updatedAtUtc").GetDateTime();

        Assert.True(after > before, $"{after:O} no es posterior a {before:O}");
    }
}
