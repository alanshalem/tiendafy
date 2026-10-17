using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;
using Api.Notifications;
using Checkout.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// La cuenta del comprador en la tienda: registrarse y verificar el email,
/// entrar y salir, recuperar la contraseña, favoritos (con los avisos de baja
/// de precio y de reposición), "mis compras", el chat posventa con adjuntos y
/// el mail de carrito abandonado.
///
/// <para>
/// Los tokens de verificación y de reseteo se sacan del mail que salió por
/// Resend, igual que los usaría la persona: si el link vino mal armado, el
/// test no puede seguir.
/// </para>
/// </summary>
[Collection("api")]
public sealed partial class ShopperFlowTests
{
    private readonly ApiFactory _factory;

    public ShopperFlowTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Cuenta_verificacion_login_y_reseteo()
    {
        var merchant = await Merchant.CreateAsync(_factory, "shp");
        var shopper = new Shopper(merchant);
        var email = $"cliente-{merchant.Subdomain}@mail.com";

        Assert.Equal(HttpStatusCode.Unauthorized, (await shopper.SendAsync(HttpMethod.Get, "/api/v1/shop/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/register",
            new { name = "Ana", email, password = "corta" })).StatusCode);

        // Registro: queda logueada y le llega el mail para verificar.
        var registered = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/auth/register",
            new { name = "Ana Pérez", email = email.ToUpperInvariant(), password = "una-clave-larga" });
        Assert.Equal(email, registered.GetProperty("customer").GetProperty("email").GetString()); // normalizado
        Assert.False(await EmailVerifiedAsync(email));
        Assert.Equal(HttpStatusCode.Conflict, (await new Shopper(merchant).SendAsync(HttpMethod.Post, "/api/v1/shop/auth/register",
            new { name = "Otra", email, password = "una-clave-larga" })).StatusCode);

