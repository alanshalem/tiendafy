using System.Net;
using System.Text.Json;
using Ai.Infrastructure;
using Api.Ai.Catalog;
using Api.Meli;
using MercadoLibre.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using static IntegrationTests.AiSetup;

namespace IntegrationTests;

/// <summary>
/// El worker de fichas de punta a punta: Mercado Libre simulado en <see cref="FakeHttp"/>, los modelos en <see cref="FakeAi"/> y el
/// gateway, el medidor, el consumo y el tope de verdad. Una pasada del worker por vez, a pedido del test.
/// </summary>
[Collection("api")]
public sealed class AiCatalogWorkerTests(ApiFactory factory)
{
    private const string Jobs = "/api/v1/ai/catalog/jobs";
    private const string MlApi = MeliAccount.Api;

    private static string NewCategoryId() => $"MLA{Random.Shared.NextInt64(100_000_000, 999_999_999)}";

    /// <summary>Un comercio con IA y una cuenta de ML real, y la API de ML simulada con una categoría clara.</summary>
    private async Task<(Merchant Store, string Category)> StoreAsync(string tag, decimal budgetUsd = 20)
    {
        var store = await Merchant.CreateAsync(factory, tag);
        await MeliAccount.SeedAsync(factory, store.TenantId);
        await ConfigureCatalogAsync(store, budgetUsd: budgetUsd);
        var category = NewCategoryId();
        StubCategory(category);
        return (store, category);
    }

