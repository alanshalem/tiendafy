using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Customers.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.DependencyInjection;
using Support.Infrastructure;
using static IntegrationTests.AiSetup;

namespace IntegrationTests;

/// <summary>
/// El borrador para el chat posventa de la tienda y para los mensajes de contacto: el servidor lee la
/// conversación, el pedido o el mensaje, nada del cliente (mail, nombre, teléfono) llega al modelo y pedirlo
/// no marca nada como leído.
/// </summary>
[Collection("api")]
public sealed class AiStoreDraftTests(ApiFactory factory)
{
    private const string AfterSale = "{\"categoria\":\"postventa\",\"motivo\":\"pregunta por su pedido\"}";
    private const string Other = "{\"categoria\":\"otro\",\"motivo\":\"consulta general\"}";

    private static string ChatPath(Guid id) => $"/api/v1/ai/support/conversations/{id}/draft";

    private static string ContactPath(Guid id) => $"/api/v1/ai/contact/{id}/draft";

    [Fact]
    public async Task Chat_posventa_usa_el_pedido_de_la_conversacion()
    {
        var store = await Merchant.CreateAsync(factory, "aisd1");
        await EnableDraftsAsync(store);
        var orderId = await store.CreateSaleAsync(buyerEmail: "comprador@test.local");
        var conversationId = await OpenConversationAsync(store.TenantId, orderId, "comprador@test.local", "¿Cómo viene mi pedido?");
        factory.Ai.Respond(Haiku, Reply(AfterSale));
        factory.Ai.Respond(Sonnet, Call("estado_del_pedido"), Reply("¡Hola! Tu pedido está en preparación."));

        var res = await store.SendAsync(HttpMethod.Post, ChatPath(conversationId));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("¡Hola! Tu pedido está en preparación.", body.GetProperty("text").GetString());
        Assert.DoesNotContain(Narration, body.GetProperty("text").GetString());
        Assert.Equal("postventa", body.GetProperty("category").GetString());
        var label = await OrderLabelAsync(orderId);
        var calls = factory.Ai.Calls(Sonnet);
        Assert.Equal(2, calls.Count);
        var status = ToolResult(calls[1]);
        Assert.Contains(label, status);
        Assert.DoesNotContain("comprador@test.local", status);
        Assert.All(calls, call => Assert.DoesNotContain("comprador@test.local", TextOf(call)));
        Assert.All(factory.Ai.Calls(Haiku), call => Assert.DoesNotContain("comprador@test.local", TextOf(call)));
    }

    [Fact]
    public async Task El_seguimiento_no_lleva_el_link_del_transportista()
    {
        var store = await Merchant.CreateAsync(factory, "aisd2");
        await EnableDraftsAsync(store);
        var orderId = await store.CreateSaleAsync();
        await store.PostAsync($"/api/v1/orders/{orderId}/fulfill", new { tracking = "AB123456789AR" });
        var conversationId = await OpenConversationAsync(store.TenantId, orderId, "comprador@test.local", "¿Dónde está mi paquete?");
        factory.Ai.Respond(Haiku, Reply("{\"categoria\":\"envio\",\"motivo\":\"pregunta por el envío\"}"));
        factory.Ai.Respond(Sonnet, Call("seguimiento"), Reply("Ya salió, el seguimiento es AB123456789AR."));

        var res = await store.SendAsync(HttpMethod.Post, ChatPath(conversationId));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var tracking = ToolResult(factory.Ai.Calls(Sonnet)[1]);
        Assert.Contains("AB123456789AR", tracking);
        Assert.DoesNotContain("http", tracking);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.DoesNotContain(body.GetProperty("warnings").EnumerateArray(), w => w.GetProperty("code").GetString() == "delivery-date");
    }

