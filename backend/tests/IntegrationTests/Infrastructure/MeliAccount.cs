using System.Web;
using Api.Meli;
using MercadoLibre.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Una cuenta de Mercado Libre para los tests: por el OAuth de verdad (contra <see cref="FakeHttp"/>) o sembrada
/// directo en la base, con los tokens cifrados como los guarda el OAuth.
/// </summary>
public static class MeliAccount
{
    public const string Api = "https://api.mercadolibre.com";

    /// <summary>El canje de tokens de Mercado Libre devuelve siempre estos tokens para ese vendedor.</summary>
    public static void StubTokens(ApiFactory factory, long userId, int expiresIn = 21_600) =>
        factory.ExternalHttp.OnJson(HttpMethod.Post, $"{Api}/oauth/token", new
        {
            access_token = "APP_USR-meli",
            refresh_token = "TG-meli",
            user_id = userId,
            expires_in = expiresIn,
        });

    /// <summary>Un comercio con una cuenta de ML conectada por el OAuth (sin ventas previas).</summary>
    public static async Task<(Merchant Merchant, long UserId)> ConnectAsync(ApiFactory factory, string tag)
    {
        var merchant = await Merchant.CreateAsync(factory, tag);
        var userId = Random.Shared.NextInt64(100_000_000, 900_000_000);

        var connect = await merchant.PostAsync("/api/v1/admin/meli/connect", new { });
        var state = HttpUtility.ParseQueryString(new Uri(connect.GetProperty("authUrl").GetString()!).Query)["state"]!;
        StubTokens(factory, userId);
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/users/me", new { id = userId, nickname = "TIENDA_ML", site_id = "MLA" });
        factory.ExternalHttp.OnJson(HttpMethod.Get, $"{Api}/orders/search", new { results = Array.Empty<object>() });

        var browser = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var callback = await browser.GetAsync($"/api/v1/meli/oauth/callback?code=c&state={Uri.EscapeDataString(state)}");
        Assert.EndsWith("meli=connected", callback.Headers.Location!.ToString());
        return (merchant, userId);
    }

    /// <summary>Una conexión sembrada en la base para esa tienda (sin pasar por el OAuth). Devuelve el vendedor.</summary>
    public static async Task<long> SeedAsync(ApiFactory factory, Guid tenantId, bool demo = false)
    {
        using var scope = factory.Services.CreateScope();
        var tokens = scope.ServiceProvider.GetRequiredService<MeliTokenService>();
        var db = scope.ServiceProvider.GetRequiredService<MeliDbContext>();
        var sellerId = Random.Shared.NextInt64(100_000_000, 900_000_000);
        var connection = MeliConnection.Create(tenantId, sellerId, "TIENDA_IA", "MLA",
            tokens.Protect("APP_USR-access"), tokens.Protect("TG-refresh"), DateTime.UtcNow.AddHours(6)).Value;
        if (demo) connection.MarkDemo();
        db.Connections.Add(connection);
        await db.SaveChangesAsync();
        return sellerId;
    }
}
