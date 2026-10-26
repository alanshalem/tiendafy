using System.Net;
using System.Text.Json;
using Api.Ai;
using Api.Ai.Catalog;
using Api.Middleware;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Common;
using static IntegrationTests.AiSetup;

namespace IntegrationTests;

/// <summary>Elegir productos, ver el costo estimado contra el tope y crear el trabajo de fichas.</summary>
[Collection("api")]
public sealed class AiCatalogJobTests(ApiFactory factory)
{
    private const string Jobs = "/api/v1/ai/catalog/jobs";

    /// <summary>Un comercio con IA lista para fichas y una cuenta de Mercado Libre real conectada.</summary>
    private async Task<Merchant> StoreAsync(string tag, decimal budgetUsd = 20)
    {
        var store = await Merchant.CreateAsync(factory, tag);
        await MeliAccount.SeedAsync(factory, store.TenantId);
        await ConfigureCatalogAsync(store, budgetUsd: budgetUsd);
        return store;
    }

    private static async Task<Guid> ProductAsync(Merchant store, string name, string? description)
    {
        var body = await store.PostAsync("/api/v1/products", new
        {
            name,
            description,
            publish = true,
            variants = new[] { new { sku = $"SKU-{Guid.NewGuid():N}"[..20], optionValues = Array.Empty<string>(), priceAmount = 15_000_00, currency = "ARS" } },
        });
        return body.GetProperty("id").GetGuid();
    }

    private static object Ids(params Guid[] ids) => new { productIds = ids };

    private static async Task<string> CodeOfAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString()!;

    [Fact]
    public async Task Preview_cuenta_estima_y_dice_cuanto_queda()
    {
        var store = await StoreAsync("ajp");
        var ids = new[]
        {
            await ProductAsync(store, "Taladro", "x"), await ProductAsync(store, "Martillo", "x"), await ProductAsync(store, "Pinza", "x"),
        };

        var preview = await store.PostAsync($"{Jobs}/preview", Ids(ids));

        var perProduct = AiCatalogEstimate.PerProductMicroUsd(AiModelCatalog.Find(Sonnet)!, AiModelCatalog.Find(Luna)!);
        Assert.Equal(3, preview.GetProperty("count").GetInt32());
        Assert.Equal(3, preview.GetProperty("matched").GetInt32());
        Assert.False(preview.GetProperty("capped").GetBoolean());
        Assert.Equal(3 * perProduct, preview.GetProperty("estimatedCostMicroUsd").GetInt64());
        Assert.Equal(20_000_000, preview.GetProperty("budgetMicroUsd").GetInt64());
        Assert.Equal(0, preview.GetProperty("committedMicroUsd").GetInt64());
        Assert.Equal(20_000_000, preview.GetProperty("remainingMicroUsd").GetInt64());
        Assert.True(preview.GetProperty("fitsBudget").GetBoolean());
        Assert.True(preview.GetProperty("available").GetBoolean());
        Assert.Equal("Claude Sonnet 5.5", preview.GetProperty("writeModel").GetString());
        Assert.Equal("GPT-6 Luna", preview.GetProperty("judgeModel").GetString());
        Assert.Equal(JsonValueKind.Null, preview.GetProperty("reason").ValueKind);
    }

    [Fact]
    public async Task Preview_avisa_si_el_tope_no_alcanza_pero_no_bloquea()
    {
        var store = await StoreAsync("ajt", budgetUsd: 0.01m);
        var id = await ProductAsync(store, "Taladro", "x");

        var preview = await store.PostAsync($"{Jobs}/preview", Ids(id));

        Assert.False(preview.GetProperty("fitsBudget").GetBoolean());
        Assert.Equal(10_000, preview.GetProperty("remainingMicroUsd").GetInt64());
        Assert.True(preview.GetProperty("available").GetBoolean());
    }

