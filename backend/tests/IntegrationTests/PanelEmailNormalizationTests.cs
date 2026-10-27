using System.Net;
using System.Text;
using System.Text.Json;
using Identity.Infrastructure;
using Identity.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// El email del panel se busca con NFKC + mayúsculas (PanelLookupNormalizer):
/// la misma dirección escrita con otra forma Unicode entra a la misma cuenta,
/// y las cuentas guardadas con la clave de antes siguen entrando.
/// </summary>
[Collection("api")]
public sealed class PanelEmailNormalizationTests
{
    private const string Password = "Clave-larga-123";
    private readonly ApiFactory _factory;

    public PanelEmailNormalizationTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task El_email_se_busca_con_NFKC_y_las_cuentas_viejas_siguen_entrando()
    {
        // Letras de ancho completo: NFKC las lleva a las comunes.
        var email = await CreateUserAsync("nfkc");
        var fullWidth = new string([.. email.Select(c => c is >= 'a' and <= 'z' ? (char)(c - 'a' + '\uff41') : c)]);
        Assert.NotEqual(email, fullWidth);
        Assert.Equal(email, (await LoginAsync(NewClient(), fullWidth)).GetProperty("email").GetString());

        // Una cuenta guardada con la clave de antes (solo mayúsculas, sin NFKC):
        // entra, y queda guardada con la clave nueva.
        var legacyEmail = $"jose\u0301-{Guid.NewGuid():N}@test.local";
        var userId = await CreateLegacyUserAsync(legacyEmail);
        var login = await NewClient().PostAsJsonAsync("/api/v1/auth/login", new { email = legacyEmail, password = Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppIdentityDbContext>();
            var user = await db.Users.AsNoTracking().SingleAsync(u => u.Id == userId);
            Assert.Equal(legacyEmail.Normalize(NormalizationForm.FormKC).ToUpperInvariant(), user.NormalizedEmail);
            Assert.Equal(user.NormalizedEmail, user.NormalizedUserName);
        }

        // Ya re-normalizada, también la encuentra escrita con la "é" compuesta.
        var composed = legacyEmail.Normalize(NormalizationForm.FormC);
        Assert.NotEqual(legacyEmail, composed);
        Assert.Equal(HttpStatusCode.OK, (await NewClient().PostAsJsonAsync("/api/v1/auth/login", new { email = composed, password = Password })).StatusCode);
    }

    private HttpClient NewClient() => _factory.CreateClient();

    private async Task<string> CreateUserAsync(string tag)
    {
        var email = $"{tag}-{Guid.NewGuid():N}@test.local";
        using var scope = _factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var created = await users.CreateAsync(new AppUser { UserName = email, Email = email, DisplayName = "Test", EmailConfirmed = true }, Password);
        Assert.True(created.Succeeded, string.Join(", ", created.Errors.Select(e => e.Description)));
        return email;
    }

    /// <summary>
    /// Una cuenta como las de antes del cambio: email no ASCII guardado con la
    /// clave vieja (solo mayúsculas). Se escribe directo en la base porque hoy
    /// Identity no deja crear un usuario con letras no ASCII en el nombre.
    /// </summary>
    private async Task<Guid> CreateLegacyUserAsync(string email)
    {
        var placeholder = await CreateUserAsync("legacy");
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppIdentityDbContext>();
        var user = await db.Users.SingleAsync(u => u.Email == placeholder);
        user.Email = email;
        user.UserName = email;
        user.NormalizedEmail = email.ToUpperInvariant();
        user.NormalizedUserName = email.ToUpperInvariant();
        await db.SaveChangesAsync();
        return user.Id;
    }

    private static async Task<JsonElement> LoginAsync(HttpClient client, string email)
    {
        var res = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = Password });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return await res.Content.ReadFromJsonAsync<JsonElement>();
    }
}
