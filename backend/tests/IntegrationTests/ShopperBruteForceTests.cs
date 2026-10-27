using System.Net;
using System.Text.Json;
using Customers.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Lo que frena a quien reparte los intentos entre muchas IPs (el cupo por IP
/// no lo ve): el login del comprador se bloquea por cuenta después de 10
/// contraseñas mal puestas, y los mails de la cuenta tienen tope por dirección.
/// En los dos casos la respuesta es la de siempre: ni el bloqueo ni el tope se
/// notan desde afuera.
/// </summary>
[Collection("api")]
public sealed class ShopperBruteForceTests(ApiFactory factory)
{
    private const string Password = "una-clave-larga";

    [Fact]
    public async Task Diez_contrasenas_mal_puestas_bloquean_la_cuenta_quince_minutos_sin_decirlo()
    {
        var store = await Merchant.CreateAsync(factory, "bfl");
        var email = $"bf-{Guid.NewGuid():N}@test.local";
        await new Shopper(store).RegisterVerifiedAsync(email, password: Password);
        var attacker = new Shopper(store);

        var wrong = await attacker.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/login", new { email, password = "probando-0" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        var wrongBody = await ProblemAsync(wrong);
        for (var i = 1; i < 10; i++)
            Assert.Equal(HttpStatusCode.Unauthorized,
                (await attacker.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/login", new { email, password = $"probando-{i}" })).StatusCode);

        // Bloqueada: ni la contraseña correcta entra, y la respuesta es la misma.
        var owner = new Shopper(store);
        var locked = await owner.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/login", new { email, password = Password });
        Assert.Equal(HttpStatusCode.Unauthorized, locked.StatusCode);
        Assert.Equal(wrongBody, await ProblemAsync(locked));

        // Pasado el bloqueo, entra (y el conteo arrancó de cero).
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CustomersDbContext>();
            var account = await db.Customers.IgnoreQueryFilters().SingleAsync(c => c.TenantId == store.TenantId && c.Email == email);
            Assert.NotNull(account.LoginLockedUntilUtc);
            Assert.InRange(account.LoginLockedUntilUtc!.Value, DateTime.UtcNow.AddMinutes(14), DateTime.UtcNow.AddMinutes(16));
            Assert.Equal(0, account.FailedLoginCount);
            await db.Customers.IgnoreQueryFilters().Where(c => c.Id == account.Id)
                .ExecuteUpdateAsync(u => u.SetProperty(c => c.LoginLockedUntilUtc, DateTime.UtcNow.AddSeconds(-1)));
        }
        await owner.ExpectOkAsync(HttpMethod.Post, "/api/v1/shop/auth/login", new { email, password = Password });
    }

    [Fact]
    public async Task Entrar_bien_vuelve_a_cero_el_conteo()
    {
        var store = await Merchant.CreateAsync(factory, "bfz");
        var email = $"bfz-{Guid.NewGuid():N}@test.local";
        var shopper = new Shopper(store);
        await shopper.RegisterVerifiedAsync(email, password: Password);

        for (var round = 0; round < 2; round++)
        {
            for (var i = 0; i < 9; i++)
                await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/login", new { email, password = "mal" });
            await shopper.ExpectOkAsync(HttpMethod.Post, "/api/v1/shop/auth/login", new { email, password = Password });
        }
    }

    [Fact]
    public async Task Los_mails_de_la_cuenta_tienen_tope_por_direccion_y_tienda()
    {
        var store = await Merchant.CreateAsync(factory, "bfm");
        var other = await Merchant.CreateAsync(factory, "bfn");
        var email = $"bfm-{Guid.NewGuid():N}@test.local";

        // Registro desde muchas "IPs": siempre la misma respuesta, solo 3 mails.
        for (var i = 0; i < 5; i++)
        {
            var res = await new Shopper(store).SendAsync(HttpMethod.Post, "/api/v1/shop/auth/register", new { name = "Ana", email = email.ToUpperInvariant() });
            Assert.Equal(HttpStatusCode.Accepted, res.StatusCode);
        }
        Assert.Equal(3, factory.ExternalHttp.EmailsTo(email).Count);

        // Otra tienda tiene su propio tope.
        Assert.Equal(HttpStatusCode.Accepted,
            (await new Shopper(other).SendAsync(HttpMethod.Post, "/api/v1/shop/auth/register", new { name = "Ana", email })).StatusCode);
        Assert.Equal(4, factory.ExternalHttp.EmailsTo(email).Count);
    }

    [Fact]
    public async Task Olvide_mi_contrasena_tambien_tiene_tope_por_direccion()
    {
        var store = await Merchant.CreateAsync(factory, "bff");
        var email = $"bff-{Guid.NewGuid():N}@test.local";
        await new Shopper(store).RegisterVerifiedAsync(email, password: Password); // 1 mail (activación)

        for (var i = 0; i < 4; i++)
            Assert.Equal(HttpStatusCode.NoContent,
                (await new Shopper(store).SendAsync(HttpMethod.Post, "/api/v1/shop/auth/forgot", new { email })).StatusCode);

        // Activación + 2 de cambio de contraseña: el resto no salió.
        await factory.ExternalHttp.WaitForEmailAsync(email, m => m.Html.Contains("/cuenta/reset?token=", StringComparison.Ordinal));
        await Task.Delay(500);
        Assert.Equal(2, factory.ExternalHttp.EmailsTo(email).Count(m => m.Html.Contains("/cuenta/reset?token=", StringComparison.Ordinal)));
    }

    private static async Task<string> ProblemAsync(HttpResponseMessage res)
    {
        var json = await res.Content.ReadFromJsonAsync<JsonElement>();
        return $"{json.GetProperty("title").GetString()}|{json.GetProperty("detail").GetString()}";
    }
}
