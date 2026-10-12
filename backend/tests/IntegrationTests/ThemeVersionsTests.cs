using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Historial, copia entre tiendas y publicación programada del editor de diseño.
///
/// Lo que se protege acá: que "volver a la versión anterior" tenga de dónde
/// volver, y sobre todo que copiar el diseño de otra tienda exija ser miembro
/// de ESA tienda — si no, alcanzaría con tener una tienda propia y adivinar un
/// id para leerse el diseño de un tercero.
/// </summary>
[Collection("api")]
public sealed class ThemeVersionsTests
{
    private readonly ApiFactory _factory;

    public ThemeVersionsTests(ApiFactory factory) => _factory = factory;

    private static object Config(string primary) => new
    {
        colors = new { primary, accent = "0 0 0", useAccent = false, bg = "255 255 255", text = "17 24 39" },
        sections = Array.Empty<object>(),
    };

    [Fact]
    public async Task Publicar_guarda_la_version_anterior_y_se_puede_volver_a_ella()
    {
        var merchant = await Merchant.CreateAsync(_factory, "thv");

        // Primera publicación: no hay nada anterior que guardar más allá del default.
        await merchant.ExpectOkAsync(HttpMethod.Post, "/api/v1/theme/publish", Config("1 2 3"));
        // Segunda: la anterior queda en el historial.
        await merchant.ExpectOkAsync(HttpMethod.Post, "/api/v1/theme/publish", Config("9 9 9"));

        var history = await merchant.GetAsync("/api/v1/theme/history");
        var items = history.GetProperty("items").EnumerateArray().ToList();
        Assert.NotEmpty(items);

        // Restaurar carga en el BORRADOR, sin tocar lo que ve el comprador.
        var versionId = items[0].GetProperty("id").GetGuid();
        await merchant.ExpectOkAsync(HttpMethod.Post, $"/api/v1/theme/history/{versionId}/restore", new { });

        var draft = await merchant.GetAsync("/api/v1/theme/draft");
        Assert.Equal("1 2 3", draft.GetProperty("colors").GetProperty("primary").GetString());

        var published = await merchant.GetAsync("/api/v1/theme/");
        Assert.Equal("9 9 9", published.GetProperty("colors").GetProperty("primary").GetString());
    }

    [Fact]
    public async Task Copiar_el_diseno_de_otra_tienda_solo_si_sos_miembro_de_esa_tienda()
    {
        var storeA = await Merchant.CreateAsync(_factory, "cpa");
        // La MISMA persona con una segunda tienda.
        var storeB = await storeA.OpenAnotherStoreAsync("cpb");
        var ajena = await Merchant.CreateAsync(_factory, "cpx"); // otra empresa

        await storeA.ExpectOkAsync(HttpMethod.Post, "/api/v1/theme/publish", Config("7 7 7"));
        await ajena.ExpectOkAsync(HttpMethod.Post, "/api/v1/theme/publish", Config("4 4 4"));

        // Entre tiendas propias: copia al borrador de la tienda destino.
        await storeB.ExpectOkAsync(HttpMethod.Post, $"/api/v1/theme/copy-from/{storeA.TenantId}", new { });
        var draftB = await storeB.GetAsync("/api/v1/theme/draft");
        Assert.Equal("7 7 7", draftB.GetProperty("colors").GetProperty("primary").GetString());

        // De una tienda ajena: no, aunque el id sea correcto.
        var stolen = await storeB.SendAsync(HttpMethod.Post, $"/api/v1/theme/copy-from/{ajena.TenantId}", new { });
        Assert.True(stolen.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.NotFound,
            $"copiar de una tienda ajena devolvió {stolen.StatusCode}");
    }

    [Fact]
    public async Task Programar_exige_fecha_futura_y_se_puede_cancelar()
    {
        var merchant = await Merchant.CreateAsync(_factory, "sch");

        var past = await merchant.SendAsync(HttpMethod.Post, "/api/v1/theme/schedule",
            new { config = Config("1 1 1"), atUtc = DateTime.UtcNow.AddMinutes(-5) });
        Assert.Equal(HttpStatusCode.BadRequest, past.StatusCode);

        await merchant.ExpectOkAsync(HttpMethod.Post, "/api/v1/theme/schedule",
            new { config = Config("2 2 2"), atUtc = DateTime.UtcNow.AddDays(2) });

        var state = await merchant.GetAsync("/api/v1/theme/schedule");
        Assert.NotEqual(JsonValueKind.Null, state.GetProperty("scheduledAtUtc").ValueKind);

        await merchant.ExpectOkAsync(HttpMethod.Delete, "/api/v1/theme/schedule");
        var cleared = await merchant.GetAsync("/api/v1/theme/schedule");
        Assert.Equal(JsonValueKind.Null, cleared.GetProperty("scheduledAtUtc").ValueKind);
    }

    [Fact]
    public async Task A_la_hora_programada_el_worker_publica_y_guarda_la_anterior()
    {
        var merchant = await Merchant.CreateAsync(_factory, "thw");
        await merchant.ExpectOkAsync(HttpMethod.Post, "/api/v1/theme/publish", Config("1 1 1"));
        await merchant.ExpectOkAsync(HttpMethod.Post, "/api/v1/theme/schedule",
            new { config = Config("5 5 5"), atUtc = DateTime.UtcNow.AddDays(1) });

        // Llega la hora.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Themes.Infrastructure.ThemesDbContext>();
            await db.Themes.IgnoreQueryFilters().Where(t => t.TenantId == merchant.TenantId)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.ScheduledAtUtc, DateTime.UtcNow.AddMinutes(-1)));
        }
        await Workers.RunOnceAsync<Api.Workers.ThemeScheduleWorker>(_factory);

        var published = await merchant.GetAsync("/api/v1/theme/");
        Assert.Equal("5 5 5", published.GetProperty("colors").GetProperty("primary").GetString());
        Assert.Equal(JsonValueKind.Null, (await merchant.GetAsync("/api/v1/theme/schedule")).GetProperty("scheduledAtUtc").ValueKind);
        Assert.NotEmpty((await merchant.GetAsync("/api/v1/theme/history")).GetProperty("items").EnumerateArray());
    }
}
