using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
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

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private HttpClient NewClient() => _factory.CreateDefaultClient(new CookieContainerHandler());

    private async Task<Guid> RegisterWithStoreAsync(HttpClient client, string tag)
    {
        var email = $"it-{tag}@test.local";
        const string password = "password-larga-123";

        using (var scope = _factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            if (await users.FindByEmailAsync(email) is null)
            {
                var user = new AppUser
                {
                    UserName = email,
                    Email = email,
                    DisplayName = $"Test {tag}",
                    EmailConfirmed = true,
                };
                var created = await users.CreateAsync(user, password);
                Assert.True(created.Succeeded, string.Join(", ", created.Errors.Select(e => e.Description)));
            }
        }

        Assert.Equal(HttpStatusCode.OK,
            (await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password })).StatusCode);

        return await CreateStoreAsync(client, tag);
    }

    /// <summary>Otra tienda para el usuario que ya está logueado en ese client.</summary>
    private static async Task<Guid> CreateStoreAsync(HttpClient client, string tag)
    {
        var create = await client.PostAsJsonAsync("/api/v1/tenants", new { name = $"Tienda {tag}", subdomain = tag });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        return (await create.Content.ReadFromJsonAsync<JsonElement>(Json)).GetProperty("id").GetGuid();
    }

    private static object Config(string primary) => new
    {
        colors = new { primary, accent = "0 0 0", useAccent = false, bg = "255 255 255", text = "17 24 39" },
        sections = Array.Empty<object>(),
    };

    private static async Task<HttpResponseMessage> SendAsync(
        HttpClient client, HttpMethod method, string path, Guid tenantId, object? body = null)
    {
        var req = new HttpRequestMessage(method, path);
        if (body is not null) req.Content = JsonContent.Create(body);
        req.Headers.Add("X-Tenant-Id", tenantId.ToString());
        return await client.SendAsync(req);
    }

    [Fact]
    public async Task Publicar_guarda_la_version_anterior_y_se_puede_volver_a_ella()
    {
        var run = Guid.NewGuid().ToString("N")[..8];
        var client = NewClient();
        var tenant = await RegisterWithStoreAsync(client, $"thv-{run}");

        // Primera publicación: no hay nada anterior que guardar más allá del default.
        Assert.True((await SendAsync(client, HttpMethod.Post, "/api/v1/theme/publish", tenant, Config("1 2 3")))
            .IsSuccessStatusCode);
        // Segunda: la anterior queda en el historial.
        Assert.True((await SendAsync(client, HttpMethod.Post, "/api/v1/theme/publish", tenant, Config("9 9 9")))
            .IsSuccessStatusCode);

        var history = await (await SendAsync(client, HttpMethod.Get, "/api/v1/theme/history", tenant))
            .Content.ReadFromJsonAsync<JsonElement>(Json);
        var items = history.GetProperty("items").EnumerateArray().ToList();
        Assert.NotEmpty(items);

        // Restaurar carga en el BORRADOR, sin tocar lo que ve el comprador.
        var versionId = items[0].GetProperty("id").GetGuid();
        var restored = await SendAsync(client, HttpMethod.Post, $"/api/v1/theme/history/{versionId}/restore", tenant, new { });
        Assert.True(restored.IsSuccessStatusCode);

        var draft = await (await SendAsync(client, HttpMethod.Get, "/api/v1/theme/draft", tenant))
            .Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("1 2 3", draft.GetProperty("colors").GetProperty("primary").GetString());

        var published = await (await SendAsync(client, HttpMethod.Get, "/api/v1/theme/", tenant))
            .Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("9 9 9", published.GetProperty("colors").GetProperty("primary").GetString());
    }

    [Fact]
    public async Task Copiar_el_diseno_de_otra_tienda_solo_si_sos_miembro_de_esa_tienda()
    {
        var run = Guid.NewGuid().ToString("N")[..8];

        var mine = NewClient();
        var tenantA = await RegisterWithStoreAsync(mine, $"cpa-{run}");
        // La MISMA persona con una segunda tienda: registrarse de nuevo cambiaría
        // la sesión del client por otro usuario.
        var tenantB = await CreateStoreAsync(mine, $"cpb-{run}");

        var other = NewClient();
        var ajena = await RegisterWithStoreAsync(other, $"cpx-{run}"); // otra empresa

        Assert.True((await SendAsync(mine, HttpMethod.Post, "/api/v1/theme/publish", tenantA, Config("7 7 7")))
            .IsSuccessStatusCode);
        Assert.True((await SendAsync(other, HttpMethod.Post, "/api/v1/theme/publish", ajena, Config("4 4 4")))
            .IsSuccessStatusCode);

        // Entre tiendas propias: copia al borrador de la tienda destino.
        var copied = await SendAsync(mine, HttpMethod.Post, $"/api/v1/theme/copy-from/{tenantA}", tenantB, new { });
        Assert.True(copied.IsSuccessStatusCode, $"copiar entre tiendas propias devolvió {copied.StatusCode}: {await copied.Content.ReadAsStringAsync()}");
        var draftB = await (await SendAsync(mine, HttpMethod.Get, "/api/v1/theme/draft", tenantB))
            .Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal("7 7 7", draftB.GetProperty("colors").GetProperty("primary").GetString());

        // De una tienda ajena: no, aunque el id sea correcto.
        var stolen = await SendAsync(mine, HttpMethod.Post, $"/api/v1/theme/copy-from/{ajena}", tenantB, new { });
        Assert.True(stolen.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.NotFound,
            $"copiar de una tienda ajena devolvió {stolen.StatusCode}");
    }

    [Fact]
    public async Task Programar_exige_fecha_futura_y_se_puede_cancelar()
    {
        var run = Guid.NewGuid().ToString("N")[..8];
        var client = NewClient();
        var tenant = await RegisterWithStoreAsync(client, $"sch-{run}");

        var past = await SendAsync(client, HttpMethod.Post, "/api/v1/theme/schedule", tenant,
            new { config = Config("1 1 1"), atUtc = DateTime.UtcNow.AddMinutes(-5) });
        Assert.Equal(HttpStatusCode.BadRequest, past.StatusCode);

        var when = DateTime.UtcNow.AddDays(2);
        Assert.True((await SendAsync(client, HttpMethod.Post, "/api/v1/theme/schedule", tenant,
            new { config = Config("2 2 2"), atUtc = when })).IsSuccessStatusCode);

        var state = await (await SendAsync(client, HttpMethod.Get, "/api/v1/theme/schedule", tenant))
            .Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.NotEqual(JsonValueKind.Null, state.GetProperty("scheduledAtUtc").ValueKind);

        Assert.True((await SendAsync(client, HttpMethod.Delete, "/api/v1/theme/schedule", tenant)).IsSuccessStatusCode);
        var cleared = await (await SendAsync(client, HttpMethod.Get, "/api/v1/theme/schedule", tenant))
            .Content.ReadFromJsonAsync<JsonElement>(Json);
        Assert.Equal(JsonValueKind.Null, cleared.GetProperty("scheduledAtUtc").ValueKind);
    }
}
