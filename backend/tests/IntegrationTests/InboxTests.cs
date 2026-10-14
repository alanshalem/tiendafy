using System.Net;
using System.Text.Json;
using MercadoLibre.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Support.Infrastructure;

namespace IntegrationTests;

/// <summary>
/// La bandeja unificada: contacto, chat posventa y Mercado Libre (la cuenta
/// de demostración, sin salir a la red) en una sola lista, con sus contadores,
/// leído/no leído, archivo, asignación y la respuesta por email del contacto.
/// Y lo que no puede pasar: ver la bandeja de otra tienda, o asignarle una
/// conversación a quien no tiene permiso para atender ese canal.
/// </summary>
[Collection("api")]
public sealed class InboxTests(ApiFactory factory)
{
    [Fact]
    public async Task Junta_los_cuatro_canales_con_sus_contadores_y_respeta_la_tienda()
    {
        var store = await Merchant.CreateAsync(factory, "ibx");
        var other = await Merchant.CreateAsync(factory, "ibo");

        var contactId = await SubmitContactAsync(store, "Ana", "ana-ibx@mail.com", "¿Hacen envíos a Córdoba?");
        var orderId = await store.CreateSaleAsync(buyerEmail: "beto-ibx@mail.com");
        var conversationId = await OpenConversationAsync(store.TenantId, orderId, "beto-ibx@mail.com", "¿Cuándo sale mi pedido?");
        await ConnectDemoMeliAsync(store.TenantId);

        var inbox = await store.GetAsync("/api/v1/inbox");
        var items = Items(inbox);
        Assert.Contains(items, t => t.GetProperty("key").GetString() == $"contacto:{contactId}");
        Assert.Contains(items, t => t.GetProperty("key").GetString() == $"posventa:{conversationId}");
        Assert.Equal(4, items.Count(t => t.GetProperty("channel").GetString() == "ml-pregunta"));
        Assert.Equal(2, items.Count(t => t.GetProperty("channel").GetString() == "ml-mensaje"));

        // Contadores: el contacto, el chat, las 2 preguntas sin responder y los 2 chats de ML.
        var counts = inbox.GetProperty("counts");
        Assert.Equal(6, counts.GetProperty("unread").GetInt32());
        Assert.Equal(2, counts.GetProperty("byChannel").GetProperty("ml-pregunta").GetInt32());
        Assert.Equal(6, (await store.GetAsync("/api/v1/inbox/counts")).GetProperty("unread").GetInt32());

        // La pregunta trae su publicación: título, precio y stock.
        var question = items.First(t => t.GetProperty("channel").GetString() == "ml-pregunta"
            && t.GetProperty("unread").GetBoolean());
        var listing = question.GetProperty("context").GetProperty("listing");
        Assert.False(string.IsNullOrEmpty(listing.GetProperty("title").GetString()));
        Assert.True(listing.GetProperty("price").GetDecimal() > 0);
        Assert.Equal(JsonValueKind.Number, listing.GetProperty("availableQuantity").ValueKind);

        // Filtros: por canal y "sin leer".
        var onlyContact = Items(await store.GetAsync("/api/v1/inbox?channel=contacto"));
        Assert.All(onlyContact, t => Assert.Equal("contacto", t.GetProperty("channel").GetString()));
        Assert.Equal(6, Items(await store.GetAsync("/api/v1/inbox?filter=sin-leer")).Count);

        // Leído en el canal mismo: el chat posventa queda sin pendientes en su pantalla de siempre.
        await store.ExpectOkAsync(HttpMethod.Post, $"/api/v1/inbox/threads/posventa/{conversationId}/read");
        var support = (await store.GetAsync("/api/v1/support/conversations")).GetProperty("unreadTotal").GetInt32();
        Assert.Equal(0, support);
        var questionId = question.GetProperty("externalId").GetString();
        await store.ExpectOkAsync(HttpMethod.Post, $"/api/v1/inbox/threads/ml-pregunta/{questionId}/read");
        Assert.Equal(4, (await store.GetAsync("/api/v1/inbox/counts")).GetProperty("unread").GetInt32());

        // Y de vuelta a no leído a mano.
        await store.ExpectOkAsync(HttpMethod.Post, $"/api/v1/inbox/threads/posventa/{conversationId}/unread");
        Assert.True(Thread(await store.GetAsync("/api/v1/inbox"), $"posventa:{conversationId}").GetProperty("unread").GetBoolean());

        // La otra tienda no ve nada de esto, ni puede tocarlo.
        var foreign = await other.GetAsync("/api/v1/inbox");
        Assert.Empty(Items(foreign));
        Assert.Equal(0, foreign.GetProperty("counts").GetProperty("unread").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await other.SendAsync(HttpMethod.Post,
            $"/api/v1/inbox/threads/contacto/{contactId}/archive")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.SendAsync(HttpMethod.Post,
            $"/api/v1/inbox/threads/posventa/{conversationId}/read")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await store.SendAsync(HttpMethod.Post,
            $"/api/v1/inbox/threads/whatsapp/{contactId}/read")).StatusCode);
    }

    [Fact]
    public async Task Archivar_saca_de_la_bandeja_hasta_que_el_cliente_vuelve_a_escribir()
    {
        var store = await Merchant.CreateAsync(factory, "iba");
        var orderId = await store.CreateSaleAsync(buyerEmail: "cli-iba@mail.com");
        var conversationId = await OpenConversationAsync(store.TenantId, orderId, "cli-iba@mail.com", "Hola");
        var key = $"posventa:{conversationId}";

        await store.ExpectOkAsync(HttpMethod.Post, $"/api/v1/inbox/threads/posventa/{conversationId}/archive");
        Assert.DoesNotContain(Items(await store.GetAsync("/api/v1/inbox")), t => t.GetProperty("key").GetString() == key);
        Assert.True(Thread(await store.GetAsync("/api/v1/inbox?filter=archivadas"), key).GetProperty("archived").GetBoolean());

        // Que conteste el equipo no la desarchiva…
        await store.ExpectOkAsync(HttpMethod.Post, $"/api/v1/support/conversations/{conversationId}/messages", new { body = "Sale mañana" });
        Assert.DoesNotContain(Items(await store.GetAsync("/api/v1/inbox")), t => t.GetProperty("key").GetString() == key);

        // …que escriba el cliente, sí.
        await Task.Delay(20);
        await AddCustomerMessageAsync(store.TenantId, conversationId, "¿Y el número de seguimiento?");
        var back = Thread(await store.GetAsync("/api/v1/inbox"), key);
        Assert.False(back.GetProperty("archived").GetBoolean());
        Assert.True(back.GetProperty("unread").GetBoolean());
    }

    [Fact]
    public async Task El_contacto_se_contesta_por_email_y_queda_registrado()
    {
        var store = await Merchant.CreateAsync(factory, "ibr");
        var email = $"consulta-{store.Subdomain}@mail.com";
        var contactId = await SubmitContactAsync(store, "Carla", email, "¿Tienen talle XL?");

        var thread = Thread(await store.GetAsync("/api/v1/inbox"), $"contacto:{contactId}");
        Assert.True(thread.GetProperty("awaitingReply").GetBoolean());

        Assert.Equal(HttpStatusCode.BadRequest, (await store.SendAsync(HttpMethod.Post,
            $"/api/v1/contact/messages/{contactId}/reply", new { body = " " })).StatusCode);
        await store.PostAsync($"/api/v1/contact/messages/{contactId}/reply", new { body = "¡Sí! Quedan dos." });

        var sent = Assert.Single(factory.ExternalHttp.EmailsTo(email));
        Assert.Contains("Quedan dos", sent.Html);
        Assert.Contains("talle XL", sent.Html); // la consulta va citada abajo

        var replies = (await store.GetAsync($"/api/v1/contact/messages/{contactId}/replies")).GetProperty("items");
        Assert.Equal("¡Sí! Quedan dos.", Assert.Single(replies.EnumerateArray()).GetProperty("body").GetString());

        thread = Thread(await store.GetAsync("/api/v1/inbox"), $"contacto:{contactId}");
        Assert.False(thread.GetProperty("awaitingReply").GetBoolean());
        Assert.False(thread.GetProperty("unread").GetBoolean()); // contestar es leerlo
    }

    [Fact]
    public async Task Asignar_respeta_la_matriz_de_permisos()
    {
        var owner = await Merchant.CreateAsync(factory, "ibp");
        var support = await owner.AddTeammateAsync("soporte");
        var catalog = await owner.AddTeammateAsync("catalogo");
        var contactId = await SubmitContactAsync(owner, "Dani", "dani-ibp@mail.com", "Consulta");
        var assign = $"/api/v1/inbox/threads/contacto/{contactId}/assignee";

        // La lista de asignables: solo quien atiende algún canal (catálogo no).
        var assignees = (await owner.GetAsync("/api/v1/inbox/assignees")).GetProperty("items").EnumerateArray().ToList();
        Assert.Contains(assignees, a => a.GetProperty("userId").GetGuid() == support.UserId);
        Assert.DoesNotContain(assignees, a => a.GetProperty("userId").GetGuid() == catalog.UserId);

        // A quien no puede atender el canal, no.
        var denied = await owner.SendAsync(HttpMethod.Put, assign, new { userId = catalog.UserId });
        Assert.Equal(HttpStatusCode.BadRequest, denied.StatusCode);
        Assert.Contains("Inbox.AssigneeCannot", await denied.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.SendAsync(HttpMethod.Put, assign, new { userId = Guid.NewGuid() })).StatusCode);

        // A soporte, sí: lo ve en "mías".
        var assigned = await owner.PutAsync(assign, new { userId = support.UserId });
        Assert.Equal(support.UserId, assigned.GetProperty("assignedTo").GetProperty("userId").GetGuid());
        var mine = await (await support.SendAsync(HttpMethod.Get, "/api/v1/inbox?filter=mias")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.Contains(Items(mine), t => t.GetProperty("key").GetString() == $"contacto:{contactId}");
        Assert.Equal(1, mine.GetProperty("counts").GetProperty("mine").GetInt32());

        // Catálogo no atiende ningún canal: ni ve la bandeja ni puede asignar.
        Assert.Equal(HttpStatusCode.Forbidden, await catalog.StatusAsync(HttpMethod.Get, "/api/v1/inbox"));
        Assert.Equal(HttpStatusCode.Forbidden, await catalog.StatusAsync(HttpMethod.Put, assign, new { userId = (Guid?)null }));

        // Sin "Leer mensajes de contacto", soporte ve la bandeja sin ese canal
        // y no puede tocar esas conversaciones (aunque se la hayan asignado).
        var permissions = (await support.PermissionsAsync()).Where(p => p != "messages.read").ToArray();
        await owner.ExpectOkAsync(HttpMethod.Put, $"/api/v1/members/{support.UserId}/permissions", new { permissions });
        var withoutContact = await (await support.SendAsync(HttpMethod.Get, "/api/v1/inbox")).Content.ReadFromJsonAsync<JsonElement>();
        Assert.DoesNotContain(withoutContact.GetProperty("channels").EnumerateArray(), c => c.GetString() == "contacto");
        Assert.DoesNotContain(Items(withoutContact), t => t.GetProperty("channel").GetString() == "contacto");
        Assert.Equal(HttpStatusCode.Forbidden, await support.StatusAsync(HttpMethod.Post, $"/api/v1/inbox/threads/contacto/{contactId}/read"));

        // Liberarla.
        var released = await owner.PutAsync(assign, new { userId = (Guid?)null });
        Assert.Equal(JsonValueKind.Null, released.GetProperty("assignedTo").ValueKind);
    }

    // ---------------------------------------------------------------- helpers

    private static List<JsonElement> Items(JsonElement page) => [.. page.GetProperty("items").EnumerateArray()];

    private static JsonElement Thread(JsonElement page, string key) =>
        Items(page).Single(t => t.GetProperty("key").GetString() == key);

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

    private async Task AddCustomerMessageAsync(Guid tenantId, Guid conversationId, string text)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SupportDbContext>();
        var conversation = db.Conversations.Single(c => c.Id == conversationId);
        db.Messages.Add(SupportMessage.Create(conversationId, tenantId, isFromStaff: false, conversation.CustomerEmail, text));
        conversation.RegisterMessage(fromStaff: false);
        await db.SaveChangesAsync();
    }

    /// <summary>La cuenta de Mercado Libre de demostración, con dos ventas en el cache local.</summary>
    private async Task ConnectDemoMeliAsync(Guid tenantId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MeliDbContext>();
        var connection = MeliConnection.Create(tenantId, 900_000 + Random.Shared.Next(1, 99_999), "DEMO", "MLA",
            "token-demo", "refresh-demo", DateTime.UtcNow.AddHours(6)).Value;
        connection.MarkDemo();
        db.Connections.Add(connection);
        for (var i = 0; i < 2; i++)
        {
            var order = MeliOrder.Create(tenantId, 2_000_000_000 + Random.Shared.Next(1, 999_999_999));
            order.Apply("paid", DateTime.UtcNow.AddHours(-i), null, 1000, 1000, "ARS", 77 + i, $"COMPRADOR{i}", "[]",
                null, null, null);
            db.Orders.Add(order);
        }
        await db.SaveChangesAsync();
    }
}
