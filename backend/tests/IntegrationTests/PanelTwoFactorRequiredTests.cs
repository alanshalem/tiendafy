using System.Net;
using System.Text.Json;
using Api.Auth;
using Identity.Infrastructure;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// La verificación en dos pasos obligatoria para dueños y administradores
/// (<c>Auth:RequireTwoFactorForAdmins</c>): quien tiene ese rol en alguna
/// tienda no usa el panel sin activarla. Al entrar con la contraseña queda en
/// un estado intermedio que solo sirve para configurarla; una sesión abierta
/// de antes recibe un 403 específico; no la puede desactivar (sí renovar los
/// códigos o pasarla a otra app); y quien opera la plataforma la puede borrar
/// con <c>dotnet Api.dll reset-2fa</c>.
///
/// <para>
/// El resto de los tests corre con la exigencia apagada (como dev y el e2e);
/// estos levantan otra API con la exigencia prendida, sobre la misma base.
/// </para>
/// </summary>
[Collection("api")]
public sealed class PanelTwoFactorRequiredTests(ApiFactory factory)
{
    private const string Password = "Clave-larga-123";

    private WebApplicationFactory<Program> Required() =>
        factory.WithWebHostBuilder(b => b.UseSetting("Auth:RequireTwoFactorForAdmins", "true"));

