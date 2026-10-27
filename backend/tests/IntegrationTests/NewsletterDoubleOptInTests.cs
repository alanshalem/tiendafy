using System.Net;
using System.Text.Json;
using Customers.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// El newsletter con doble confirmación: dejar el email en la tienda manda un
/// mail con un link (de un solo uso, guardado como hash) y recién al tocarlo
/// la persona queda suscripta y le llegan las campañas. Así nadie anota el
/// email de otro. Las suscripciones de antes siguen como estaban.
/// </summary>
[Collection("api")]
public sealed class NewsletterDoubleOptInTests(ApiFactory factory)
{
    [Fact]
    public async Task Suscribirse_deja_pendiente_hasta_tocar_el_link_del_mail()
    {
        var store = await Merchant.CreateAsync(factory, "nlc");
        var shopper = new Shopper(store);
        var email = $"news-{Guid.NewGuid():N}@mail.com";

        var res = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/newsletter", new { email, source = "footer" });
        Assert.True(res.GetProperty("ok").GetBoolean());

        // Pendiente: no está en la audiencia de las campañas.
        Assert.DoesNotContain(email, await SubscribersAsync(store));

        // El mail con el link, a la tienda (no al Origin del pedido).
        var mail = await factory.ExternalHttp.WaitForEmailAsync(email, m => m.Html.Contains("/suscripcion/confirmar?token=", StringComparison.Ordinal));
        Assert.StartsWith("Confirmá tu suscripción", mail.Subject, StringComparison.Ordinal);
        Assert.Contains($"http://{store.Subdomain}.localhost:3000/suscripcion/confirmar?token=", mail.Html, StringComparison.Ordinal);
        var token = Shopper.TokenFrom(mail.Html);

        // Lo que queda en la base es el hash, no el token.
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CustomersDbContext>();
            var row = await db.NewsletterSubscribers.IgnoreQueryFilters().SingleAsync(x => x.TenantId == store.TenantId && x.Email == email);
            Assert.Null(row.ConfirmedAtUtc);
            Assert.Equal(ShopperTokenHash.Of(token), row.ConfirmTokenHash);
        }

        // El link de otra tienda no sirve.
        var other = new Shopper(await Merchant.CreateAsync(factory, "nlo"));
        Assert.Equal(HttpStatusCode.BadRequest, (await other.SendAsync(HttpMethod.Post, "/api/v1/newsletter/confirm", new { token })).StatusCode);

        // Lo toca: confirmada y en la audiencia.
        await shopper.ExpectOkAsync(HttpMethod.Post, "/api/v1/newsletter/confirm", new { token });
        Assert.Contains(email, await SubscribersAsync(store));

        // El link es de un solo uso, y suscribirse de nuevo no manda otro mail.
        var reused = await shopper.SendAsync(HttpMethod.Post, "/api/v1/newsletter/confirm", new { token });
        Assert.Equal(HttpStatusCode.BadRequest, reused.StatusCode);
        Assert.Equal("Newsletter.InvalidToken", await TitleAsync(reused));
        var before = factory.ExternalHttp.EmailsTo(email).Count;
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/newsletter", new { email });
        await Task.Delay(300);
        Assert.Equal(before, factory.ExternalHttp.EmailsTo(email).Count);
    }

    [Fact]
    public async Task Un_link_vencido_no_confirma_y_suscribirse_de_nuevo_manda_otro()
    {
        var store = await Merchant.CreateAsync(factory, "nlv");
        var shopper = new Shopper(store);
        var email = $"venc-{Guid.NewGuid():N}@mail.com";
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/newsletter", new { email });
        var first = Shopper.TokenFrom((await factory.ExternalHttp.WaitForEmailAsync(email, m => m.Html.Contains("token=", StringComparison.Ordinal))).Html);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CustomersDbContext>();
            await db.NewsletterSubscribers.IgnoreQueryFilters().Where(x => x.TenantId == store.TenantId && x.Email == email)
                .ExecuteUpdateAsync(u => u.SetProperty(x => x.ConfirmTokenExpiresAtUtc, DateTime.UtcNow.AddMinutes(-1)));
        }
        var expired = await shopper.SendAsync(HttpMethod.Post, "/api/v1/newsletter/confirm", new { token = first });
        Assert.Equal(HttpStatusCode.BadRequest, expired.StatusCode);
        Assert.Equal("Newsletter.TokenExpired", await TitleAsync(expired));

        // Se suscribe otra vez: link nuevo, el viejo ya no sirve.
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/newsletter", new { email });
        string second = first;
        for (var i = 0; i < 100 && second == first; i++)
        {
            second = Shopper.TokenFrom(factory.ExternalHttp.EmailsTo(email).Last().Html);
            if (second == first) await Task.Delay(50);
        }
        Assert.NotEqual(first, second);
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/newsletter/confirm", new { token = first })).StatusCode);
        await shopper.ExpectOkAsync(HttpMethod.Post, "/api/v1/newsletter/confirm", new { token = second });
        Assert.Contains(email, await SubscribersAsync(store));
    }

    [Fact]
    public async Task Las_suscripciones_de_antes_siguen_recibiendo_campanas()
    {
        var store = await Merchant.CreateAsync(factory, "nlh");
        var email = $"hist-{Guid.NewGuid():N}@mail.com";
        // Una fila como las que dejó la migración: confirmada con la fecha del alta.
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CustomersDbContext>();
            var row = NewsletterSubscriber.CreatePending(store.TenantId, email, "footer", ShopAuthToken());
            row.Confirm();
            db.NewsletterSubscribers.Add(row);
            await db.SaveChangesAsync();
        }
        Assert.Contains(email, await SubscribersAsync(store));
    }

    private static string ShopAuthToken() => Api.Shop.ShopAuth.NewToken();

    private static async Task<List<string?>> SubscribersAsync(Merchant store)
    {
        var preview = await store.PostAsync("/api/v1/admin/campaigns/audience/preview", new { type = "subscribers" });
        return [.. preview.GetProperty("sample").EnumerateArray().Select(m => m.GetProperty("email").GetString())];
    }

    private static async Task<string?> TitleAsync(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("title").GetString();
}