    [Fact]
    public async Task Pedir_un_borrador_no_marca_leido()
    {
        var store = await Merchant.CreateAsync(factory, "aisd3");
        await EnableDraftsAsync(store);
        var orderId = await store.CreateSaleAsync();
        var conversationId = await OpenConversationAsync(store.TenantId, orderId, "comprador@test.local", "¿Cuándo llega?");
        var contactId = await SubmitContactAsync(store, "Ana", "ana-aisd3@mail.com", "¿Hacen envíos a Córdoba?");
        factory.Ai.Respond(Haiku, Reply(Other));
        factory.Ai.Respond(Sonnet, Reply("¡Hola! Te lo confirmamos enseguida."));
        Assert.Equal(HttpStatusCode.OK, (await store.SendAsync(HttpMethod.Post, ChatPath(conversationId))).StatusCode);

        factory.Ai.Respond(Haiku, Reply(Other));
        factory.Ai.Respond(Sonnet, Reply("¡Hola! Te lo confirmamos enseguida."));
        Assert.Equal(HttpStatusCode.OK, (await store.SendAsync(HttpMethod.Post, ContactPath(contactId))).StatusCode);

        using var scope = factory.Services.CreateScope();
        var conversation = await scope.ServiceProvider.GetRequiredService<SupportDbContext>()
            .Conversations.IgnoreQueryFilters().AsNoTracking().SingleAsync(c => c.Id == conversationId);
        Assert.Equal(1, conversation.UnreadForStaff);
        var message = await scope.ServiceProvider.GetRequiredService<CustomersDbContext>()
            .ContactMessages.IgnoreQueryFilters().AsNoTracking().SingleAsync(m => m.Id == contactId);
        Assert.False(message.Read);
    }

    [Fact]
    public async Task Contacto_sin_mail_ni_telefono_en_el_prompt()
    {
        var store = await Merchant.CreateAsync(factory, "aisd4");
        await EnableDraftsAsync(store);
        var contactId = await SubmitContactAsync(store, "Beatriz Quispe", "beatriz-aisd4@mail.com", "Llamame al 11 5555-1234");
        factory.Ai.Respond(Haiku, Reply(Other));
        factory.Ai.Respond(Sonnet, Reply("¡Hola! Te escribimos por acá."));

        var res = await store.SendAsync(HttpMethod.Post, ContactPath(contactId));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var calls = factory.Ai.Calls(Haiku).Concat(factory.Ai.Calls(Sonnet)).ToList();
        Assert.Equal(2, calls.Count);
        Assert.All(calls, call =>
        {
            var text = TextOf(call);
            Assert.DoesNotContain("beatriz-aisd4@mail.com", text);
            Assert.DoesNotContain("Beatriz", text);
            Assert.DoesNotContain("Quispe", text);
            Assert.DoesNotContain("5555-1234", text);
        });
    }

    [Fact]
    public async Task Contacto_con_respuestas_las_manda_como_lineas_del_vendedor()
    {
        var store = await Merchant.CreateAsync(factory, "aisd5");
        await EnableDraftsAsync(store);
        var contactId = await SubmitContactAsync(store, "Ana", "ana-aisd5@mail.com", "¿Hacen envíos a Córdoba?");
        await store.ExpectOkAsync(HttpMethod.Post, $"/api/v1/contact/messages/{contactId}/reply", new { body = "Sí, hacemos." });
        factory.Ai.Respond(Haiku, Reply(Other));
        factory.Ai.Respond(Sonnet, Reply("Sí, llegamos a todo el país."));

        var res = await store.SendAsync(HttpMethod.Post, ContactPath(contactId));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var thread = TextOf(Assert.Single(factory.Ai.Calls(Haiku)));
        Assert.Contains("Comprador: ¿Hacen envíos a Córdoba?", thread);
        Assert.Contains("Vendedor: Sí, hacemos.", thread);
    }

    [Fact]
    public async Task Conversacion_de_otra_tienda_da_404()
    {
        var store = await Merchant.CreateAsync(factory, "aisd6");
        await EnableDraftsAsync(store);
        var other = await store.OpenAnotherStoreAsync("aisd6b");
        var orderId = await other.CreateSaleAsync();
        var conversationId = await OpenConversationAsync(other.TenantId, orderId, "comprador@test.local", "Hola");
        var contactId = await SubmitContactAsync(other, "Ana", "ana-aisd6@mail.com", "Hola");
        factory.Ai.Respond(Haiku, Reply(Other));

        var chat = await store.SendAsync(HttpMethod.Post, ChatPath(conversationId));
        var contact = await store.SendAsync(HttpMethod.Post, ContactPath(contactId));

        Assert.Equal(HttpStatusCode.NotFound, chat.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, contact.StatusCode);
        Assert.Equal("Ai.DraftNotFound", await TitleAsync(chat));
        Assert.Empty(factory.Ai.Calls(Haiku));
    }

