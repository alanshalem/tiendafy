using System.Net;
using Customers.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Lo que el comprador le escribe a la tienda: el formulario de contacto, el
/// Botón de Arrepentimiento (obligatorio por ley, con constancia) y la
/// suscripción a novedades. Y la bandeja donde el comercio lo lee.
/// </summary>
[Collection("api")]
public sealed class ContactFlowTests
{
    private readonly ApiFactory _factory;

    public ContactFlowTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Contacto_y_arrepentimiento_llegan_a_la_bandeja()
    {
        var merchant = await Merchant.CreateAsync(_factory, "cto");
        var shopper = new Shopper(merchant);
        var buyer = $"arrepentido-{merchant.Subdomain}@mail.com";
        var orderId = await merchant.CreateSaleAsync(buyerEmail: buyer);

        // Validaciones del formulario.
        foreach (var bad in new object[]
        {
            new { name = "", email = "a@b.com", body = "hola" },
            new { name = "Ana", email = "sin-arroba", body = "hola" },
            new { name = "Ana", email = "a@b.com", body = "" },
        })
        {
            Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/contact/submit", bad)).StatusCode);
        }

        var contact = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/contact/submit",
            new { name = "Ana", email = "ana@mail.com", body = "¿Hacen envíos a Córdoba?" });
        Assert.Equal(System.Text.Json.JsonValueKind.Null, contact.GetProperty("reference").ValueKind);

        // Arrepentimiento: número de constancia generado por el servidor y
        // acuse por email al comprador.
        var repentance = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/contact/submit", new
        {
            name = "Beto",
            email = buyer,
            body = "Me arrepiento de la compra.",
            kind = "repentance",
            orderRef = orderId.ToString(),
        });
        var reference = repentance.GetProperty("reference").GetString()!;
        Assert.Matches("^ARR-[A-Z0-9]{6}$", reference);
        var receipt = Assert.Single(_factory.ExternalHttp.EmailsTo(buyer), m => m.Subject.Contains(reference));
        Assert.Contains(orderId.ToString(), receipt.Html);

        // La bandeja: los dos, sin leer, y el arrepentimiento enlazado a la venta.
        var inbox = await merchant.GetAsync("/api/v1/contact/messages");
        Assert.Equal(2, inbox.GetProperty("total").GetInt32());
        Assert.Equal(2, inbox.GetProperty("unread").GetInt32());
        var arr = inbox.GetProperty("items").EnumerateArray().Single(m => m.GetProperty("kind").GetString() == "repentance");
        Assert.Equal(orderId, arr.GetProperty("orderId").GetGuid());

        await merchant.ExpectOkAsync(HttpMethod.Post, $"/api/v1/contact/messages/{arr.GetProperty("id").GetGuid()}/read");
        Assert.Equal(1, (await merchant.GetAsync("/api/v1/contact/messages")).GetProperty("unread").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound,
            (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/contact/messages/{Guid.NewGuid()}/read")).StatusCode);

        // La bandeja es del comercio: un comprador no la ve.
        Assert.Equal(HttpStatusCode.Unauthorized, (await shopper.SendAsync(HttpMethod.Get, "/api/v1/contact/messages")).StatusCode);

        var captcha = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/captcha/config");
        Assert.False(captcha.GetProperty("enabled").GetBoolean());
    }

    [Fact]
    public async Task Newsletter_guarda_una_vez_y_engania_a_los_bots()
    {
        var merchant = await Merchant.CreateAsync(_factory, "nws");
        var shopper = new Shopper(merchant);
        var email = $"Novedades-{merchant.Subdomain}@Mail.com";

        Assert.Equal(HttpStatusCode.BadRequest,
            (await shopper.SendAsync(HttpMethod.Post, "/api/v1/newsletter", new { email = "x" })).StatusCode);

        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/newsletter", new { email, source = "footer" });
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/newsletter", new { email = email.ToLowerInvariant() });
        // El honeypot lleno: responde OK pero no guarda.
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/newsletter", new { email = "bot@spam.com", website = "http://spam" });

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CustomersDbContext>();
        Assert.Equal(1, await db.NewsletterSubscribers.IgnoreQueryFilters().CountAsync(x => x.TenantId == merchant.TenantId));
    }
}
