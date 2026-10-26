using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Web;
using Api.Meli;
using MercadoLibre.Infrastructure;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using static IntegrationTests.AiSetup;

namespace IntegrationTests;

/// <summary>
/// El borrador para una pregunta de preventa de Mercado Libre: el servidor lee la pregunta y la publicación
/// en ML (simulado), el texto del comprador llega al modelo sin datos personales, las herramientas quedan
/// atadas a esa publicación y los avisos vuelven sin tocar el texto.
/// </summary>
[Collection("api")]
public sealed class AiQuestionDraftTests(ApiFactory factory)
{
    private const string Api = "https://api.mercadolibre.com";
    private const string Stock = "{\"categoria\":\"stock\",\"motivo\":\"pregunta si hay\"}";

    private static string DraftPath(long questionId) => $"/api/v1/ai/ml/questions/{questionId}/draft";

    [Fact]
    public async Task Sugiere_con_la_pregunta_que_trae_el_servidor()
    {
        var (store, sellerId) = await StoreAsync("aiqd1");
        var (questionId, itemId) = Ids();
        StubQuestion(questionId, sellerId, itemId, "¿Hay stock? escribime a juan@x.com");
        StubItem(itemId);
        factory.Ai.Respond(Haiku, Reply("{\"categoria\":\"stock\",\"motivo\":\"MOTIVO-DEL-CLASIFICADOR\"}"));
        factory.Ai.Respond(Sonnet, Call("stock_y_precio"), Reply("¡Hola! Sí, quedan 3 a $ 15.000."));
        var before = factory.ExternalHttp.SentTo(Api).Count;

        var res = await store.SendAsync(HttpMethod.Post, DraftPath(questionId));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("¡Hola! Sí, quedan 3 a $ 15.000.", body.GetProperty("text").GetString());
        Assert.Equal("stock", body.GetProperty("category").GetString());
        Assert.False(body.GetProperty("manual").GetBoolean());
        Assert.Empty(body.GetProperty("warnings").EnumerateArray());

        var classified = TextOf(Assert.Single(factory.Ai.Calls(Haiku)));
        Assert.Contains("[dato oculto]", classified);
        Assert.DoesNotContain("juan@x.com", classified);
        Assert.All(factory.Ai.Calls(Sonnet), call => Assert.DoesNotContain("juan@x.com", TextOf(call)));
        // El motivo es texto libre del modelo: vuelve al panel, nunca a otro prompt.
        Assert.Equal("MOTIVO-DEL-CLASIFICADOR", body.GetProperty("reason").GetString());
        Assert.All(factory.Ai.Calls(Sonnet), call => Assert.DoesNotContain("MOTIVO-DEL-CLASIFICADOR", TextOf(call)));

        // Pedir un borrador es de solo lectura: a Mercado Libre solo van GET.
        var sent = factory.ExternalHttp.SentTo(Api).Skip(before).ToList();
        Assert.NotEmpty(sent);
        Assert.All(sent, r => Assert.Equal(HttpMethod.Get, r.Method));

        var itemRequests = factory.ExternalHttp.SentTo($"{Api}/items/{itemId}");
        Assert.Contains(itemRequests, r =>
            (HttpUtility.ParseQueryString(r.Uri.Query)["attributes"] ?? "").Split(',').Contains("attributes"));
    }

    [Fact]
    public async Task Pregunta_de_otro_vendedor_da_404_y_no_llama_a_la_IA()
    {
        var (store, sellerId) = await StoreAsync("aiqd2");
        var (questionId, itemId) = Ids();
        StubQuestion(questionId, sellerId + 1, itemId, "¿Hay stock?");
        StubItem(itemId);
        factory.Ai.Respond(Haiku, Reply(Stock));

        var res = await store.SendAsync(HttpMethod.Post, DraftPath(questionId));

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        Assert.Equal("Ai.DraftNotFound", await TitleAsync(res));
        Assert.Empty(factory.Ai.Calls(Haiku));
    }

