using System.Net;

namespace IntegrationTests;

/// <summary>
/// Contrato entre el storefront y la API: cada escritura que la tienda hace
/// SIN sesión de admin tiene que pasar la barrera de escrituras de
/// administración (<c>AdminWriteAuthMiddleware</c>), que corta todo lo que no
/// esté en su lista blanca con un 401 mudo.
///
/// <para>
/// Regresión: la cotización de Andreani se sumó sin agregarla a esa lista, y
/// el checkout real nunca ofrecía Andreani. Los tests del carrier no lo veían
/// porque cotizaban como comerciante logueado. La lista de abajo sale de los
/// fetch del storefront: si se agrega uno nuevo, va acá.
/// </para>
/// </summary>
[Collection("api")]
public sealed class StorefrontContractTests
{
    private readonly ApiFactory _factory;

    public StorefrontContractTests(ApiFactory factory) => _factory = factory;

    public static TheoryData<string> EscriturasDeLaTienda() => new(
        "/api/v1/checkout",
        "/api/v1/checkout/00000000-0000-0000-0000-000000000000/submit",
        "/api/v1/checkout/00000000-0000-0000-0000-000000000000/pay",
        "/api/v1/checkout/00000000-0000-0000-0000-000000000000/pay-onsite",
        "/api/v1/checkout/00000000-0000-0000-0000-000000000000/pay-payway",
        "/api/v1/shipping/correo/quote",
        "/api/v1/shipping/zipnova/quote",
        "/api/v1/shipping/andreani/quote",
        "/api/v1/coupons/validate",
        "/api/v1/contact/submit",
        "/api/v1/newsletter",
        "/api/v1/track",
        "/api/v1/shop/auth/login",
        "/api/v1/shop/auth/register",
        "/api/v1/shop/auth/forgot",
        "/api/v1/shop/auth/reset",
        "/api/v1/shop/auth/verify",
        "/api/v1/shop/auth/logout",
        "/api/v1/shop/favorites/merge",
        "/api/v1/shop/support/conversations");

    [Theory]
    [MemberData(nameof(EscriturasDeLaTienda))]
    public async Task El_comprador_sin_sesion_pasa_la_barrera_de_admin(string path)
    {
        // Un comprador CON su sesión de cliente (pero sin sesión de admin): así
        // un 401 solo puede venir de la barrera de administración, no de los
        // endpoints /shop/* que piden cuenta de cliente.
        var store = await SeededStore.GetAsync(_factory);
        var shopper = new Shopper(store);
        var credentials = new { name = "Contrato", email = $"contrato-{Guid.NewGuid():N}@mail.com", password = "una-clave-larga" };
        await shopper.ExpectJsonAsync(HttpMethod.Post, "/api/v1/shop/auth/register", credentials);

        // Puede responder 400 (cuerpo vacío) o 404; no puede responder 401. El
        // login, con sus credenciales: vacío, el 401 sería el suyo.
        var res = await shopper.SendAsync(HttpMethod.Post, path, path.EndsWith("/login") ? credentials : new { });
        Assert.True(res.StatusCode != HttpStatusCode.Unauthorized,
            $"POST {path}: 401 para un comprador. ¿Falta en la lista blanca de AdminWriteAuthMiddleware?");
        Assert.NotEqual(HttpStatusCode.InternalServerError, res.StatusCode);
    }

    [Fact]
    public async Task Una_escritura_de_admin_sin_sesion_si_se_corta()
    {
        // El otro lado: la barrera sigue cerrando lo que no es de la tienda.
        var store = await SeededStore.GetAsync(_factory);
        var res = await new Shopper(store).SendAsync(HttpMethod.Post, "/api/v1/products", new { name = "spam" });
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }
}
