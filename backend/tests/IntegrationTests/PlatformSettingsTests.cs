using System.Net;
using System.Text.Json;
using Api.Auth;
using Api.Notifications;
using Api.Platform;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace IntegrationTests;

[Collection("api")]
public sealed class PlatformSettingsTests(ApiFactory factory)
{
    [Fact]
    public async Task Duenio_comun_o_anonimo_no_puede_leer_ni_editar_configuracion_de_plataforma()
    {
        var owner = await Merchant.CreateAsync(factory, "plat");

        // El dueño común (como admin@puenteoriente.com.ar) tiene isSuperAdmin = false.
        var me = await owner.GetAsync("/api/v1/auth/me");
        Assert.False(me.GetProperty("isSuperAdmin").GetBoolean());

        // Anónimo -> 401.
        var anon = owner.Anonymous();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync("/api/v1/admin/platform-settings")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anon.PutAsJsonAsync("/api/v1/admin/platform-settings", new { })).StatusCode);

        // Dueño común -> 403 Auth.SuperAdminRequired.
        var getRes = await owner.SendAsync(HttpMethod.Get, "/api/v1/admin/platform-settings");
        Assert.Equal(HttpStatusCode.Forbidden, getRes.StatusCode);
        var problem = await getRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Auth.SuperAdminRequired", problem.GetProperty("title").GetString());

        var putRes = await owner.SendAsync(HttpMethod.Put, "/api/v1/admin/platform-settings", new { aiDisabled = true });
        Assert.Equal(HttpStatusCode.Forbidden, putRes.StatusCode);
    }

    [Fact]
    public async Task Superadmin_edita_palancas_y_secretos_cifrados_en_caliente_y_restaura_a_env()
    {
        var superEmail = $"super-{Guid.NewGuid():N}@tiendafy.local";
        const string password = "PasswordSuper123!";

        // 1. Crear superadmin por CLI (como en el servidor).
        var (outcome, error) = await SuperAdminCli.RunAsync(factory.Services, superEmail, password, "Superadmin Real");
        Assert.Equal(SuperAdminCliOutcome.Created, outcome);
        Assert.Null(error);

        var client = factory.CreateDefaultClient(new CookieContainerHandler());
        var loginRes = await client.PostAsJsonAsync("/api/v1/auth/login", new { email = superEmail, password });
        Assert.Equal(HttpStatusCode.OK, loginRes.StatusCode);
        var loginBody = await loginRes.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(loginBody.GetProperty("isSuperAdmin").GetBoolean());

        var keysToClean = new[]
        {
            PlatformSettingsService.KeyAiDisabled,
            PlatformSettingsService.KeyTurnstileSiteKey,
            PlatformSettingsService.KeyEmailResendApiKey,
        };

        try
        {
            // 2. Lectura inicial.
            var initialRes = await client.GetAsync("/api/v1/admin/platform-settings");
            Assert.Equal(HttpStatusCode.OK, initialRes.StatusCode);
            var initial = await initialRes.Content.ReadFromJsonAsync<JsonElement>();
            Assert.True(initial.GetProperty("infrastructure").GetArrayLength() >= 6);

            // 3. Guardar una palanca, un texto y un secreto desde el panel.
            var putRes = await client.PutAsJsonAsync("/api/v1/admin/platform-settings", new
            {
                aiDisabled = true,
                values = new Dictionary<string, string?>
                {
                    [PlatformSettingsService.KeyTurnstileSiteKey] = "0x4AAAAAA_site_live",
                    [PlatformSettingsService.KeyEmailResendApiKey] = "re_live_super_secret_9876",
                },
            });
            Assert.Equal(HttpStatusCode.OK, putRes.StatusCode);
            var updatedRaw = await putRes.Content.ReadAsStringAsync();
            // El secreto jamás viaja en claro en la respuesta.
            Assert.DoesNotContain("re_live_super_secret_9876", updatedRaw, StringComparison.Ordinal);

            var updated = JsonDocument.Parse(updatedRaw).RootElement;
            Assert.True(updated.GetProperty("switches").GetProperty("aiDisabled").GetProperty("value").GetBoolean());
            Assert.Equal("database", updated.GetProperty("switches").GetProperty("aiDisabled").GetProperty("source").GetString());

            var siteKeyNode = updated.GetProperty("services").GetProperty("turnstile").GetProperty("siteKey");
            Assert.Equal("0x4AAAAAA_site_live", siteKeyNode.GetProperty("value").GetString());
            Assert.Equal("database", siteKeyNode.GetProperty("source").GetString());

            var resendNode = updated.GetProperty("services").GetProperty("email").GetProperty("resendApiKey");
            Assert.True(resendNode.GetProperty("configured").GetBoolean());
            Assert.Equal("9876", resendNode.GetProperty("last4").GetString());
            Assert.Equal("database", resendNode.GetProperty("source").GetString());

            // 4. En la base de datos el secreto está cifrado con DataProtection.
            using (var scope = factory.Services.CreateScope())
            {
                var idDb = scope.ServiceProvider.GetRequiredService<AppIdentityDbContext>();
                var secretRow = await idDb.PlatformSettings.AsNoTracking()
                    .SingleAsync(r => r.Key == PlatformSettingsService.KeyEmailResendApiKey);
                Assert.DoesNotContain("re_live_super_secret_9876", secretRow.Value, StringComparison.Ordinal);
            }

            // 5. Impacta en caliente en IConfiguration e IOptions<EmailOptions> sin reiniciar.
            var cfg = factory.Services.GetRequiredService<IConfiguration>();
            Assert.True(cfg.GetValue<bool>(PlatformSettingsService.KeyAiDisabled));
            Assert.Equal("0x4AAAAAA_site_live", cfg[PlatformSettingsService.KeyTurnstileSiteKey]);

            var emailOpts = factory.Services.GetRequiredService<IOptions<EmailOptions>>();
            Assert.Equal("re_live_super_secret_9876", emailOpts.Value.ResendApiKey);

            // 6. Restaurar al valor de .env.prod borra el override de la base.
            var clearRes = await client.PutAsJsonAsync("/api/v1/admin/platform-settings", new
            {
                clearKeys = keysToClean,
            });
            Assert.Equal(HttpStatusCode.OK, clearRes.StatusCode);
            var cleared = await clearRes.Content.ReadFromJsonAsync<JsonElement>();
            Assert.NotEqual("database", cleared.GetProperty("switches").GetProperty("aiDisabled").GetProperty("source").GetString());
            Assert.False(cfg.GetValue<bool>(PlatformSettingsService.KeyAiDisabled));
        }
        finally
        {
            await client.PutAsJsonAsync("/api/v1/admin/platform-settings", new { clearKeys = keysToClean });
        }
    }
}

