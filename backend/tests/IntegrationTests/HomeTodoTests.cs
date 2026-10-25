using System.Net;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;

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

    private async Task<JsonElement> AiBudgetAsync(Merchant m, string path = "/api/v1/home/todo") =>
        (await m.GetAsync(path)).GetProperty("aiBudget");

    private async Task SpendAsync(Guid tenantId, long microUsd)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Ai.Infrastructure.AiDbContext>();
        db.Usage.Add(new Ai.Infrastructure.AiUsage
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Task = Ai.Infrastructure.AiTask.ShortText,
            Provider = Ai.Infrastructure.AiProvider.Anthropic,
            Model = "claude-haiku-5-5",
            CostMicroUsd = microUsd,
            CreatedAtUtc = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Home_avisa_al_80_por_ciento()
    {
        var m = await Merchant.CreateAsync(factory, "homeai");
        // Sin tope cargado no hay nada que avisar.
        Assert.Equal(JsonValueKind.Null, (await AiBudgetAsync(m)).ValueKind);

        await m.ExpectOkAsync(HttpMethod.Put, "/api/v1/ai/config/settings", new { enabled = true, monthlyBudgetUsd = 1, alertThresholdPct = 80 });
        await SpendAsync(m.TenantId, 790_000);
        Assert.Equal(JsonValueKind.Null, (await AiBudgetAsync(m)).ValueKind);

        await SpendAsync(m.TenantId, 60_000); // 0,85 USD de 1
        var warn = await AiBudgetAsync(m);
        Assert.Equal("warn", warn.GetProperty("level").GetString());
        Assert.Equal(85, warn.GetProperty("pct").GetInt32());

        await SpendAsync(m.TenantId, 150_000); // 1 USD justo
        var over = await AiBudgetAsync(m);
        Assert.Equal("over", over.GetProperty("level").GetString());
        Assert.Equal(100, over.GetProperty("pct").GetInt32());
    }

    [Fact]
    public async Task Home_no_avisa_a_quien_no_es_duenio()
    {
        var m = await Merchant.CreateAsync(factory, "homeai2");
        await m.ExpectOkAsync(HttpMethod.Put, "/api/v1/ai/config/settings", new { enabled = true, monthlyBudgetUsd = 1, alertThresholdPct = 80 });
        await SpendAsync(m.TenantId, 900_000);
        Assert.Equal("warn", (await AiBudgetAsync(m)).GetProperty("level").GetString());

        var admin = await m.AddTeammateAsync("admin", "homead");
        var res = await admin.SendAsync(HttpMethod.Get, "/api/v1/home/todo");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var seen = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(JsonValueKind.Null, seen.GetProperty("aiBudget").ValueKind);
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
