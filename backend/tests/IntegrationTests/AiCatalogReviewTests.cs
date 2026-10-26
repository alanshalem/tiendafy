using System.Net;
using System.Text.Json;
using Ai.Infrastructure;
using Api.Ai.Catalog;
using Api.Meli;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static IntegrationTests.AiSetup;

namespace IntegrationTests;

/// <summary>
/// La revisión de las fichas: aprobar (con y sin cambios), descartar, elegir la categoría y qué guarda cada cosa. Los ítems se
/// arman directo en la base con un estado ya terminado, que es lo que deja el worker (ver <see cref="AiCatalogWorkerTests"/>).
/// </summary>
[Collection("api")]
public sealed class AiCatalogReviewTests(ApiFactory factory)
{
    private const string Jobs = "/api/v1/ai/catalog/jobs";
    private const string Items = "/api/v1/ai/catalog/items";
    private const string MlApi = MeliAccount.Api;

    private static readonly string Description = "Un taladro percutor pensado para el hogar y el taller: " + new string('a', 220) + ".";

    private static readonly IReadOnlyList<MeliCategoryAttribute> Asked =
    [
        new("POWER", "Potencia", MeliAttributeKind.Number, [], [], null, null, false, true, false),
        new("COLOR", "Color", MeliAttributeKind.List, [new("52049", "Negro"), new("51993", "Rojo")], [], null, null, false, true, false),
        new("IS_KIT", "Es kit", MeliAttributeKind.Boolean, [new("242085", "Sí"), new("242084", "No")], [], null, null, false, true, false),
        new("GTIN", "GTIN", MeliAttributeKind.Text, [], [], null, 60, true, true, true),
        new("LENGTH", "Largo del cable", MeliAttributeKind.NumberUnit, [], ["cm", "m"], "m", null, false, true, false),
    ];

    private static AiCatalogItemState Reviewed(bool passed, params AiCatalogAttributeProposal[] attributes) => AiCatalogItemState.Initial with
    {
        Step = AiCatalogStep.Done,
        Category = new MeliCategoryRef("MLA1", "Taladros eléctricos"),
        CategorySource = MeliCategorySource.Predicted,
        Asked = Asked,
        Proposal = new AiCatalogProposal(Description, "Taladro percutor Bosch", "Taladro percutor Bosch para el hogar y el taller, con maletín incluido.", attributes),
        Passed = passed,
    };

    private static AiCatalogAttributeProposal Value(string id, string? valueId, string name) => new(id, valueId, name, null, false);

    private static readonly AiCatalogAttributeProposal GtinMissing = new("GTIN", null, null, null, true);

    private async Task<(Merchant Store, Guid JobId, Guid[] ProductIds, Guid[] ItemIds)> ArrangeAsync(
        string tag, int products, Func<int, (AiCatalogItemStatus Status, AiCatalogItemState State)> item,
        AiCatalogJobStatus jobStatus = AiCatalogJobStatus.Done)
    {
        var store = await Merchant.CreateAsync(factory, tag);
        await MeliAccount.SeedAsync(factory, store.TenantId);
        await ConfigureCatalogAsync(store);
        var ids = new List<Guid>();
        for (var i = 0; i < products; i++)
            ids.Add((await store.CreateProductAsync($"Taladro {i}")).ProductId);
        var jobId = (await store.PostAsync(Jobs, new { productIds = ids })).GetProperty("jobId").GetGuid();

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AiDbContext>();
        var job = await db.CatalogJobs.IgnoreQueryFilters().FirstAsync(j => j.Id == jobId);
        job.Status = jobStatus;
        job.Processed = products;
        var rows = await db.CatalogJobItems.IgnoreQueryFilters().Where(i => i.JobId == jobId).ToListAsync();
        var ordered = ids.Select(id => rows.Single(r => r.ProductId == id)).ToList();
        for (var i = 0; i < ordered.Count; i++)
        {
            var (status, state) = item(i);
            ordered[i].Status = status;
            ordered[i].ProposalJson = state.ToJson();
            ordered[i].Attempts = 1;
            ordered[i].JudgeScore = state.Passed ? 5 : 3;
        }
        await db.SaveChangesAsync();
        return (store, jobId, [.. ids], [.. ordered.Select(r => r.Id)]);
    }

