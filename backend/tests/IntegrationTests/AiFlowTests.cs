using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Ai.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using static IntegrationTests.AiSetup;

namespace IntegrationTests;

/// <summary>
/// Las funciones de IA del panel (sugerencias de respuesta, posts, descripciones y lectura de facturas)
/// pasando por el gateway de verdad, con los modelos simulados en <see cref="FakeAi"/>. Se prueba lo que
/// recibe el modelo, lo que queda en el consumo y que un fallo del proveedor no rompa nada.
/// </summary>
[Collection("api")]
public sealed class AiFlowTests(ApiFactory factory)
{
    private const string Status = "/api/v1/ai/status";
    private const string ShortText = "/api/v1/ai/short-text";

    private static Dictionary<string, JsonElement> TasksOf(JsonElement status) =>
        status.GetProperty("tasks").EnumerateArray().ToDictionary(t => t.GetProperty("task").GetString()!);

    [Fact]
    public async Task Status_lista_las_tareas_con_motivo()
    {
        var m = await Merchant.CreateAsync(factory, "aist");

        // Sin configurar nada: ninguna tarea se puede usar, y cada una dice por qué.
        var tasks = TasksOf(await m.GetAsync(Status));
        Assert.Equal(Enum.GetValues<AiTask>().Length, tasks.Count);
        Assert.All(tasks.Values, t =>
        {
            Assert.False(t.GetProperty("available").GetBoolean());
            Assert.False(string.IsNullOrWhiteSpace(t.GetProperty("reason").GetString()));
            Assert.Equal("Ai.Disabled", t.GetProperty("code").GetString());
        });

        // Con una tarea asignada, esa sí; las demás siguen sin modelo.
        await ConfigureAsync(m, (AiTask.ShortText, Haiku), (AiTask.InvoiceRead, Sonnet));
        tasks = TasksOf(await m.GetAsync(Status));
        Assert.True(tasks["ShortText"].GetProperty("available").GetBoolean());
        Assert.Equal(JsonValueKind.Null, tasks["ShortText"].GetProperty("reason").ValueKind);
        Assert.Equal(JsonValueKind.Null, tasks["ShortText"].GetProperty("code").ValueKind);
        Assert.False(tasks["QuestionDraft"].GetProperty("available").GetBoolean());
        Assert.Contains("modelo", tasks["QuestionDraft"].GetProperty("reason").GetString());
        Assert.Equal("Ai.TaskNotConfigured", tasks["QuestionDraft"].GetProperty("code").GetString());
    }

    [Fact]
    public async Task Status_es_por_usuario_segun_sus_permisos()
    {
        var m = await Merchant.CreateAsync(factory, "aistp");
        await ConfigureAsync(m, (AiTask.ShortText, Haiku), (AiTask.InvoiceRead, Sonnet), (AiTask.QuestionDraft, Haiku));
        var catalog = await m.AddTeammateAsync("catalogo", "aicat");

        var res = await catalog.SendAsync(HttpMethod.Get, Status);
        var tasks = TasksOf(await res.Content.ReadFromJsonAsync<JsonElement>());

        // Catálogo escribe productos: puede pedir textos cortos, pero ni leer facturas ni contestar preguntas.
        Assert.True(tasks["ShortText"].GetProperty("available").GetBoolean());
        foreach (var denied in new[] { "InvoiceRead", "QuestionDraft", "DataAssistant" })
        {
            Assert.False(tasks[denied].GetProperty("available").GetBoolean());
            Assert.Equal("No tenés permiso para usar esta función.", tasks[denied].GetProperty("reason").GetString());
            Assert.Equal("Ai.Denied", tasks[denied].GetProperty("code").GetString());
        }

        // El dueño ve las tres.
        var owner = TasksOf(await m.GetAsync(Status));
        Assert.True(owner["InvoiceRead"].GetProperty("available").GetBoolean());
        Assert.True(owner["QuestionDraft"].GetProperty("available").GetBoolean());
    }

