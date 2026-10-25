using System.Net;
using System.Text.Json;
using Ai.Infrastructure;
using Api.Ai;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SharedKernel.Common;

namespace IntegrationTests;

/// <summary>
/// Consumo de IA del mes contra la base real: lo que registra <see cref="IAiUsageRecorder"/>, lo que suma
/// <see cref="IAiMonthSpend"/> y lo que devuelve /ai/config/usage (de la tienda y de todas las propias).
/// </summary>
[Collection("api")]
public sealed class AiUsageTests(ApiFactory factory)
{
    private const string Usage = "/api/v1/ai/config/usage";
    private static readonly AiModelInfo Haiku = AiModelCatalog.Find(AiSetup.Haiku)!;

    private static string ThisMonth() => $"{ArgentinaTime.Today:yyyy-MM}";

    private async Task AddUsageAsync(Guid tenantId, DateTime createdAtUtc, long microUsd,
        AiTask task = AiTask.ShortText, string model = AiSetup.Haiku, Guid? userId = null)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AiDbContext>();
        db.Usage.Add(new AiUsage
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            UserId = userId,
            Task = task,
            Provider = AiProvider.Anthropic,
            Model = model,
            RunId = Guid.NewGuid(),
            CostMicroUsd = microUsd,
            Outcome = AiOutcome.Ok,
            CreatedAtUtc = createdAtUtc,
        });
        await db.SaveChangesAsync();
    }

    private static async Task<Guid> UserIdOfAsync(Merchant m) =>
        (await m.GetAsync("/api/v1/members?limit=100")).GetProperty("items").EnumerateArray()
            .Single(i => i.GetProperty("email").GetString() == m.Email).GetProperty("userId").GetGuid();

    [Fact]
    public async Task El_recorder_guarda_el_costo_dado_y_el_mes_lo_suma()
    {
        var m = await Merchant.CreateAsync(factory, "aiusrec");
        var other = await m.OpenAnotherStoreAsync("aiusre2");
        var userId = await UserIdOfAsync(m);
        var recorder = factory.Services.GetRequiredService<IAiUsageRecorder>();

        await recorder.RecordAsync(new AiUsageEntry(m.TenantId, userId, AiTask.QuestionDraft, Haiku,
            Guid.NewGuid(), 100, 10, 50, AiOutcome.Ok, CostMicroUsd: 1_234), CancellationToken.None);
        await recorder.RecordAsync(new AiUsageEntry(m.TenantId, null, AiTask.CatalogWrite, Haiku,
            Guid.NewGuid(), 1_000_000, 0, 0, AiOutcome.Ok), CancellationToken.None);
        await recorder.RecordAsync(new AiUsageEntry(other.TenantId, userId, AiTask.ShortText, Haiku,
            Guid.NewGuid(), 1, 0, 1, AiOutcome.Ok, CostMicroUsd: 777), CancellationToken.None);

        using var scope = factory.Services.CreateScope();
        var rows = await scope.ServiceProvider.GetRequiredService<AiDbContext>().Usage
            .IgnoreQueryFilters().Where(u => u.TenantId == m.TenantId).OrderBy(u => u.CostMicroUsd).ToListAsync();
        Assert.Equal(2, rows.Count);
        var given = rows.Single(r => r.CostMicroUsd == 1_234);
        Assert.Equal((userId, AiTask.QuestionDraft, AiProvider.Anthropic, AiSetup.Haiku, AiOutcome.Ok),
            (given.UserId, given.Task, given.Provider, given.Model, given.Outcome));
        Assert.Equal((100L, 10L, 50L), (given.InputTokens, given.CachedInputTokens, given.OutputTokens));
        // Sin costo dado se calcula con el precio del modelo (1M tokens de entrada).
        var computed = rows.Single(r => r.CostMicroUsd != 1_234);
        Assert.Equal(Haiku.InputMicroUsdPerMTok, computed.CostMicroUsd);
        Assert.Null(computed.UserId);

        // La suma del mes es de la tienda: no mezcla la otra.
        var spend = factory.Services.GetRequiredService<IAiMonthSpend>();
        Assert.Equal(1_234 + Haiku.InputMicroUsdPerMTok, await spend.SpentThisMonthMicroUsdAsync(m.TenantId, CancellationToken.None));
        Assert.Equal(777, await spend.SpentThisMonthMicroUsdAsync(other.TenantId, CancellationToken.None));

        var report = await m.GetAsync($"{Usage}?month={ThisMonth()}");
        Assert.Equal(1_234 + Haiku.InputMicroUsdPerMTok, report.GetProperty("spentMicroUsd").GetInt64());
        Assert.Equal("store", report.GetProperty("scope").GetString());
        Assert.Equal(JsonValueKind.Null, report.GetProperty("stores").ValueKind);
    }

    [Fact]
    public async Task La_suma_del_mes_corta_en_hora_argentina()
    {
        var m = await Merchant.CreateAsync(factory, "aiusmes");
        var (start, end) = AiMonth.RangeUtc(ArgentinaTime.Today);
        await AddUsageAsync(m.TenantId, start.AddMinutes(-1), 900); // fin del mes anterior (AR)
        await AddUsageAsync(m.TenantId, start, 10);                 // primer instante del mes
        await AddUsageAsync(m.TenantId, end.AddMinutes(-1), 20);    // último del mes
        await AddUsageAsync(m.TenantId, end, 700);                  // ya es el mes siguiente

        var spend = factory.Services.GetRequiredService<IAiMonthSpend>();
        Assert.Equal(30, await spend.SpentThisMonthMicroUsdAsync(m.TenantId, CancellationToken.None));
        Assert.Equal(30, (await m.GetAsync($"{Usage}?month={ThisMonth()}")).GetProperty("spentMicroUsd").GetInt64());
    }

    [Fact]
    public async Task Agrupa_por_dia_en_hora_argentina()
    {
        var m = await Merchant.CreateAsync(factory, "aiusdia");
        var userId = await UserIdOfAsync(m);
        // Un mes cerrado, para no depender de la fecha de hoy.
        // 2026-03-01 01:30 UTC = 2026-02-28 22:30 en Argentina; 2026-03-01 03:00 UTC = 00:00 del 1.
        await AddUsageAsync(m.TenantId, new DateTime(2026, 3, 1, 1, 30, 0, DateTimeKind.Utc), 100, AiTask.QuestionDraft, userId: userId);
        await AddUsageAsync(m.TenantId, new DateTime(2026, 3, 1, 2, 59, 0, DateTimeKind.Utc), 50, AiTask.QuestionDraft);
        await AddUsageAsync(m.TenantId, new DateTime(2026, 3, 1, 3, 0, 0, DateTimeKind.Utc), 10, AiTask.CatalogWrite, AiSetup.Sonnet, userId);
        await AddUsageAsync(m.TenantId, new DateTime(2026, 3, 31, 2, 30, 0, DateTimeKind.Utc), 5, AiTask.CatalogWrite, AiSetup.Sonnet); // 30-mar AR
        await AddUsageAsync(m.TenantId, new DateTime(2026, 4, 1, 2, 30, 0, DateTimeKind.Utc), 4000); // 31-mar 23:30 AR: es marzo
        await AddUsageAsync(m.TenantId, new DateTime(2026, 4, 1, 3, 0, 0, DateTimeKind.Utc), 9000);  // abril

        var feb = await m.GetAsync($"{Usage}?month=2026-02");
        Assert.Equal(150, feb.GetProperty("spentMicroUsd").GetInt64());
        var febDay = Assert.Single(feb.GetProperty("byDay").EnumerateArray());
        Assert.Equal("2026-02-28", febDay.GetProperty("day").GetString());
        Assert.Equal(150, febDay.GetProperty("microUsd").GetInt64());

        var mar = await m.GetAsync($"{Usage}?month=2026-03");
        Assert.Equal("2026-03", mar.GetProperty("month").GetString());
        Assert.Equal(10 + 5 + 4000, mar.GetProperty("spentMicroUsd").GetInt64());
        Assert.Equal(
            [("2026-03-01", 10L), ("2026-03-30", 5L), ("2026-03-31", 4000L)],
            mar.GetProperty("byDay").EnumerateArray().Select(d => (d.GetProperty("day").GetString()!, d.GetProperty("microUsd").GetInt64())));

        // Por tarea y por modelo, de mayor a menor.
        Assert.Equal([("ShortText", 4000L), ("CatalogWrite", 15L)],
            mar.GetProperty("byTask").EnumerateArray().Select(d => (d.GetProperty("key").GetString()!, d.GetProperty("microUsd").GetInt64())));
        Assert.Equal([(AiSetup.Haiku, 4000L), (AiSetup.Sonnet, 15L)],
            mar.GetProperty("byModel").EnumerateArray().Select(d => (d.GetProperty("key").GetString()!, d.GetProperty("microUsd").GetInt64())));
    }

    [Fact]
    public async Task Por_persona_lleva_nombre_nunca_email()
    {
        var m = await Merchant.CreateAsync(factory, "aiusper");
        var userId = await UserIdOfAsync(m);
        var at = new DateTime(2026, 5, 10, 15, 0, 0, DateTimeKind.Utc);
        await AddUsageAsync(m.TenantId, at, 300, userId: userId);
        await AddUsageAsync(m.TenantId, at, 100); // worker, sin persona

        var res = await m.ExpectOkAsync(HttpMethod.Get, $"{Usage}?month=2026-05");
        var raw = await res.Content.ReadAsStringAsync();
        Assert.DoesNotContain("@", raw);
        var users = JsonDocument.Parse(raw).RootElement.GetProperty("byUser").EnumerateArray().ToList();
        Assert.Equal(2, users.Count);
        Assert.Equal(userId, users[0].GetProperty("userId").GetGuid());
        Assert.StartsWith("Test ", users[0].GetProperty("name").GetString());
        Assert.Equal(300, users[0].GetProperty("microUsd").GetInt64());
        Assert.Equal(JsonValueKind.Null, users[1].GetProperty("userId").ValueKind);
        Assert.Equal("Automático", users[1].GetProperty("name").GetString());
    }

    [Fact]
    public async Task Owned_suma_solo_tiendas_propias()
    {
        var a = await Merchant.CreateAsync(factory, "aiusown");
        var b = await a.OpenAnotherStoreAsync("aiusowb");
        // Otra persona es dueña de C y suma a la primera como administradora.
        var c = await Merchant.CreateAsync(factory, "aiusowc");
        await c.PostAsync("/api/v1/members", new { email = a.Email, role = "admin" });

        await a.ExpectOkAsync(HttpMethod.Put, "/api/v1/ai/config/settings", new { enabled = true, monthlyBudgetUsd = 5, alertThresholdPct = 80 });
        await b.ExpectOkAsync(HttpMethod.Put, "/api/v1/ai/config/settings", new { enabled = true, monthlyBudgetUsd = 3, alertThresholdPct = 80 });
        var at = new DateTime(2026, 6, 10, 15, 0, 0, DateTimeKind.Utc);
        await AddUsageAsync(a.TenantId, at, 2_000);
        await AddUsageAsync(b.TenantId, at, 500, AiTask.CatalogWrite, AiSetup.Sonnet);
        await AddUsageAsync(c.TenantId, at, 99_000);

        var owned = await a.GetAsync($"{Usage}?month=2026-06&scope=owned");
        Assert.Equal("owned", owned.GetProperty("scope").GetString());
        Assert.Equal(2_500, owned.GetProperty("spentMicroUsd").GetInt64());
        Assert.Equal(8_000_000, owned.GetProperty("budgetMicroUsd").GetInt64());
        var stores = owned.GetProperty("stores").EnumerateArray().ToList();
        Assert.Equal(new[] { a.TenantId, b.TenantId }.Order(), stores.Select(s => s.GetProperty("tenantId").GetGuid()).Order());
        Assert.DoesNotContain(stores, s => s.GetProperty("tenantId").GetGuid() == c.TenantId);
        var storeA = stores.Single(s => s.GetProperty("tenantId").GetGuid() == a.TenantId);
        Assert.Equal(2_000, storeA.GetProperty("spentMicroUsd").GetInt64());
        Assert.Equal(5_000_000, storeA.GetProperty("budgetMicroUsd").GetInt64());
        Assert.Equal($"Tienda {a.Subdomain}", storeA.GetProperty("name").GetString());

        // La vista de una tienda no trae "stores" y no suma las otras.
        var one = await a.GetAsync($"{Usage}?month=2026-06");
        Assert.Equal(2_000, one.GetProperty("spentMicroUsd").GetInt64());
        Assert.Equal(JsonValueKind.Null, one.GetProperty("stores").ValueKind);

        // Como administradora de C no ve su consumo ni lo puede pedir.
        Assert.Equal(HttpStatusCode.Forbidden, (await c.SendAsync(a.Client, HttpMethod.Get, $"{Usage}?month=2026-06")).StatusCode);
    }

    [Fact]
    public async Task Pide_un_mes_y_un_alcance_validos()
    {
        var m = await Merchant.CreateAsync(factory, "aiusval");
        Assert.Equal(HttpStatusCode.BadRequest, (await m.SendAsync(HttpMethod.Get, $"{Usage}?month=octubre")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await m.SendAsync(HttpMethod.Get, $"{Usage}?scope=todo")).StatusCode);
        var admin = await m.AddTeammateAsync("admin", "aiusadm");
        Assert.Equal(HttpStatusCode.Forbidden, await admin.StatusAsync(HttpMethod.Get, Usage));

        // Sin consumo: ceros y listas vacías.
        var empty = await m.GetAsync(Usage);
        Assert.Equal(0, empty.GetProperty("spentMicroUsd").GetInt64());
        Assert.Empty(empty.GetProperty("byDay").EnumerateArray());
    }
}
