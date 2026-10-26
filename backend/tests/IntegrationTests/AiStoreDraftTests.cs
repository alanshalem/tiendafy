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
            .Conversations.AsNoTracking().SingleAsync(c => c.Id == conversationId);
        Assert.Equal(1, conversation.UnreadForStaff);
        var message = await scope.ServiceProvider.GetRequiredService<CustomersDbContext>()
            .ContactMessages.AsNoTracking().SingleAsync(m => m.Id == contactId);
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

    // ---- Sembrado -----------------------------------------------------------------------------------

    private static async Task<Guid> SubmitContactAsync(Merchant store, string name, string email, string body)
    {
        await new Shopper(store).ExpectOkAsync(HttpMethod.Post, "/api/v1/contact/submit", new { name, email, body });
        var messages = await store.GetAsync("/api/v1/contact/messages");
        return messages.GetProperty("items").EnumerateArray()
            .First(m => m.GetProperty("email").GetString() == email).GetProperty("id").GetGuid();
    }

    /// <summary>Un chat posventa con un mensaje del cliente (como si lo hubiera escrito desde la tienda).</summary>
    private async Task<Guid> OpenConversationAsync(Guid tenantId, Guid orderId, string email, string text)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SupportDbContext>();
        var conversation = Conversation.Open(tenantId, orderId, Guid.NewGuid(), email);
        db.Conversations.Add(conversation);
        db.Messages.Add(SupportMessage.Create(conversation.Id, tenantId, isFromStaff: false, email, text));
        conversation.RegisterMessage(fromStaff: false);
        await db.SaveChangesAsync();
        return conversation.Id;
    }

    private async Task<string> OrderLabelAsync(Guid orderId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Orders.Infrastructure.Persistence.OrdersDbContext>();
        return (await db.Orders.AsNoTracking().SingleAsync(o => o.Id == orderId)).Label;
    }

    private static ChatResponse Call(string tool) =>
        new(new ChatMessage(ChatRole.Assistant, [new FunctionCallContent("call-1", tool, null)]))
        {
            Usage = new UsageDetails { InputTokenCount = 10, OutputTokenCount = 5 },
        };

    private static string ToolResult(IReadOnlyList<ChatMessage> call) =>
        call.SelectMany(m => m.Contents).OfType<FunctionResultContent>().Single().Result?.ToString() ?? "";

    private static string TextOf(IReadOnlyList<ChatMessage> messages) => string.Join("\n", messages.Select(m => m.Text));

    private static async Task<string?> TitleAsync(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString();
}