    [Fact]
    public async Task ShortText_sugiere_y_sobrevive_a_un_fallo()
    {
        var m = await Merchant.CreateAsync(factory, "aish");
        await ConfigureAsync(m, (AiTask.ShortText, Haiku));
        var post = new { kind = "social-post", draft = "Remeras nuevas con VERANO10" };

        factory.Ai.Respond(Haiku, Reply("  Sugerencia lista.  "));
        var ok = await m.PostAsync(ShortText, post);
        Assert.Equal("Sugerencia lista.", ok.GetProperty("text").GetString());
        var call = Assert.Single(factory.Ai.Calls(Haiku));
        Assert.Equal(ChatRole.System, call[0].Role);
        Assert.Contains("VERANO10", call[1].Text);

        // Sin nada que redactar, o con un tipo que no existe: 400 y el modelo ni se entera.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await m.SendAsync(HttpMethod.Post, ShortText, new { kind = "social-post", draft = "", productName = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await m.SendAsync(HttpMethod.Post, ShortText, new { kind = "product-description", name = " " })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await m.SendAsync(HttpMethod.Post, ShortText, new { kind = "poema" })).StatusCode);
        Assert.Single(factory.Ai.Calls(Haiku));

        // Contesta vacío: error explicado, no una excepción.
        factory.Ai.Respond(Haiku, Reply("   "));
        var empty = await m.SendAsync(HttpMethod.Post, ShortText, post);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, empty.StatusCode);
        Assert.Contains("respuesta vacía", await empty.Content.ReadAsStringAsync());

