using System.Net;

namespace IntegrationTests;

/// <summary>
/// Aislamiento multi-tenant de punta a punta, contra la API real y Postgres:
/// dos merchants con su tienda y su producto cada uno; NADA de la tienda A
/// debe verse desde la tienda B por ningún camino (listado, by-id, sesión
/// cruzada). Es el riesgo #1 de un SaaS multi-tenant — este test es la red.
/// Requiere Postgres local (el de infra/docker/docker-compose.dev.yml o el
/// service de CI); usa una base propia (tiendafy_itests) que migra al boot.
/// </summary>
[Collection("api")]
public sealed class TenantIsolationTests
{
    private readonly ApiFactory _factory;

    public TenantIsolationTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Los_datos_de_una_tienda_no_se_ven_desde_otra()
    {
        var a = await Merchant.CreateAsync(_factory, "isoa");
        var b = await Merchant.CreateAsync(_factory, "isob");

        // Nombres únicos por corrida: la DB de tests persiste entre corridas.
        var nameA = $"Producto A {a.Subdomain}";
        var nameB = $"Producto B {b.Subdomain}";
        var (productA, _) = await a.CreateProductAsync(nameA, stock: 0);
        var (productB, _) = await b.CreateProductAsync(nameB, stock: 0);

        // 1) El listado de cada tienda contiene SOLO lo suyo.
        var namesA = Names(await a.GetAsync("/api/v1/products?limit=100"));
        Assert.Contains(nameA, namesA);
        Assert.DoesNotContain(nameB, namesA);

        var namesB = Names(await b.GetAsync("/api/v1/products?limit=100"));
        Assert.Contains(nameB, namesB);
        Assert.DoesNotContain(nameA, namesB);

        // 2) Pedir un producto de A con el tenant B → 404 (ni siquiera "forbidden": no existe para B).
        var cross = await b.SendAsync(HttpMethod.Get, $"/api/v1/products/{productA}");
        Assert.Equal(HttpStatusCode.NotFound, cross.StatusCode);

        // 3) Sesión de A + tenant de B en un endpoint de admin → denegado (membresía).
        var denied = await b.SendAsync(a.Client, HttpMethod.Get, "/api/v1/stats/overview");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);

        // 4) Escritura cruzada: A intenta editar el producto de B → denegado, y B sigue intacto.
        var writeDenied = await b.SendAsync(a.Client, HttpMethod.Put, $"/api/v1/products/{productB}",
            new { name = "HACKED", description = "x" });
        Assert.True(
            writeDenied.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.NotFound or HttpStatusCode.Unauthorized,
            $"la escritura cruzada devolvió {writeDenied.StatusCode}");

        var stillB = await b.GetAsync($"/api/v1/products/{productB}");
        Assert.Equal(nameB, stillB.GetProperty("name").GetString());
    }

    private static List<string?> Names(System.Text.Json.JsonElement list) =>
        [.. list.GetProperty("items").EnumerateArray().Select(p => p.GetProperty("name").GetString())];
}
