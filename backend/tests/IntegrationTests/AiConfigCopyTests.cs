using System.Net;
using System.Text.Json;
using Ai.Infrastructure;
using Api.Ai;
using Api.Middleware;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// "Copiar a mis otras tiendas": claves, modelos y tope hacia tiendas donde la persona es dueña.
/// Es una escritura entre tiendas: todo o nada, y solo hacia las propias.
/// </summary>
[Collection("api")]
public sealed class AiConfigCopyTests(ApiFactory factory)
{
    private const string Key = "sk-test-123456a1b2";
    private const string Sonnet = "claude-sonnet-5-5";
    private const string Config = "/api/v1/ai/config";
    private const string Copy = "/api/v1/ai/config/copy";

    private async Task ConfigureSourceAsync(Merchant m)
    {
        await m.ExpectOkAsync(HttpMethod.Put, $"{Config}/providers/Anthropic", new { apiKey = Key });
        await m.ExpectOkAsync(HttpMethod.Put, $"{Config}/assignments",
            new { items = new[] { new { task = "QuestionDraft", primaryModel = Sonnet, fallbackModel = (string?)null } } });
        await m.ExpectOkAsync(HttpMethod.Put, $"{Config}/settings", new { enabled = true, monthlyBudgetUsd = 12.5, alertThresholdPct = 70 });

        // El origen tiene una prueba exitosa de su clave.
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AiDbContext>();
        var credential = await db.Credentials.IgnoreQueryFilters().SingleAsync(c => c.TenantId == m.TenantId);
        credential.RecordTest(true, DateTime.UtcNow);
        await db.SaveChangesAsync();
    }

    private static Task<HttpResponseMessage> CopyAsync(Merchant m, Guid[] targets, bool keys = true, bool models = true, bool budget = true) =>
        m.SendAsync(HttpMethod.Post, Copy, new { targetTenantIds = targets, keys, models, budget });

    private async Task<AiProviderCredential?> CredentialOfAsync(Guid tenantId)
    {
        using var scope = factory.Services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<AiDbContext>().Credentials
            .IgnoreQueryFilters().AsNoTracking().SingleOrDefaultAsync(c => c.TenantId == tenantId);
    }

    private async Task<(int Assignments, int Settings)> RowsOfAsync(Guid tenantId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AiDbContext>();
        return (await db.Assignments.IgnoreQueryFilters().CountAsync(a => a.TenantId == tenantId),
            await db.Settings.IgnoreQueryFilters().CountAsync(s => s.TenantId == tenantId));
    }

    [Fact]
    public async Task Copia_claves_modelos_y_tope_a_tienda_propia()
    {
        var a = await Merchant.CreateAsync(factory, "aicpy");
        var b = await a.OpenAnotherStoreAsync("aicpyb");
        await ConfigureSourceAsync(a);

        var res = await CopyAsync(a, [b.TenantId]);
        var raw = await res.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.DoesNotContain(Key, raw);
        Assert.Equal([b.TenantId], JsonDocument.Parse(raw).RootElement.GetProperty("copied").EnumerateArray().Select(x => x.GetGuid()));

        // La clave del destino es la misma, cifrada de nuevo, y arranca sin resultado de prueba.
        var source = await CredentialOfAsync(a.TenantId);
        var target = await CredentialOfAsync(b.TenantId);
        Assert.NotNull(target);
        Assert.Equal("a1b2", target.Last4);
        Assert.Null(target.LastTestOk);
        Assert.Null(target.LastTestAtUtc);
        Assert.NotEqual(source!.KeyEncrypted, target.KeyEncrypted);
        using (var scope = factory.Services.CreateScope())
            Assert.Equal(Key, scope.ServiceProvider.GetRequiredService<IAiKeyProtector>().Unprotect(target.KeyEncrypted));
        Assert.True(source.LastTestOk); // el origen no se toca

        var copied = await b.GetAsync(Config);
        Assert.DoesNotContain(Key, copied.ToString());
        var assignment = Assert.Single(copied.GetProperty("assignments").EnumerateArray());
        Assert.Equal(("QuestionDraft", Sonnet), (assignment.GetProperty("task").GetString(), assignment.GetProperty("primaryModel").GetString()));
        var settings = copied.GetProperty("settings");
        Assert.True(settings.GetProperty("enabled").GetBoolean());
        Assert.Equal(12.5m, settings.GetProperty("monthlyBudgetUsd").GetDecimal());
        Assert.Equal(70, settings.GetProperty("alertThresholdPct").GetInt32());
    }