    [Fact]
    public async Task Sin_permiso_da_403()
    {
        var store = await Merchant.CreateAsync(factory, "aisd7");
        var catalog = await store.AddTeammateAsync("catalogo", "aisdc");

        Assert.Equal(HttpStatusCode.Forbidden, await catalog.StatusAsync(HttpMethod.Post, ChatPath(Guid.NewGuid())));
        Assert.Equal(HttpStatusCode.Forbidden, await catalog.StatusAsync(HttpMethod.Post, ContactPath(Guid.NewGuid())));
    }

    [Fact]
    public async Task Un_seguimiento_manual_con_texto_libre_no_llega_al_modelo()
    {
        var store = await Merchant.CreateAsync(factory, "aisd8");
        await EnableDraftsAsync(store);
        var orderId = await store.CreateSaleAsync();
        await store.PostAsync($"/api/v1/orders/{orderId}/fulfill", new { tracking = "AB123 - Juan, Av. X 123" });
        var conversationId = await OpenConversationAsync(store.TenantId, orderId, "comprador@test.local", "¿Dónde está mi paquete?");
        factory.Ai.Respond(Haiku, Reply("{\"categoria\":\"envio\",\"motivo\":\"pregunta por el envío\"}"));
        factory.Ai.Respond(Sonnet, Call("seguimiento"), Reply("Ya salió."));

        var res = await store.SendAsync(HttpMethod.Post, ChatPath(conversationId));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var tracking = ToolResult(factory.Ai.Calls(Sonnet)[1]);
        Assert.DoesNotContain("Juan", tracking);
        Assert.DoesNotContain("Av.", tracking);
        Assert.Contains("seguimiento cargado", tracking);
    }

    [Fact]
    public async Task Chat_con_solo_mensajes_del_staff_no_tiene_que_contestar()
    {
        var store = await Merchant.CreateAsync(factory, "aisd9");
        await EnableDraftsAsync(store);
        var orderId = await store.CreateSaleAsync();
        var conversationId = await OpenConversationAsync(store.TenantId, orderId, "comprador@test.local", "Te escribimos por tu pedido.", fromStaff: true);
        factory.Ai.Respond(Haiku, Reply(Other));

        var res = await store.SendAsync(HttpMethod.Post, ChatPath(conversationId));

        Assert.Equal("Ai.NothingToAnswer", await TitleAsync(res));
        Assert.Empty(factory.Ai.Calls(Haiku));
    }

    [Fact]
    public async Task Un_adjunto_sin_texto_entra_como_adjunto()
    {
        var store = await Merchant.CreateAsync(factory, "aisd10");
        await EnableDraftsAsync(store);
        var orderId = await store.CreateSaleAsync();
        var conversationId = await OpenConversationAsync(store.TenantId, orderId, "comprador@test.local", "Mirá la foto");
        await AddAttachmentOnlyAsync(store.TenantId, conversationId);
        factory.Ai.Respond(Haiku, Reply(Other));
        factory.Ai.Respond(Sonnet, Reply("Gracias, lo revisamos."));

        var res = await store.SendAsync(HttpMethod.Post, ChatPath(conversationId));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Contains("Comprador: [adjunto]", TextOf(Assert.Single(factory.Ai.Calls(Haiku))));
    }

    [Fact]
    public async Task Mencionar_el_total_y_el_envio_reales_no_da_aviso_de_monto()
    {
        var store = await Merchant.CreateAsync(factory, "aisd11");
        await EnableDraftsAsync(store);
        var orderId = await store.CreateSaleAsync(priceMinor: 50_000_00);
        await SetShippingAsync(orderId, pickup: false, shippingMinor: 2_500_00);
        var conversationId = await OpenConversationAsync(store.TenantId, orderId, "comprador@test.local", "¿Cuánto era el total?");
        factory.Ai.Respond(Haiku, Reply(AfterSale));
        factory.Ai.Respond(Sonnet, Reply("El total fue $ 52.500, con $ 2.500 de envío."));

        var res = await store.SendAsync(HttpMethod.Post, ChatPath(conversationId));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.DoesNotContain(body.GetProperty("warnings").EnumerateArray(), w => w.GetProperty("code").GetString() == "amount");
    }

