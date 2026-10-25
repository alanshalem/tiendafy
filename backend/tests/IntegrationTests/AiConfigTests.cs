using System.Net;
using System.Text.Json;
using Ai.Infrastructure;
using Api.Ai;
using Api.Middleware;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// Configuración de IA por tienda: claves que nunca vuelven, modelos validados contra el catálogo y
/// las claves cargadas, y el tope sin el que no se prende. Solo el dueño la toca.
/// </summary>
[Collection("api")]
public sealed class AiConfigTests(ApiFactory factory)
{
    private const string Key = "sk-test-123456a1b2";
    private const string Haiku = "claude-haiku-5-5";
    private const string Sonnet = "claude-sonnet-5-5";
    private const string Config = "/api/v1/ai/config";

    private static string Provider(string name) => $"{Config}/providers/{name}";

    private static async Task SaveKeyAsync(Merchant m, string provider = "Anthropic", string key = Key) =>
        await m.ExpectOkAsync(HttpMethod.Put, Provider(provider), new { apiKey = key });

    private static Task<HttpResponseMessage> AssignAsync(Merchant m, params object[] items) =>
        m.SendAsync(HttpMethod.Put, $"{Config}/assignments", new { items });

    private static JsonElement ProviderOf(JsonElement config, string name) =>
        config.GetProperty("providers").EnumerateArray().Single(p => p.GetProperty("provider").GetString() == name);

    [Fact]
    public async Task La_clave_nunca_vuelve()
    {
        var m = await Merchant.CreateAsync(factory, "aikey");
        await SaveKeyAsync(m);

        var res = await m.ExpectOkAsync(HttpMethod.Get, Config);
        var raw = await res.Content.ReadAsStringAsync();
        Assert.DoesNotContain(Key, raw);
        var anthropic = ProviderOf(JsonDocument.Parse(raw).RootElement, "Anthropic");
        Assert.True(anthropic.GetProperty("configured").GetBoolean());
        Assert.Equal("a1b2", anthropic.GetProperty("last4").GetString());

        // En la base queda cifrada, no en claro.
        using var scope = factory.Services.CreateScope();
        var stored = await scope.ServiceProvider.GetRequiredService<AiDbContext>().Credentials
            .IgnoreQueryFilters().Where(c => c.TenantId == m.TenantId).Select(c => c.KeyEncrypted).SingleAsync();
        Assert.DoesNotContain("123456", stored);
    }