    private Task<(Merchant Store, Guid JobId, Guid[] ProductIds, Guid[] ItemIds)> ArrangeOneAsync(
        string tag, AiCatalogItemState state, AiCatalogItemStatus status = AiCatalogItemStatus.Review) =>
        ArrangeAsync(tag, 1, _ => (status, state));

    private async Task<List<MeliProductAttribute>> MeliAttributesAsync(Guid tenantId, Guid productId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MeliDbContext>();
        return await db.ProductAttributes.IgnoreQueryFilters().AsNoTracking()
            .Where(a => a.TenantId == tenantId && a.ProductId == productId).ToListAsync();
    }

    private async Task<MeliProductCategory?> MeliCategoryAsync(Guid tenantId, Guid productId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MeliDbContext>();
        return await db.ProductCategories.IgnoreQueryFilters().AsNoTracking()
            .FirstOrDefaultAsync(c => c.TenantId == tenantId && c.ProductId == productId);
    }

    private async Task<AiCatalogJobItem> ItemAsync(Guid itemId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AiDbContext>();
        return await db.CatalogJobItems.IgnoreQueryFilters().AsNoTracking().FirstAsync(i => i.Id == itemId);
    }

    private static async Task<JsonElement> ProblemAsync(HttpResponseMessage response) => await response.Content.ReadFromJsonAsync<JsonElement>();

    [Fact]
    public async Task Aprobar_guarda_descripcion_y_SEO_sin_tocar_nombre_ni_marca()
    {
        var (store, _, products, items) = await ArrangeOneAsync("rv1", Reviewed(true, Value("COLOR", "52049", "Negro")));
        await store.PatchAsync($"/api/v1/products/{products[0]}", new { name = "Taladro 0", description = "Vieja", brand = "Bosch" });

        var approved = await store.PostAsync($"{Items}/{items[0]}/approve", new { });

        Assert.Equal("Approved", approved.GetProperty("status").GetString());
        var product = await store.GetAsync($"/api/v1/products/{products[0]}");
        Assert.Equal(Description, product.GetProperty("description").GetString());
        Assert.Equal("Taladro percutor Bosch", product.GetProperty("seoTitle").GetString());
        Assert.StartsWith("Taladro percutor Bosch para el hogar", product.GetProperty("seoDescription").GetString());
        Assert.Equal("Bosch", product.GetProperty("brand").GetString());
        Assert.Equal("Taladro 0", product.GetProperty("name").GetString());
        Assert.Equal(AiCatalogItemStatus.Approved, (await ItemAsync(items[0])).Status);
    }

    [Fact]
    public async Task Aprobar_suma_specs_sin_borrar_las_que_habia()
    {
        var (store, _, products, items) = await ArrangeOneAsync("rv2", Reviewed(true, Value("POWER", null, "600")));
        var material = (await store.PostAsync("/api/v1/spec-definitions", new
        {
            name = "Material",
            type = "TEXT",
            showOnProduct = true,
            filterable = false,
            sortOrder = 1,
        })).GetProperty("id").GetGuid();
        var power = (await store.PostAsync("/api/v1/spec-definitions", new
        {
            name = "Potencia",
            type = "NUMBER",
            unit = "W",
            meliAttributeId = "POWER",
            showOnProduct = true,
            filterable = false,
            sortOrder = 2,
        })).GetProperty("id").GetGuid();
        await store.PutAsync($"/api/v1/products/{products[0]}/specs", new { values = new[] { new { definitionId = material, value = "Acero" } } });

        var approved = await store.PostAsync($"{Items}/{items[0]}/approve", new { });

        var specs = (await store.GetAsync($"/api/v1/products/{products[0]}")).GetProperty("specs").EnumerateArray()
            .ToDictionary(s => s.GetProperty("definitionId").GetGuid(), s => s.GetProperty("value").GetString());
        Assert.Equal("Acero", specs[material]);
        Assert.Equal("600", specs[power]);
        Assert.Equal(2, specs.Count);
        // Lo que va a la spec no se duplica en las tablas de ML.
        Assert.Empty(await MeliAttributesAsync(store.TenantId, products[0]));
        Assert.Equal("spec", approved.GetProperty("proposal").GetProperty("attributes")[0].GetProperty("target").GetString());
    }