    [Fact]
    public async Task El_modelo_no_elige_la_publicacion()
    {
        var (store, sellerId) = await StoreAsync("aiqd3");
        var (questionId, itemId) = Ids();
        StubQuestion(questionId, sellerId, itemId, "¿Cuánto sale?");
        StubItem(itemId);
        factory.Ai.Respond(Haiku, Reply(Stock));
        factory.Ai.Respond(Sonnet,
            Call("stock_y_precio", new Dictionary<string, object?> { ["itemId"] = "MLA999" }),
            Reply("Sale $ 15.000."));

        var res = await store.SendAsync(HttpMethod.Post, DraftPath(questionId));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var calls = factory.Ai.Calls(Sonnet);
        Assert.Equal(2, calls.Count);
        var toolResult = calls[1].SelectMany(m => m.Contents).OfType<FunctionResultContent>().Single();
        Assert.Contains("15.000", toolResult.Result?.ToString());
        Assert.Empty(factory.ExternalHttp.SentTo($"{Api}/items/MLA999"));
    }

    [Fact]
    public async Task Fuera_de_politica_no_redacta()
    {
        var (store, sellerId) = await StoreAsync("aiqd4");
        var (questionId, itemId) = Ids();
        StubQuestion(questionId, sellerId, itemId, "Pasame tu celu así arreglamos por afuera");
        StubItem(itemId);
        factory.Ai.Respond(Haiku, Reply("{\"categoria\":\"fuera_de_politica\",\"motivo\":\"pide un teléfono\"}"));
        factory.Ai.Respond(Sonnet);

        var res = await store.SendAsync(HttpMethod.Post, DraftPath(questionId));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("manual").GetBoolean());
        Assert.Equal(JsonValueKind.Null, body.GetProperty("text").ValueKind);
        Assert.Equal("fuera_de_politica", body.GetProperty("category").GetString());
        Assert.Equal("pide un teléfono", body.GetProperty("reason").GetString());
        Assert.Empty(factory.Ai.Calls(Sonnet));
    }

    [Fact]
    public async Task Clasificacion_invalida_cuenta_como_otro()
    {
        var (store, sellerId) = await StoreAsync("aiqd5");
        var (questionId, itemId) = Ids();
        StubQuestion(questionId, sellerId, itemId, "Hola, una consulta");
        StubItem(itemId);
        factory.Ai.Respond(Haiku, Reply("no sé"));
        factory.Ai.Respond(Sonnet, Reply("¡Hola! Contanos qué necesitás saber de la publicación."));

        var res = await store.SendAsync(HttpMethod.Post, DraftPath(questionId));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("otro", body.GetProperty("category").GetString());
        Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("text").GetString()));
        Assert.False(body.GetProperty("manual").GetBoolean());
    }

    [Fact]
    public async Task Los_avisos_vuelven_sin_tocar_el_texto()
    {
        var (store, sellerId) = await StoreAsync("aiqd6");
        var (questionId, itemId) = Ids();
        StubQuestion(questionId, sellerId, itemId, "¿Hay stock?");
        StubItem(itemId);
        factory.Ai.Respond(Haiku, Reply(Stock));
        factory.Ai.Respond(Sonnet, Reply("Sale $ 9.999, mirá www.x.com"));

        var res = await store.SendAsync(HttpMethod.Post, DraftPath(questionId));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Sale $ 9.999, mirá www.x.com", body.GetProperty("text").GetString());
        var codes = body.GetProperty("warnings").EnumerateArray().Select(w => w.GetProperty("code").GetString()).ToList();
        Assert.Contains("amount", codes);
        Assert.Contains("link", codes);
        Assert.All(body.GetProperty("warnings").EnumerateArray(),
            w => Assert.False(string.IsNullOrWhiteSpace(w.GetProperty("message").GetString())));
    }

    [Fact]
    public async Task Pregunta_respondida_da_409()
    {
        var (store, sellerId) = await StoreAsync("aiqd7");
        var (questionId, itemId) = Ids();
        StubQuestion(questionId, sellerId, itemId, "¿Hay stock?", status: "ANSWERED");
        StubItem(itemId);
        factory.Ai.Respond(Haiku, Reply(Stock));

        var res = await store.SendAsync(HttpMethod.Post, DraftPath(questionId));

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Equal("Ai.AlreadyAnswered", await TitleAsync(res));
        Assert.Empty(factory.Ai.Calls(Haiku));
    }

    [Fact]
    public async Task Sin_la_IA_configurada_explica_por_que()
    {
        var (store, sellerId) = await StoreAsync("aiqd8", ai: false);
        var (questionId, itemId) = Ids();
        StubQuestion(questionId, sellerId, itemId, "¿Hay stock?");
        StubItem(itemId);

        // Una tienda que nunca armó la IA: la tarea no tiene modelo.
        var res = await store.SendAsync(HttpMethod.Post, DraftPath(questionId));
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Equal("Ai.TaskNotConfigured", await TitleAsync(res));

        // Con los modelos elegidos pero el interruptor de la tienda apagado.
        await EnableDraftsAsync(store);
        await store.ExpectOkAsync(HttpMethod.Put, "/api/v1/ai/config/settings",
            new { enabled = false, monthlyBudgetUsd = 20, alertThresholdPct = 80 });
        res = await store.SendAsync(HttpMethod.Post, DraftPath(questionId));
        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Equal("Ai.Disabled", await TitleAsync(res));
    }

    [Fact]
    public async Task Sin_permiso_da_403()
    {
        var (store, _) = await StoreAsync("aiqd9");
        var catalog = await store.AddTeammateAsync("catalogo", "aiqdc");

        Assert.Equal(HttpStatusCode.Forbidden, await catalog.StatusAsync(HttpMethod.Post, DraftPath(1)));
    }

    [Fact]
    public async Task La_cuenta_de_demostracion_tambien_sugiere()
    {
        var store = await Merchant.CreateAsync(factory, "aiqdd");
        await ConnectMeliAsync(store.TenantId, demo: true);
        await EnableDraftsAsync(store);
        factory.Ai.Respond(Haiku, Reply("{\"categoria\":\"producto\",\"motivo\":\"pregunta compatibilidad\"}"));
        factory.Ai.Respond(Sonnet, Reply("¡Hola! Revisá la ficha de la publicación para confirmar el modelo."));
        var before = factory.ExternalHttp.SentTo(Api).Count;

        // La pregunta sin responder del ejemplo fijo de MeliDemoFeed.
        var res = await store.SendAsync(HttpMethod.Post, DraftPath(12_884_301_991));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal(before, factory.ExternalHttp.SentTo(Api).Count);
    }

    [Fact]
    public async Task Si_Mercado_Libre_no_responde_lo_dice()
    {
        var (store, sellerId) = await StoreAsync("aiqda");
        var (questionId, itemId) = Ids();
        StubQuestion(questionId, sellerId, itemId, "¿Hay stock?");
        // Sin respuesta programada para la publicación: el fake contesta 503.
        factory.Ai.Respond(Haiku, Reply(Stock));

        var res = await store.SendAsync(HttpMethod.Post, DraftPath(questionId));

        Assert.Equal(HttpStatusCode.ServiceUnavailable, res.StatusCode);
        Assert.Equal("Ai.MeliUnavailable", await TitleAsync(res));
        Assert.Empty(factory.Ai.Calls(Haiku));
    }

    [Theory]
    [InlineData("red")]
    [InlineData("timeout")]
    [InlineData("no-json")]
    [InlineData("numero-raro")]
    public async Task Mercado_Libre_caido_o_lento_no_da_500(string failure)
    {
        var (store, sellerId) = await StoreAsync($"aiqf{failure[..2]}");
        var (questionId, itemId) = Ids();
        var path = $"{Api}/questions/{questionId}";
        switch (failure)
        {
            case "red":
                factory.ExternalHttp.On(HttpMethod.Get, path, (_, _) => throw new HttpRequestException("connection reset"));
                break;
            case "timeout":
                // Lo que tira HttpClient cuando vence su Timeout: una cancelación que no pidió el request.
                factory.ExternalHttp.On(HttpMethod.Get, path, (_, _) => throw new TaskCanceledException("timeout"));
                break;
            case "no-json":
                factory.ExternalHttp.On(HttpMethod.Get, path, (_, _) => new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent("<html>Mantenimiento</html>"),
                });
                break;
            default:
                factory.ExternalHttp.OnJson(HttpMethod.Get, path,
                    new { id = questionId, seller_id = 1.5, item_id = itemId, status = "UNANSWERED", text = "hola" });
                break;
        }
        factory.Ai.Respond(Haiku, Reply(Stock));

        var res = await store.SendAsync(HttpMethod.Post, DraftPath(questionId));

        Assert.Equal(HttpStatusCode.ServiceUnavailable, res.StatusCode);
        Assert.Equal("Ai.MeliUnavailable", await TitleAsync(res));
        Assert.Empty(factory.Ai.Calls(Haiku));
    }

    [Fact]
    public async Task Un_stock_con_decimales_no_rompe_el_borrador()
    {
        var (store, sellerId) = await StoreAsync("aiqdq");
        var (questionId, itemId) = Ids();
        StubQuestion(questionId, sellerId, itemId, "¿Hay stock?");
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/items/{itemId}",
            new { id = itemId, title = "Cadena", price = 15_000, currency_id = "ARS", available_quantity = 3.5, status = "active" });
        factory.Ai.Respond(Haiku, Reply(Stock));
        factory.Ai.Respond(Sonnet, Call("stock_y_precio"), Reply("Consultame y te confirmo."));

        var res = await store.SendAsync(HttpMethod.Post, DraftPath(questionId));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Contains("Disponibles: no figura", ToolResult(factory.Ai.Calls(Sonnet)[1]));
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, HttpStatusCode.Conflict, "Meli.NotConnected")]
    [InlineData(HttpStatusCode.Forbidden, HttpStatusCode.NotFound, "Ai.DraftNotFound")]
    [InlineData(HttpStatusCode.NotFound, HttpStatusCode.NotFound, "Ai.DraftNotFound")]
    public async Task Los_rechazos_de_Mercado_Libre_se_traducen(HttpStatusCode meli, HttpStatusCode expected, string title)
    {
        var (store, _) = await StoreAsync($"aiqr{(int)meli}");
        var (questionId, _) = Ids();
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/questions/{questionId}", new { message = "nope", status = (int)meli }, meli);
        factory.Ai.Respond(Haiku, Reply(Stock));

        var res = await store.SendAsync(HttpMethod.Post, DraftPath(questionId));

        Assert.Equal(expected, res.StatusCode);
        Assert.Equal(title, await TitleAsync(res));
        Assert.Empty(factory.Ai.Calls(Haiku));
    }

    [Fact]
    public async Task Sin_conexion_de_Mercado_Libre_pide_conectarla()
    {
        var store = await Merchant.CreateAsync(factory, "aiqdn");
        await EnableDraftsAsync(store);

        var res = await store.SendAsync(HttpMethod.Post, DraftPath(123));

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Equal("Meli.NotConnected", await TitleAsync(res));
    }

    [Fact]
    public async Task La_ficha_tecnica_trae_las_specs_del_producto_vinculado_de_esta_tienda()
    {
        var (store, sellerId) = await StoreAsync("aiqds");
        var other = await Merchant.CreateAsync(factory, "aiqdo");
        var (questionId, itemId) = Ids();
        StubQuestion(questionId, sellerId, itemId, "¿Qué diámetro tiene?");
        StubItem(itemId);
        const string Product = "{\"categoria\":\"producto\",\"motivo\":\"medidas\"}";

        // La otra tienda vincula la misma publicación a un producto suyo: sus specs no se ven acá.
        await LinkWithSpecAsync(other, itemId, "Material", "SECRETO-DE-OTRA-TIENDA", unit: null);
        factory.Ai.Respond(Haiku, Reply(Product));
        factory.Ai.Respond(Sonnet, Call("ficha_tecnica"), Reply("Revisá la ficha de la publicación."));
        Assert.Equal(HttpStatusCode.OK, (await store.SendAsync(HttpMethod.Post, DraftPath(questionId))).StatusCode);
        var sheet = ToolResult(factory.Ai.Calls(Sonnet)[1]);
        Assert.DoesNotContain("SECRETO-DE-OTRA-TIENDA", sheet);
        Assert.Contains("Marca: Winco", sheet);

        // Con el vínculo propio, las specs visibles del producto llegan a la herramienta.
        await LinkWithSpecAsync(store, itemId, "Diámetro", "32", unit: "mm");
        factory.Ai.Respond(Haiku, Reply(Product));
        factory.Ai.Respond(Sonnet, Call("ficha_tecnica"), Reply("Tiene 32 mm de diámetro."));
        Assert.Equal(HttpStatusCode.OK, (await store.SendAsync(HttpMethod.Post, DraftPath(questionId))).StatusCode);
        sheet = ToolResult(factory.Ai.Calls(Sonnet)[1]);
        Assert.Contains("Diámetro: 32 mm", sheet);
        Assert.Contains("Marca: Winco", sheet);
        Assert.DoesNotContain("SECRETO-DE-OTRA-TIENDA", sheet);
    }

    /// <summary>Un producto de la tienda con una spec visible, vinculado a la publicación de ML.</summary>
    private async Task LinkWithSpecAsync(Merchant merchant, string itemId, string specName, string value, string? unit)
    {
        var (productId, variantId) = await merchant.CreateProductAsync($"Producto {Guid.NewGuid():N}"[..20]);
        var definition = await merchant.PostAsync("/api/v1/spec-definitions", new
        {
            name = specName,
            type = "TEXT",
            unit,
            showOnProduct = true,
            filterable = false,
            sortOrder = 1,
        });
        await merchant.PutAsync($"/api/v1/products/{productId}/specs", new
        {
            values = new[] { new { definitionId = definition.GetProperty("id").GetGuid(), value } },
        });

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MeliDbContext>();
        db.ItemLinks.Add(MeliItemLink.Create(merchant.TenantId, itemId, null, productId, variantId, "Publicación vinculada").Value);
        await db.SaveChangesAsync();
    }

    private static string ToolResult(IReadOnlyList<ChatMessage> call) =>
        call.SelectMany(m => m.Contents).OfType<FunctionResultContent>().Single().Result?.ToString() ?? "";

    private async Task<(Merchant Store, long SellerId)> StoreAsync(string tag, bool ai = true)
    {
        var store = await Merchant.CreateAsync(factory, tag);
        var sellerId = await ConnectMeliAsync(store.TenantId);
        if (ai) await EnableDraftsAsync(store);
        return (store, sellerId);
    }

    /// <summary>Una conexión de ML sembrada en la base, con los tokens cifrados como los guarda el OAuth.</summary>
    private async Task<long> ConnectMeliAsync(Guid tenantId, bool demo = false)
    {
        using var scope = factory.Services.CreateScope();
        var tokens = scope.ServiceProvider.GetRequiredService<MeliTokenService>();
        var db = scope.ServiceProvider.GetRequiredService<MeliDbContext>();
        var sellerId = Random.Shared.NextInt64(100_000_000, 900_000_000);
        var connection = MeliConnection.Create(tenantId, sellerId, "TIENDA_IA", "MLA",
            tokens.Protect("APP_USR-access"), tokens.Protect("TG-refresh"), DateTime.UtcNow.AddHours(6)).Value;
        if (demo) connection.MarkDemo();
        db.Connections.Add(connection);
        await db.SaveChangesAsync();
        return sellerId;
    }

    private static (long QuestionId, string ItemId) Ids() =>
        (Random.Shared.NextInt64(10_000_000_000, 99_999_999_999), $"MLA{Random.Shared.NextInt64(1_000_000_000, 9_999_999_999)}");

    private void StubQuestion(long questionId, long sellerId, string itemId, string text, string status = "UNANSWERED") =>
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/questions/{questionId}", new
        {
            id = questionId,
            seller_id = sellerId,
            buyer_id = 56_801_932,
            item_id = itemId,
            status,
            text,
            date_created = "2026-10-24T17:51:21.746Z",
            answer = (object?)null,
        });

    private void StubItem(string itemId) =>
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/items/{itemId}", new
        {
            id = itemId,
            title = "Juego De Pastillas De Freno Delanteras",
            price = 15_000,
            currency_id = "ARS",
            available_quantity = 3,
            status = "active",
            attributes = new object[]
            {
                new { id = "BRAND", name = "Marca", value_name = "Winco" },
                new { id = "GTIN", name = "Código universal de producto", value_name = (string?)null },
            },
        });

    private static ChatResponse Call(string tool, IDictionary<string, object?>? arguments = null) =>
        new(new ChatMessage(ChatRole.Assistant, [new FunctionCallContent("call-1", tool, arguments)]))
        {
            Usage = new UsageDetails { InputTokenCount = 10, OutputTokenCount = 5 },
        };

    private static string TextOf(IReadOnlyList<ChatMessage> messages) => string.Join("\n", messages.Select(m => m.Text));

    private static async Task<string?> TitleAsync(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString();
}