    [Theory]
    [InlineData(true, "retiro en el local", "envío a domicilio")]
    [InlineData(false, "envío a domicilio", "retiro en el local")]
    public async Task El_estado_del_pedido_dice_retiro_o_envio_y_no_trae_datos_del_cliente(bool pickup, string expected, string absent)
    {
        var store = await Merchant.CreateAsync(factory, pickup ? "aisd12" : "aisd13");
        await EnableDraftsAsync(store);
        var orderId = await store.CreateSaleAsync();
        await SetShippingAsync(orderId, pickup, shippingMinor: 0);
        var conversationId = await OpenConversationAsync(store.TenantId, orderId, "comprador@test.local", "¿Cómo viene mi pedido?");
        factory.Ai.Respond(Haiku, Reply(AfterSale));
        factory.Ai.Respond(Sonnet, Call("estado_del_pedido"), Reply("Está en camino."));

        var res = await store.SendAsync(HttpMethod.Post, ChatPath(conversationId));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var status = ToolResult(factory.Ai.Calls(Sonnet)[1]);
        Assert.Contains(expected, status);
        Assert.DoesNotContain(absent, status);
        Assert.DoesNotContain("CALLE-SECRETA", status);
        Assert.DoesNotContain("NOMBRE-SECRETO", status);
        Assert.DoesNotContain("5555-0000", status);
    }

    [Fact]
    public async Task Un_mensaje_viejo_enorme_no_esconde_el_nuevo()
    {
        var store = await Merchant.CreateAsync(factory, "aisd14");
        await EnableDraftsAsync(store);
        var orderId = await store.CreateSaleAsync();
        var conversationId = await OpenConversationAsync(store.TenantId, orderId, "comprador@test.local", "VIEJO " + new string('v', 3_994));
        await AddMessageAsync(store.TenantId, conversationId, "NUEVO-Y-CORTO: ¿ya salió?");
        factory.Ai.Respond(Haiku, Reply(Other));
        factory.Ai.Respond(Sonnet, Reply("Te lo confirmamos enseguida."));

        var res = await store.SendAsync(HttpMethod.Post, ChatPath(conversationId));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Contains("Comprador: NUEVO-Y-CORTO: ¿ya salió?", TextOf(Assert.Single(factory.Ai.Calls(Haiku))));
        Assert.Contains("Comprador: NUEVO-Y-CORTO: ¿ya salió?", TextOf(Assert.Single(factory.Ai.Calls(Sonnet))));
    }

    [Fact]
    public async Task El_numero_de_seguimiento_real_no_es_un_dato_de_contacto()
    {
        var store = await Merchant.CreateAsync(factory, "aisd15");
        await EnableDraftsAsync(store);
        var orderId = await store.CreateSaleAsync();
        await store.PostAsync($"/api/v1/orders/{orderId}/fulfill", new { tracking = "123456789012" });
        var conversationId = await OpenConversationAsync(store.TenantId, orderId, "comprador@test.local", "¿Me pasás el seguimiento?");
        const string Shipping = "{\"categoria\":\"envio\",\"motivo\":\"pregunta por el envío\"}";

        factory.Ai.Respond(Haiku, Reply(Shipping));
        factory.Ai.Respond(Sonnet, Call("seguimiento"), Reply("Tu número de seguimiento es 123456789012."));
        var real = await (await store.SendAsync(HttpMethod.Post, ChatPath(conversationId))).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Contains("123456789012", ToolResult(factory.Ai.Calls(Sonnet)[1]));
        Assert.DoesNotContain(real.GetProperty("warnings").EnumerateArray(), w => w.GetProperty("code").GetString() == "contact-data");

        factory.Ai.Respond(Haiku, Reply(Shipping));
        factory.Ai.Respond(Sonnet, Call("seguimiento"), Reply("Tu número de seguimiento es 987654321098."));
        var other = await (await store.SendAsync(HttpMethod.Post, ChatPath(conversationId))).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Contains(other.GetProperty("warnings").EnumerateArray(), w => w.GetProperty("code").GetString() == "contact-data");
    }

    [Fact]
    public async Task Lo_devuelto_y_el_subtotal_de_una_linea_son_montos_conocidos()
    {
        var store = await Merchant.CreateAsync(factory, "aisd16");
        await EnableDraftsAsync(store);
        var orderId = await store.CreateSaleAsync(priceMinor: 10_000_00, quantity: 3);
        await SetShippingAsync(orderId, pickup: false, shippingMinor: 2_500_00);
        await store.PostAsync($"/api/v1/orders/{orderId}/refund", new { amount = 5_000m });
        var conversationId = await OpenConversationAsync(store.TenantId, orderId, "comprador@test.local", "¿Cuánto me devolvieron?");
        factory.Ai.Respond(Haiku, Reply(AfterSale));
        factory.Ai.Respond(Sonnet, Call("estado_del_pedido"),
            Reply("Los 3 productos fueron $ 30.000, el total $ 32.500, y te devolvimos $ 5.000."));

        var res = await store.SendAsync(HttpMethod.Post, ChatPath(conversationId));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Contains("Devuelto al comprador: $ 5.000", ToolResult(factory.Ai.Calls(Sonnet)[1]));
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.DoesNotContain(body.GetProperty("warnings").EnumerateArray(), w => w.GetProperty("code").GetString() == "amount");
    }