    [Fact]
    public async Task Mas_de_500_da_400()
    {
        var store = await StoreAsync("aj5");
        var ids = Enumerable.Range(0, 501).Select(_ => Guid.NewGuid()).ToArray();

        var response = await store.SendAsync(HttpMethod.Post, $"{Jobs}/preview", Ids(ids));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("AiCatalog.TooMany", problem.GetProperty("title").GetString());
        Assert.Equal("Elegí hasta 500 productos.", problem.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Sin_elegir_nada_o_con_las_dos_cosas_da_400()
    {
        var store = await StoreAsync("ajn");
        var id = await ProductAsync(store, "Taladro", "x");
        var filter = new { missingDescription = true, shortDescription = false, missingMeliData = false };

        Assert.Equal(HttpStatusCode.BadRequest, (await store.SendAsync(HttpMethod.Post, $"{Jobs}/preview", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await store.SendAsync(HttpMethod.Post, $"{Jobs}/preview", new { productIds = new[] { id }, filter })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await store.SendAsync(HttpMethod.Post, $"{Jobs}/preview", Ids())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await store.SendAsync(HttpMethod.Post, $"{Jobs}/preview",
                new { filter = new { missingDescription = false, shortDescription = false, missingMeliData = false } })).StatusCode);
    }

    [Fact]
    public async Task Filtro_sin_descripcion_toma_solo_esos()
    {
        var store = await StoreAsync("ajd");
        await ProductAsync(store, "Con descripción A", new string('a', 400));
        await ProductAsync(store, "Con descripción B", new string('b', 400));
        var without = await ProductAsync(store, "Sin descripción", null);

        var preview = await store.PostAsync($"{Jobs}/preview",
            new { filter = new { missingDescription = true, shortDescription = false, missingMeliData = false } });

        Assert.Equal(1, preview.GetProperty("count").GetInt32());
        var created = await store.PostAsync(Jobs, new { filter = new { missingDescription = true, shortDescription = false, missingMeliData = false } });
        Assert.Equal(1, created.GetProperty("total").GetInt32());
        Assert.NotEqual(Guid.Empty, without);
    }

    [Fact]
    public async Task Filtro_de_descripcion_corta_y_de_sin_datos_de_ML()
    {
        var store = await StoreAsync("ajc");
        await ProductAsync(store, "Corta", "poca cosa");
        await ProductAsync(store, "Larga", new string('l', 400));

        var shortOnes = await store.PostAsync($"{Jobs}/preview",
            new { filter = new { missingDescription = false, shortDescription = true, missingMeliData = false } });
        // Ninguno tiene categoría ni atributos de ML guardados todavía.
        var noMeli = await store.PostAsync($"{Jobs}/preview",
            new { filter = new { missingDescription = false, shortDescription = false, missingMeliData = true } });
        var both = await store.PostAsync($"{Jobs}/preview",
            new { filter = new { missingDescription = false, shortDescription = true, missingMeliData = true } });

        Assert.Equal(1, shortOnes.GetProperty("count").GetInt32());
        Assert.Equal(2, noMeli.GetProperty("count").GetInt32());
        Assert.Equal(2, both.GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task Filtro_por_categoria_incluye_las_subcategorias()
    {
        var store = await StoreAsync("ajg");
        var parent = (await store.PostAsync("/api/v1/categories", new { name = "Herramientas" })).GetProperty("id").GetGuid();
        var child = (await store.PostAsync("/api/v1/categories", new { name = "Taladros", parentId = parent })).GetProperty("id").GetGuid();
        var inChild = await ProductAsync(store, "Taladro", "x");
        await ProductAsync(store, "Remera", "x");
        await store.PutAsync($"/api/v1/products/{inChild}/categories", new { categoryIds = new[] { child } });

        var preview = await store.PostAsync($"{Jobs}/preview",
            new { filter = new { categoryId = parent, missingDescription = false, shortDescription = false, missingMeliData = false } });

        Assert.Equal(1, preview.GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task Filtro_corta_en_el_maximo_y_avisa()
    {
        var store = await StoreAsync("ajm");
        for (var i = 0; i < 3; i++) await ProductAsync(store, $"Sin descripción {i}", null);

        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantContextHolder>().Set(TenantId.From(store.TenantId));
        var selection = scope.ServiceProvider.GetRequiredService<AiCatalogSelection>();

        var selected = await selection.ResolveAsync(
            TenantId.From(store.TenantId),
            new AiCatalogSelectionRequest(null, new AiCatalogFilter(null, true, false, false)),
            CancellationToken.None, max: 2);

        Assert.True(selected.IsSuccess);
        Assert.Equal(2, selected.Value.ProductIds.Count);
        Assert.Equal(3, selected.Value.Matched);
        Assert.True(selected.Value.Capped);
    }

    [Fact]
    public async Task Producto_de_otra_tienda_no_entra()
    {
        var store = await StoreAsync("ajo");
        var other = await StoreAsync("ajq");
        var mine = await ProductAsync(store, "Mío", "x");
        var theirs = await ProductAsync(other, "Ajeno", "x");

        var preview = await store.PostAsync($"{Jobs}/preview", Ids(mine, theirs));
        Assert.Equal(1, preview.GetProperty("count").GetInt32());

        var onlyTheirs = await store.SendAsync(HttpMethod.Post, $"{Jobs}/preview", Ids(theirs));
        Assert.Equal(HttpStatusCode.BadRequest, onlyTheirs.StatusCode);
        Assert.Equal("AiCatalog.Empty", await CodeOfAsync(onlyTheirs));
    }

    [Fact]
    public async Task Sin_modelo_de_evaluacion_no_crea()
    {
        var store = await Merchant.CreateAsync(factory, "ajs");
        await MeliAccount.SeedAsync(factory, store.TenantId);
        await ConfigureAsync(store, (Ai.Infrastructure.AiTask.CatalogWrite, Sonnet));
        var id = await ProductAsync(store, "Taladro", "x");

        var preview = await store.PostAsync($"{Jobs}/preview", Ids(id));
        Assert.False(preview.GetProperty("available").GetBoolean());
        Assert.Contains("modelo", preview.GetProperty("reason").GetString());

        var created = await store.SendAsync(HttpMethod.Post, Jobs, Ids(id));
        Assert.Equal(HttpStatusCode.Conflict, created.StatusCode);
        Assert.Equal("Ai.TaskNotConfigured", await CodeOfAsync(created));
    }

    [Fact]
    public async Task Sin_Mercado_Libre_no_crea()
    {
        var store = await Merchant.CreateAsync(factory, "ajl");
        await ConfigureCatalogAsync(store);
        var id = await ProductAsync(store, "Taladro", "x");

        var preview = await store.PostAsync($"{Jobs}/preview", Ids(id));
        Assert.False(preview.GetProperty("available").GetBoolean());

        var created = await store.SendAsync(HttpMethod.Post, Jobs, Ids(id));
        Assert.Equal(HttpStatusCode.Conflict, created.StatusCode);
        Assert.Contains("Conectá tu cuenta de Mercado Libre", await created.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task La_cuenta_de_demostracion_tampoco_alcanza()
    {
        var store = await Merchant.CreateAsync(factory, "ajz");
        await MeliAccount.SeedAsync(factory, store.TenantId, demo: true);
        await ConfigureCatalogAsync(store);
        var id = await ProductAsync(store, "Taladro", "x");

        var created = await store.SendAsync(HttpMethod.Post, Jobs, Ids(id));

        Assert.Equal(HttpStatusCode.Conflict, created.StatusCode);
        Assert.Contains("Mercado Libre", await created.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Crear_deja_un_item_por_producto_en_cola()
    {
        var store = await StoreAsync("ajc2");
        var ids = new[] { await ProductAsync(store, "Uno", "x"), await ProductAsync(store, "Dos", "x"), await ProductAsync(store, "Tres", "x") };

        var response = await store.SendAsync(HttpMethod.Post, Jobs, Ids(ids));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.Content.ReadFromJsonAsync<JsonElement>();
        var jobId = created.GetProperty("jobId").GetGuid();
        Assert.Equal(3, created.GetProperty("total").GetInt32());

        var job = await store.GetAsync($"{Jobs}/{jobId}");
        Assert.Equal("Queued", job.GetProperty("status").GetString());
        Assert.Equal(3, job.GetProperty("total").GetInt32());
        Assert.Equal(0, job.GetProperty("processed").GetInt32());
        Assert.Equal(3, job.GetProperty("byStatus").GetProperty("Pending").GetInt32());
        Assert.Equal(0, job.GetProperty("byStatus").GetProperty("Review").GetInt32());
        Assert.Equal(AiCatalogEstimate.PerProductMicroUsd(AiModelCatalog.Find(Sonnet)!, AiModelCatalog.Find(Luna)!) * 3,
            job.GetProperty("estimatedCostMicroUsd").GetInt64());
        Assert.Equal(0, job.GetProperty("actualCostMicroUsd").GetInt64());
        Assert.Equal(JsonValueKind.Null, job.GetProperty("pauseReason").ValueKind);
        Assert.StartsWith("Test ", job.GetProperty("createdByName").GetString());

        var list = await store.GetAsync(Jobs);
        Assert.Equal(jobId, Assert.Single(list.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Un_trabajo_activo_por_tienda()
    {
        var store = await StoreAsync("aja");
        var id = await ProductAsync(store, "Taladro", "x");
        await store.PostAsync(Jobs, Ids(id));

        var second = await store.SendAsync(HttpMethod.Post, Jobs, Ids(id));

        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
        var problem = await second.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("AiCatalog.JobActive", problem.GetProperty("title").GetString());
        Assert.Equal("Ya hay un trabajo de fichas en curso en esta tienda.", problem.GetProperty("detail").GetString());
    }

    [Fact]
    public async Task Dos_creaciones_a_la_vez_dejan_un_solo_trabajo_activo()
    {
        var store = await StoreAsync("ajc");
        var id = await ProductAsync(store, "Taladro", "x");

        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => store.SendAsync(HttpMethod.Post, Jobs, Ids(id))));

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.Equal(3, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Otra_tienda_no_ve_el_trabajo()
    {
        var store = await StoreAsync("ajv");
        var other = await StoreAsync("ajw");
        var id = await ProductAsync(store, "Taladro", "x");
        var jobId = (await store.PostAsync(Jobs, Ids(id))).GetProperty("jobId").GetGuid();

        Assert.Equal(HttpStatusCode.NotFound, (await other.SendAsync(HttpMethod.Get, $"{Jobs}/{jobId}")).StatusCode);
        Assert.Empty((await other.GetAsync(Jobs)).GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task Solo_quien_escribe_el_catalogo_puede()
    {
        var store = await StoreAsync("ajr");
        var id = await ProductAsync(store, "Taladro", "x");
        var support = await store.AddTeammateAsync("soporte", "ajsp");

        Assert.Equal(HttpStatusCode.Forbidden, await support.StatusAsync(HttpMethod.Post, $"{Jobs}/preview", Ids(id)));
        Assert.Equal(HttpStatusCode.Forbidden, await support.StatusAsync(HttpMethod.Post, Jobs, Ids(id)));
        Assert.Equal(HttpStatusCode.Forbidden, await support.StatusAsync(HttpMethod.Get, Jobs));
    }
}
