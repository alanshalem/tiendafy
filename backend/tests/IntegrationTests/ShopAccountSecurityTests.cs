using System.Net;
using System.Text.Json;
using Customers.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Lo que protege a la cuenta del comprador de quien se registra con un email
/// ajeno: los pedidos (que se atan a la cuenta por el email de la compra) se
/// ven recién con el email verificado, el registro no abre sesión ni dice si
/// la cuenta existe, y "¿Olvidaste tu contraseña?" contesta igual y pide
/// captcha. Y lo que queda en la base de las sesiones y los links: su hash.
/// </summary>
[Collection("api")]
public sealed class ShopAccountSecurityTests(ApiFactory factory)
{
    private const string Siteverify = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

    [Fact]
    public async Task Registrarse_con_el_email_de_otro_no_muestra_sus_pedidos_hasta_verificarlo()
    {
        var merchant = await Merchant.CreateAsync(factory, "ajeno");
        _ = new FakeArca(factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        // Ana compró sin cuenta: su pedido, facturado.
        var email = $"ana-{merchant.Subdomain}@test.local";
        var orderId = await merchant.CreateSaleAsync(buyerEmail: email);
        Assert.True((await merchant.PostAsync($"/api/v1/orders/{orderId}/invoice", new { })).GetProperty("authorized").GetBoolean());

        // Alguien se registra con el email de Ana y entra con SU contraseña.
        var intruder = new Shopper(merchant);
        var registered = await intruder.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/register",
            new { name = "Intruso", email, password = "clave-del-intruso" });
        Assert.Equal(HttpStatusCode.Accepted, registered.StatusCode);
        var me = await intruder.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/auth/login", new { email, password = "clave-del-intruso" });
        Assert.False(me.GetProperty("customer").GetProperty("emailVerified").GetBoolean());

        // Ni la lista, ni el detalle, ni la factura, ni el pedido completo, ni opinar, ni el chat.
        var list = await intruder.ExpectJsonAsync(HttpMethod.Get, "/api/v1/shop/orders");
        Assert.Empty(list.GetProperty("items").EnumerateArray());
        Assert.False(list.GetProperty("emailVerified").GetBoolean());
        Assert.Equal(HttpStatusCode.NotFound, (await intruder.SendAsync(HttpMethod.Get, $"/api/v1/shop/orders/{orderId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await intruder.SendAsync(HttpMethod.Get, $"/api/v1/shop/orders/{orderId}/invoice.pdf")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await intruder.SendAsync(HttpMethod.Get, $"/api/v1/orders/{orderId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await intruder.SendAsync(HttpMethod.Get, $"/api/v1/shop/orders/{orderId}/review-invite")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await intruder.SendAsync(HttpMethod.Post, "/api/v1/shop/support/conversations", new { orderId })).StatusCode);

        // "Reenviar el mail": sale otro link, siempre al email de la cuenta.
        Assert.Equal(HttpStatusCode.NoContent, (await intruder.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/verify/resend")).StatusCode);
        var activations = factory.ExternalHttp.EmailsTo(email).Where(m => m.Html.Contains("/cuenta/verificar?token=", StringComparison.Ordinal)).ToList();
        Assert.Equal(2, activations.Count);

        // Ana (la dueña del email) toca el link: ahí sí ve su pedido, con la
        // factura, y la sesión que el intruso había abierto se cierra.
        var ana = new Shopper(merchant);
        var verified = await ana.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/auth/verify",
            new { token = Shopper.TokenFrom(activations[^1].Html) });
        Assert.True(verified.GetProperty("customer").GetProperty("emailVerified").GetBoolean());
        var mine = await ana.ExpectJsonAsync(HttpMethod.Get, "/api/v1/shop/orders");
        Assert.True(mine.GetProperty("emailVerified").GetBoolean());
        Assert.Equal(orderId, Assert.Single(mine.GetProperty("items").EnumerateArray()).GetProperty("id").GetGuid());
        await ana.ExpectOkAsync(HttpMethod.Get, $"/api/v1/shop/orders/{orderId}");
        var pdf = await ana.ExpectOkAsync(HttpMethod.Get, $"/api/v1/shop/orders/{orderId}/invoice.pdf");
        Assert.Equal("application/pdf", pdf.Content.Headers.ContentType?.MediaType);
        await ana.ExpectOkAsync(HttpMethod.Get, $"/api/v1/orders/{orderId}");
        Assert.Equal(HttpStatusCode.Unauthorized, (await intruder.SendAsync(HttpMethod.Get, "/api/v1/shop/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Registrarse_con_un_email_que_ya_tiene_cuenta_contesta_igual_y_no_cambia_nada()
    {
        var merchant = await Merchant.CreateAsync(factory, "dup");
        var email = $"duena-{merchant.Subdomain}@mail.com";
        await new Shopper(merchant).RegisterVerifiedAsync(email, "Dora", "clave-de-la-duena");
        var before = await AccountAsync(merchant.TenantId, email);

        // Lo que contesta un registro nuevo…
        var fresh = await new Shopper(merchant).SendAsync(HttpMethod.Post, "/api/v1/shop/auth/register",
            new { name = "Nueva", email = $"nueva-{merchant.Subdomain}@mail.com", password = "una-clave-larga" });
        // …y lo que contesta uno con un email que ya tiene cuenta: lo mismo.
        var intruder = new Shopper(merchant);
        var taken = await intruder.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/register",
            new { name = "Intruso", email = email.ToUpperInvariant(), password = "clave-del-intruso" });
        Assert.Equal(HttpStatusCode.Accepted, fresh.StatusCode);
        Assert.Equal(fresh.StatusCode, taken.StatusCode);
        Assert.Equal(await fresh.Content.ReadAsStringAsync(), await taken.Content.ReadAsStringAsync());
        Assert.False(taken.Headers.Contains("Set-Cookie"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await intruder.SendAsync(HttpMethod.Get, "/api/v1/shop/auth/me")).StatusCode);

        // Sin cambios: una sola cuenta, con la misma contraseña y el mismo nombre.
        var after = await AccountAsync(merchant.TenantId, email);
        Assert.Equal(before, after);
        Assert.Equal(HttpStatusCode.Unauthorized, (await intruder.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/login",
            new { email, password = "clave-del-intruso" })).StatusCode);
        await intruder.ExpectOkAsync(HttpMethod.Post, "/api/v1/shop/auth/login", new { email, password = "clave-de-la-duena" });

        // A la dueña le llega el aviso, con el link a su cuenta en la tienda.
        var shopper = new Shopper(merchant);
        var notice = Assert.Single(factory.ExternalHttp.EmailsTo(email), m => m.Subject.StartsWith("Ya tenés una cuenta", StringComparison.Ordinal));
        Assert.Contains("Hola Dora", notice.Html, StringComparison.Ordinal);
        Assert.Contains($"{shopper.ReturnUrl}/cuenta", notice.Html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Olvide_mi_contrasena_pide_captcha()
    {
        var merchant = await Merchant.CreateAsync(factory, "fcap");
        var email = $"cap-{merchant.Subdomain}@mail.com";
        await new Shopper(merchant).RegisterVerifiedAsync(email);

        await using var app = factory.WithWebHostBuilder(b => b.UseSetting("Captcha:Turnstile:Secret", "turnstile-secret"));
        var client = app.CreateClient();
        Task<HttpResponseMessage> Forgot(string? captcha)
        {
            var req = new HttpRequestMessage(HttpMethod.Post, "/api/v1/shop/auth/forgot")
            {
                Content = JsonContent.Create(new { email, captcha }),
            };
            req.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
            return client.SendAsync(req);
        }

        Assert.Equal(HttpStatusCode.BadRequest, (await Forgot(null)).StatusCode);
        factory.ExternalHttp.OnJson(HttpMethod.Post, Siteverify, new { success = false });
        Assert.Equal(HttpStatusCode.BadRequest, (await Forgot("token-vencido")).StatusCode);
        factory.ExternalHttp.OnJson(HttpMethod.Post, Siteverify, new { success = true });
        Assert.Equal(HttpStatusCode.NoContent, (await Forgot("token-bueno")).StatusCode);
        await factory.ExternalHttp.WaitForEmailAsync(email, m => m.Subject.Contains("Restablecé"));
    }

    [Fact]
    public async Task Las_sesiones_y_los_links_se_guardan_hasheados()
    {
        var merchant = await Merchant.CreateAsync(factory, "hash");
        var email = $"hash-{merchant.Subdomain}@mail.com";
        var shopper = new Shopper(merchant);
        Assert.Equal(HttpStatusCode.Accepted, (await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/register",
            new { name = "Hash", email, password = "una-clave-larga" })).StatusCode);
        var verifyToken = Shopper.TokenFrom(factory.ExternalHttp.EmailsTo(email).Single().Html);

        var verify = await shopper.SendAsync(HttpMethod.Post, "/api/v1/shop/auth/verify", new { token = verifyToken });
        Assert.Equal(HttpStatusCode.OK, verify.StatusCode);
        var cookie = verify.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith($"shop_{merchant.TenantId:N}=", StringComparison.Ordinal));
        var sessionToken = cookie.Split(';')[0].Split('=', 2)[1];

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CustomersDbContext>();
        var sessions = await db.CustomerSessions.IgnoreQueryFilters().Where(s => s.TenantId == merchant.TenantId).ToListAsync();
        var session = Assert.Single(sessions);
        Assert.NotEqual(sessionToken, session.TokenHash);
        Assert.Equal(ShopperTokenHash.Of(sessionToken), session.TokenHash);
        var link = Assert.Single(await db.CustomerTokens.IgnoreQueryFilters().Where(t => t.TenantId == merchant.TenantId).ToListAsync());
        Assert.Equal(ShopperTokenHash.Of(verifyToken), link.TokenHash);

        // Y la sesión anda: el bearer (o la cookie) se busca por su hash.
        var me = new HttpRequestMessage(HttpMethod.Get, "/api/v1/shop/auth/me");
        me.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
        me.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", sessionToken);
        Assert.Equal(HttpStatusCode.OK, (await factory.CreateClient().SendAsync(me)).StatusCode);
    }

    [Fact]
    public async Task La_migracion_hashea_igual_que_la_api()
    {
        // La migración HashShopperTokens convirtió en SQL los tokens que había:
        // si no diera lo mismo que ShopperTokenHash, todos quedaban deslogueados.
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CustomersDbContext>();
        foreach (var token in new[] { "abcDEF-_123", Api.Shop.ShopAuth.NewToken(), "ñandú" })
        {
            var sql = await db.Database
                .SqlQuery<string>($"SELECT encode(sha256(convert_to({token}, 'UTF8')), 'hex') AS \"Value\"")
                .SingleAsync();
            Assert.Equal(ShopperTokenHash.Of(token), sql);
        }
    }

    private async Task<string> AccountAsync(Guid tenantId, string email)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CustomersDbContext>();
        var rows = await db.Customers.IgnoreQueryFilters()
            .Where(c => c.TenantId == tenantId && c.Email == email)
            .Select(c => new { c.Id, c.Name, c.PasswordHash, c.EmailVerified })
            .ToListAsync();
        return JsonSerializer.Serialize(Assert.Single(rows));
    }
}