    [Fact]
    public async Task Lo_que_es_solo_de_ML_va_a_sus_tablas()
    {
        var (store, _, products, items) = await ArrangeOneAsync("rv3", Reviewed(true,
            Value("IS_KIT", "242084", "No"), Value("COLOR", "52049", "Negro")));
        var specsBefore = (await store.GetAsync($"/api/v1/products/{products[0]}")).GetProperty("specs").GetArrayLength();

        var approved = await store.PostAsync($"{Items}/{items[0]}/approve", new { });

        var saved = await MeliAttributesAsync(store.TenantId, products[0]);
        Assert.Equal(["COLOR", "IS_KIT"], saved.Select(a => a.AttributeId).Order());
        var kit = saved.Single(a => a.AttributeId == "IS_KIT");
        Assert.Equal("242084", kit.ValueId);
        Assert.Equal("No", kit.ValueName);
        Assert.Equal(specsBefore, (await store.GetAsync($"/api/v1/products/{products[0]}")).GetProperty("specs").GetArrayLength());
        var category = await MeliCategoryAsync(store.TenantId, products[0]);
        Assert.Equal("MLA1", category!.CategoryId);
        Assert.Equal("Taladros eléctricos", category.CategoryName);
        Assert.Equal(MeliCategorySource.Predicted, category.Source);
        Assert.All(approved.GetProperty("proposal").GetProperty("attributes").EnumerateArray(),
            a => Assert.Equal("meli", a.GetProperty("target").GetString()));
    }

    [Fact]
    public async Task Aprobar_no_llama_a_Mercado_Libre()
    {
        var (store, _, _, items) = await ArrangeOneAsync("rv4", Reviewed(true, Value("COLOR", "52049", "Negro")));
        var before = factory.ExternalHttp.SentTo(MlApi).Count;

        await store.PostAsync($"{Items}/{items[0]}/approve", new { });

        Assert.Equal(before, factory.ExternalHttp.SentTo(MlApi).Count);
    }

    [Fact]
    public async Task Aprobar_dos_veces_es_un_409_y_no_cambia_nada()
    {
        var (store, _, products, items) = await ArrangeOneAsync("rv5", Reviewed(true, Value("COLOR", "52049", "Negro")));
        await store.PostAsync($"{Items}/{items[0]}/approve", new { });

        var again = await store.SendAsync(HttpMethod.Post, $"{Items}/{items[0]}/approve", new { });

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("AiCatalog.NotReviewable", (await ProblemAsync(again)).GetProperty("title").GetString());
        Assert.Single(await MeliAttributesAsync(store.TenantId, products[0]));
    }

    [Fact]
    public async Task Completar_un_falta_dato_al_aprobar()
    {
        var (store, _, products, items) = await ArrangeOneAsync("rv6", Reviewed(true, GtinMissing, Value("COLOR", "52049", "Negro")));

        // Un GTIN con el dígito verificador mal no se acepta, y la ficha sigue en revisión.
        var bad = await store.SendAsync(HttpMethod.Post, $"{Items}/{items[0]}/approve",
            new { attributes = new[] { new { id = "GTIN", valueName = "4006381333932" } } });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.Contains("GTIN", (await ProblemAsync(bad)).GetProperty("detail").GetString());
        Assert.Equal(AiCatalogItemStatus.Review, (await ItemAsync(items[0])).Status);
        Assert.Empty(await MeliAttributesAsync(store.TenantId, products[0]));

        // Uno válido, que no está en los datos del producto, sí: lo tipeó la persona.
        await store.PostAsync($"{Items}/{items[0]}/approve",
            new { attributes = new[] { new { id = "GTIN", valueName = "4006 381333931" } } });

        var gtin = (await MeliAttributesAsync(store.TenantId, products[0])).Single(a => a.AttributeId == "GTIN");
        Assert.Equal("4006381333931", gtin.ValueName);
    }

