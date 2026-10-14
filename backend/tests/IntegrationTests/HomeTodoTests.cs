using System.Net;
using System.Text.Json;

namespace IntegrationTests;

/// <summary>
/// "Para hacer hoy" del Inicio: cada cola contada en la base (no sobre un
/// listado recortado), y solo las que la persona puede ver.
/// </summary>
[Collection("api")]
public sealed class HomeTodoTests(ApiFactory factory)
{
    [Fact]
    public async Task Cuenta_las_colas_del_dia_y_esconde_las_que_no_le_tocan()
    {
        var merchant = await Merchant.CreateAsync(factory, "home");
        var shopper = new Shopper(merchant);

        var empty = await merchant.GetAsync("/api/v1/home/todo");
        Assert.Equal(0, empty.GetProperty("toDispatch").GetInt32());
        Assert.Equal(0, empty.GetProperty("messages").GetProperty("repentance").GetInt32());
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("messages").GetProperty("oldestRepentanceAtUtc").ValueKind);
        // Sin Mercado Libre conectado no hay nada que contar de ML.
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("mercadoLibre").ValueKind);
        Assert.False(empty.GetProperty("fiscalReady").GetBoolean());

        // Dos ventas cobradas, una ya despachada.
        await merchant.CreateSaleAsync();
        var sent = await merchant.CreateSaleAsync();
        await merchant.PostAsync($"/api/v1/orders/{sent}/fulfill", new { tracking = (string?)null });

        // Un mensaje común y dos arrepentimientos; uno se lee.
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/contact/submit",
            new { name = "Ana", email = "ana@mail.com", body = "¿Tienen local?" });
        foreach (var name in new[] { "Beto", "Caro" })
            await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/contact/submit",
                new { name, email = $"{name.ToLowerInvariant()}@mail.com", body = "Me arrepiento.", kind = "repentance" });
        var inbox = await merchant.GetAsync("/api/v1/contact/messages");
        var first = inbox.GetProperty("items").EnumerateArray()
            .First(m => m.GetProperty("kind").GetString() == "repentance" && m.GetProperty("name").GetString() == "Caro");
        await merchant.ExpectOkAsync(HttpMethod.Post, $"/api/v1/contact/messages/{first.GetProperty("id").GetGuid()}/read");

        var todo = await merchant.GetAsync("/api/v1/home/todo");
        Assert.Equal(1, todo.GetProperty("toDispatch").GetInt32());
        Assert.Equal(0, todo.GetProperty("pendingTransfers").GetInt32());
        var messages = todo.GetProperty("messages");
        Assert.Equal(1, messages.GetProperty("unreadContact").GetInt32());
        Assert.Equal(1, messages.GetProperty("repentance").GetInt32());
        Assert.True(messages.GetProperty("oldestRepentanceAtUtc").GetDateTime() <= DateTime.UtcNow.AddMinutes(1));

        // Alguien de catálogo no ve ninguna de estas colas: ni le llega el endpoint.
        var catalog = await merchant.AddTeammateAsync("catalogo");
        Assert.Equal(HttpStatusCode.Forbidden, await catalog.StatusAsync(HttpMethod.Get, "/api/v1/home/todo"));
    }

    [Fact]
    public async Task Facturacion_lista_solo_con_emisor_certificado_y_punto_de_venta()
    {
        var merchant = await Merchant.CreateAsync(factory, "fready");
        var before = await merchant.GetAsync("/api/v1/fiscal/readiness");
        Assert.False(before.GetProperty("ready").GetBoolean());
        Assert.False(before.GetProperty("issuer").GetBoolean());

        _ = new FakeArca(factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        var after = await merchant.GetAsync("/api/v1/fiscal/readiness");
        Assert.True(after.GetProperty("ready").GetBoolean());
        Assert.True((await merchant.GetAsync("/api/v1/home/todo")).GetProperty("fiscalReady").GetBoolean());

        // Lo ve quien vende aunque no pueda tocar la configuración fiscal.
        var support = await merchant.AddTeammateAsync("soporte");
        Assert.Equal(HttpStatusCode.OK, await support.StatusAsync(HttpMethod.Get, "/api/v1/fiscal/readiness"));
        Assert.Equal(HttpStatusCode.Forbidden, await support.StatusAsync(HttpMethod.Get, "/api/v1/fiscal/config"));
    }
}