        var verifyToken = TokenFrom(_factory.ExternalHttp.EmailsTo(email).Single(m => m.Subject.Contains("Verificá")).Html);
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/verify", new { token = "inventado" })).StatusCode);
        await shopper.ExpectOkAsync(HttpMethod.Post, "/api/v1/shop/auth/verify", new { token = verifyToken });
        Assert.True(await EmailVerifiedAsync(email));
        Assert.Equal("Ana Pérez", (await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/shop/auth/me")).GetProperty("name").GetString());
        // Un token se usa una vez.
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/verify", new { token = verifyToken })).StatusCode);

        // Salir y volver a entrar.
        await shopper.ExpectOkAsync(HttpMethod.Post, "/api/v1/shop/auth/logout");
        Assert.Equal(HttpStatusCode.Unauthorized, (await shopper.SendAsync(HttpMethod.Get, "/api/v1/shop/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/login",
            new { email, password = "otra-clave" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/login",
            new { email = "nadie@mail.com", password = "una-clave-larga" })).StatusCode);
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/auth/login", new { email, password = "una-clave-larga" });

        // Olvidó la contraseña: la respuesta es la misma exista o no la cuenta.
        Assert.Equal(HttpStatusCode.NoContent, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/forgot", new { email = "nadie@mail.com" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/forgot", new { email })).StatusCode);
        var resetToken = TokenFrom(_factory.ExternalHttp.EmailsTo(email).Single(m => m.Subject.Contains("Restablecé")).Html);
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/reset",
            new { token = resetToken, password = "corta" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/reset",
            new { token = "inventado", password = "nueva-clave-larga" })).StatusCode);
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/auth/reset", new { token = resetToken, password = "nueva-clave-larga" });
        var other = new Shopper(merchant);
        await other.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/auth/login", new { email, password = "nueva-clave-larga" });

        // Sin tienda no hay cuenta.
        var noTenant = await _factory.CreateClient().PostAsJsonAsync("/api/v1/shop/auth/login", new { email, password = "x" });
        Assert.Equal(HttpStatusCode.BadRequest, noTenant.StatusCode);

        // Google: sin credenciales en el servidor, ni arranca.
        Assert.False((await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/shop/auth/google/configured")).GetProperty("configured").GetBoolean());
        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Get, "/api/v1/shop/auth/google/start?tenant=x")).StatusCode);
        Assert.Equal(HttpStatusCode.NotImplemented, (await shopper.SendAsync(HttpMethod.Get, $"/api/v1/shop/auth/google/start?tenant={merchant.TenantId}")).StatusCode);
    }

    [Fact]
    public async Task Favoritos_con_avisos_mis_compras_y_chat_posventa()
    {
        var merchant = await Merchant.CreateAsync(_factory, "fav");
        var shopper = new Shopper(merchant);
        var email = $"fan-{merchant.Subdomain}@mail.com";
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/auth/register", new { name = "Fan", email, password = "una-clave-larga" });

        var (cheaper, cheaperVariant) = await merchant.CreateProductAsync("Zapatilla", priceMinor: 100_000_00, stock: 5);
        var (restocked, restockedVariant) = await merchant.CreateProductAsync("Campera", priceMinor: 80_000_00, stock: 0);

        // Favoritos: agregar, el merge desde el navegador (lo que marcó sin cuenta), sacar.
        await shopper.ExpectOkAsync(HttpMethod.Put, $"/api/v1/shop/favorites/{cheaper}");
        await shopper.ExpectOkAsync(HttpMethod.Put, $"/api/v1/shop/favorites/{cheaper}"); // dos veces: uno
        var favorites = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/favorites/merge", new { productIds = new[] { restocked.ToString(), "no-es-un-id" } });
        Assert.Equal(2, favorites.GetProperty("productIds").GetArrayLength());

        // Avisos opt-in: la tienda los activa.
        await merchant.PutAsync("/api/v1/email-templates/favorito-baja-precio", new { enabled = true });
        await merchant.PutAsync("/api/v1/email-templates/favorito-repuesto", new { enabled = true });

        // Primera pasada: solo mira. Después baja el precio y vuelve el stock.
        await Workers.RunOnceAsync<FavoriteAlertWorker>(_factory);
        Assert.DoesNotContain(_factory.ExternalHttp.EmailsTo(email), m => !m.Subject.Contains("Verificá"));
        await merchant.PatchAsync($"/api/v1/products/{cheaper}/variants/{cheaperVariant}/price", new { priceAmount = 85_000_00L, currency = "ARS" });
        await merchant.ExpectOkAsync(HttpMethod.Put, $"/api/v1/inventory/{restockedVariant}", new { available = 3, reason = "llegó" });

        await Workers.RunOnceAsync<FavoriteAlertWorker>(_factory);
        var alerts = _factory.ExternalHttp.EmailsTo(email).Where(m => !m.Subject.Contains("Verificá")).ToList();
        Assert.Equal(2, alerts.Count);
        Assert.Contains(alerts, m => m.Html.Contains("Zapatilla"));
        Assert.Contains(alerts, m => m.Html.Contains("Campera"));
        // El precio como en el resto de los mails, sin depender de la cultura del servidor.
        Assert.Contains(alerts, m => m.Html.Contains("ARS 85.000"));

        // Al día siguiente no se repite.
        await Workers.RunOnceAsync<FavoriteAlertWorker>(_factory);
        Assert.Equal(2, _factory.ExternalHttp.EmailsTo(email).Count(m => !m.Subject.Contains("Verificá")));

        await shopper.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/shop/favorites/{restocked}");
        // El merge con la lista vacía es como la tienda lee los de la cuenta.
        Assert.Equal(cheaper, Assert.Single((await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/favorites/merge",
            new { productIds = Array.Empty<string>() })).GetProperty("productIds").EnumerateArray()).GetGuid());

        // Mis compras: solo las suyas.
        var orderId = await merchant.CreateSaleAsync(buyerEmail: email);
        await merchant.CreateSaleAsync(buyerEmail: $"otro-{merchant.Subdomain}@mail.com");
        var mine = await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/shop/orders");
        Assert.Equal(orderId, Assert.Single(mine.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
        // El detalle con datos personales: el dueño sí, un tercero no.
        Assert.Equal(HttpStatusCode.OK, (await shopper.SendAsync(HttpMethod.Get, $"/api/v1/orders/{orderId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await new Shopper(merchant).SendAsync(HttpMethod.Get, $"/api/v1/orders/{orderId}")).StatusCode);

        // Chat posventa: el comprador abre la conversación de su compra…
        Assert.Equal(HttpStatusCode.NotFound, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/support/conversations",
            new { orderId = Guid.NewGuid() })).StatusCode);
        var conversation = await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/support/conversations", new { orderId });
        var conversationId = conversation.GetProperty("id").GetGuid();
        // (abrirla otra vez devuelve la misma)
        Assert.Equal(conversationId, (await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/support/conversations", new { orderId })).GetProperty("id").GetGuid());

        Assert.Equal(HttpStatusCode.BadRequest, (await shopper.SendAsync(HttpMethod.Post,
            $"/api/v1/shop/support/conversations/{conversationId}/messages", new { body = " " })).StatusCode);
        await shopper.ExpectJsonAsync(HttpMethod.Post, $"/api/v1/shop/support/conversations/{conversationId}/messages", new { body = "¿Cuándo llega?" });
        using (var photo = new MultipartFormDataContent
        {
            { new ByteArrayContent(TestImages.Png) { Headers = { ContentType = new MediaTypeHeaderValue("image/png") } }, "file", "foto.png" },
            { new StringContent("Así llegó la caja"), "body" },
        })
        {
            Assert.True((await shopper.SendAsync(HttpMethod.Post, $"/api/v1/shop/support/conversations/{conversationId}/attachments", photo)).IsSuccessStatusCode);
        }

        // Sin Origin propio (un sitio ajeno), las escrituras se rechazan.
        var crossSite = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/shop/support/conversations/{conversationId}/messages")
        {
            Content = JsonContent.Create(new { body = "hola" }),
        };
        crossSite.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
        crossSite.Headers.Add("Origin", "https://sitio-malicioso.example");
        Assert.Equal(HttpStatusCode.Forbidden, (await _factory.CreateClient().SendAsync(crossSite)).StatusCode);

        // …y la tienda contesta desde el panel.
        var inbox = await merchant.GetAsync("/api/v1/support/conversations");
        Assert.Equal(2, inbox.GetProperty("unreadTotal").GetInt32());
        var thread = await merchant.GetAsync($"/api/v1/support/conversations/{conversationId}/messages");
        Assert.Equal(2, thread.GetProperty("items").GetArrayLength());
        // El adjunto es privado: se ve con un link firmado y de vida corta, con
        // el esquema del storage (en desarrollo, MinIO por http).
        var attachment = thread.GetProperty("items").EnumerateArray()
            .Single(m => m.GetProperty("attachment").ValueKind == JsonValueKind.Object).GetProperty("attachment");
        Assert.StartsWith($"{ApiFactory.Storage}/tiendafy-private/", attachment.GetProperty("url").GetString());
        Assert.Contains("X-Amz-Signature=", attachment.GetProperty("url").GetString());
        await merchant.PostAsync($"/api/v1/support/conversations/{conversationId}/messages", new { body = "Sale mañana." });
        using (var label = new MultipartFormDataContent
        {
            { new ByteArrayContent(TestImages.Png) { Headers = { ContentType = new MediaTypeHeaderValue("image/png") } }, "file", "etiqueta.png" },
        })
        {
            var req = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/support/conversations/{conversationId}/attachments") { Content = label };
            req.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
            Assert.True((await merchant.Client.SendAsync(req)).IsSuccessStatusCode);
        }

        var customerView = await shopper.ExpectJsonAsync(HttpMethod.Get, $"/api/v1/shop/support/conversations/{conversationId}/messages");
        Assert.Equal(4, customerView.GetProperty("items").GetArrayLength());

        // El panel lee el hilo de a tandas: las últimas, y "Ver anteriores" con
        // el id del más viejo que ya tiene.
        var latest = await merchant.GetAsync($"/api/v1/support/conversations/{conversationId}/messages?limit=3");
        var latestItems = latest.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(3, latestItems.Count);
        Assert.True(latest.GetProperty("hasMore").GetBoolean());
        var older = await merchant.GetAsync(
            $"/api/v1/support/conversations/{conversationId}/messages?limit=3&before={latestItems[0].GetProperty("id").GetGuid()}");
        Assert.Equal("¿Cuándo llega?", Assert.Single(older.GetProperty("items").EnumerateArray()).GetProperty("body").GetString());
        Assert.False(older.GetProperty("hasMore").GetBoolean());
        var inboxPage = await merchant.GetAsync("/api/v1/support/conversations?limit=1");
        Assert.Equal(1, inboxPage.GetProperty("total").GetInt32());
        Assert.Equal(1, inboxPage.GetProperty("openCount").GetInt32());
        // Ya leída por la tienda: no espera respuesta, y el filtro lo respeta
        // (las cifras siguen contando todas).
        var waiting = await merchant.GetAsync("/api/v1/support/conversations?filter=waiting");
        Assert.Equal(0, waiting.GetProperty("total").GetInt32());
        Assert.Equal(1, waiting.GetProperty("allCount").GetInt32());

        // "Mis conversaciones" en la cuenta: el pedido con su número, lo sin
        // leer y el último mensaje (acá, la etiqueta que mandó la tienda, sin texto).
        var orderNumber = Assert.Single(mine.GetProperty("items").EnumerateArray()).GetProperty("number").GetInt32();
        var listed = Assert.Single((await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/shop/support/conversations")).GetProperty("items").EnumerateArray());
        Assert.Equal(conversationId, listed.GetProperty("id").GetGuid());
        Assert.Equal(orderId, listed.GetProperty("orderId").GetGuid());
        Assert.Equal(orderNumber, listed.GetProperty("orderNumber").GetInt32());
        Assert.Equal($"#{orderNumber}", listed.GetProperty("orderLabel").GetString());
        Assert.Equal(0, listed.GetProperty("unreadForCustomer").GetInt32());
        Assert.True(listed.GetProperty("lastMessage").GetProperty("isFromStaff").GetBoolean());
        Assert.Equal("", listed.GetProperty("lastMessage").GetProperty("body").GetString());
        Assert.Equal("etiqueta.png", listed.GetProperty("lastMessage").GetProperty("attachmentName").GetString());
        Assert.False(listed.TryGetProperty("customerEmail", out _));

        // La tienda contesta otra vez: queda sin leer, con el texto en un renglón.
        await merchant.PostAsync($"/api/v1/support/conversations/{conversationId}/messages", new { body = "¿Algo más?\nSaludos" });
        // Otra compra suya con el chat abierto pero sin escribir: no hay nada que mostrar.
        var otherOrderId = await merchant.CreateSaleAsync(buyerEmail: email);
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/support/conversations", new { orderId = otherOrderId });
        listed = Assert.Single((await shopper.ExpectJsonAsync(HttpMethod.Get, "/api/v1/shop/support/conversations")).GetProperty("items").EnumerateArray());
        Assert.Equal(1, listed.GetProperty("unreadForCustomer").GetInt32());
        Assert.Equal("¿Algo más? Saludos", listed.GetProperty("lastMessage").GetProperty("body").GetString());
        Assert.True(listed.GetProperty("lastMessage").GetProperty("attachmentName").ValueKind == JsonValueKind.Null);

        var closed = await merchant.PostAsync($"/api/v1/support/conversations/{conversationId}/close", new { });
        Assert.Equal("closed", closed.GetProperty("status").GetString(), ignoreCase: true);

        // Lo que no es de nadie.
        var missing = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/support/conversations/{missing}/messages")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/support/conversations/{missing}/messages", new { body = "x" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/support/conversations/{missing}/close")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await shopper.SendAsync(HttpMethod.Get, $"/api/v1/shop/support/conversations/{missing}/messages")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await new Shopper(merchant).SendAsync(HttpMethod.Get, "/api/v1/shop/support/conversations")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await new Shopper(merchant).SendAsync(HttpMethod.Post, "/api/v1/shop/favorites/merge",
            new { productIds = Array.Empty<string>() })).StatusCode);
    }

    [Fact]
    public async Task Un_carrito_abandonado_recibe_un_solo_mail()
    {
        var merchant = await Merchant.CreateAsync(_factory, "aba");
        var shopper = new Shopper(merchant);
        var email = $"indeciso-{merchant.Subdomain}@mail.com";
        var (_, variantId) = await merchant.CreateProductAsync("Mochila", priceMinor: 40_000_00);

        // Completó el checkout (tildando el aviso por WhatsApp) pero no pagó, hace dos horas.
        var checkoutId = await shopper.CheckoutAsync(variantId, email: email, acceptsWhatsApp: true);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CheckoutDbContext>();
            await db.Sessions.IgnoreQueryFilters().Where(s => s.Id == checkoutId)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(x => x.CreatedAtUtc, DateTime.UtcNow.AddHours(-2))
                    .SetProperty(x => x.LastActivityAtUtc, DateTime.UtcNow.AddHours(-2)));
        }

        // Con WhatsApp conectado y la plantilla activa, también le llega por ahí
        // (al teléfono que dejó en el checkout).
        var phoneNumberId = $"pn{Guid.NewGuid():N}"[..14];
        var messages = $"{Api.MetaAds.MetaGraph.ApiBaseUrl}/{phoneNumberId}/messages";
        await merchant.ExpectOkAsync(HttpMethod.Put, "/api/v1/whatsapp/connection", new { phoneNumberId, accessToken = "EAAG-aba" });
        await merchant.PutAsync("/api/v1/whatsapp/templates/carritos-abandonados",
            new { enabled = true, metaTemplateName = "carrito_olvidado", languageCode = "es_AR" });
        _factory.ExternalHttp.OnJson(HttpMethod.Post, messages, new { messages = new[] { new { id = "wamid.aba" } } });

        await RunAbandonedCartsUntilEmailedAsync(checkoutId);
        var mail = Assert.Single(_factory.ExternalHttp.EmailsTo(email), m => m.Subject.Contains("carrito"));
        Assert.Contains(merchant.Subdomain, mail.Html);
        var whatsapp = Assert.Single(_factory.ExternalHttp.SentTo(messages)).Body!;
        Assert.Contains("carrito_olvidado", whatsapp);
        Assert.Contains("5491155556666", whatsapp);
        Assert.Contains("Ana", whatsapp);

        await Workers.RunOnceAsync<AbandonedCartWorker>(_factory);
        Assert.Single(_factory.ExternalHttp.EmailsTo(email), m => m.Subject.Contains("carrito"));
    }

    /// <summary>
    /// El worker toma los carritos de a 50, los más viejos primero, de TODA la
    /// base (que persiste entre corridas): puede tener que despachar otros antes.
    /// </summary>
    private async Task RunAbandonedCartsUntilEmailedAsync(Guid checkoutId)
    {
        for (var pass = 0; pass < 20; pass++)
        {
            await Workers.RunOnceAsync<AbandonedCartWorker>(_factory);
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<CheckoutDbContext>();
            if (await db.Sessions.IgnoreQueryFilters().AnyAsync(s => s.Id == checkoutId && s.RecoveryEmailSentAtUtc != null)) return;
        }
        Assert.Fail("El carrito abandonado nunca se procesó.");
    }

    private async Task<bool> EmailVerifiedAsync(string email)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Customers.Infrastructure.CustomersDbContext>();
        return await db.Customers.IgnoreQueryFilters().Where(c => c.Email == email).Select(c => c.EmailVerified).SingleAsync();
    }

    private static string TokenFrom(string html) => TokenRegex().Match(html).Groups[1].Value;

    [GeneratedRegex(@"token=([A-Za-z0-9_\-%]+)")]
    private static partial Regex TokenRegex();
}