    [Fact]
    public async Task Editar_con_un_valor_fuera_de_la_lista_da_400()
    {
        var (store, _, _, items) = await ArrangeOneAsync("rv7", Reviewed(true, Value("COLOR", "52049", "Negro")));

        var response = await store.SendAsync(HttpMethod.Post, $"{Items}/{items[0]}/approve",
            new { attributes = new[] { new { id = "COLOR", valueName = "Fucsia flúor" } } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("Fucsia", (await ProblemAsync(response)).GetProperty("detail").GetString());
        Assert.Equal(AiCatalogItemStatus.Review, (await ItemAsync(items[0])).Status);
    }

    [Fact]
    public async Task Editar_un_atributo_que_no_es_de_la_categoria_o_un_texto_demasiado_largo_da_400()
    {
        var (store, _, _, items) = await ArrangeOneAsync("rv8", Reviewed(true, Value("COLOR", "52049", "Negro")));

        var foreign = await store.SendAsync(HttpMethod.Post, $"{Items}/{items[0]}/approve",
            new { attributes = new[] { new { id = "INVENTADO", valueName = "x" } } });
        var tooLong = await store.SendAsync(HttpMethod.Post, $"{Items}/{items[0]}/approve", new { seoTitle = new string('t', 61) });
        var empty = await store.SendAsync(HttpMethod.Post, $"{Items}/{items[0]}/approve", new { description = "  " });

        Assert.Equal(HttpStatusCode.BadRequest, foreign.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, empty.StatusCode);
    }

    [Fact]
    public async Task Editar_el_texto_y_un_numero_con_unidad_se_guarda_como_se_edito()
    {
        var (store, _, products, items) = await ArrangeOneAsync("rv9", Reviewed(true, GtinMissing));

        await store.PostAsync($"{Items}/{items[0]}/approve", new
        {
            description = "Mi descripción, a mi manera.",
            seoTitle = "Mi título",
            seoDescription = "Mi descripción SEO",
            attributes = new[] { new { id = "LENGTH", valueName = "2", unit = "M" } },
        });

        var product = await store.GetAsync($"/api/v1/products/{products[0]}");
        Assert.Equal("Mi descripción, a mi manera.", product.GetProperty("description").GetString());
        Assert.Equal("Mi título", product.GetProperty("seoTitle").GetString());
        var length = Assert.Single(await MeliAttributesAsync(store.TenantId, products[0]));
        Assert.Equal(("LENGTH", "2", "m"), (length.AttributeId, length.ValueName, length.Unit));
    }

    [Fact]
    public async Task Quitar_un_atributo_propuesto_no_lo_guarda()
    {
        var (store, _, products, items) = await ArrangeOneAsync("rv9b",
            Reviewed(true, Value("COLOR", "52049", "Negro"), Value("IS_KIT", "242084", "No")));

        var approved = await store.PostAsync($"{Items}/{items[0]}/approve", new { remove = new[] { "color", "NO_EXISTE" } });

        Assert.Equal("Approved", approved.GetProperty("status").GetString());
        var saved = Assert.Single(await MeliAttributesAsync(store.TenantId, products[0]));
        Assert.Equal("IS_KIT", saved.AttributeId);
    }

    [Fact]
    public async Task Corregir_un_atributo_propuesto_pisa_el_valor_de_la_IA()
    {
        var (store, _, products, items) = await ArrangeOneAsync("rv9c", Reviewed(true, Value("COLOR", "52049", "Negro")));

        await store.PostAsync($"{Items}/{items[0]}/approve", new { attributes = new[] { new { id = "COLOR", valueId = "51993" } } });

        var saved = Assert.Single(await MeliAttributesAsync(store.TenantId, products[0]));
        Assert.Equal(("COLOR", "51993", "Rojo"), (saved.AttributeId, saved.ValueId, saved.ValueName));
    }

    private static async Task<Guid> SpecAsync(Merchant store, string name, string type, string? unit)
    {
        var created = await store.PostAsync("/api/v1/spec-definitions", new
        {
            name,
            type,
            unit,
            meliAttributeId = "LENGTH",
            showOnProduct = true,
            filterable = false,
            sortOrder = 1,
        });
        return created.GetProperty("id").GetGuid();
    }

    private static async Task<Dictionary<Guid, string?>> SpecsAsync(Merchant store, Guid productId) =>
        (await store.GetAsync($"/api/v1/products/{productId}")).GetProperty("specs").EnumerateArray()
            .ToDictionary(s => s.GetProperty("definitionId").GetGuid(), s => s.GetProperty("value").GetString());

    [Fact]
    public async Task Una_spec_numerica_en_otra_unidad_manda_el_dato_a_ML_y_no_lo_guarda_sin_unidad()
    {
        var (store, _, products, items) = await ArrangeOneAsync("rv9d",
            Reviewed(true, new AiCatalogAttributeProposal("LENGTH", null, "300", "m", false)));
        var spec = await SpecAsync(store, "Largo del cable", "NUMBER", "cm");

        var approved = await store.PostAsync($"{Items}/{items[0]}/approve", new { });

        // 300 m no es 300 cm: la spec queda sin tocar y el dato, con su unidad, viaja solo a Mercado Libre.
        Assert.DoesNotContain(spec, await SpecsAsync(store, products[0]));
        var saved = Assert.Single(await MeliAttributesAsync(store.TenantId, products[0]));
        Assert.Equal(("LENGTH", "300", "m"), (saved.AttributeId, saved.ValueName, saved.Unit));
        Assert.Equal("meli", approved.GetProperty("proposal").GetProperty("attributes")[0].GetProperty("target").GetString());
    }

    [Fact]
    public async Task Una_spec_numerica_en_la_misma_unidad_se_guarda_en_la_ficha()
    {
        var (store, _, products, items) = await ArrangeOneAsync("rv9e",
            Reviewed(true, new AiCatalogAttributeProposal("LENGTH", null, "300", "CM", false)));
        var spec = await SpecAsync(store, "Largo del cable", "NUMBER", "cm");

        var approved = await store.PostAsync($"{Items}/{items[0]}/approve", new { });

        Assert.Equal("300", (await SpecsAsync(store, products[0]))[spec]);
        Assert.Empty(await MeliAttributesAsync(store.TenantId, products[0]));
        Assert.Equal("spec", approved.GetProperty("proposal").GetProperty("attributes")[0].GetProperty("target").GetString());
    }

    [Fact]
    public async Task Una_spec_de_texto_guarda_el_valor_con_su_unidad()
    {
        var (store, _, products, items) = await ArrangeOneAsync("rv9f",
            Reviewed(true, new AiCatalogAttributeProposal("LENGTH", null, "300", "cm", false)));
        var spec = await SpecAsync(store, "Largo del cable", "TEXT", null);

        await store.PostAsync($"{Items}/{items[0]}/approve", new { });

        Assert.Equal("300 cm", (await SpecsAsync(store, products[0]))[spec]);
        Assert.Empty(await MeliAttributesAsync(store.TenantId, products[0]));
    }

    [Fact]
    public async Task Descartar_no_guarda_nada()
    {
        var (store, _, products, items) = await ArrangeOneAsync("rv10", Reviewed(true, Value("COLOR", "52049", "Negro")));
        var before = (await store.GetAsync($"/api/v1/products/{products[0]}")).GetProperty("description").GetString();

        var discarded = await store.PostAsync($"{Items}/{items[0]}/discard", new { });

        Assert.Equal("Discarded", discarded.GetProperty("status").GetString());
        Assert.Equal(before, (await store.GetAsync($"/api/v1/products/{products[0]}")).GetProperty("description").GetString());
        Assert.Empty(await MeliAttributesAsync(store.TenantId, products[0]));
        Assert.Null(await MeliCategoryAsync(store.TenantId, products[0]));
        Assert.Equal(HttpStatusCode.Conflict, (await store.SendAsync(HttpMethod.Post, $"{Items}/{items[0]}/discard", new { })).StatusCode);
    }

    [Fact]
    public async Task Aprobar_todos_los_que_pasaron()
    {
        var (store, jobId, products, items) = await ArrangeAsync("rv11", 3, i =>
            (AiCatalogItemStatus.Review, Reviewed(passed: i < 2, Value("COLOR", "52049", "Negro"))));

        // Antes de aprobar, la lista dice cuántas pasaron (de todas las que están para revisar, no solo de la página).
        var page = await store.GetAsync($"{Jobs}/{jobId}/items?status=Review&limit=1");
        Assert.Equal(1, page.GetProperty("items").GetArrayLength());
        Assert.Equal(3, page.GetProperty("total").GetInt32());
        Assert.Equal(2, page.GetProperty("passed").GetInt32());

        var result = await store.PostAsync($"{Jobs}/{jobId}/approve-passed", new { });

        Assert.Equal(2, result.GetProperty("approved").GetInt32());
        Assert.Empty(result.GetProperty("failed").EnumerateArray());
        Assert.Equal(AiCatalogItemStatus.Approved, (await ItemAsync(items[0])).Status);
        Assert.Equal(AiCatalogItemStatus.Approved, (await ItemAsync(items[1])).Status);
        Assert.Equal(AiCatalogItemStatus.Review, (await ItemAsync(items[2])).Status);
        Assert.NotEmpty(await MeliAttributesAsync(store.TenantId, products[0]));
        Assert.Empty(await MeliAttributesAsync(store.TenantId, products[2]));
    }

    [Fact]
    public async Task Aprobar_todos_informa_el_que_fallo_y_sigue_con_el_resto()
    {
        var (store, jobId, products, items) = await ArrangeAsync("rv12", 2, _ =>
            (AiCatalogItemStatus.Review, Reviewed(true, Value("COLOR", "52049", "Negro"))));
        await store.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/products/{products[0]}");

        var result = await store.PostAsync($"{Jobs}/{jobId}/approve-passed", new { });

        Assert.Equal(1, result.GetProperty("approved").GetInt32());
        var failed = Assert.Single(result.GetProperty("failed").EnumerateArray());
        Assert.Equal(products[0], failed.GetProperty("productId").GetGuid());
        Assert.False(string.IsNullOrWhiteSpace(failed.GetProperty("message").GetString()));
        Assert.Equal(AiCatalogItemStatus.Approved, (await ItemAsync(items[1])).Status);
    }

    [Fact]
    public async Task Elegir_categoria_vuelve_a_la_cola()
    {
        var category = $"MLA{Random.Shared.NextInt64(100_000_000, 999_999_999)}";
        var asking = AiCatalogItemState.Initial with
        {
            Suggestions = [new("MLA7", "Taladros", "Herramientas"), new("MLA8", "Atornilladores", "Herramientas")],
        };
        var (store, jobId, products, items) = await ArrangeOneAsync("rv13", asking, AiCatalogItemStatus.NeedsCategory);
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/categories/{category}", new { id = category, name = "Taladros eléctricos" });
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/categories/{category}/attributes", new object[]
        {
            new { id = "BRAND", name = "Marca", tags = new { required = true }, value_type = "string" },
        });

        var updated = await store.PutAsync($"{Items}/{items[0]}/category", new { categoryId = category });

        Assert.Equal("Pending", updated.GetProperty("status").GetString());
        var job = await store.GetAsync($"{Jobs}/{jobId}");
        Assert.Equal("Running", job.GetProperty("status").GetString());
        Assert.Equal(0, job.GetProperty("processed").GetInt32());
        var queued = AiCatalogItemState.FromJson((await ItemAsync(items[0])).ProposalJson);
        Assert.Equal(category, queued.Category!.Id);
        Assert.Equal(MeliCategorySource.Manual, queued.CategorySource);
        Assert.Equal(AiCatalogStep.Category, queued.Step);

        // El worker no vuelve a adivinar la categoría: usa la que se eligió y sigue con la redacción.
        factory.Ai.Respond(Sonnet, Reply(JsonSerializer.Serialize(new
        {
            descripcion = Description,
            seo_titulo = "Taladro percutor",
            seo_descripcion = "Taladro percutor para el hogar y el taller, con maletín incluido y mucha potencia.",
            atributos = new[] { new { id = "BRAND", valor_id = "", valor = "Bosch", unidad = "", falta_dato = false } },
        })));
        factory.Ai.Respond(Luna, Reply(JsonSerializer.Serialize(new
        {
            inventa_datos = false,
            tono_y_voseo = 5,
            claridad = 5,
            atributos_ok = true,
            puntaje = 5,
            motivos = Array.Empty<string>(),
        })));
        await CatalogWorker.RunOnceAsync(factory, store.TenantId);

        var item = await ItemAsync(items[0]);
        Assert.Equal(AiCatalogItemStatus.Review, item.Status);
        var state = AiCatalogItemState.FromJson(item.ProposalJson);
        Assert.Equal(category, state.Category!.Id);
        Assert.Equal(MeliCategorySource.Manual, state.CategorySource);
        Assert.True(state.Passed);
        Assert.NotEqual(Guid.Empty, products[0]);

        // Aprobada, la categoría elegida a mano queda guardada como tal.
        await store.PostAsync($"{Items}/{items[0]}/approve", new { });
        Assert.Equal(MeliCategorySource.Manual, (await MeliCategoryAsync(store.TenantId, products[0]))!.Source);
    }

    [Fact]
    public async Task Categoria_inexistente_da_400_y_el_item_sigue_esperando()
    {
        var category = $"MLA{Random.Shared.NextInt64(100_000_000, 999_999_999)}";
        var (store, _, _, items) = await ArrangeOneAsync("rv14", AiCatalogItemState.Initial, AiCatalogItemStatus.NeedsCategory);
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/categories/{category}", new { message = "not found" }, HttpStatusCode.NotFound);

        var response = await store.SendAsync(HttpMethod.Put, $"{Items}/{items[0]}/category", new { categoryId = category });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("no existe en Mercado Libre", (await ProblemAsync(response)).GetProperty("detail").GetString());
        Assert.Equal(AiCatalogItemStatus.NeedsCategory, (await ItemAsync(items[0])).Status);
    }

    [Fact]
    public async Task Elegir_la_categoria_mientras_el_trabajo_termina_reabre_el_trabajo()
    {
        var category = $"MLA{Random.Shared.NextInt64(100_000_000, 999_999_999)}";
        var (store, jobId, _, items) = await ArrangeAsync("rv13b", 1, _ => (AiCatalogItemStatus.NeedsCategory, AiCatalogItemState.Initial),
            AiCatalogJobStatus.Running);
        // La consulta a ML tarda: mientras tanto el worker ve que no quedan pendientes y cierra el trabajo.
        factory.ExternalHttp.On(HttpMethod.Get, $"{MlApi}/categories/{category}", (_, _) =>
        {
            Task.Run(async () =>
            {
                using var scope = factory.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AiDbContext>();
                await db.CatalogJobs.IgnoreQueryFilters().Where(j => j.Id == jobId)
                    .ExecuteUpdateAsync(s => s.SetProperty(j => j.Status, AiCatalogJobStatus.Done));
            }).GetAwaiter().GetResult();
            return FakeHttp.Json(new { id = category, name = "Taladros eléctricos" });
        });

        var updated = await store.PutAsync($"{Items}/{items[0]}/category", new { categoryId = category });

        Assert.Equal("Pending", updated.GetProperty("status").GetString());
        var job = await store.GetAsync($"{Jobs}/{jobId}");
        Assert.Equal("Running", job.GetProperty("status").GetString());
        Assert.Equal(0, job.GetProperty("processed").GetInt32());
    }

    [Fact]
    public async Task Elegir_categoria_solo_vale_para_los_que_la_esperan()
    {
        var (store, _, _, items) = await ArrangeOneAsync("rv15", Reviewed(true));

        var response = await store.SendAsync(HttpMethod.Put, $"{Items}/{items[0]}/category", new { categoryId = "MLA1" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Revision_muestra_lo_actual_y_lo_que_falta()
    {
        var (store, jobId, products, _) = await ArrangeOneAsync("rv16",
            Reviewed(false, GtinMissing, Value("COLOR", "52049", "Negro")));
        await store.PatchAsync($"/api/v1/products/{products[0]}", new { name = "Taladro 0", description = "Descripción de ahora", brand = "Bosch" });

        var page = await store.GetAsync($"{Jobs}/{jobId}/items?status=Review");

        Assert.Equal(1, page.GetProperty("total").GetInt32());
        var item = page.GetProperty("items")[0];
        Assert.Equal("Descripción de ahora", item.GetProperty("current").GetProperty("description").GetString());
        Assert.Equal("Bosch", item.GetProperty("current").GetProperty("brand").GetString());
        Assert.False(item.GetProperty("passed").GetBoolean());
        Assert.Equal(3, item.GetProperty("score").GetInt32());
        Assert.False(item.GetProperty("hasMeliListing").GetBoolean());
        Assert.Equal("MLA1", item.GetProperty("category").GetProperty("id").GetString());
        Assert.Equal(Description, item.GetProperty("proposal").GetProperty("description").GetString());

        // Falta lo que se pidió y no tiene valor: el GTIN (la IA no lo inventa), la potencia, el kit y el largo.
        var missing = item.GetProperty("missing").EnumerateArray().ToDictionary(m => m.GetProperty("attributeId").GetString()!);
        Assert.Equal(["GTIN", "IS_KIT", "LENGTH", "POWER"], missing.Keys.Order());
        Assert.True(missing["GTIN"].GetProperty("required").GetBoolean());
        Assert.Equal("Boolean", missing["IS_KIT"].GetProperty("kind").GetString());
        Assert.Equal(["242085", "242084"], missing["IS_KIT"].GetProperty("values").EnumerateArray().Select(v => v.GetProperty("id").GetString()));
        Assert.Equal(["cm", "m"], missing["LENGTH"].GetProperty("units").EnumerateArray().Select(u => u.GetString()));
        Assert.Equal("m", missing["LENGTH"].GetProperty("defaultUnit").GetString());
    }

    [Fact]
    public async Task Revision_pagina_y_filtra_por_estado()
    {
        var (store, jobId, _, _) = await ArrangeAsync("rv17", 3, i =>
            i == 0 ? (AiCatalogItemStatus.Failed, AiCatalogItemState.Initial with { FailureReason = "El producto ya no existe." })
                   : (AiCatalogItemStatus.Review, Reviewed(true)));

        var all = await store.GetAsync($"{Jobs}/{jobId}/items?limit=2");
        var failed = await store.GetAsync($"{Jobs}/{jobId}/items?status=failed");
        var bad = await store.SendAsync(HttpMethod.Get, $"{Jobs}/{jobId}/items?status=Nada");

        Assert.Equal(3, all.GetProperty("total").GetInt32());
        Assert.Equal(2, all.GetProperty("items").GetArrayLength());
        Assert.Equal("El producto ya no existe.", failed.GetProperty("items")[0].GetProperty("failureReason").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await store.SendAsync(HttpMethod.Get, $"{Jobs}/{Guid.NewGuid()}/items")).StatusCode);
    }

    [Fact]
    public async Task Otra_tienda_no_aprueba()
    {
        var (store, jobId, _, items) = await ArrangeOneAsync("rv18", Reviewed(true, Value("COLOR", "52049", "Negro")));
        var other = await Merchant.CreateAsync(factory, "rv19");

        Assert.Equal(HttpStatusCode.NotFound, (await other.SendAsync(HttpMethod.Post, $"{Items}/{items[0]}/approve", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.SendAsync(HttpMethod.Post, $"{Items}/{items[0]}/discard", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.SendAsync(HttpMethod.Put, $"{Items}/{items[0]}/category", new { categoryId = "MLA1" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.SendAsync(HttpMethod.Post, $"{Jobs}/{jobId}/approve-passed", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.SendAsync(HttpMethod.Get, $"{Jobs}/{jobId}/items")).StatusCode);
        Assert.Equal(AiCatalogItemStatus.Review, (await ItemAsync(items[0])).Status);
        Assert.NotNull(store);
    }

    [Fact]
    public async Task Buscar_categorias_usa_la_prediccion_con_lo_que_escribe_la_persona()
    {
        var (store, _, _, _) = await ArrangeOneAsync("rv20", Reviewed(true));
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/sites/MLA/domain_discovery/search", new object[]
        {
            new { domain_name = "Taladros", category_id = "MLA7", category_name = "Taladros eléctricos" },
        });

        var found = await store.GetAsync("/api/v1/ai/catalog/categories/search?q=taladro%20percutor");
        var tooShort = await store.GetAsync("/api/v1/ai/catalog/categories/search?q=ta");

        var suggestion = Assert.Single(found.GetProperty("suggestions").EnumerateArray());
        Assert.Equal("MLA7", suggestion.GetProperty("categoryId").GetString());
        Assert.Equal("Taladros eléctricos", suggestion.GetProperty("categoryName").GetString());
        Assert.Empty(tooShort.GetProperty("suggestions").EnumerateArray());
    }

    [Fact]
    public async Task Solo_quien_escribe_el_catalogo_revisa()
    {
        var (store, jobId, _, items) = await ArrangeOneAsync("rv21", Reviewed(true));
        var support = await store.AddTeammateAsync("soporte", "rvsp");

        Assert.Equal(HttpStatusCode.Forbidden, await support.StatusAsync(HttpMethod.Post, $"{Items}/{items[0]}/approve", new { }));
        Assert.Equal(HttpStatusCode.Forbidden, await support.StatusAsync(HttpMethod.Get, $"{Jobs}/{jobId}/items"));
        Assert.Equal(HttpStatusCode.Forbidden, await support.StatusAsync(HttpMethod.Get, "/api/v1/ai/catalog/categories/search?q=taladro"));
    }
}