    [Fact]
    public async Task Un_dueno_sin_verificacion_la_configura_al_entrar_y_recien_ahi_entra()
    {
        await using var app = Required();
        var store = await Merchant.CreateAsync(factory, "2fa-req");
        var (email, _) = await CreateMemberAsync(app, store.TenantId, Roles.Owner, "dueno");
        var client = NewClient(app);

        // La contraseña sola no abre la sesión: pide configurar el segundo paso.
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var body = await login.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("twoFactorSetupRequired").GetBoolean());
        Assert.False(body.TryGetProperty("email", out _));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);

        // Con ese estado se puede configurar: estado, clave y QR, y confirmar.
        var status = await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/2fa");
        Assert.False(status.GetProperty("enabled").GetBoolean());
        var setup = await client.PostAsJsonAsync("/api/v1/auth/2fa/setup", new { });
        Assert.Equal(HttpStatusCode.OK, setup.StatusCode);
        var key = (await setup.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("sharedKey").GetString()!;

        // Activarla también pide la contraseña (la que se acaba de escribir).
        Assert.Equal("Auth.PasswordRequired", await TitleAsync(
            await client.PostAsJsonAsync("/api/v1/auth/2fa/enable", new { code = TotpCodes.At(key, 0) })));
        var enabled = await client.PostAsJsonAsync("/api/v1/auth/2fa/enable", new { code = TotpCodes.At(key, 0), password = Password });
        Assert.Equal(HttpStatusCode.OK, enabled.StatusCode);
        var result = await enabled.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(10, result.GetProperty("recoveryCodes").GetArrayLength());
        Assert.Equal(email, result.GetProperty("user").GetProperty("email").GetString());

        // Activarla abrió la sesión: el panel entero ya responde.
        var me = await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/me");
        Assert.True(me.GetProperty("twoFactorEnabled").GetBoolean());
        Assert.True(me.GetProperty("twoFactorRequired").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/tenants")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await store.SendAsync(client, HttpMethod.Get, "/api/v1/orders")).StatusCode);

        // La próxima vez entra como cualquiera con la verificación activa.
        await client.PostAsync("/api/v1/auth/logout", null);
        var again = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });
        Assert.True((await again.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("twoFactorRequired").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = TotpCodes.At(key, 1) })).StatusCode);
    }

    [Fact]
    public async Task El_estado_intermedio_solo_sirve_para_configurar_la_verificacion()
    {
        await using var app = Required();
        var store = await Merchant.CreateAsync(factory, "2fa-mid");
        var (email, _) = await CreateMemberAsync(app, store.TenantId, Roles.Admin, "admin");
        var client = NewClient(app);
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });
        Assert.True((await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("twoFactorSetupRequired").GetBoolean());

        // Ningún otro endpoint lo acepta como sesión.
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/tenants")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await store.SendAsync(client, HttpMethod.Get, "/api/v1/orders")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await store.SendAsync(client, HttpMethod.Get, "/api/v1/me/permissions")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await store.SendAsync(client, HttpMethod.Post, "/api/v1/products", new { name = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/auth/2fa/disable", new { password = Password })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/auth/2fa/recovery-codes", new { password = Password })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/auth/2fa/relink", new { password = Password, code = "123456" })).StatusCode);
        // Ni como segundo paso del login: no hay código que valga sin la verificación activa.
        Assert.Equal("Auth.TwoFactorExpired", await TitleAsync(
            await client.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = "123456" })));

        // Y al revés: el paso intermedio de quien ya la tiene (falta el código) no sirve para configurar.
        var (other, _) = await CreateMemberAsync(app, store.TenantId, Roles.Owner, "otro");
        var otherClient = NewClient(app);
        await otherClient.PostAsJsonAsync("/api/v1/auth/login", new { email = other, password = Password });
        var key = await EnableAsync(otherClient);
        await otherClient.PostAsync("/api/v1/auth/logout", null);
        var pending = await otherClient.PostAsJsonAsync("/api/v1/auth/login", new { email = other, password = Password });
        Assert.True((await pending.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("twoFactorRequired").GetBoolean());
        Assert.Equal(HttpStatusCode.Unauthorized, (await otherClient.GetAsync("/api/v1/auth/2fa")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await otherClient.PostAsJsonAsync("/api/v1/auth/2fa/setup", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await otherClient.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = TotpCodes.At(key, 1) })).StatusCode);
    }

    [Fact]
    public async Task Una_sesion_abierta_sin_verificacion_recibe_un_403_especifico_hasta_configurarla()
    {
        await using var app = Required();
        var store = await Merchant.CreateAsync(factory, "2fa-old");
        // Entra cuando todavía no tiene un rol que la exija (como una sesión de antes del deploy)...
        var (email, userId) = await CreateUserAsync(app, "vieja");
        var client = NewClient(app);
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });
        Assert.Equal(email, (await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("email").GetString());

        // ...y pasa a ser administradora de una tienda.
        using (var scope = app.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IMembershipService>().AddAsync(userId, store.TenantId, Roles.Admin);

        foreach (var res in new[]
        {
            await client.GetAsync("/api/v1/tenants"),
            await store.SendAsync(client, HttpMethod.Get, "/api/v1/orders"),
            await store.SendAsync(client, HttpMethod.Get, "/api/v1/me/permissions"),
            await store.SendAsync(client, HttpMethod.Post, "/api/v1/products", new { name = "x" }),
        })
        {
            Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
            Assert.Equal("Auth.TwoFactorSetupRequired", await TitleAsync(res));
        }

        // /auth/me responde (con lo que falta) y la configuración anda con esa sesión.
        var me = await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/me");
        Assert.True(me.GetProperty("twoFactorRequired").GetBoolean());
        Assert.False(me.GetProperty("twoFactorEnabled").GetBoolean());
        await EnableAsync(client);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/tenants")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await store.SendAsync(client, HttpMethod.Get, "/api/v1/orders")).StatusCode);

        // Cerrar la sesión también anda sin haberla configurado.
        var (other, otherId) = await CreateUserAsync(app, "vieja2");
        var otherClient = NewClient(app);
        await otherClient.PostAsJsonAsync("/api/v1/auth/login", new { email = other, password = Password });
        using (var scope = app.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<IMembershipService>().AddAsync(otherId, store.TenantId, Roles.Owner);
        Assert.Equal(HttpStatusCode.NoContent, (await otherClient.PostAsync("/api/v1/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await otherClient.GetAsync("/api/v1/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Quien_la_necesita_no_la_desactiva_pero_renueva_los_codigos_y_cambia_de_app()
    {
        await using var app = Required();
        var store = await Merchant.CreateAsync(factory, "2fa-keep");
        var (email, _) = await CreateMemberAsync(app, store.TenantId, Roles.Owner, "keep");
        var client = NewClient(app);
        await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });
        var key = await EnableAsync(client);

        var disable = await client.PostAsJsonAsync("/api/v1/auth/2fa/disable", new { password = Password });
        Assert.Equal(HttpStatusCode.Forbidden, disable.StatusCode);
        Assert.Equal("Auth.TwoFactorRequired", await TitleAsync(disable));
        Assert.True((await client.GetFromJsonAsync<JsonElement>("/api/v1/auth/2fa")).GetProperty("enabled").GetBoolean());

        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/auth/2fa/recovery-codes", new { password = Password })).StatusCode);

        // Pasarla a otra app pide la contraseña Y un código.
        Assert.Equal("Auth.ConfirmationRequired", await TitleAsync(
            await client.PostAsJsonAsync("/api/v1/auth/2fa/relink", new { password = Password })));
        Assert.Equal("Auth.ConfirmationRequired", await TitleAsync(
            await client.PostAsJsonAsync("/api/v1/auth/2fa/relink", new { code = TotpCodes.At(key, 1) })));
        Assert.Equal("Auth.InvalidPassword", await TitleAsync(
            await client.PostAsJsonAsync("/api/v1/auth/2fa/relink", new { password = "otra-clave-larga", code = TotpCodes.At(key, 1) })));
        Assert.Equal("Auth.InvalidCode", await TitleAsync(
            await client.PostAsJsonAsync("/api/v1/auth/2fa/relink", new { password = Password, code = TotpCodes.At(key, 20) })));

        var relink = await client.PostAsJsonAsync("/api/v1/auth/2fa/relink", new { password = Password, code = TotpCodes.At(key, 1) });
        Assert.Equal(HttpStatusCode.OK, relink.StatusCode);
        var started = await relink.Content.ReadFromJsonAsync<JsonElement>();
        var newKey = started.GetProperty("sharedKey").GetString()!;
        var ticket = started.GetProperty("ticket").GetString()!;
        Assert.NotEqual(TotpCodes.Raw(key), TotpCodes.Raw(newKey));
        Assert.StartsWith("<svg", started.GetProperty("qrSvg").GetString());

        // Hasta confirmar, la app vieja sigue siendo la que vale (la nueva no está en la base).
        Assert.DoesNotContain(await StoredTokensAsync(app, email), t => t.Contains(TotpCodes.Raw(newKey), StringComparison.OrdinalIgnoreCase));

        // Se confirma con un código de la app nueva; uno de la vieja no sirve.
        Assert.Equal("Auth.InvalidCode", await TitleAsync(
            await client.PostAsJsonAsync("/api/v1/auth/2fa/relink/confirm", new { ticket, code = TotpCodes.At(key, 2) })));
        Assert.Equal("Auth.InvalidTicket", await TitleAsync(
            await client.PostAsJsonAsync("/api/v1/auth/2fa/relink/confirm", new { ticket = ticket + "x", code = TotpCodes.At(newKey, 0) })));
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PostAsJsonAsync("/api/v1/auth/2fa/relink/confirm", new { ticket, code = TotpCodes.At(newKey, 0) })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/tenants")).StatusCode);

        // El ticket es de esta persona: otra con sesión no lo puede usar.
        var (intruder, _) = await CreateMemberAsync(app, store.TenantId, Roles.Vendedor, "intruso");
        var intruderClient = NewClient(app);
        await intruderClient.PostAsJsonAsync("/api/v1/auth/login", new { email = intruder, password = Password });
        await EnableAsync(intruderClient);
        Assert.Equal("Auth.InvalidTicket", await TitleAsync(
            await intruderClient.PostAsJsonAsync("/api/v1/auth/2fa/relink/confirm", new { ticket, code = TotpCodes.At(newKey, 1) })));

        // Al entrar, vale la app nueva y no la vieja.
        await client.PostAsync("/api/v1/auth/logout", null);
        await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });
        Assert.Equal("Auth.InvalidCode", await TitleAsync(
            await client.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = TotpCodes.At(key, -1) })));
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/auth/login/2fa", new { code = TotpCodes.At(newKey, 1) })).StatusCode);
    }

    [Fact]
    public async Task Un_vendedor_sin_verificacion_entra_como_siempre()
    {
        await using var app = Required();
        var store = await Merchant.CreateAsync(factory, "2fa-vend");
        var (email, _) = await CreateMemberAsync(app, store.TenantId, Roles.Vendedor, "vendedor");
        var client = NewClient(app);

        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });
        var body = await login.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(email, body.GetProperty("email").GetString());
        Assert.False(body.GetProperty("twoFactorRequired").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/tenants")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await store.SendAsync(client, HttpMethod.Get, "/api/v1/orders")).StatusCode);

        // Y la puede desactivar si la activó.
        await EnableAsync(client);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/2fa/disable", new { password = Password })).StatusCode);
    }

    [Fact]
    public async Task Con_la_exigencia_apagada_un_dueno_entra_y_la_desactiva_como_antes()
    {
        var store = await Merchant.CreateAsync(factory, "2fa-off");
        var (email, _) = await CreateMemberAsync(factory, store.TenantId, Roles.Owner, "off");
        var client = NewClient(factory);

        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });
        var body = await login.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(email, body.GetProperty("email").GetString());
        Assert.False(body.GetProperty("twoFactorRequired").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await store.SendAsync(client, HttpMethod.Get, "/api/v1/orders")).StatusCode);

        await EnableAsync(client);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/v1/auth/2fa/disable", new { password = Password })).StatusCode);
    }

    [Fact]
    public async Task El_comando_reset_2fa_la_borra_y_la_pide_de_nuevo_al_entrar()
    {
        await using var app = Required();
        var store = await Merchant.CreateAsync(factory, "2fa-reset");
        var (email, _) = await CreateMemberAsync(app, store.TenantId, Roles.Owner, "reset");
        var client = NewClient(app);
        await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });
        await EnableAsync(client);

        // Con el email como lo tipee quien opera (mayúsculas, espacios).
        Assert.Equal(TwoFactorResetOutcome.Reset, await PanelTwoFactorReset.RunAsync(app.Services, $"  {email.ToUpperInvariant()} "));
        Assert.DoesNotContain(await StoredTokenNamesAsync(app, email), n => n is "AuthenticatorKey" or "RecoveryCodes");

        // La sesión que había deja de servir (cambió el sello de seguridad)...
        Assert.Equal(HttpStatusCode.Unauthorized, (await NewSessionCheckAsync(app, client)).StatusCode);

        // ...y al entrar, la pide configurar de nuevo.
        var fresh = NewClient(app);
        var login = await fresh.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });
        Assert.True((await login.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("twoFactorSetupRequired").GetBoolean());

        Assert.Equal(TwoFactorResetOutcome.NotEnabled, await PanelTwoFactorReset.RunAsync(app.Services, email));
        Assert.Equal(TwoFactorResetOutcome.NotFound, await PanelTwoFactorReset.RunAsync(app.Services, "nadie@test.local"));
    }

    // ---------------------------------------------------------------- ayudas

    private static HttpClient NewClient(WebApplicationFactory<Program> app) => app.CreateDefaultClient(new CookieContainerHandler());

    /// <summary>
    /// El sello de seguridad se revisa cada tanto (no en cada pedido): para ver
    /// que la sesión cayó sin esperar, se fuerza la revisión en este pedido.
    /// </summary>
    private static Task<HttpResponseMessage> NewSessionCheckAsync(WebApplicationFactory<Program> app, HttpClient client)
    {
        var options = app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<SecurityStampValidatorOptions>>().Value;
        options.ValidationInterval = TimeSpan.Zero;
        return client.GetAsync("/api/v1/auth/me");
    }

    private static async Task<(string Email, Guid Id)> CreateUserAsync(WebApplicationFactory<Program> app, string tag)
    {
        var email = $"{tag}-{Guid.NewGuid():N}@test.local";
        using var scope = app.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var user = new AppUser { UserName = email, Email = email, DisplayName = "Test", EmailConfirmed = true };
        var created = await users.CreateAsync(user, Password);
        Assert.True(created.Succeeded, string.Join(", ", created.Errors.Select(e => e.Description)));
        return (email, user.Id);
    }

    private static async Task<(string Email, Guid Id)> CreateMemberAsync(WebApplicationFactory<Program> app, Guid tenantId, string role, string tag)
    {
        var (email, id) = await CreateUserAsync(app, tag);
        using var scope = app.Services.CreateScope();
        Assert.Equal(MembershipChange.Done,
            await scope.ServiceProvider.GetRequiredService<IMembershipService>().AddAsync(id, tenantId, role));
        return (email, id);
    }

    /// <summary>Activa la verificación con la sesión (o el paso intermedio) del cliente y devuelve la clave.</summary>
    private static async Task<string> EnableAsync(HttpClient client)
    {
        var setup = await client.PostAsJsonAsync("/api/v1/auth/2fa/setup", new { });
        Assert.Equal(HttpStatusCode.OK, setup.StatusCode);
        var key = (await setup.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("sharedKey").GetString()!;
        var enabled = await client.PostAsJsonAsync("/api/v1/auth/2fa/enable", new { code = TotpCodes.At(key, 0), password = Password });
        Assert.Equal(HttpStatusCode.OK, enabled.StatusCode);
        return key;
    }

    private static async Task<List<string>> StoredTokensAsync(WebApplicationFactory<Program> app, string email)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppIdentityDbContext>();
        var id = (await db.Users.SingleAsync(u => u.Email == email)).Id;
        return await db.UserTokens.Where(t => t.UserId == id).Select(t => t.Value ?? string.Empty).ToListAsync();
    }

    private static async Task<List<string>> StoredTokenNamesAsync(WebApplicationFactory<Program> app, string email)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppIdentityDbContext>();
        var id = (await db.Users.SingleAsync(u => u.Email == email)).Id;
        return await db.UserTokens.Where(t => t.UserId == id).Select(t => t.Name).ToListAsync();
    }

    private static async Task<string?> TitleAsync(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString();
}
