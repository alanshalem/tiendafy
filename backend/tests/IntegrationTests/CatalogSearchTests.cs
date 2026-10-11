using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// Buscar y filtrar el catálogo como lo hacen la tienda (búsqueda con facetas:
/// categoría con subcategorías, precio, marca, opciones, ficha técnica, orden)
/// y el panel (estado, sin costo, sin imagen, en oferta, stock, orden,
/// paginado por cursor y por página, resolver por ids).
/// </summary>
[Collection("api")]
public sealed class CatalogSearchTests
{
    private readonly ApiFactory _factory;

    public CatalogSearchTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task La_tienda_filtra_por_todo_lo_que_ofrece()
    {
        var (merchant, ids) = await CatalogAsync("srch");
        var shopper = new Shopper(merchant);

        async Task<List<string>> Names(string query) =>
            [.. (await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/products/search?{query}"))
                .GetProperty("items").EnumerateArray().Select(p => p.GetProperty("name").GetString()!)];

        // Facetas del catálogo entero.
        var all = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/products/search?pageSize=48");
        var facets = all.GetProperty("facets");
        Assert.Contains("Nike", facets.GetProperty("brands").EnumerateArray().Select(b => b.GetString()));
        Assert.Contains(facets.GetProperty("options").EnumerateArray(), o => o.GetProperty("name").GetString() == "Color");
        Assert.Contains(facets.GetProperty("specs").EnumerateArray(), s => s.GetProperty("name").GetString() == "Material");
        Assert.Equal(3, all.GetProperty("total").GetInt32()); // el borrador no aparece

        // Categoría padre: trae lo de las subcategorías.
        Assert.Equal(2, (await Names($"category={ids["calzado"]}")).Count);
        Assert.Single(await Names($"category={ids["running"]}"));
        Assert.Empty(await Names($"category={Guid.NewGuid()}"));

        // Precio (en pesos), marca, opción y ficha técnica.
        Assert.Equal(["Zapatilla Running"], await Names("priceMin=50000&priceMax=70000"));
        Assert.Equal(["Zapatilla Running", "Ojota"], await Names("brand=Nike&sort=price_desc"));
        Assert.Equal(["Remera Dry"], await Names("option=Rojo"));
        Assert.Equal(["Remera Dry"], await Names($"spec={ids["material"]}:Poliéster"));
        Assert.Equal(2, (await Names($"spec={ids["material"]}:Poliéster&spec={ids["material"]}:Goma")).Count); // dos valores del mismo campo suman
        Assert.Equal(3, (await Names("spec=basura&spec=x:y")).Count); // filtros malformados se ignoran

        // Orden y paginado.
        Assert.Equal(["Ojota", "Remera Dry", "Zapatilla Running"], await Names("sort=name"));
        Assert.Equal("Ojota", (await Names("sort=price_asc"))[0]);
        var page2 = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/products/search?pageSize=2&page=2");
        Assert.Equal(2, page2.GetProperty("totalPages").GetInt32());
        Assert.Single(page2.GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task El_panel_filtra_ordena_y_pagina()
    {
        var (merchant, ids) = await CatalogAsync("adm");

        async Task<List<string>> Names(string query) =>
            [.. (await merchant.GetAsync($"/api/v1/products?{query}"))
                .GetProperty("items").EnumerateArray().Select(p => p.GetProperty("name").GetString()!)];

        Assert.Equal(4, (await Names("offset=0&limit=50")).Count);
        Assert.Equal(["Borrador"], await Names("status=DRAFT&offset=0"));
        Assert.Equal(["Ojota"], await Names("missingCost=true&sort=nameAsc"));
        Assert.Equal(["Zapatilla Running"], await Names("promo=true"));
        Assert.Equal(3, (await Names("promo=false")).Count);
        Assert.Equal(4, (await Names("missingImage=true")).Count);
        Assert.Equal(["Remera Dry"], await Names("stock=low&lowStockThreshold=5"));
        Assert.Equal(["Borrador"], await Names("stock=out"));
        Assert.Equal(3, (await Names("stock=in")).Count);
        Assert.Equal(["Zapatilla Running", "Remera Dry", "Ojota", "Borrador"], await Names("sort=nameDesc"));
        Assert.Equal("Zapatilla Running", (await Names("sort=oldest"))[0]);
        Assert.Equal(2, (await Names($"categoryId={ids["calzado"]}")).Count);

        // Por ids, en el orden pedido (para los selectores).
        var byIds = await Names($"ids={ids["ojota"]},{ids["remera"]},no-es-id");
        Assert.Equal(["Ojota", "Remera Dry"], byIds);
        Assert.Empty(await Names("ids=nada"));

        // Por cursor: recorre todo sin repetir (lo usa la exportación).
        var seen = new List<string>();
        string? cursor = null;
        do
        {
            var page = await merchant.GetAsync($"/api/v1/products?limit=2{(cursor is null ? "" : $"&after={cursor}")}");
            seen.AddRange(page.GetProperty("items").EnumerateArray().Select(p => p.GetProperty("name").GetString()!));
            cursor = page.GetProperty("nextCursor").ValueKind == JsonValueKind.Null ? null : page.GetProperty("nextCursor").GetString();
        }
        while (cursor is not null);
        Assert.Equal(4, seen.Distinct().Count());
    }

    /// <summary>
    /// Un catálogo chico pero con todo: categorías anidadas, marcas, opciones,
    /// ficha técnica, oferta, stock bajo y agotado, y un borrador.
    /// </summary>
    private async Task<(Merchant Merchant, Dictionary<string, Guid> Ids)> CatalogAsync(string tag)
    {
        var merchant = await Merchant.CreateAsync(_factory, tag);
        var ids = new Dictionary<string, Guid>();

        var calzado = await merchant.PostAsync("/api/v1/categories", new { name = "Calzado" });
        ids["calzado"] = calzado.GetProperty("id").GetGuid();
        var running = await merchant.PostAsync("/api/v1/categories", new { name = "Running", parentId = ids["calzado"] });
        ids["running"] = running.GetProperty("id").GetGuid();
        var material = await merchant.PostAsync("/api/v1/spec-definitions", new { name = "Material", type = "TEXT", showOnProduct = true, filterable = true, sortOrder = 1 });
        ids["material"] = material.GetProperty("id").GetGuid();

        async Task<Guid> Product(string name, string brand, long priceMinor, long? compareAt, int stock, Guid? category, string? specValue,
            bool publish = true, string[]? colors = null, bool cost = true)
        {
            var body = await merchant.PostAsync("/api/v1/products", new
            {
                name,
                description = "x",
                publish,
                options = colors is null ? null : new[] { new { name = "Color", values = colors } },
                variants = new[]
                {
                    new { sku = $"{name[..3]}-{merchant.Subdomain}", optionValues = colors is null ? Array.Empty<string>() : [colors[0]], priceAmount = priceMinor, currency = "ARS", compareAtAmount = compareAt },
                },
            });
            var id = body.GetProperty("id").GetGuid();
            var variantId = body.GetProperty("variants")[0].GetProperty("id").GetGuid();
            await merchant.PatchAsync($"/api/v1/products/{id}", new { name, description = "x", brand });
            if (stock > 0) await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{variantId}", new { available = stock, reason = "test" });
            if (category is { } c) await merchant.PutAsync($"/api/v1/products/{id}/categories", new { categoryIds = new[] { c } });
            if (specValue is not null)
                await merchant.PutAsync($"/api/v1/products/{id}/specs", new { values = new[] { new { definitionId = ids["material"], value = specValue } } });
            if (cost)
                await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/products/{id}/costs", new { costs = new[] { new { variantId, costAmount = (long?)(priceMinor / 2) } } });
            return id;
        }

        ids["zapatilla"] = await Product("Zapatilla Running", "Nike", 60_000_00, 75_000_00, 20, ids["running"], "Goma");
        ids["ojota"] = await Product("Ojota", "Nike", 8_000_00, null, 30, ids["calzado"], null, cost: false);
        ids["remera"] = await Product("Remera Dry", "Adidas", 15_000_00, null, 3, null, "Poliéster", colors: ["Rojo", "Azul"]);
        ids["borrador"] = await Product("Borrador", "X", 1_000_00, null, 0, null, null, publish: false);
        return (merchant, ids);
    }
}
