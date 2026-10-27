using System.Net;
using System.Text.Json;
using Identity.Infrastructure;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// La verificación en dos pasos del panel de punta a punta: activarla desde la
/// cuenta, entrar con y sin código, los códigos de recuperación de un solo
/// uso, el bloqueo por intentos y desactivarla. Los códigos se calculan como
/// los calcula la app de autenticación (TOTP, RFC 6238) con la clave que
/// muestra el panel.
/// </summary>
[Collection("api")]
public sealed class PanelTwoFactorTests
{
    private const string Password = "Clave-larga-123";
    private readonly ApiFactory _factory;

    public PanelTwoFactorTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Activar_entrar_con_codigo_o_recuperacion_y_desactivar()
    {
        var email = await CreateUserAsync("2fa");
        var client = NewClient();
        var first = await LoginAsync(client, email);
        Assert.Equal(email, first.GetProperty("email").GetString());
        Assert.False(first.GetProperty("twoFactorEnabled").GetBoolean());

        var status = await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/2fa");
        Assert.False(status.GetProperty("enabled").GetBoolean());

        // Sin empezar no se puede confirmar.
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/v1/auth/2fa/enable", new { code = "123456", password = Password })).StatusCode);

        // La clave para la app, el link otpauth:// y el QR.
        var setup = await (await client.PostAsJsonAsync("/api/v1/auth/2fa/setup", new { })).Content.ReadFromJsonAsync<JsonElement>();
        var key = setup.GetProperty("sharedKey").GetString()!;
        Assert.Matches("^([a-z2-7]{4} )+[a-z2-7]{1,4}$", key);
        var uri = setup.GetProperty("authenticatorUri").GetString()!;
        Assert.StartsWith($"otpauth://totp/Tiendafy:{Uri.EscapeDataString(email)}?secret=", uri);
        Assert.Contains("issuer=Tiendafy", uri);
        Assert.StartsWith("<svg", setup.GetProperty("qrSvg").GetString());

        // La clave queda cifrada en la base, no en texto plano.
        Assert.DoesNotContain(await StoredTokensAsync(email), t => t.Contains(Raw(key), StringComparison.OrdinalIgnoreCase));

        // Activarla pide la contraseña: con solo la cookie (robada), quien la
        // tenga activaría su propia app y dejaría afuera al dueño.
        var noPassword = await client.PostAsJsonAsync("/api/v1/auth/2fa/enable", new { code = Totp(key, 0) });
        Assert.Equal(HttpStatusCode.BadRequest, noPassword.StatusCode);
        Assert.Equal("Auth.PasswordRequired", (await noPassword.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
        var wrongPassword = await client.PostAsJsonAsync("/api/v1/auth/2fa/enable", new { code = Totp(key, 0), password = "otra-clave-larga" });
        Assert.Equal(HttpStatusCode.BadRequest, wrongPassword.StatusCode);
        Assert.Equal("Auth.InvalidPassword", (await wrongPassword.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString());
        Assert.False((await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/2fa")).GetProperty("enabled").GetBoolean());

        // Un código equivocado no la activa; uno de la app sí, y entrega 10 de recuperación.
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/auth/2fa/enable", new { code = Totp(key, 20), password = Password })).StatusCode);
        var enabled = await client.PostAsJsonAsync("/api/v1/auth/2fa/enable", new { code = Totp(key, 0), password = Password });
        Assert.Equal(HttpStatusCode.OK, enabled.StatusCode);
        var recovery = (await enabled.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("recoveryCodes")
            .EnumerateArray().Select(c => c.GetString()!).ToList();
        Assert.Equal(10, recovery.Count);
        Assert.Equal(10, recovery.Distinct().Count());
        // Los de recuperación tampoco quedan legibles en la base.
        Assert.DoesNotContain(await StoredTokensAsync(email), t => t.Contains(recovery[0], StringComparison.OrdinalIgnoreCase));

        // La sesión con la que se activó sigue abierta.
        var me = await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/me");
        Assert.True(me.GetProperty("twoFactorEnabled").GetBoolean());

        // Entrar de nuevo: la contraseña sola no abre sesión.
        await client.PostAsync("/api/v1/auth/logout", null);
        var pending = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });
        Assert.Equal(HttpStatusCode.OK, pending.StatusCode);
        var pendingBody = await pending.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(pendingBody.GetProperty("twoFactorRequired").GetBoolean());
        Assert.False(pendingBody.TryGetProperty("email", out _));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/2fa")).StatusCode);

        // Sin haber pasado la contraseña, el código no sirve de nada.
        var stranger = NewClient();
        var expired = await stranger.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = Totp(key, 1) });
        Assert.Equal(HttpStatusCode.Unauthorized, expired.StatusCode);
        Assert.Equal("Auth.TwoFactorExpired", await TitleAsync(expired));

        // Código equivocado, y el que ya se usó para activarla tampoco vuelve a servir.
        var wrong = await client.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = Totp(key, 20) });
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        Assert.Equal("Auth.InvalidCode", await TitleAsync(wrong));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = Totp(key, 0) })).StatusCode);

        // Con el código que muestra la app (con espacio en el medio, como se lee) entra.
        var code = Totp(key, 1);
        var ok = await client.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = $"{code[..3]} {code[3..]}" });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Equal(email, (await ok.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("email").GetString());
        Assert.Equal(email, (await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/me")).GetProperty("email").GetString());
        // La cookie intermedia se consumió: no sirve para entrar otra vez.
        await client.PostAsync("/api/v1/auth/logout", null);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = Totp(key, 2) })).StatusCode);

        // Con un código de recuperación (en minúsculas, da igual) entra una sola vez.
        await LoginPendingAsync(client, email);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = recovery[0].ToLowerInvariant() })).StatusCode);
        await client.PostAsync("/api/v1/auth/logout", null);
        await LoginPendingAsync(client, email);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = recovery[0] })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = recovery[1] })).StatusCode);
        Assert.Equal(8, (await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/2fa")).GetProperty("recoveryCodesLeft").GetInt32());

        // Códigos nuevos: piden confirmar, y los viejos dejan de servir.
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/auth/2fa/recovery-codes", new { })).StatusCode);
        var renewed = await client.PostAsJsonAsync("/api/v1/auth/2fa/recovery-codes", new { password = Password });
        Assert.Equal(HttpStatusCode.OK, renewed.StatusCode);
        var fresh = (await renewed.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("recoveryCodes")
            .EnumerateArray().Select(c => c.GetString()!).ToList();
        Assert.Equal(10, fresh.Count);
        await client.PostAsync("/api/v1/auth/logout", null);
        await LoginPendingAsync(client, email);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = recovery[2] })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = fresh[0] })).StatusCode);

        // Desactivar pide la contraseña (o un código): con una equivocada, no.
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/auth/2fa/disable", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/auth/2fa/disable", new { password = "otra-clave-cualquiera" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/2fa/disable", new { password = Password })).StatusCode);
        Assert.False((await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/me")).GetProperty("twoFactorEnabled").GetBoolean());
        Assert.DoesNotContain(await StoredTokenNamesAsync(email), n => n is "AuthenticatorKey" or "RecoveryCodes");

        // Sin el segundo paso, la contraseña vuelve a alcanzar.
        await client.PostAsync("/api/v1/auth/logout", null);
        Assert.Equal(email, (await LoginAsync(client, email)).GetProperty("email").GetString());
    }

    [Fact]
    public async Task Desactivar_con_un_codigo_de_la_app()
    {
        var email = await CreateUserAsync("2fa-off");
        var client = NewClient();
        await LoginAsync(client, email);
        var key = await EnableAsync(client);

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/v1/auth/2fa/disable", new { code = Totp(key, 20) })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/2fa/disable", new { code = Totp(key, 1) })).StatusCode);
        Assert.False((await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/2fa")).GetProperty("enabled").GetBoolean());
    }

    [Fact]
    public async Task Cinco_codigos_equivocados_bloquean_la_cuenta()
    {
        var email = await CreateUserAsync("2fa-lock");
        var client = NewClient();
        await LoginAsync(client, email);
        var key = await EnableAsync(client);
        await client.PostAsync("/api/v1/auth/logout", null);

        await LoginPendingAsync(client, email);
        for (var i = 0; i < 4; i++)
            Assert.Equal("Auth.InvalidCode", await TitleAsync(await client.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = Totp(key, 20 + i) })));
        var fifth = await client.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = Totp(key, 30) });
        Assert.Equal(HttpStatusCode.TooManyRequests, fifth.StatusCode);
        Assert.Equal("Auth.LockedOut", await TitleAsync(fifth));

        // Bloqueada, ni el código bueno entra.
        var locked = await client.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = Totp(key, 1) });
        Assert.Equal("Auth.LockedOut", await TitleAsync(locked));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    // ---------------------------------------------------------------- ayudas

    private HttpClient NewClient() => _factory.CreateDefaultClient(new CookieContainerHandler());

    private async Task<string> CreateUserAsync(string tag)
    {
        var email = $"{tag}-{Guid.NewGuid():N}@test.local";
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var created = await users.CreateAsync(new AppUser { UserName = email, Email = email, DisplayName = "Test", EmailConfirmed = true }, Password);
        Assert.True(created.Succeeded, string.Join(", ", created.Errors.Select(e => e.Description)));
        return email;
    }

    private static async Task<JsonElement> LoginAsync(HttpClient client, string email)
    {
        var res = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return await res.Content.ReadFromJsonAsync<JsonElement>();
    }

    private static async Task LoginPendingAsync(HttpClient client, string email)
    {
        var body = await LoginAsync(client, email);
        Assert.True(body.GetProperty("twoFactorRequired").GetBoolean());
    }

    /// <summary>Activa la verificación en dos pasos y devuelve la clave de la app.</summary>
    private static async Task<string> EnableAsync(HttpClient client)
    {
        var setup = await (await client.PostAsJsonAsync("/api/v1/auth/2fa/setup", new { })).Content.ReadFromJsonAsync<JsonElement>();
        var key = setup.GetProperty("sharedKey").GetString()!;
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/auth/2fa/enable", new { code = Totp(key, 0), password = Password })).StatusCode);
        return key;
    }

    private async Task<List<string>> StoredTokensAsync(string email)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppIdentityDbContext>();
        var id = (await db.Users.SingleAsync(u => u.Email == email)).Id;
        return await db.UserTokens.Where(t => t.UserId == id).Select(t => t.Value ?? string.Empty).ToListAsync();
    }

    private async Task<List<string>> StoredTokenNamesAsync(string email)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppIdentityDbContext>();
        var id = (await db.Users.SingleAsync(u => u.Email == email)).Id;
        return await db.UserTokens.Where(t => t.UserId == id).Select(t => t.Name).ToListAsync();
    }

    private static async Task<string?> TitleAsync(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString();

    private static string Raw(string sharedKey) => TotpCodes.Raw(sharedKey);

    private static string Totp(string sharedKey, int steps) => TotpCodes.At(sharedKey, steps);
}
