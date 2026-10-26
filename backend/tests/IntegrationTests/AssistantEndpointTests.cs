using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Ai.Infrastructure;
using Api.Ai;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using static IntegrationTests.AiSetup;

namespace IntegrationTests;

/// <summary>
/// "Preguntale a tu tienda": las herramientas que recibe el modelo son las que permite el rol de quien
/// pregunta, ven solo la tienda del request, no devuelven datos personales, y la respuesta es el texto final.
/// </summary>
[Collection("api")]
public sealed class AssistantEndpointTests(ApiFactory factory)
{
    private const string Path = "/api/v1/ai/assistant";
    private const string Narration = "Voy a consultar el dato.";
    private static readonly string[] SellerTools =
        ["resumen_ventas", "productos_mas_vendidos", "carritos_abandonados", "stock_bajo", "resumen_clientes"];

    private static ChatResponse Call(string tool, IDictionary<string, object?>? arguments = null, string id = "c1") =>
        new(new ChatMessage(ChatRole.Assistant, [new TextContent(Narration), new FunctionCallContent(id, tool, arguments)]));

    private static string Text(IEnumerable<ChatMessage> call) => string.Join("\n", call.Select(m => m.Text));

    private static async Task<JsonElement> BodyAsync(HttpResponseMessage res) =>
        await res.Content.ReadFromJsonAsync<JsonElement>();

    private static Task<HttpResponseMessage> AskAsync(Merchant store, string question = "¿Cuánto vendí?", object? history = null) =>
        store.SendAsync(HttpMethod.Post, Path, new { question, history });

    private async Task<Merchant> StoreAsync(string tag)
    {
        var store = await Merchant.CreateAsync(factory, tag);
        await EnableAsync(store, AiTask.DataAssistant, Sonnet);
        return store;
    }

    private static string[] ResultsOf(IReadOnlyList<ChatMessage> call) =>
        [.. call.SelectMany(m => m.Contents).OfType<FunctionResultContent>().Select(r => r.Result?.ToString() ?? "")];

    [Fact]
    public async Task Sin_StatsRead_da_403()
    {
        var store = await StoreAsync("asq1");
        var mate = await store.AddTeammateAsync("catalogo", "asq1c");
        factory.Ai.Respond(Sonnet, Reply("Hola."));

        var res = await mate.SendAsync(HttpMethod.Post, Path, new { question = "¿Cuánto vendí?" });

        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
        Assert.Equal("Auth.Forbidden", (await BodyAsync(res)).GetProperty("title").GetString());
        Assert.Empty(factory.Ai.Calls(Sonnet));
    }

    [Fact]
    public async Task Vendedor_no_recibe_rentabilidad_ni_ordenes_de_compra()
    {
        var store = await StoreAsync("asq2");
        var seller = await store.AddTeammateAsync("vendedor", "asq2v");
        factory.Ai.Respond(Sonnet, Reply("Vendiste poco."));

        var res = await seller.SendAsync(HttpMethod.Post, Path, new { question = "¿Cuánto vendí?" });

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal(SellerTools, factory.Ai.Options(Sonnet)[0]!.Tools!.Select(t => t.Name));
    }

    [Fact]
    public async Task Una_excepcion_personal_saca_la_herramienta()
    {
        var store = await StoreAsync("asq3");
        var admin = await store.AddTeammateAsync("admin", "asq3a");
        var allowed = (await admin.PermissionsAsync()).Where(p => p != "costs.read").ToArray();
        await store.ExpectOkAsync(HttpMethod.Put, $"/api/v1/members/{admin.UserId}/permissions", new { permissions = allowed });
        factory.Ai.Respond(Sonnet, Reply("Listo."));

        var res = await admin.SendAsync(HttpMethod.Post, Path, new { question = "¿Cuánto gané?" });

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var names = factory.Ai.Options(Sonnet)[0]!.Tools!.Select(t => t.Name).ToList();
        Assert.DoesNotContain("rentabilidad", names);
        Assert.Contains("resumen_ventas", names);
    }

    [Fact]
    public async Task Pedir_una_herramienta_no_dada_no_ejecuta_nada()
    {
        var store = await StoreAsync("asq4");
        var seller = await store.AddTeammateAsync("vendedor", "asq4v");
        await store.CreateSaleAsync(priceMinor: 10_000_00);
        factory.Ai.Respond(Sonnet, Call("rentabilidad"), Reply("Eso no lo puedo ver desde acá."));

        var res = await seller.SendAsync(HttpMethod.Post, Path, new { question = "¿Cuánto gané?" });

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var result = Assert.Single(ResultsOf(factory.Ai.Calls(Sonnet)[1]));
        Assert.DoesNotContain("profit", result);
        Assert.DoesNotContain("minor", result);
        Assert.Empty((await BodyAsync(res)).GetProperty("sources").EnumerateArray());
    }