        // El proveedor se cae y no hay respaldo: 503 explicado, no un 500.
        factory.Ai.Throw(Haiku, new HttpRequestException("caído", null, HttpStatusCode.ServiceUnavailable));
        var down = await m.SendAsync(HttpMethod.Post, ShortText, post);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, down.StatusCode);
        Assert.Contains("no responde", await down.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ShortText_pide_el_permiso_del_tipo()
    {
        var m = await Merchant.CreateAsync(factory, "aishp");
        await ConfigureAsync(m, (AiTask.ShortText, Haiku));
        var catalog = await m.AddTeammateAsync("catalogo", "aishc");

        factory.Ai.Respond(Haiku, Reply("Descripción."));
        var description = await catalog.SendAsync(HttpMethod.Post, ShortText, new { kind = "product-description", name = "Remera" });
        Assert.Equal(HttpStatusCode.OK, description.StatusCode);

        // Catálogo no publica en redes: el permiso del tipo se mira aunque la ruta lo deje pasar.
        var social = await catalog.SendAsync(HttpMethod.Post, ShortText, new { kind = "social-post", draft = "Hola" });
        Assert.Equal(HttpStatusCode.Forbidden, social.StatusCode);
        Assert.Single(factory.Ai.Calls(Haiku));
    }

    public static TheoryData<string, object, object> Respuestas() => new()
    {
        { "/api/v1/ai/ml-answer", new { question = "¿Sirve para talle L?", itemTitle = "Remera" }, new { question = "" } },
        { "/api/v1/ai/support-reply", new { message = "¿Cuándo llega?", orderSummary = "Pedido #123, enviado ayer" }, new { message = " " } },
    };

    [Theory]
    [MemberData(nameof(Respuestas))]
    public async Task Las_respuestas_sugeridas_van_al_gateway_con_la_tarea_QuestionDraft(string path, object ok, object empty)
    {
        var m = await Merchant.CreateAsync(factory, "aiqd");
        await ConfigureAsync(m, (AiTask.QuestionDraft, Haiku));

        factory.Ai.Respond(Haiku, Reply(" Sí, hay talle L. "));
        var suggestion = await m.PostAsync(path, ok);
        Assert.Equal("Sí, hay talle L.", suggestion.GetProperty("text").GetString());
        Assert.Null(Assert.Single(factory.Ai.Options(Haiku))!.Tools);
        Assert.Equal(HttpStatusCode.BadRequest, (await m.SendAsync(HttpMethod.Post, path, empty)).StatusCode);

        using var scope = factory.Services.CreateScope();
        var row = await scope.ServiceProvider.GetRequiredService<AiDbContext>().Usage
            .IgnoreQueryFilters().SingleAsync(u => u.TenantId == m.TenantId);
        Assert.Equal(AiTask.QuestionDraft, row.Task);
    }

    [Fact]
    public async Task Cada_sugerencia_queda_en_el_consumo()
    {
        var m = await Merchant.CreateAsync(factory, "aius");
        await ConfigureAsync(m, (AiTask.ShortText, Haiku));

        factory.Ai.Respond(Haiku, Reply("Un post.", input: 120, output: 40));
        await m.PostAsync(ShortText, new { kind = "social-post", draft = "Borrador" });

        using var scope = factory.Services.CreateScope();
        var rows = await scope.ServiceProvider.GetRequiredService<AiDbContext>().Usage
            .IgnoreQueryFilters().Where(u => u.TenantId == m.TenantId).ToListAsync();
        var row = Assert.Single(rows);
        Assert.Equal(AiTask.ShortText, row.Task);
        Assert.Equal(Haiku, row.Model);
        Assert.Equal(120, row.InputTokens);
        Assert.Equal(40, row.OutputTokens);
    }

    [Fact]
    public async Task Sin_configurar_la_funcion_explica_por_que_no_anda()
    {
        var m = await Merchant.CreateAsync(factory, "aiof");

        var res = await m.SendAsync(HttpMethod.Post, ShortText, new { kind = "social-post", draft = "Hola" });
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Contains("apagada", await res.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Factura_pasa_el_pdf_al_modelo()
    {
        var m = await Merchant.CreateAsync(factory, "aifa");
        await ConfigureAsync(m, (AiTask.InvoiceRead, Sonnet));
        var order = await m.PostAsync("/api/v1/purchasing/purchase-orders",
            new { supplierName = "Shenzhen Trading Co.", currency = "ARS", exchangeRate = 1m });
        var poId = order.GetProperty("id").GetGuid();

        factory.Ai.Respond(Sonnet, Reply("""{"invoiceNumber":"0001-00000042","currency":"ARS","confidence":"alta"}"""));
        using var form = new MultipartFormDataContent
        {
            { new ByteArrayContent("%PDF-1.4 factura"u8.ToArray()) { Headers = { ContentType = new MediaTypeHeaderValue("application/pdf") } }, "file", "factura.pdf" },
        };
        var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/purchasing/purchase-orders/{poId}/invoice/scan") { Content = form };
        req.Headers.Add("X-Tenant-Id", m.TenantId.ToString());
        var res = await m.Client.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("0001-00000042", (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("invoiceNumber").GetString());
        var message = Assert.Single(Assert.Single(factory.Ai.Calls(Sonnet)), x => x.Role == ChatRole.User);
        var file = Assert.Single(message.Contents.OfType<DataContent>());
        Assert.Equal("application/pdf", file.MediaType);
        Assert.Contains("Shenzhen Trading Co.", message.Contents.OfType<TextContent>().Single().Text);
    }

    [Fact]
    public async Task Un_error_del_proveedor_no_loguea_su_cuerpo()
    {
        var m = await Merchant.CreateAsync(factory, "aiqlog");
        await ConfigureAsync(m, (AiTask.ShortText, Haiku));

        const string Leak = "Incorrect API key provided: sk-test-...a1b2";
        factory.Ai.Throw(Haiku, new HttpRequestException(Leak, new InvalidOperationException(Leak), HttpStatusCode.Unauthorized));
        var res = await m.SendAsync(HttpMethod.Post, ShortText, new { kind = "social-post", draft = "Hola" });
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);

        var logged = factory.Logs.Lines.Where(l => l.Contains("Falló claude-haiku-5-5")).ToList();
        Assert.NotEmpty(logged);
        Assert.All(logged, l => Assert.DoesNotContain("Incorrect API key", l));
        Assert.All(logged, l => Assert.DoesNotContain("HttpRequestException", l));
        Assert.Contains(logged, l => l.Contains("ShortText") && l.Contains("401"));
    }
}