    private void StubCategory(string category)
    {
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/sites/MLA/domain_discovery/search", new object[]
        {
            new { domain_name = "Taladros", category_id = category, category_name = "Taladros eléctricos" },
        });
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/categories/{category}/attributes", Attributes());
    }

    private static object[] Attributes() =>
    [
        new { id = "BRAND", name = "Marca", tags = new { required = true }, value_type = "string", value_max_length = 60 },
        new
        {
            id = "COLOR", name = "Color", tags = new { }, value_type = "list",
            values = new[] { new { id = "52049", name = "Negro" }, new { id = "51993", name = "Rojo" } },
        },
        new
        {
            id = "GTIN", name = "GTIN", tags = new { hidden = true, conditional_required = true },
            type = "product_identifier", value_type = "string", value_max_length = 60,
        },
    ];

    private static async Task<Guid> ProductAsync(Merchant store, string name) =>
        (await store.PostAsync("/api/v1/products", new
        {
            name,
            description = (string?)null,
            publish = true,
            variants = new[] { new { sku = $"SKU-{Guid.NewGuid():N}"[..20], optionValues = Array.Empty<string>(), priceAmount = 15_000_00, currency = "ARS" } },
        })).GetProperty("id").GetGuid();

    private static ChatResponse Written(string brand = "Bosch") => Reply(JsonSerializer.Serialize(new
    {
        descripcion = "Un taladro percutor pensado para el hogar y el taller: " + new string('a', 220) + ".",
        seo_titulo = "Taladro percutor Bosch",
        seo_descripcion = "Taladro percutor Bosch para el hogar y el taller, con maletín incluido y mucha potencia.",
        atributos = new[]
        {
            new { id = "BRAND", valor_id = "", valor = brand, unidad = "", falta_dato = false },
            new { id = "COLOR", valor_id = "52049", valor = "Negro", unidad = "", falta_dato = false },
            new { id = "GTIN", valor_id = "", valor = "", unidad = "", falta_dato = true },
        },
    }), input: 2_500, output: 700);

    private static ChatResponse Judged(int score, params string[] reasons) => Reply(JsonSerializer.Serialize(new
    {
        inventa_datos = false,
        tono_y_voseo = 5,
        claridad = 5,
        atributos_ok = true,
        puntaje = score,
        motivos = reasons,
    }), input: 2_000, output: 250);

    private async Task<Guid> CreateJobAsync(Merchant store, params Guid[] productIds) =>
        (await store.PostAsync(Jobs, new { productIds })).GetProperty("jobId").GetGuid();

    private Task RunWorkerAsync(Merchant store) => CatalogWorker.RunOnceAsync(factory, store.TenantId);

    private async Task<List<AiCatalogJobItem>> ItemsAsync(Guid jobId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AiDbContext>();
        return await db.CatalogJobItems.IgnoreQueryFilters().AsNoTracking().Where(i => i.JobId == jobId).ToListAsync();
    }

    private async Task UpdateItemsAsync(Guid jobId, Action<AiCatalogJobItem> change)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AiDbContext>();
        foreach (var item in await db.CatalogJobItems.IgnoreQueryFilters().Where(i => i.JobId == jobId).ToListAsync()) change(item);
        await db.SaveChangesAsync();
    }

    private static int Count(JsonElement job, string status) => job.GetProperty("byStatus").GetProperty(status).GetInt32();

    private void RespondDefaults(int count, int score = 5)
    {
        factory.Ai.Respond(Sonnet, [.. Enumerable.Range(0, count).Select(_ => Written())]);
        factory.Ai.Respond(Luna, [.. Enumerable.Range(0, count).Select(_ => Judged(score))]);
    }

    [Fact]
    public async Task Procesa_tres_por_pasada()
    {
        var (store, category) = await StoreAsync("awp");
        var products = new List<Guid>();
        for (var i = 0; i < 5; i++) products.Add(await ProductAsync(store, $"Taladro {i}"));
        var jobId = await CreateJobAsync(store, [.. products]);
        RespondDefaults(5);

        await RunWorkerAsync(store);
        var first = await store.GetAsync($"{Jobs}/{jobId}");
        Assert.Equal(3, Count(first, "Review"));
        Assert.Equal(2, Count(first, "Pending"));
        Assert.Equal("Running", first.GetProperty("status").GetString());
        Assert.Equal(3, first.GetProperty("processed").GetInt32());

        await RunWorkerAsync(store);
        var second = await store.GetAsync($"{Jobs}/{jobId}");
        Assert.Equal(5, Count(second, "Review"));
        Assert.Equal(0, Count(second, "Pending"));
        Assert.Equal("Done", second.GetProperty("status").GetString());
        Assert.Equal(5, second.GetProperty("processed").GetInt32());

        // Las lecturas de ML se comparten: una categoría y una sola lista de atributos para los cinco.
        Assert.Single(factory.ExternalHttp.SentTo($"{MlApi}/categories/{category}/attributes"));
    }

    [Fact]
    public async Task Pasa_al_primer_intento_queda_para_revisar_como_aprobable()
    {
        var (store, _) = await StoreAsync("aw1");
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Taladro"));
        RespondDefaults(1);

        await RunWorkerAsync(store);

        var item = Assert.Single(await ItemsAsync(jobId));
        Assert.Equal(AiCatalogItemStatus.Review, item.Status);
        Assert.Equal(1, item.Attempts);
        Assert.Equal(5, item.JudgeScore);
        Assert.Null(item.ClaimedAtUtc);
        var state = AiCatalogItemState.FromJson(item.ProposalJson);
        Assert.True(state.Passed);
        Assert.Equal(AiCatalogStep.Done, state.Step);
        // El GTIN no figura en los datos del producto: queda para completar, no se inventa.
        Assert.True(state.Proposal!.Attributes.Single(a => a.Id == "GTIN").Missing);
        Assert.Equal("52049", state.Proposal.Attributes.Single(a => a.Id == "COLOR").ValueId);
        Assert.Equal(2, state.RunIds.Count);
        Assert.Equal("Taladros eléctricos", state.Category!.Name);
        Assert.Equal(MeliCategorySource.Predicted, state.CategorySource);
        Assert.Contains(state.Asked, a => a.Id == "GTIN");
        // Lo que gastó el trabajo es lo que quedó en el libro de consumo.
        Assert.Equal(2, factory.Ai.Calls(Sonnet).Count + factory.Ai.Calls(Luna).Count);
    }

    [Fact]
    public async Task Despues_de_dos_intentos_queda_para_revisar_con_las_notas_del_evaluador()
    {
        var (store, _) = await StoreAsync("aw2");
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Taladro"));
        factory.Ai.Respond(Sonnet, Written(), Written());
        factory.Ai.Respond(Luna, Judged(2, "Sacá la potencia: no figura."), Judged(3, "Todavía suena exagerada."));

        await RunWorkerAsync(store);

        var item = Assert.Single(await ItemsAsync(jobId));
        Assert.Equal(AiCatalogItemStatus.Review, item.Status);
        Assert.Equal(2, item.Attempts);
        Assert.Equal(3, item.JudgeScore);
        Assert.Equal("Todavía suena exagerada.", item.JudgeNotes);
        var state = AiCatalogItemState.FromJson(item.ProposalJson);
        Assert.False(state.Passed);
        Assert.Equal(4, state.RunIds.Count);
        // La segunda redacción recibió la crítica de la primera evaluación.
        Assert.Contains("Sacá la potencia", factory.Ai.Calls(Sonnet)[1][1].Text);
    }

    [Fact]
    public async Task Categoria_dudosa_no_gasta_IA()
    {
        var (store, _) = await StoreAsync("awc");
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/sites/MLA/domain_discovery/search", new object[]
        {
            new { domain_name = "Taladros", category_id = "MLA7", category_name = "Taladros eléctricos" },
            new { domain_name = "Atornilladores", category_id = "MLA8", category_name = "Atornilladores" },
        });
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Taladro"));
        var writeCalls = factory.Ai.Calls(Sonnet).Count;

        await RunWorkerAsync(store);

        var item = Assert.Single(await ItemsAsync(jobId));
        Assert.Equal(AiCatalogItemStatus.NeedsCategory, item.Status);
        Assert.Equal(2, AiCatalogItemState.FromJson(item.ProposalJson).Suggestions.Count);
        Assert.Equal(writeCalls, factory.Ai.Calls(Sonnet).Count);
        var job = await store.GetAsync($"{Jobs}/{jobId}");
        Assert.Equal("Done", job.GetProperty("status").GetString());
        Assert.Equal(1, job.GetProperty("processed").GetInt32());
    }

    [Fact]
    public async Task Retoma_sin_repetir_la_redaccion()
    {
        var (store, _) = await StoreAsync("awr");
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Taladro"));
        var proposal = new AiCatalogProposal(
            "Un taladro percutor pensado para el hogar y el taller: " + new string('a', 220) + ".",
            "Taladro percutor Bosch",
            "Taladro percutor Bosch para el hogar y el taller, con maletín incluido y mucha potencia.",
            [new("COLOR", "52049", "Negro", null, false)]);
        var savedCategory = NewCategoryId();
        var saved = AiCatalogItemState.Initial with
        {
            Step = AiCatalogStep.Judge,
            Category = new MeliCategoryRef(savedCategory, "Taladros eléctricos"),
            CategorySource = MeliCategorySource.Predicted,
            Asked = [new("COLOR", "Color", MeliAttributeKind.List, [new("52049", "Negro")], [], null, null, false, true, false)],
            Proposal = proposal,
            RunIds = [Guid.NewGuid()],
        };
        // Lo que dejó una API que se cayó a mitad de ítem: ya redactó, falta evaluar, y el reclamo venció.
        await UpdateItemsAsync(jobId, item =>
        {
            item.ProposalJson = saved.ToJson();
            item.Attempts = 1;
            item.ClaimedAtUtc = DateTime.UtcNow - AiCatalogWorker.Lease - TimeSpan.FromMinutes(1);
        });
        var writesBefore = factory.Ai.Calls(Sonnet).Count;
        factory.Ai.Respond(Luna, Judged(5));

        await RunWorkerAsync(store);

        Assert.Equal(writesBefore, factory.Ai.Calls(Sonnet).Count);
        Assert.Single(factory.Ai.Calls(Luna));
        var item = Assert.Single(await ItemsAsync(jobId));
        Assert.Equal(AiCatalogItemStatus.Review, item.Status);
        Assert.Equal(1, item.Attempts);
        Assert.True(AiCatalogItemState.FromJson(item.ProposalJson).Passed);
        // Ni siquiera se preguntó la categoría: ya estaba guardada en el paso.
        Assert.Empty(factory.ExternalHttp.SentTo($"{MlApi}/categories/{savedCategory}"));
    }

    [Fact]
    public async Task Reclamo_vigente_no_se_toca()
    {
        var (store, _) = await StoreAsync("awv");
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Taladro"));
        await UpdateItemsAsync(jobId, item => item.ClaimedAtUtc = DateTime.UtcNow);
        var writesBefore = factory.Ai.Calls(Sonnet).Count;

        await RunWorkerAsync(store);

        var item = Assert.Single(await ItemsAsync(jobId));
        Assert.Equal(AiCatalogItemStatus.Pending, item.Status);
        Assert.NotNull(item.ClaimedAtUtc);
        Assert.Equal(writesBefore, factory.Ai.Calls(Sonnet).Count);
        Assert.Equal("Running", (await store.GetAsync($"{Jobs}/{jobId}")).GetProperty("status").GetString());
    }

    [Fact]
    public async Task Tope_alcanzado_pausa_sin_fallar_items()
    {
        var (store, _) = await StoreAsync("awt", budgetUsd: 0.01m);
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Uno"), await ProductAsync(store, "Dos"));

        await RunWorkerAsync(store);

        var job = await store.GetAsync($"{Jobs}/{jobId}");
        Assert.Equal("PausedBudget", job.GetProperty("status").GetString());
        Assert.Contains("tope mensual", job.GetProperty("pauseReason").GetString());
        Assert.Equal(0, Count(job, "Failed"));
        Assert.Equal(2, Count(job, "Pending"));
        Assert.All(await ItemsAsync(jobId), item => Assert.Null(item.ClaimedAtUtc));

        var stuck = await store.SendAsync(HttpMethod.Post, $"{Jobs}/{jobId}/resume");
        Assert.Equal(HttpStatusCode.Conflict, stuck.StatusCode);
        Assert.Contains("tope", await stuck.Content.ReadAsStringAsync());

        await store.PutAsync("/api/v1/ai/config/settings", new { enabled = true, monthlyBudgetUsd = 20, alertThresholdPct = 80 });
        var resumed = await store.PostAsync($"{Jobs}/{jobId}/resume", new { });
        Assert.Equal("Running", resumed.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Un_429_de_ML_espera_y_no_cuenta_como_falla()
    {
        var (store, category) = await StoreAsync("aw4");
        var calls = 0;
        factory.ExternalHttp.On(HttpMethod.Get, $"{MlApi}/categories/{category}/attributes", (_, _) =>
            Interlocked.Increment(ref calls) == 1
                ? FakeHttp.Json(new { message = "too many requests" }, HttpStatusCode.TooManyRequests)
                : FakeHttp.Json(Attributes()));
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Taladro"));
        RespondDefaults(1);
        var waitsBefore = factory.MeliWaits.Count;

        await RunWorkerAsync(store);

        var item = Assert.Single(await ItemsAsync(jobId));
        Assert.Equal(AiCatalogItemStatus.Review, item.Status);
        Assert.Equal(1, item.Attempts);
        Assert.Equal(0, AiCatalogItemState.FromJson(item.ProposalJson).TransientFailures);
        Assert.Equal(2, calls);
        Assert.Equal(waitsBefore + 1, factory.MeliWaits.Count);
        Assert.Equal(TimeSpan.FromSeconds(1), factory.MeliWaits.Last());
    }

    [Fact]
    public async Task Mercado_Libre_limitando_para_siempre_no_falla_el_item()
    {
        var (store, category) = await StoreAsync("aw5");
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/categories/{category}/attributes",
            new { message = "too many requests" }, HttpStatusCode.TooManyRequests);
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Taladro"));

        await RunWorkerAsync(store);

        var item = Assert.Single(await ItemsAsync(jobId));
        Assert.Equal(AiCatalogItemStatus.Pending, item.Status);
        Assert.Null(item.ClaimedAtUtc);
        Assert.Equal(0, item.Attempts);
        Assert.Equal(0, AiCatalogItemState.FromJson(item.ProposalJson).TransientFailures);
        Assert.Equal("Running", (await store.GetAsync($"{Jobs}/{jobId}")).GetProperty("status").GetString());
    }

    [Fact]
    public async Task ML_desconectado_pausa_el_trabajo()
    {
        var (store, _) = await StoreAsync("awm");
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Taladro"));
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MeliDbContext>();
            db.Connections.RemoveRange(await db.Connections.IgnoreQueryFilters().Where(c => c.TenantId == store.TenantId).ToListAsync());
            await db.SaveChangesAsync();
        }

        await RunWorkerAsync(store);

        var job = await store.GetAsync($"{Jobs}/{jobId}");
        Assert.Equal("PausedUnavailable", job.GetProperty("status").GetString());
        Assert.Contains("Mercado Libre", job.GetProperty("pauseReason").GetString());
        Assert.Equal(1, Count(job, "Pending"));
        Assert.Null(Assert.Single(await ItemsAsync(jobId)).ClaimedAtUtc);
    }

    [Fact]
    public async Task Costo_real_sale_del_consumo()
    {
        var (store, _) = await StoreAsync("awk");
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Taladro"));
        RespondDefaults(1);

        await RunWorkerAsync(store);

        long spent;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AiDbContext>();
            spent = await db.Usage.IgnoreQueryFilters().Where(u => u.TenantId == store.TenantId).SumAsync(u => u.CostMicroUsd);
        }
        var job = await store.GetAsync($"{Jobs}/{jobId}");
        Assert.True(spent > 0);
        Assert.Equal(spent, job.GetProperty("actualCostMicroUsd").GetInt64());
        // 2.500 de entrada y 700 de salida de Sonnet más 2.000 y 250 del evaluador.
        Assert.Equal(AiCostOf(Sonnet, 2_500, 700) + AiCostOf(Luna, 2_000, 250), spent);
    }

    private static long AiCostOf(string model, long input, long output) =>
        Api.Ai.AiCost.MicroUsd(Api.Ai.AiModelCatalog.Find(model)!, input, 0, output);

    [Fact]
    public async Task Cancelar_frena_el_trabajo()
    {
        var (store, _) = await StoreAsync("awx");
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Uno"), await ProductAsync(store, "Dos"));
        var writesBefore = factory.Ai.Calls(Sonnet).Count;

        var cancelled = await store.PostAsync($"{Jobs}/{jobId}/cancel", new { });
        Assert.Equal("Cancelled", cancelled.GetProperty("status").GetString());
        await RunWorkerAsync(store);

        Assert.All(await ItemsAsync(jobId), item => Assert.Equal(AiCatalogItemStatus.Pending, item.Status));
        Assert.Equal(writesBefore, factory.Ai.Calls(Sonnet).Count);
        Assert.Equal("Cancelled", (await store.GetAsync($"{Jobs}/{jobId}")).GetProperty("status").GetString());
        // Cancelado no se reanuda ni se cancela de nuevo.
        Assert.Equal(HttpStatusCode.Conflict, (await store.SendAsync(HttpMethod.Post, $"{Jobs}/{jobId}/resume")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await store.SendAsync(HttpMethod.Post, $"{Jobs}/{jobId}/cancel")).StatusCode);
    }

    [Fact]
    public async Task La_IA_caida_espera_cada_vez_mas_y_falla_el_item_a_la_cuarta()
    {
        var (store, _) = await StoreAsync("awd");
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Taladro"));
        factory.Ai.Throw(Sonnet, new HttpRequestException("caído", null, HttpStatusCode.ServiceUnavailable));

        // Cada falla corre el reclamo hacia adelante: 1, 5 y 15 minutos de espera, no una pasada de 5 segundos después.
        var waits = new[] { TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(5), TimeSpan.FromMinutes(15) };
        for (var i = 0; i < waits.Length; i++)
        {
            await RunWorkerAsync(store);
            var held = Assert.Single(await ItemsAsync(jobId));
            Assert.Equal(AiCatalogItemStatus.Pending, held.Status);
            Assert.Equal(i + 1, AiCatalogItemState.FromJson(held.ProposalJson).TransientFailures);
            var due = held.ClaimedAtUtc!.Value + AiCatalogWorker.Lease;
            Assert.InRange(due - DateTime.UtcNow, waits[i] - TimeSpan.FromSeconds(30), waits[i] + TimeSpan.FromSeconds(30));

            // Mientras espera, otra pasada no llama a la IA ni suma una falla.
            var calls = factory.Ai.Calls(Sonnet).Count;
            await RunWorkerAsync(store);
            Assert.Equal(calls, factory.Ai.Calls(Sonnet).Count);
            Assert.Equal(i + 1, AiCatalogItemState.FromJson(Assert.Single(await ItemsAsync(jobId)).ProposalJson).TransientFailures);

            await UpdateItemsAsync(jobId, item => item.ClaimedAtUtc = DateTime.UtcNow - AiCatalogWorker.Lease - TimeSpan.FromSeconds(1));
        }

        await RunWorkerAsync(store);

        var item = Assert.Single(await ItemsAsync(jobId));
        Assert.Equal(AiCatalogItemStatus.Failed, item.Status);
        Assert.Equal("La IA no respondió después de 4 intentos.", AiCatalogItemState.FromJson(item.ProposalJson).FailureReason);
        var job = await store.GetAsync($"{Jobs}/{jobId}");
        Assert.Equal("Done", job.GetProperty("status").GetString());
        Assert.Equal(1, Count(job, "Failed"));
    }

    [Fact]
    public async Task Si_el_evaluador_se_cae_con_la_redaccion_ya_paga_el_item_queda_para_revisar()
    {
        var (store, _) = await StoreAsync("awj");
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Taladro"));
        factory.Ai.Respond(Sonnet, Written());
        factory.Ai.Throw(Luna, new HttpRequestException("caído", null, HttpStatusCode.ServiceUnavailable));

        for (var i = 0; i < 4; i++)
        {
            await RunWorkerAsync(store);
            await UpdateItemsAsync(jobId, item => item.ClaimedAtUtc = item.ClaimedAtUtc is null ? null : DateTime.UtcNow - AiCatalogWorker.Lease - TimeSpan.FromSeconds(1));
        }

        var item = Assert.Single(await ItemsAsync(jobId));
        Assert.Equal(AiCatalogItemStatus.Review, item.Status);
        var state = AiCatalogItemState.FromJson(item.ProposalJson);
        Assert.False(state.Passed);
        Assert.NotNull(state.Proposal);
        Assert.Contains("evaluador", item.JudgeNotes);
        // La redacción que ya se pagó no se repite.
        Assert.Single(factory.Ai.Calls(Sonnet));
        var job = await store.GetAsync($"{Jobs}/{jobId}");
        Assert.Equal(1, Count(job, "Review"));
        Assert.Equal(0, Count(job, "Failed"));
        Assert.Equal("Done", job.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Reintentar_un_item_que_fallo_lo_devuelve_a_la_cola_y_reabre_el_trabajo()
    {
        var (store, _) = await StoreAsync("awy");
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Taladro"));
        // Lo que deja una caída larga: el ítem Failed y el trabajo terminado (se arma directo: el corte por fallas del
        // proveedor seguiría abierto si se la provocara de verdad).
        await UpdateItemsAsync(jobId, item =>
        {
            item.Status = AiCatalogItemStatus.Failed;
            item.ProposalJson = (AiCatalogItemState.Initial with
            {
                Step = AiCatalogStep.Done,
                TransientFailures = AiCatalogItemProcessor.MaxTransientFailures,
                FailureReason = "La IA no respondió después de 4 intentos.",
            }).ToJson();
        });
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AiDbContext>();
            await db.CatalogJobs.IgnoreQueryFilters().Where(j => j.Id == jobId)
                .ExecuteUpdateAsync(s => s.SetProperty(j => j.Status, AiCatalogJobStatus.Done).SetProperty(j => j.Processed, 1));
        }
        var failed = Assert.Single(await ItemsAsync(jobId));
        Assert.Equal(AiCatalogItemStatus.Failed, failed.Status);
        Assert.Equal(1, (await store.GetAsync($"{Jobs}/{jobId}")).GetProperty("processed").GetInt32());

        var retried = await store.PostAsync($"/api/v1/ai/catalog/items/{failed.Id}/retry", new { });

        Assert.Equal("Pending", retried.GetProperty("status").GetString());
        var job = await store.GetAsync($"{Jobs}/{jobId}");
        Assert.Equal("Running", job.GetProperty("status").GetString());
        Assert.Equal(0, job.GetProperty("processed").GetInt32());
        var queued = Assert.Single(await ItemsAsync(jobId));
        Assert.Equal(0, queued.Attempts);
        var state = AiCatalogItemState.FromJson(queued.ProposalJson);
        Assert.Equal(0, state.TransientFailures);
        Assert.Null(state.FailureReason);

        RespondDefaults(1);
        await RunWorkerAsync(store);
        Assert.Equal(AiCatalogItemStatus.Review, Assert.Single(await ItemsAsync(jobId)).Status);
    }

    [Fact]
    public async Task Reintentar_solo_vale_para_los_que_fallaron_y_respeta_el_tope()
    {
        var (store, _) = await StoreAsync("awz", budgetUsd: 0.01m);
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Taladro"));
        await UpdateItemsAsync(jobId, item => item.Status = AiCatalogItemStatus.Review);
        var item = Assert.Single(await ItemsAsync(jobId));

        var notFailed = await store.SendAsync(HttpMethod.Post, $"/api/v1/ai/catalog/items/{item.Id}/retry");
        Assert.Equal(HttpStatusCode.Conflict, notFailed.StatusCode);

        await UpdateItemsAsync(jobId, i => i.Status = AiCatalogItemStatus.Failed);
        var overBudget = await store.SendAsync(HttpMethod.Post, $"/api/v1/ai/catalog/items/{item.Id}/retry");
        Assert.Equal(HttpStatusCode.Conflict, overBudget.StatusCode);
        Assert.Equal(AiCatalogItemStatus.Failed, Assert.Single(await ItemsAsync(jobId)).Status);
    }

    [Fact]
    public async Task Un_trabajo_terminado_con_un_item_pendiente_se_retoma()
    {
        var (store, _) = await StoreAsync("awn");
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Taladro"));
        // Lo que dejaba la carrera de elegir la categoría mientras el trabajo se cerraba: Done con un ítem Pending.
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AiDbContext>();
            await db.CatalogJobs.IgnoreQueryFilters().Where(j => j.Id == jobId)
                .ExecuteUpdateAsync(s => s.SetProperty(j => j.Status, AiCatalogJobStatus.Done));
        }
        RespondDefaults(1);

        await RunWorkerAsync(store);

        Assert.Equal(AiCatalogItemStatus.Review, Assert.Single(await ItemsAsync(jobId)).Status);
        Assert.Equal("Done", (await store.GetAsync($"{Jobs}/{jobId}")).GetProperty("status").GetString());
    }

    [Fact]
    public async Task Un_token_de_ML_revocado_pausa_pidiendo_reconectar()
    {
        var (store, category) = await StoreAsync("awu");
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{MlApi}/categories/{category}/attributes",
            new { message = "invalid token" }, HttpStatusCode.Unauthorized);
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Taladro"));

        await RunWorkerAsync(store);

        var job = await store.GetAsync($"{Jobs}/{jobId}");
        Assert.Equal("PausedUnavailable", job.GetProperty("status").GetString());
        var reason = job.GetProperty("pauseReason").GetString()!;
        Assert.Contains("Reconectá Mercado Libre", reason);
        Assert.DoesNotContain("Ya podés reanudar", reason);
    }

    [Fact]
    public async Task Una_clave_invalida_pausa_el_trabajo_sin_fallar_items()
    {
        var (store, _) = await StoreAsync("awk2");
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Taladro"));
        factory.Ai.Throw(Sonnet, new HttpRequestException("clave", null, HttpStatusCode.Unauthorized));

        await RunWorkerAsync(store);

        var job = await store.GetAsync($"{Jobs}/{jobId}");
        Assert.Equal("PausedUnavailable", job.GetProperty("status").GetString());
        Assert.Equal(0, Count(job, "Failed"));
        Assert.Equal(1, Count(job, "Pending"));
    }

    [Fact]
    public async Task Un_producto_borrado_falla_el_item_y_el_resto_sigue()
    {
        var (store, _) = await StoreAsync("awb");
        var gone = await ProductAsync(store, "Borrado");
        var kept = await ProductAsync(store, "Se queda");
        var jobId = await CreateJobAsync(store, gone, kept);
        await store.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/products/{gone}");
        RespondDefaults(1);

        await RunWorkerAsync(store);

        var items = await ItemsAsync(jobId);
        var failed = Assert.Single(items, i => i.ProductId == gone);
        Assert.Equal(AiCatalogItemStatus.Failed, failed.Status);
        Assert.Equal("El producto ya no existe.", AiCatalogItemState.FromJson(failed.ProposalJson).FailureReason);
        Assert.Equal(AiCatalogItemStatus.Review, Assert.Single(items, i => i.ProductId == kept).Status);
    }

    [Fact]
    public async Task Dos_pasadas_a_la_vez_de_la_misma_tienda_no_repiten_trabajo()
    {
        var (store, _) = await StoreAsync("awq");
        var jobId = await CreateJobAsync(store, await ProductAsync(store, "Uno"), await ProductAsync(store, "Dos"));
        RespondDefaults(2);

        await Task.WhenAll(RunWorkerAsync(store), RunWorkerAsync(store));

        // Cada producto se redactó una sola vez, estuvieran las dos pasadas o no corriendo juntas.
        Assert.Equal(2, factory.Ai.Calls(Sonnet).Count);
        Assert.Equal(2, factory.Ai.Calls(Luna).Count);
        Assert.All(await ItemsAsync(jobId), item => Assert.Equal(AiCatalogItemStatus.Review, item.Status));
    }
}