    [Fact]
    public async Task Pisa_lo_que_el_destino_ya_tenia()
    {
        var a = await Merchant.CreateAsync(factory, "aicpyp");
        var b = await a.OpenAnotherStoreAsync("aicpypb");
        await ConfigureSourceAsync(a);
        await b.ExpectOkAsync(HttpMethod.Put, $"{Config}/providers/Anthropic", new { apiKey = "sk-test-vieja-clave-0000" });
        await b.ExpectOkAsync(HttpMethod.Put, $"{Config}/settings", new { enabled = false, monthlyBudgetUsd = 1, alertThresholdPct = 90 });

        Assert.Equal(HttpStatusCode.OK, (await CopyAsync(a, [b.TenantId, b.TenantId])).StatusCode); // repetido: una sola vez

        Assert.Equal("a1b2", (await CredentialOfAsync(b.TenantId))!.Last4);
        Assert.Equal((1, 1), await RowsOfAsync(b.TenantId));
        Assert.Equal(12.5m, (await b.GetAsync(Config)).GetProperty("settings").GetProperty("monthlyBudgetUsd").GetDecimal());
    }

    [Fact]
    public async Task Destino_ajeno_da_403_y_no_copia_nada()
    {
        var a = await Merchant.CreateAsync(factory, "aicpya");
        var own = await a.OpenAnotherStoreAsync("aicpyo");
        // C es de otra persona y suma a la primera como administradora: no es "propia".
        var c = await Merchant.CreateAsync(factory, "aicpyc");
        await c.PostAsync("/api/v1/members", new { email = a.Email, role = "admin" });
        await ConfigureSourceAsync(a);

        Assert.Equal(HttpStatusCode.Forbidden, (await CopyAsync(a, [own.TenantId, c.TenantId])).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await CopyAsync(a, [Guid.NewGuid()])).StatusCode);

        Assert.Null(await CredentialOfAsync(own.TenantId));
        Assert.Null(await CredentialOfAsync(c.TenantId));
        Assert.Equal((0, 0), await RowsOfAsync(own.TenantId));
        Assert.Equal((0, 0), await RowsOfAsync(c.TenantId));
    }

    [Fact]
    public async Task Solo_copia_lo_elegido()
    {
        var a = await Merchant.CreateAsync(factory, "aicpys");
        var b = await a.OpenAnotherStoreAsync("aicpysb");
        var c = await a.OpenAnotherStoreAsync("aicpysc");
        await ConfigureSourceAsync(a);

        Assert.Equal(HttpStatusCode.OK, (await CopyAsync(a, [b.TenantId], keys: false, models: true, budget: true)).StatusCode);

        Assert.Null(await CredentialOfAsync(b.TenantId));
        Assert.Equal((1, 1), await RowsOfAsync(b.TenantId));

        // Sin las claves, el modelo copiado no se puede usar y el motivo lo dice.
        using (var scope = factory.Services.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<TenantContextHolder>().Set(TenantId.From(b.TenantId));
            var availability = (await scope.ServiceProvider.GetRequiredService<IAiGateway>().AvailabilityAsync(CancellationToken.None))
                .Single(t => t.Task == AiTask.QuestionDraft);
            Assert.False(availability.Available);
            Assert.Equal("Falta la clave de Anthropic.", availability.Reason);
        }

        // Solo el tope: ni claves ni modelos.
        Assert.Equal(HttpStatusCode.OK, (await CopyAsync(a, [c.TenantId], keys: false, models: false, budget: true)).StatusCode);
        Assert.Equal((0, 1), await RowsOfAsync(c.TenantId));
        Assert.Null(await CredentialOfAsync(c.TenantId));
    }

    [Fact]
    public async Task Pedidos_invalidos_dan_400_y_no_escriben()
    {
        var a = await Merchant.CreateAsync(factory, "aicpyi");
        var b = await a.OpenAnotherStoreAsync("aicpyib");
        await ConfigureSourceAsync(a);

        Assert.Equal(HttpStatusCode.BadRequest, (await CopyAsync(a, [])).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await CopyAsync(a, [b.TenantId], keys: false, models: false, budget: false)).StatusCode);
        // A la misma tienda no tiene sentido: se rechaza, y con ella la copia entera.
        Assert.Equal(HttpStatusCode.BadRequest, (await CopyAsync(a, [b.TenantId, a.TenantId])).StatusCode);
        Assert.Null(await CredentialOfAsync(b.TenantId));
        Assert.Equal((0, 0), await RowsOfAsync(b.TenantId));
    }

    [Fact]
    public async Task Un_administrador_no_copia()
    {
        var m = await Merchant.CreateAsync(factory, "aicpyr");
        var b = await m.OpenAnotherStoreAsync("aicpyrb");
        var admin = await m.AddTeammateAsync("admin", "aicpyad");
        Assert.Equal(HttpStatusCode.Forbidden, await admin.StatusAsync(HttpMethod.Post, Copy,
            new { targetTenantIds = new[] { b.TenantId }, keys = true, models = true, budget = true }));
    }
}