    [Fact]
    public async Task Put_vacio_conserva_y_delete_borra()
    {
        var m = await Merchant.CreateAsync(factory, "aikeep");

        // Sin clave guardada, vacío no sirve.
        Assert.Equal(HttpStatusCode.BadRequest, (await m.SendAsync(HttpMethod.Put, Provider("OpenAI"), new { apiKey = "" })).StatusCode);

        await SaveKeyAsync(m, "OpenAI");
        await m.ExpectOkAsync(HttpMethod.Put, Provider("OpenAI"), new { apiKey = "  " });
        var kept = ProviderOf(await m.GetAsync(Config), "OpenAI");
        Assert.True(kept.GetProperty("configured").GetBoolean());
        Assert.Equal("a1b2", kept.GetProperty("last4").GetString());

        await SaveKeyAsync(m, "OpenAI", "sk-test-otra-clave-9z9z");
        Assert.Equal("9z9z", ProviderOf(await m.GetAsync(Config), "OpenAI").GetProperty("last4").GetString());

        await m.ExpectOkAsync(HttpMethod.Delete, Provider("OpenAI"));
        var gone = ProviderOf(await m.GetAsync(Config), "OpenAI");
        Assert.False(gone.GetProperty("configured").GetBoolean());
        Assert.Equal(JsonValueKind.Null, gone.GetProperty("last4").ValueKind);

        // Borrar dos veces no es un error; un proveedor que no existe, sí.
        await m.ExpectOkAsync(HttpMethod.Delete, Provider("OpenAI"));
        Assert.Equal(HttpStatusCode.NotFound, (await m.SendAsync(HttpMethod.Delete, Provider("Cohere"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await m.SendAsync(HttpMethod.Put, Provider("2"), new { apiKey = Key })).StatusCode);
    }

    [Fact]
    public async Task Solo_el_duenio_configura()
    {
        var m = await Merchant.CreateAsync(factory, "aiown");
        var admin = await m.AddTeammateAsync("admin", "aiadm");

        Assert.Equal(HttpStatusCode.Forbidden, await admin.StatusAsync(HttpMethod.Get, Config));
        Assert.Equal(HttpStatusCode.Forbidden, await admin.StatusAsync(HttpMethod.Put, Provider("Anthropic"), new { apiKey = Key }));
        Assert.Equal(HttpStatusCode.Forbidden, await admin.StatusAsync(HttpMethod.Delete, Provider("Anthropic")));
        Assert.Equal(HttpStatusCode.Forbidden, await admin.StatusAsync(HttpMethod.Post, $"{Provider("Anthropic")}/test"));
        Assert.Equal(HttpStatusCode.Forbidden, await admin.StatusAsync(HttpMethod.Put, $"{Config}/settings",
            new { enabled = false, monthlyBudgetUsd = 0, alertThresholdPct = 80 }));
        Assert.Equal(HttpStatusCode.Forbidden, await admin.StatusAsync(HttpMethod.Put, $"{Config}/assignments", new { items = Array.Empty<object>() }));
        Assert.DoesNotContain("ai.config", await admin.PermissionsAsync());

        Assert.Equal(HttpStatusCode.OK, (await m.SendAsync(HttpMethod.Get, Config)).StatusCode);
    }

    [Fact]
    public async Task Asignar_un_modelo_sin_clave_da_400()
    {
        var m = await Merchant.CreateAsync(factory, "aino");
        await SaveKeyAsync(m, "Anthropic");

        // Principal de un proveedor sin clave.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await AssignAsync(m, new { task = "ShortText", primaryModel = "gpt-6-luna" })).StatusCode);
        // Respaldo de un proveedor sin clave: el gateway lo ignoraría en silencio, así que se rechaza acá.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await AssignAsync(m, new { task = "ShortText", primaryModel = Haiku, fallbackModel = "gpt-6-luna" })).StatusCode);
        // Un modelo que no está en el catálogo.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await AssignAsync(m, new { task = "ShortText", primaryModel = "gpt-9000" })).StatusCode);
        // Nada se guardó.
        Assert.Empty((await m.GetAsync(Config)).GetProperty("assignments").EnumerateArray());
    }

    [Fact]
    public async Task Asignar_Groq_a_InvoiceRead_da_400()
    {
        var m = await Merchant.CreateAsync(factory, "aigroq");
        await SaveKeyAsync(m, "Groq");
        await SaveKeyAsync(m, "Anthropic");

        Assert.Equal(HttpStatusCode.BadRequest,
            (await AssignAsync(m, new { task = "InvoiceRead", primaryModel = "openai/gpt-oss-20b" })).StatusCode);
        // El mismo chequeo vale para el respaldo.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await AssignAsync(m, new { task = "InvoiceRead", primaryModel = Sonnet, fallbackModel = "openai/gpt-oss-20b" })).StatusCode);
        // Y un respaldo igual al principal no es un respaldo.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await AssignAsync(m, new { task = "InvoiceRead", primaryModel = Sonnet, fallbackModel = Sonnet })).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent,
            (await AssignAsync(m, new { task = "InvoiceRead", primaryModel = Sonnet },
                new { task = "ShortText", primaryModel = "openai/gpt-oss-20b", fallbackModel = Haiku })).StatusCode);
        var saved = (await m.GetAsync(Config)).GetProperty("assignments").EnumerateArray().ToList();
        Assert.Equal(2, saved.Count);
        Assert.Equal(Haiku, saved.Single(a => a.GetProperty("task").GetString() == "ShortText").GetProperty("fallbackModel").GetString());
    }

    [Fact]
    public async Task Las_opciones_por_tarea_siguen_a_las_claves_y_avisan_del_juez()
    {
        var m = await Merchant.CreateAsync(factory, "aiopt");
        var empty = (await m.GetAsync(Config)).GetProperty("tasks").EnumerateArray().ToList();
        Assert.Equal(7, empty.Count);
        Assert.All(empty, t => Assert.Empty(t.GetProperty("eligibleModels").EnumerateArray()));

        await SaveKeyAsync(m, "Groq");
        await SaveKeyAsync(m, "Anthropic");
        var tasks = (await m.GetAsync(Config)).GetProperty("tasks").EnumerateArray()
            .ToDictionary(t => t.GetProperty("task").GetString()!);
        var invoice = tasks["InvoiceRead"].GetProperty("eligibleModels").EnumerateArray().Select(e => e.GetString()).ToList();
        Assert.DoesNotContain("openai/gpt-oss-20b", invoice);
        Assert.Contains(Sonnet, invoice);
        Assert.Contains("openai/gpt-oss-20b", tasks["QuestionClassify"].GetProperty("eligibleModels").EnumerateArray().Select(e => e.GetString()));

        // Redactor y evaluador del mismo proveedor: aviso en el evaluador, no en el redactor.
        await AssignAsync(m, new { task = "CatalogWrite", primaryModel = Sonnet }, new { task = "CatalogJudge", primaryModel = Haiku });
        var warned = (await m.GetAsync(Config)).GetProperty("tasks").EnumerateArray()
            .ToDictionary(t => t.GetProperty("task").GetString()!);
        Assert.Equal("Conviene que evalúe un modelo de otro proveedor.", warned["CatalogJudge"].GetProperty("warning").GetString());
        Assert.Equal(JsonValueKind.Null, warned["CatalogWrite"].GetProperty("warning").ValueKind);

        await AssignAsync(m, new { task = "CatalogJudge", primaryModel = "openai/gpt-oss-120b" });
        var fixedUp = (await m.GetAsync(Config)).GetProperty("tasks").EnumerateArray()
            .Single(t => t.GetProperty("task").GetString() == "CatalogJudge");
        Assert.Equal(JsonValueKind.Null, fixedUp.GetProperty("warning").ValueKind);
    }

    [Fact]
    public async Task Habilitar_sin_tope_da_400()
    {
        var m = await Merchant.CreateAsync(factory, "aibud");
        var settings = $"{Config}/settings";

        Assert.Equal(HttpStatusCode.BadRequest,
            (await m.SendAsync(HttpMethod.Put, settings, new { enabled = true, monthlyBudgetUsd = 0, alertThresholdPct = 80 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await m.SendAsync(HttpMethod.Put, settings, new { enabled = false, monthlyBudgetUsd = -1, alertThresholdPct = 80 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await m.SendAsync(HttpMethod.Put, settings, new { enabled = true, monthlyBudgetUsd = 20, alertThresholdPct = 0 })).StatusCode);
        var untouched = (await m.GetAsync(Config)).GetProperty("settings");
        Assert.False(untouched.GetProperty("enabled").GetBoolean());

        // El tope viaja en dólares y se guarda en micro-dólares.
        await m.ExpectOkAsync(HttpMethod.Put, settings, new { enabled = true, monthlyBudgetUsd = 20.5, alertThresholdPct = 90 });
        var saved = (await m.GetAsync(Config)).GetProperty("settings");
        Assert.True(saved.GetProperty("enabled").GetBoolean());
        Assert.Equal(20.5m, saved.GetProperty("monthlyBudgetUsd").GetDecimal());
        Assert.Equal(90, saved.GetProperty("alertThresholdPct").GetInt32());
        using var scope = factory.Services.CreateScope();
        var micro = await scope.ServiceProvider.GetRequiredService<AiDbContext>().Settings
            .IgnoreQueryFilters().Where(s => s.TenantId == m.TenantId).Select(s => s.MonthlyBudgetMicroUsd).SingleAsync();
        Assert.Equal(20_500_000L, micro);

        // Apagar sin tope sí se puede.
        await m.ExpectOkAsync(HttpMethod.Put, settings, new { enabled = false, monthlyBudgetUsd = 0, alertThresholdPct = 80 });
    }

    [Fact]
    public async Task Probar_conexion_registra_el_resultado()
    {
        var m = await Merchant.CreateAsync(factory, "aitest");
        var test = $"{Provider("Anthropic")}/test";

        // Sin clave no hay qué probar.
        Assert.Equal(HttpStatusCode.BadRequest, (await m.SendAsync(HttpMethod.Post, test)).StatusCode);

        await SaveKeyAsync(m);
        factory.Ai.Respond(Haiku, new ChatResponse(new ChatMessage(ChatRole.Assistant, "ok"))
        {
            Usage = new UsageDetails { InputTokenCount = 8, OutputTokenCount = 2 },
        });
        var ok = await m.PostAsync(test, new { });
        Assert.True(ok.GetProperty("ok").GetBoolean());
        var after = ProviderOf(await m.GetAsync(Config), "Anthropic");
        Assert.True(after.GetProperty("lastTestOk").GetBoolean());
        Assert.NotEqual(JsonValueKind.Null, after.GetProperty("lastTestAt").ValueKind);

        // Va al modelo más barato del proveedor, con un mensaje corto y poca salida.
        var call = Assert.Single(factory.Ai.Calls(Haiku));
        Assert.Equal("ok", Assert.Single(call).Text);
        Assert.Equal(16, Assert.Single(factory.Ai.Options(Haiku))!.MaxOutputTokens);

        // Y queda en el consumo como ShortText.
        using (var scope = factory.Services.CreateScope())
        {
            var usage = await scope.ServiceProvider.GetRequiredService<AiDbContext>().Usage
                .IgnoreQueryFilters().Where(u => u.TenantId == m.TenantId).ToListAsync();
            var row = Assert.Single(usage);
            Assert.Equal(AiTask.ShortText, row.Task);
            Assert.Equal(Haiku, row.Model);
            Assert.Equal(8, row.InputTokens);
            Assert.Equal(2, row.OutputTokens);
        }

        // Una clave rechazada (401): falla la prueba y se dice por qué, sin números de error.
        factory.Ai.Throw(Haiku, new HttpRequestException("unauthorized", null, HttpStatusCode.Unauthorized));
        var bad = await m.PostAsync(test, new { });
        Assert.False(bad.GetProperty("ok").GetBoolean());
        Assert.Contains("no es válida", bad.GetProperty("message").GetString());
        Assert.False(ProviderOf(await m.GetAsync(Config), "Anthropic").GetProperty("lastTestOk").GetBoolean());

        // Un corte del proveedor no dice nada de la clave: no pisa el resultado anterior.
        factory.Ai.Throw(Haiku, new HttpRequestException("caído", null, HttpStatusCode.ServiceUnavailable));
        var down = await m.PostAsync(test, new { });
        Assert.False(down.GetProperty("ok").GetBoolean());
        Assert.DoesNotContain("no es válida", down.GetProperty("message").GetString());
        Assert.False(ProviderOf(await m.GetAsync(Config), "Anthropic").GetProperty("lastTestOk").GetBoolean());

        // Cambiar la clave borra el resultado de la prueba: era de la clave vieja.
        await SaveKeyAsync(m, "Anthropic", "sk-test-nueva-clave-7k7k");
        Assert.Equal(JsonValueKind.Null, ProviderOf(await m.GetAsync(Config), "Anthropic").GetProperty("lastTestOk").ValueKind);
    }

    [Fact]
    public async Task Borrar_la_clave_deja_la_tarea_no_disponible_con_motivo()
    {
        var m = await Merchant.CreateAsync(factory, "aigone");
        await SaveKeyAsync(m);
        Assert.Equal(HttpStatusCode.NoContent, (await AssignAsync(m, new { task = "QuestionDraft", primaryModel = Sonnet })).StatusCode);
        await m.ExpectOkAsync(HttpMethod.Put, $"{Config}/settings", new { enabled = true, monthlyBudgetUsd = 20, alertThresholdPct = 80 });

        Assert.True((await AvailabilityOfAsync(m, AiTask.QuestionDraft)).Available);

        await m.ExpectOkAsync(HttpMethod.Delete, Provider("Anthropic"));

        // La asignación sigue ahí; lo que cambia es que no se puede usar, y por qué.
        var assignment = Assert.Single((await m.GetAsync(Config)).GetProperty("assignments").EnumerateArray());
        Assert.Equal(Sonnet, assignment.GetProperty("primaryModel").GetString());
        var draft = await AvailabilityOfAsync(m, AiTask.QuestionDraft);
        Assert.False(draft.Available);
        Assert.Equal("Falta la clave de Anthropic.", draft.Reason);
    }

    [Fact]
    public async Task Cada_tienda_ve_solo_su_configuracion()
    {
        var a = await Merchant.CreateAsync(factory, "aiiso");
        var b = await a.OpenAnotherStoreAsync("aiis2");
        await SaveKeyAsync(a);
        await a.ExpectOkAsync(HttpMethod.Put, $"{Config}/settings", new { enabled = true, monthlyBudgetUsd = 5, alertThresholdPct = 80 });

        var other = await b.GetAsync(Config);
        Assert.All(other.GetProperty("providers").EnumerateArray(), p => Assert.False(p.GetProperty("configured").GetBoolean()));
        Assert.False(other.GetProperty("settings").GetProperty("enabled").GetBoolean());
    }

    /// <summary>Lo que el gateway dice de una tarea, pedido como lo haría un request de esta tienda.</summary>
    private async Task<AiTaskAvailability> AvailabilityOfAsync(Merchant m, AiTask task)
    {
        using var scope = factory.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<TenantContextHolder>().Set(TenantId.From(m.TenantId));
        var all = await scope.ServiceProvider.GetRequiredService<IAiGateway>().AvailabilityAsync(CancellationToken.None);
        return all.Single(t => t.Task == task);
    }
}