    [Fact]
    public async Task Las_herramientas_ven_solo_su_tienda()
    {
        var a = await StoreAsync("asq5a");
        var b = await Merchant.CreateAsync(factory, "asq5b");
        await a.CreateSaleAsync(priceMinor: 10_000_00);
        await b.CreateSaleAsync(priceMinor: 99_999_00);
        factory.Ai.Respond(Sonnet,
            Call("resumen_ventas", new Dictionary<string, object?> { ["tenantId"] = b.TenantId.ToString() }),
            Reply("Vendiste $ 10.000."));

        var res = await AskAsync(a);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var result = Assert.Single(ResultsOf(factory.Ai.Calls(Sonnet)[1]));
        Assert.Equal(1_000_000, JsonDocument.Parse(result).RootElement.GetProperty("revenue").GetProperty("minor").GetInt64());
        Assert.DoesNotContain("99.999", result);
    }

    [Fact]
    public async Task Ninguna_herramienta_devuelve_datos_personales()
    {
        var store = await StoreAsync("asq6");
        await store.PostAsync("/api/v1/dev/demo-seed", new { });
        var (_, variant) = await store.CreateProductAsync("Pesa", stock: 0);
        await store.PostAsync("/api/v1/customers", new { name = "Zulema Quiroga", email = "zulema@test.local", phone = "1144443333" });
        await store.CreateSaleAsync(buyerEmail: "comprador-asq6@test.local");
        const string cuit = "30-71234567-8";
        var po = await store.PostAsync("/api/v1/purchasing/purchase-orders", new
        {
            supplierName = "Proveedor Ejemplo",
            currency = "USD",
            exchangeRate = 1m,
            items = new[] { new { variantId = variant, quantity = 10, unitCost = 100m } },
        });
        await store.PutAsync($"/api/v1/purchasing/purchase-orders/{po.GetProperty("id").GetGuid()}/invoice",
            new { supplierTaxId = cuit, invoiceType = "A" });
        var customers = (await store.GetAsync("/api/v1/customers?limit=100")).GetProperty("items").EnumerateArray().ToList();
        Assert.NotEmpty(customers);

        factory.Ai.Respond(Sonnet,
            new ChatResponse(new ChatMessage(ChatRole.Assistant,
                [.. AllTools.Select((t, i) => (AIContent)new FunctionCallContent($"c{i}", t))])),
            Reply("Listo."));

        var res = await AskAsync(store, "Resumime todo.");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var results = ResultsOf(factory.Ai.Calls(Sonnet)[1]);
        Assert.Equal(8, results.Length);
        var all = string.Join("\n", results);
        Assert.DoesNotContain("@", all);
        Assert.DoesNotContain(cuit, all);
        Assert.DoesNotContain("30712345678", all);
        foreach (var customer in customers)
            foreach (var property in customer.EnumerateObject().Where(p => p.Value.ValueKind == JsonValueKind.String
                && System.Text.RegularExpressions.Regex.IsMatch(p.Name, "(?i)email|phone|name|address|doc|tax|cuit")))
            {
                var value = property.Value.GetString()!;
                if (value.Length >= 6) Assert.DoesNotContain(value, all);
            }
    }

    private static readonly string[] AllTools =
    [
        "resumen_ventas", "productos_mas_vendidos", "carritos_abandonados", "rentabilidad",
        "stock_bajo", "sugerencias_de_reposicion", "ordenes_de_compra", "resumen_clientes",
    ];

    [Fact]
    public async Task Corta_en_el_tope_de_vueltas_sin_500()
    {
        var store = await StoreAsync("asq7");
        factory.Ai.Respond(Sonnet, [.. Enumerable.Range(0, 10).Select(i => Call("resumen_ventas", id: $"c{i}"))]);

        var res = await AskAsync(store);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await BodyAsync(res);
        Assert.True(body.GetProperty("limited").GetBoolean());
        Assert.DoesNotContain(Narration, body.GetProperty("answer").GetString());
        Assert.True(factory.Ai.Calls(Sonnet).Count <= AiTaskSpecs.For(AiTask.DataAssistant).MaxIterations);
    }

