using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Tenancy.Infrastructure.Persistence;

namespace IntegrationTests;

/// <summary>
/// La sesión del comprador (cookie <c>shop_&lt;tienda&gt;</c>, del host de la
/// API) viaja desde cualquier tienda de la plataforma. Solo vale desde un host
/// de SU tienda (subdominio, dominio propio, el pelado si es la principal) o
/// sin <c>Origin</c> (la tienda armando la página en el servidor). Desde otra
/// tienda u otro sitio, el pedido es anónimo.
/// </summary>
[Collection("api")]
public sealed class ShopperOriginTests(ApiFactory factory)
{
    private const string Me = "/api/v1/shop/auth/me";

    [Fact]
    public async Task La_tienda_A_no_puede_usar_la_sesion_de_un_comprador_de_la_B()
    {
        var a = await Merchant.CreateAsync(factory, "orga");
        var b = await Merchant.CreateAsync(factory, "orgb");
        var buyer = new Shopper(b);
        await buyer.RegisterVerifiedAsync($"b-{Guid.NewGuid():N}@test.local");

        // Su tienda y sin Origin (SSR), sí.
        Assert.Equal(HttpStatusCode.OK, (await buyer.SendFromAsync($"http://{b.Subdomain}.localhost:3000", HttpMethod.Get, Me)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await buyer.SendFromAsync(null, HttpMethod.Get, Me)).StatusCode);

        // Un script en la tienda A, con el X-Tenant-Id de la B: anónimo.
        foreach (var origin in new[] { $"http://{a.Subdomain}.localhost:3000", "http://localhost:9000", "https://sitio-malicioso.example" })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await buyer.SendFromAsync(origin, HttpMethod.Get, Me)).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await buyer.SendFromAsync(origin, HttpMethod.Get, "/api/v1/shop/addresses")).StatusCode);
        }

        // Ni cerrarle la sesión: sigue adentro desde su tienda.
        await buyer.SendFromAsync($"http://{a.Subdomain}.localhost:3000", HttpMethod.Post, "/api/v1/shop/auth/logout");
        Assert.Equal(HttpStatusCode.OK, (await buyer.SendFromAsync($"http://{b.Subdomain}.localhost:3000", HttpMethod.Get, Me)).StatusCode);

        // Desde su tienda sí sale.
        Assert.Equal(HttpStatusCode.NoContent,
            (await buyer.SendFromAsync($"http://{b.Subdomain}.localhost:3000", HttpMethod.Post, "/api/v1/shop/auth/logout")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await buyer.SendFromAsync(null, HttpMethod.Get, Me)).StatusCode);
    }

    [Fact]
    public async Task Desde_el_dominio_propio_de_la_tienda_vale()
    {
        var store = await Merchant.CreateAsync(factory, "orgc");
        var domain = $"{store.Subdomain}.example.test";
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenancyDbContext>();
            var tenant = await db.Tenants.IgnoreQueryFilters().SingleAsync(t => t.Id == store.TenantId);
            tenant.AttachCustomDomain(domain);
            await db.SaveChangesAsync();
        }
        var buyer = new Shopper(store);
        await buyer.RegisterVerifiedAsync($"c-{Guid.NewGuid():N}@test.local");

        Assert.Equal(HttpStatusCode.OK, (await buyer.SendFromAsync($"https://{domain}", HttpMethod.Get, Me)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await buyer.SendFromAsync($"https://www.{domain}", HttpMethod.Get, Me)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await buyer.SendFromAsync($"https://otro-{domain}", HttpMethod.Get, Me)).StatusCode);
    }

    [Fact]
    public async Task El_dominio_pelado_vale_solo_para_la_tienda_principal()
    {
        var primary = await Merchant.CreateAsync(factory, "orgp");
        var other = await Merchant.CreateAsync(factory, "orgo");
        await using var app = factory.WithWebHostBuilder(b => b.UseSetting("Tenancy:PrimaryStoreSubdomain", primary.Subdomain));

        foreach (var (store, expected) in new[] { (primary, HttpStatusCode.OK), (other, HttpStatusCode.Unauthorized) })
        {
            var email = $"p-{Guid.NewGuid():N}@test.local";
            var client = app.CreateClient();
            var register = new HttpRequestMessage(HttpMethod.Post, "/api/v1/shop/auth/register") { Content = JsonContent.Create(new { name = "Ana", email }) };
            register.Headers.Add("X-Tenant-Id", store.TenantId.ToString());
            Assert.Equal(HttpStatusCode.Accepted, (await client.SendAsync(register)).StatusCode);
            var verify = new HttpRequestMessage(HttpMethod.Post, "/api/v1/shop/auth/verify")
            {
                Content = JsonContent.Create(new { token = Shopper.TokenFrom(factory.ExternalHttp.EmailsTo(email).Single().Html), password = "una-clave-larga" }),
            };
            verify.Headers.Add("X-Tenant-Id", store.TenantId.ToString());
            Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(verify)).StatusCode);

            var me = new HttpRequestMessage(HttpMethod.Get, Me);
            me.Headers.Add("X-Tenant-Id", store.TenantId.ToString());
            me.Headers.Add("Origin", "http://localhost:3000");
            Assert.Equal(expected, (await client.SendAsync(me)).StatusCode);
        }
    }
}