    // ---- Sembrado -----------------------------------------------------------------------------------

    /// <summary>Otro mensaje del cliente en el chat, más nuevo que los anteriores.</summary>
    private async Task AddMessageAsync(Guid tenantId, Guid conversationId, string text)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SupportDbContext>();
        db.Messages.Add(SupportMessage.Create(conversationId, tenantId, isFromStaff: false, "comprador@test.local", text));
        await db.SaveChangesAsync();
    }

    /// <summary>Envío o retiro, con una dirección, un nombre y un teléfono que nunca tienen que llegar al modelo.</summary>
    private async Task SetShippingAsync(Guid orderId, bool pickup, long shippingMinor)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Orders.Infrastructure.Persistence.OrdersDbContext>();
        var order = await db.Orders.IgnoreQueryFilters().SingleAsync(o => o.Id == orderId);
        order.SetShippingAndBuyer(new SharedKernel.Common.Money(shippingMinor, order.Currency), "Envío", "CALLE-SECRETA 123",
            "NOMBRE-SECRETO", "11 5555-0000", null, null, pickup);
        await db.SaveChangesAsync();
    }

    private async Task AddAttachmentOnlyAsync(Guid tenantId, Guid conversationId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SupportDbContext>();
        db.Messages.Add(SupportMessage.Create(conversationId, tenantId, isFromStaff: false, "comprador@test.local", "",
            "support/foto.png", "foto.png", "image/png"));
        await db.SaveChangesAsync();
    }

    private static async Task<Guid> SubmitContactAsync(Merchant store, string name, string email, string body)
    {
        await new Shopper(store).ExpectOkAsync(HttpMethod.Post, "/api/v1/contact/submit", new { name, email, body });
        var messages = await store.GetAsync("/api/v1/contact/messages");
        return messages.GetProperty("items").EnumerateArray()
            .First(m => m.GetProperty("email").GetString() == email).GetProperty("id").GetGuid();
    }

    /// <summary>Un chat posventa con un mensaje del cliente (como si lo hubiera escrito desde la tienda).</summary>
    private async Task<Guid> OpenConversationAsync(Guid tenantId, Guid orderId, string email, string text, bool fromStaff = false)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SupportDbContext>();
        var conversation = Conversation.Open(tenantId, orderId, Guid.NewGuid(), email);
        db.Conversations.Add(conversation);
        db.Messages.Add(SupportMessage.Create(conversation.Id, tenantId, fromStaff, fromStaff ? "staff@test.local" : email, text));
        conversation.RegisterMessage(fromStaff);
        await db.SaveChangesAsync();
        return conversation.Id;
    }

    private async Task<string> OrderLabelAsync(Guid orderId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Orders.Infrastructure.Persistence.OrdersDbContext>();
        return (await db.Orders.IgnoreQueryFilters().AsNoTracking().SingleAsync(o => o.Id == orderId)).Label;
    }

    /// <summary>Lo que Claude suele escribir antes de llamar a una herramienta: nunca va al borrador.</summary>
    private const string Narration = "Voy a consultar el dato.";

    /// <summary>Un turno con herramienta como los de Claude: una frase y después la llamada.</summary>
    private static ChatResponse Call(string tool) =>
        new(new ChatMessage(ChatRole.Assistant, [new TextContent(Narration), new FunctionCallContent("call-1", tool, null)]))
        {
            Usage = new UsageDetails { InputTokenCount = 10, OutputTokenCount = 5 },
        };

    private static string ToolResult(IReadOnlyList<ChatMessage> call) =>
        call.SelectMany(m => m.Contents).OfType<FunctionResultContent>().Single().Result?.ToString() ?? "";

    private static string TextOf(IReadOnlyList<ChatMessage> messages) => string.Join("\n", messages.Select(m => m.Text));

    private static async Task<string?> TitleAsync(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString();
}
