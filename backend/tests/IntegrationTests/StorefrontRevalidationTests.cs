using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Publicar un diseño o cambiar el catálogo le avisa al storefront para que
/// vence su caché al toque (antes tardaba 30 a 60 s en verse). Lo que no
/// cambia nada publicado —guardar el borrador, un pedido rechazado— no avisa.
/// </summary>
[Collection("api")]
public sealed class StorefrontRevalidationTests(ApiFactory factory)
{
    private static object Config(string primary = "10 20 30") => new
    {
        colors = new { primary, accent = "0 0 0", useAccent = false, bg = "255 255 255", text = "17 24 39" },
        sections = Array.Empty<object>(),
    };

    /// <summary>Los avisos que recibió el storefront para esta tienda.</summary>
    private List<(string[] Scopes, string? Secret)> NoticesFor(Merchant store) =>
        [.. factory.ExternalHttp.SentTo(ApiFactory.StorefrontRevalidate)
            .Select(r => (Json: JsonDocument.Parse(r.Body!).RootElement, r.Headers))
            .Where(r => r.Json.GetProperty("tenantId").GetGuid() == store.TenantId)
            .Select(r => (
                r.Json.GetProperty("scopes").EnumerateArray().Select(s => s.GetString()!).ToArray(),
                r.Headers.TryGetValue("X-Revalidate-Secret", out var secret) ? secret : null))];

    /// <summary>El aviso sale después de mandar la respuesta: se espera un poco a que llegue.</summary>
    private async Task<List<(string[] Scopes, string? Secret)>> WaitForNoticesAsync(Merchant store, int atLeast)
    {
        for (var i = 0; i < 50 && NoticesFor(store).Count < atLeast; i++) await Task.Delay(100);
        return NoticesFor(store);
    }

    [Fact]
    public async Task Publicar_el_diseño_avisa_y_guardar_el_borrador_no()
    {
        var store = await Merchant.CreateAsync(factory, "rvt");

        await store.ExpectOkAsync(HttpMethod.Put, "/api/v1/theme/draft", Config());
        await Task.Delay(300);
        Assert.Empty(NoticesFor(store));

        await store.ExpectOkAsync(HttpMethod.Post, "/api/v1/theme/publish", Config("1 2 3"));
        var (scopes, secret) = Assert.Single(await WaitForNoticesAsync(store, 1));
        Assert.Equal(["theme"], scopes);
        Assert.Equal(ApiFactory.StorefrontRevalidateSecret, secret);
    }

    [Fact]
    public async Task La_publicacion_programada_tambien_avisa()
    {
        var store = await Merchant.CreateAsync(factory, "rvs");
        await store.ExpectOkAsync(HttpMethod.Post, "/api/v1/theme/schedule",
            new { config = Config("5 5 5"), atUtc = DateTime.UtcNow.AddDays(1) });
        await Task.Delay(300);
        Assert.Empty(NoticesFor(store)); // programar no cambia lo publicado

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Themes.Infrastructure.ThemesDbContext>();
            await db.Themes.IgnoreQueryFilters().Where(t => t.TenantId == store.TenantId)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.ScheduledAtUtc, DateTime.UtcNow.AddMinutes(-1)));
        }
        await Workers.RunOnceAsync<Api.Workers.ThemeScheduleWorker>(factory);

        var (scopes, _) = Assert.Single(await WaitForNoticesAsync(store, 1));
        Assert.Equal(["theme"], scopes);
    }

    [Fact]
    public async Task Productos_y_categorias_avisan_al_catalogo()
    {
        var store = await Merchant.CreateAsync(factory, "rvc");

        await store.PostAsync("/api/v1/categories", new { name = "Remeras" });
        var notices = await WaitForNoticesAsync(store, 1);
        Assert.Contains(notices, n => n.Scopes.SequenceEqual(["categories", "catalog"]));

        await store.CreateProductAsync("Remera lisa");
        notices = await WaitForNoticesAsync(store, 2);
        Assert.Contains(notices, n => n.Scopes.SequenceEqual(["catalog"]));
    }

    [Fact]
    public async Task Un_pedido_rechazado_no_avisa()
    {
        var store = await Merchant.CreateAsync(factory, "rvr");
        var bad = await store.SendAsync(HttpMethod.Post, "/api/v1/theme/publish", new { colors = "rojo" });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        await Task.Delay(300);
        Assert.Empty(NoticesFor(store));
    }
}
