using System.Net;
using System.Text.Json;
using Ai.Infrastructure;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Los atributos y la categoría que se guardan de un producto para Mercado Libre (al aprobar las fichas con IA) y cómo llegan a
/// una publicación: al publicar, y al actualizar una que ya existe.
/// </summary>
[Collection("api")]
public sealed class MeliListingAttributesTests(ApiFactory factory)
{
    private const string Api = MeliAccount.Api;

    private async Task SaveAsync(Guid tenantId, Guid productId, params MeliProductAttribute[] attributes)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MeliDbContext>();
        db.ProductAttributes.AddRange(attributes);
        await db.SaveChangesAsync();
    }

    private async Task SaveCategoryAsync(Guid tenantId, Guid productId, string categoryId, string name, MeliCategorySource source)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MeliDbContext>();
        db.ProductCategories.Add(MeliProductCategory.Create(tenantId, productId, categoryId, name, source));
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Publicar_manda_los_atributos_guardados()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla1");
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
        factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/items", new { id = itemId, permalink = (string?)null });
        var (productId, _) = await store.CreateProductAsync("Taladro con ficha", priceMinor: 30_000_00, stock: 5);
        await SaveCategoryAsync(store.TenantId, productId, "MLA1", "Taladros eléctricos", MeliCategorySource.Manual);
        await SaveAsync(store.TenantId, productId,
            MeliProductAttribute.Create(store.TenantId, productId, "IS_KIT", "242084", "No", null),
            MeliProductAttribute.Create(store.TenantId, productId, "GTIN", null, "7790001000017", null),
            MeliProductAttribute.Create(store.TenantId, productId, "LENGTH", null, "2", "m"));

        await store.PostAsync($"/api/v1/admin/meli/products/{productId}/publish", new { categoryId = "MLA1" });

        var body = JsonDocument.Parse(factory.ExternalHttp.SentTo($"{Api}/items").Last(r => r.Uri.AbsolutePath == "/items").Body!).RootElement;
        var attributes = body.GetProperty("attributes").EnumerateArray().ToDictionary(a => a.GetProperty("id").GetString()!);
        Assert.Equal("242084", attributes["IS_KIT"].GetProperty("value_id").GetString());
        Assert.Equal("7790001000017", attributes["GTIN"].GetProperty("value_name").GetString());
        Assert.Equal("2 m", attributes["LENGTH"].GetProperty("value_name").GetString());
        Assert.Contains("SELLER_SKU", attributes.Keys);
    }

    [Fact]
    public async Task Publicar_en_otra_categoria_no_manda_los_atributos_guardados()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla1b");
        var itemId = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
        factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/items", new { id = itemId, permalink = (string?)null });
        var (productId, _) = await store.CreateProductAsync("Taladro con ficha", priceMinor: 30_000_00, stock: 5);
        await SaveCategoryAsync(store.TenantId, productId, "MLA1", "Taladros eléctricos", MeliCategorySource.Manual);
        await SaveAsync(store.TenantId, productId,
            MeliProductAttribute.Create(store.TenantId, productId, "GTIN", null, "7790001000017", null));

        await store.PostAsync($"/api/v1/admin/meli/products/{productId}/publish", new { categoryId = "MLA2" });

        var body = JsonDocument.Parse(factory.ExternalHttp.SentTo($"{Api}/items").Last(r => r.Uri.AbsolutePath == "/items").Body!).RootElement;
        var ids = body.GetProperty("attributes").EnumerateArray().Select(a => a.GetProperty("id").GetString()).ToList();
        Assert.DoesNotContain("GTIN", ids);
    }

    [Fact]
    public async Task Categoria_guardada_se_ofrece_al_publicar()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla2");
        var (productId, _) = await store.CreateProductAsync("Taladro con categoría");
        var (other, _) = await store.CreateProductAsync("Taladro sin categoría");
        await SaveCategoryAsync(store.TenantId, productId, "MLA1", "Taladros eléctricos", MeliCategorySource.Manual);

        var saved = await store.GetAsync($"/api/v1/admin/meli/products/{productId}/category");
        var none = await store.GetAsync($"/api/v1/admin/meli/products/{other}/category");

        Assert.Equal("MLA1", saved.GetProperty("categoryId").GetString());
        Assert.Equal("Taladros eléctricos", saved.GetProperty("categoryName").GetString());
        Assert.Equal("Manual", saved.GetProperty("source").GetString());
        Assert.Equal(JsonValueKind.Null, none.GetProperty("categoryId").ValueKind);
    }

    [Fact]
    public async Task La_categoria_guardada_es_de_la_tienda()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla3");
        var (productId, _) = await store.CreateProductAsync("Taladro");
        await SaveCategoryAsync(store.TenantId, productId, "MLA1", "Taladros eléctricos", MeliCategorySource.Predicted);
        var (other, _) = await MeliAccount.ConnectAsync(factory, "mla4");

        var asOther = await other.GetAsync($"/api/v1/admin/meli/products/{productId}/category");

        Assert.Equal(JsonValueKind.Null, asOther.GetProperty("categoryId").ValueKind);
    }

    [Fact]
    public async Task Solo_con_MeliPublish()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla5");
        var (productId, _) = await store.CreateProductAsync("Taladro");
        var support = await store.AddTeammateAsync("soporte", "mlsp");

        Assert.Equal(HttpStatusCode.Forbidden, await support.StatusAsync(HttpMethod.Get, $"/api/v1/admin/meli/products/{productId}/category"));
    }

    // ------------------------------------------------------------------ Actualizar la ficha en ML

    private const string Catalog = "/api/v1/ai/catalog";

    /// <summary>Un trabajo de fichas con productos de la tienda, aprobados, y publicaciones de ML vinculadas a cada uno (una sola).</summary>
    private async Task<(Guid JobId, Guid[] ItemIds, Guid[] ProductIds, string[] MeliItems)> ApprovedAsync(
        Merchant store, int count, bool linked = true, AiCatalogItemStatus status = AiCatalogItemStatus.Approved)
    {
        var products = new List<Guid>();
        var meliItems = new List<string>();
        using var scope = factory.Services.CreateScope();
        var ai = scope.ServiceProvider.GetRequiredService<AiDbContext>();
        var meli = scope.ServiceProvider.GetRequiredService<MeliDbContext>();

        var job = AiCatalogJob.Create(store.TenantId, Guid.NewGuid(), count, 0, DateTime.UtcNow);
        job.Status = AiCatalogJobStatus.Done;
        ai.CatalogJobs.Add(job);
        var items = new List<AiCatalogJobItem>();
        for (var i = 0; i < count; i++)
        {
            var (productId, variantId) = await store.CreateProductAsync($"Taladro {i}");
            var meliItem = $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_000_000_000)}";
            products.Add(productId);
            meliItems.Add(meliItem);
            meli.ProductAttributes.Add(MeliProductAttribute.Create(store.TenantId, productId, "GTIN", null, "7790001000017", null));
            if (linked)
            {
                // Dos vínculos de la misma publicación (dos variaciones): tiene que salir un solo PUT.
                meli.ItemLinks.Add(MeliItemLink.Create(store.TenantId, meliItem, 111, productId, variantId, "Taladro").Value);
                meli.ItemLinks.Add(MeliItemLink.Create(store.TenantId, meliItem, 222, productId, variantId, "Taladro").Value);
            }
            var item = AiCatalogJobItem.Create(store.TenantId, job.Id, productId, DateTime.UtcNow);
            item.Status = status;
            items.Add(item);
        }
        ai.CatalogJobItems.AddRange(items);
        await ai.SaveChangesAsync();
        await meli.SaveChangesAsync();
        // Por defecto las publicaciones no tienen atributos cargados.
        StubCurrentAttributes([.. meliItems.Select(m => (m, Array.Empty<object>()))]);
        return (job.Id, [.. items.Select(i => i.Id)], [.. products], [.. meliItems]);
    }

    /// <summary>Lo que Mercado Libre contesta al leer las publicaciones antes de actualizarlas (por id; sin entrada, sin atributos).</summary>
    private void StubCurrentAttributes(params (string MeliItem, object[] Attributes)[] listings)
    {
        // Una ruta por id (con el id completo): otros tests dejan rutas como ?ids=MLA1, que le ganarían a /items/bulk a secas.
        foreach (var (meliItem, attributes) in listings)
            factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/items/bulk?ids={meliItem}",
                new[] { new { status_code = 200, body = new { id = meliItem, attributes } } });
    }

    private List<FakeHttp.Recorded> PutsTo(string meliItem) =>
        [.. factory.ExternalHttp.SentTo($"{Api}/items/{meliItem}").Where(r => r.Method == HttpMethod.Put)];

    [Fact]
    public async Task Actualizar_manda_un_PUT_por_publicacion()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla6");
        var (_, items, _, meliItems) = await ApprovedAsync(store, 1);
        factory.ExternalHttp.OnJson(HttpMethod.Put, $"{Api}/items/{meliItems[0]}", new { id = meliItems[0] });

        var response = await store.PostAsync($"{Catalog}/items/{items[0]}/push-to-meli", new { });

        Assert.Equal(1, response.GetProperty("updatedListings").GetInt32());
        var put = Assert.Single(PutsTo(meliItems[0]));
        var body = JsonDocument.Parse(put.Body!).RootElement;
        // Solo atributos: ni categoría ni SELLER_SKU (que es de la variación).
        Assert.Equal(["attributes"], body.EnumerateObject().Select(p => p.Name));
        var attributes = body.GetProperty("attributes").EnumerateArray().ToList();
        Assert.Equal("GTIN", Assert.Single(attributes).GetProperty("id").GetString());
        Assert.Equal("7790001000017", attributes[0].GetProperty("value_name").GetString());
    }

    [Fact]
    public async Task Actualizar_manda_la_union_con_lo_que_la_publicacion_ya_tenia()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla6b");
        var (_, items, _, meliItems) = await ApprovedAsync(store, 1);
        factory.ExternalHttp.OnJson(HttpMethod.Put, $"{Api}/items/{meliItems[0]}", new { id = meliItems[0] });
        StubCurrentAttributes((meliItems[0], new object[]
        {
            new { id = "GTIN", name = "GTIN", value_id = (string?)null, value_name = "111" },
            new { id = "COLOR", name = "Color", value_id = "52049", value_name = "Negro" },
            new { id = "BATTERY", name = "Batería", value_id = (string?)null, value_name = "18 V" },
            new { id = "EMPTY", name = "Sin valor", value_id = (string?)null, value_name = (string?)null },
        }));

        await store.PostAsync($"{Catalog}/items/{items[0]}/push-to-meli", new { });

        var put = Assert.Single(PutsTo(meliItems[0]));
        var attributes = JsonDocument.Parse(put.Body!).RootElement.GetProperty("attributes").EnumerateArray()
            .ToDictionary(a => a.GetProperty("id").GetString()!);
        // Lo nuestro gana por id; lo que no tocamos viaja igual, para que sirva si el PUT reemplaza la lista.
        Assert.Equal("7790001000017", attributes["GTIN"].GetProperty("value_name").GetString());
        Assert.Equal("52049", attributes["COLOR"].GetProperty("value_id").GetString());
        Assert.Equal("18 V", attributes["BATTERY"].GetProperty("value_name").GetString());
        Assert.DoesNotContain("EMPTY", attributes.Keys);
        Assert.Equal(3, attributes.Count);
    }

    [Fact]
    public async Task Si_no_se_puede_leer_la_publicacion_no_se_la_pisa()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla6c");
        var (_, items, _, meliItems) = await ApprovedAsync(store, 1);
        factory.ExternalHttp.On(HttpMethod.Get, $"{Api}/items/bulk?ids={meliItems[0]}", (_, _) =>
            FakeHttp.Json(new { message = "boom" }, HttpStatusCode.InternalServerError));

        var response = await store.SendAsync(HttpMethod.Post, $"{Catalog}/items/{items[0]}/push-to-meli", new { });

        Assert.False(response.IsSuccessStatusCode);
        Assert.Empty(PutsTo(meliItems[0]));    }

    [Fact]
    public async Task Sin_MeliPublish_da_403()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla7");
        var (jobId, items, _, _) = await ApprovedAsync(store, 1);
        var cataloger = await store.AddTeammateAsync("catalogo", "mlct");
        // El rol de catálogo tiene las dos cosas: a esta persona se le deja solo escribir el catálogo.
        await store.PutAsync($"/api/v1/members/{cataloger.UserId}/permissions", new { permissions = new[] { "catalog.write" } });

        Assert.Equal(HttpStatusCode.Forbidden, await cataloger.StatusAsync(HttpMethod.Post, $"{Catalog}/items/{items[0]}/push-to-meli", new { }));
        Assert.Equal(HttpStatusCode.Forbidden, await cataloger.StatusAsync(HttpMethod.Post, $"{Catalog}/jobs/{jobId}/push-to-meli", new { }));
        // Revisar y aprobar sigue siendo suyo.
        Assert.Equal(HttpStatusCode.OK, await cataloger.StatusAsync(HttpMethod.Get, $"{Catalog}/jobs/{jobId}"));
    }

    [Fact]
    public async Task Demo_da_409_y_no_sale()
    {
        var store = await Merchant.CreateAsync(factory, "mla8");
        await MeliAccount.SeedAsync(factory, store.TenantId, demo: true);
        var (jobId, items, _, meliItems) = await ApprovedAsync(store, 1);
        var before = factory.ExternalHttp.SentTo(Api).Count;

        var single = await store.SendAsync(HttpMethod.Post, $"{Catalog}/items/{items[0]}/push-to-meli", new { });
        var batch = await store.SendAsync(HttpMethod.Post, $"{Catalog}/jobs/{jobId}/push-to-meli", new { });

        Assert.Equal(HttpStatusCode.Conflict, single.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, batch.StatusCode);
        Assert.Equal("Meli.Demo", (await single.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
        Assert.Equal(before, factory.ExternalHttp.SentTo(Api).Count);
        Assert.Empty(PutsTo(meliItems[0]));
    }

    [Fact]
    public async Task Sin_conexion_da_409()
    {
        var store = await Merchant.CreateAsync(factory, "mla9");
        var (_, items, _, _) = await ApprovedAsync(store, 1);

        var response = await store.SendAsync(HttpMethod.Post, $"{Catalog}/items/{items[0]}/push-to-meli", new { });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("Meli.NotConnected", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
    }

    [Fact]
    public async Task Item_no_aprobado_da_409()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla10");
        var (_, items, _, meliItems) = await ApprovedAsync(store, 1, status: AiCatalogItemStatus.Review);

        var response = await store.SendAsync(HttpMethod.Post, $"{Catalog}/items/{items[0]}/push-to-meli", new { });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("AiCatalog.NotApproved", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
        Assert.Empty(PutsTo(meliItems[0]));
    }

    [Fact]
    public async Task Producto_sin_publicacion_vinculada_da_400()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla11");
        var (_, items, _, _) = await ApprovedAsync(store, 1, linked: false);

        var response = await store.SendAsync(HttpMethod.Post, $"{Catalog}/items/{items[0]}/push-to-meli", new { });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Este producto no está publicado en Mercado Libre.",
            (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Lote_de_aprobados_pagina_con_next()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla12");
        var (jobId, _, products, meliItems) = await ApprovedAsync(store, 3);
        foreach (var meliItem in meliItems)
            factory.ExternalHttp.OnJson(HttpMethod.Put, $"{Api}/items/{meliItem}", new { id = meliItem });

        var first = await store.PostAsync($"{Catalog}/jobs/{jobId}/push-to-meli", new { limit = 2 });
        Assert.Equal(2, first.GetProperty("updated").GetInt32());
        Assert.Empty(first.GetProperty("failed").EnumerateArray());
        var next = first.GetProperty("next").GetGuid();
        Assert.Contains(next, products);

        var second = await store.PostAsync($"{Catalog}/jobs/{jobId}/push-to-meli", new { limit = 2, after = next });
        Assert.Equal(1, second.GetProperty("updated").GetInt32());
        Assert.Equal(JsonValueKind.Null, second.GetProperty("next").ValueKind);

        // Cada publicación recibió su PUT una sola vez en total.
        Assert.All(meliItems, meliItem => Assert.Single(PutsTo(meliItem)));
    }

    [Fact]
    public async Task Un_error_de_ML_no_frena_el_lote()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla13");
        var (jobId, _, products, meliItems) = await ApprovedAsync(store, 3);
        factory.ExternalHttp.OnJson(HttpMethod.Put, $"{Api}/items/{meliItems[0]}", new { id = meliItems[0] });
        factory.ExternalHttp.OnJson(HttpMethod.Put, $"{Api}/items/{meliItems[1]}", new { id = meliItems[1] });
        factory.ExternalHttp.OnJson(HttpMethod.Put, $"{Api}/items/{meliItems[2]}", new { id = meliItems[2] });
        var broken = meliItems[1];
        factory.ExternalHttp.OnJson(HttpMethod.Put, $"{Api}/items/{broken}", new { message = "item.attributes.invalid" }, HttpStatusCode.BadRequest);

        var result = await store.PostAsync($"{Catalog}/jobs/{jobId}/push-to-meli", new { });

        Assert.Equal(2, result.GetProperty("updated").GetInt32());
        var failure = Assert.Single(result.GetProperty("failed").EnumerateArray());
        Assert.Equal(products[1], failure.GetProperty("productId").GetGuid());
        Assert.Contains("item.attributes.invalid", failure.GetProperty("message").GetString());
        Assert.Equal(JsonValueKind.Null, result.GetProperty("next").ValueKind);
    }

    [Fact]
    public async Task Solo_los_aprobados_con_publicacion_entran_al_lote()
    {
        var (store, _) = await MeliAccount.ConnectAsync(factory, "mla14");
        var (jobId, items, products, meliItems) = await ApprovedAsync(store, 3);
        // Del mismo trabajo: uno todavía en revisión y otro cuya publicación ya no está vinculada.
        using (var scope = factory.Services.CreateScope())
        {
            var ai = scope.ServiceProvider.GetRequiredService<AiDbContext>();
            var meli = scope.ServiceProvider.GetRequiredService<MeliDbContext>();
            (await ai.CatalogJobItems.IgnoreQueryFilters().FirstAsync(i => i.Id == items[1])).Status = AiCatalogItemStatus.Review;
            await ai.SaveChangesAsync();
            await meli.ItemLinks.IgnoreQueryFilters().Where(l => l.ProductId == products[2]).ExecuteDeleteAsync();
        }
        factory.ExternalHttp.OnJson(HttpMethod.Put, $"{Api}/items/{meliItems[0]}", new { id = meliItems[0] });

        var result = await store.PostAsync($"{Catalog}/jobs/{jobId}/push-to-meli", new { });

        Assert.Equal(1, result.GetProperty("updated").GetInt32());
        Assert.Empty(result.GetProperty("failed").EnumerateArray());
        Assert.Single(PutsTo(meliItems[0]));
        Assert.Empty(PutsTo(meliItems[1]));
        Assert.Empty(PutsTo(meliItems[2]));
    }
}