    [Fact]
    public async Task Una_pregunta_a_la_vez_por_usuario()
    {
        var store = await StoreAsync("asq8");
        var other = await store.AddTeammateAsync("admin", "asq8a");
        var members = (await store.GetAsync("/api/v1/members?limit=100")).GetProperty("items").EnumerateArray();
        var ownerId = members.Single(m => m.GetProperty("email").GetString() == store.Email).GetProperty("userId").GetGuid();
        factory.Ai.Respond(Sonnet, Reply("Hola."));

        using (factory.Services.GetRequiredService<AiConcurrency>().TryEnter("assistant", ownerId.ToString("N")))
        {
            var busy = await AskAsync(store);
            Assert.Equal(HttpStatusCode.Conflict, busy.StatusCode);
            Assert.Equal("Ai.Busy", (await BodyAsync(busy)).GetProperty("title").GetString());
            Assert.Equal(HttpStatusCode.OK, (await other.SendAsync(HttpMethod.Post, Path, new { question = "Hola" })).StatusCode);
        }
    }

    [Fact]
    public async Task El_historial_se_recorta_en_el_servidor()
    {
        var store = await StoreAsync("asq9");
        var history = Enumerable.Range(1, 6).Select(i => new { question = $"Pregunta {i}", answer = new string('x', 1_500) }).ToArray();
        factory.Ai.Respond(Sonnet, Reply("Listo."));

        var res = await AskAsync(store, "¿Y ahora?", history);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var messages = factory.Ai.Calls(Sonnet)[0];
        Assert.Equal(6, messages.Count); // system + 2 vueltas (4 mensajes) + la pregunta
        Assert.Contains("Pregunta 6", messages[3].Text);
        Assert.Contains("¿Y ahora?", messages[^1].Text);
    }

    [Fact]
    public async Task Responde_con_sus_fuentes()
    {
        var store = await StoreAsync("asq10");
        factory.Ai.Respond(Sonnet, Call("stock_bajo"), Reply("Hay 2 productos…"));

        var res = await AskAsync(store, "¿Qué se me acaba?");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await BodyAsync(res);
        Assert.Equal("Hay 2 productos…", body.GetProperty("answer").GetString());
        Assert.Equal(["Stock bajo"], body.GetProperty("sources").EnumerateArray().Select(s => s.GetString()));
        Assert.False(body.GetProperty("limited").GetBoolean());
        Assert.Contains("<pregunta>¿Qué se me acaba?</pregunta>", Text(factory.Ai.Calls(Sonnet)[0]));
    }

    [Theory]
    [InlineData("", "Assistant.EmptyQuestion")]
    [InlineData("   ", "Assistant.EmptyQuestion")]
    public async Task Pregunta_vacia_da_400(string question, string code)
    {
        var store = await StoreAsync("asq11");
        factory.Ai.Respond(Sonnet, Reply("Hola."));

        var res = await AskAsync(store, question);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(code, (await BodyAsync(res)).GetProperty("title").GetString());
        Assert.Empty(factory.Ai.Calls(Sonnet));
    }

    [Fact]
    public async Task Pregunta_larga_da_400()
    {
        var store = await StoreAsync("asq12");
        factory.Ai.Respond(Sonnet, Reply("Hola."));

        var res = await AskAsync(store, new string('a', 1_001));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("Assistant.QuestionTooLong", (await BodyAsync(res)).GetProperty("title").GetString());
        Assert.Empty(factory.Ai.Calls(Sonnet));
    }
}

/// <summary>El asistente cuenta contra el cupo de IA del usuario (fábrica propia: el cupo de la suite es alto).</summary>
[Collection("api")]
public sealed class AssistantRateLimitTests(AssistantRateLimitTests.LowLimitFactory factory)
    : IClassFixture<AssistantRateLimitTests.LowLimitFactory>
{
    public sealed class LowLimitFactory : ApiFactory
    {
        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseSetting("RateLimiting:AiPermitLimit", "1");
        }
    }

    [Fact]
    public async Task Usa_el_cupo_de_IA()
    {
        var store = await Merchant.CreateAsync(factory, "asrl");
        await EnableAsync(store, AiTask.DataAssistant, Sonnet);
        factory.Ai.Respond(Sonnet, Reply("Uno."), Reply("Dos."));
        var body = new { question = "Hola" };

        Assert.Equal(HttpStatusCode.OK, (await store.SendAsync(HttpMethod.Post, "/api/v1/ai/assistant", body)).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await store.SendAsync(HttpMethod.Post, "/api/v1/ai/assistant", body)).StatusCode);
        Assert.Single(factory.Ai.Calls(Sonnet));
    }
}
