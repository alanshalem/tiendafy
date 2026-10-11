using System.Net;

namespace IntegrationTests;

/// <summary>
/// Las lecturas privadas de un grupo de GET públicos.
///
/// Los GET de /products son públicos —los usa la tienda—, pero algunos no
/// pueden serlo: los costos son dato interno del comercio, y el escáner, los
/// kits y la salud del catálogo son del panel. Ese permiso estaba escrito como
/// primera línea de cada handler; ahora se declara en la ruta. Este test es lo
/// que garantiza que la mudanza no dejó ninguno abierto.
/// </summary>
[Collection("api")]
public sealed class PrivateCatalogReadsTests
{
    private readonly ApiFactory _factory;

    public PrivateCatalogReadsTests(ApiFactory factory) => _factory = factory;

    private static readonly string[] Privadas =
    [
        "/api/v1/products/health",
        "/api/v1/products/costs",
        $"/api/v1/products/{Guid.Empty}/costs",
        "/api/v1/products/kits",
        "/api/v1/products/kits/suggested-costs",
        "/api/v1/products/by-code/7790000000000",
    ];

    public static TheoryData<string> Rutas() => new(Privadas);

    [Theory]
    [MemberData(nameof(Rutas))]
    public async Task Sin_sesion_no_se_lee(string path)
    {
        var merchant = await Merchant.CreateAsync(_factory, "prv");

        var res = await merchant.SendAsync(merchant.Anonymous(), HttpMethod.Get, path);

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Theory]
    [MemberData(nameof(Rutas))]
    public async Task El_duenio_si_las_lee(string path)
    {
        var merchant = await Merchant.CreateAsync(_factory, "own");

        var res = await merchant.SendAsync(HttpMethod.Get, path);

        // 404 es válido para las que buscan algo puntual (un id o un código
        // que no existe): lo que no puede ser es 401 ni 403.
        Assert.True(res.StatusCode is HttpStatusCode.OK or HttpStatusCode.NotFound,
            $"GET {path} → {(int)res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
    }

    [Fact]
    public async Task Los_GET_publicos_del_catalogo_siguen_publicos()
    {
        // El otro lado: la tienda lista productos sin sesión. Si declarar
        // permisos en la ruta se hubiera filtrado al grupo, esto daría 401.
        var merchant = await Merchant.CreateAsync(_factory, "pub");

        var res = await merchant.SendAsync(merchant.Anonymous(), HttpMethod.Get, "/api/v1/products?status=ACTIVE&limit=5");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }
}
