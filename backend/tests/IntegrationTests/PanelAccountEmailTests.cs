using System.Net;
using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// "Olvidé mi contraseña" y "reenviar la verificación" del panel no esperan al
/// proveedor de email: si lo esperaran solo cuando la cuenta existe, el tiempo
/// de respuesta diría qué emails tienen cuenta aunque la respuesta sea
/// siempre 204. Se prueba con Resend "colgado": el endpoint contesta igual, y
/// el email sale cuando Resend responde.
/// </summary>
[Collection("api")]
public sealed class PanelAccountEmailTests(ApiFactory factory)
{
    [Theory]
    [InlineData("/api/v1/auth/forgot", true)]
    [InlineData("/api/v1/auth/resend-verification", false)]
    public async Task El_email_sale_fuera_del_request(string path, bool confirmed)
    {
        var email = $"fuera-{Guid.NewGuid():N}@test.local";
        using (var scope = factory.Services.CreateScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            Assert.True((await users.CreateAsync(
                new AppUser { UserName = email, Email = email, DisplayName = "Test", EmailConfirmed = confirmed },
                "Clave-larga-123")).Succeeded);
        }

        using var resend = new ManualResetEventSlim(false);
        factory.ExternalHttp.On(HttpMethod.Post, ApiFactory.ResendEmails, (_, _) =>
        {
            resend.Wait(TimeSpan.FromSeconds(30));
            return FakeHttp.Json(new { id = "re_test" });
        });
        try
        {
            var request = factory.CreateClient().PostAsJsonAsync(path, new { email });
            var answered = await Task.WhenAny(request, Task.Delay(TimeSpan.FromSeconds(10))) == request;
            Assert.True(answered, "El endpoint esperó al proveedor de email.");
            Assert.Equal(HttpStatusCode.NoContent, (await request).StatusCode);
        }
        finally
        {
            resend.Set();
            factory.AcceptAllEmails();
        }

        // Y el email igual sale.
        for (var i = 0; i < 200 && factory.ExternalHttp.EmailsTo(email).Count == 0; i++)
            await Task.Delay(25);
        var sent = Assert.Single(factory.ExternalHttp.EmailsTo(email));
        Assert.Contains("token=", sent.Html);
    }
}
