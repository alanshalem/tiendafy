using Api.Middleware;

namespace UnitTests.Api;

/// <summary>
/// La lista blanca de escrituras sin sesión de admin compara por segmento.
///
/// Regresión: con un <c>StartsWith</c> pelado, <c>/api/v1/checkout</c> eximía
/// también <c>/api/v1/checkout-settings</c>, y <c>/api/v1/reviews</c> o
/// <c>/api/v1/newsletter</c> eximían cualquier ruta que empezara igual. Hoy esos
/// endpoints tienen su permiso, pero la barrera no los cubría.
/// </summary>
public sealed class AdminWriteAuthMiddlewareTests
{
    [Theory]
    [InlineData("/api/v1/checkout")]
    [InlineData("/api/v1/checkout/")]
    [InlineData("/api/v1/checkout/3f0c/submit")]
    [InlineData("/api/v1/auth/login")]
    [InlineData("/api/v1/shop/auth/login")]
    [InlineData("/api/v1/newsletter")]
    [InlineData("/api/v1/reviews/3f0c/helpful")]
    [InlineData("/api/v1/search/log")]
    [InlineData("/api/v1/payments/webhooks/mercadopago")]
    [InlineData("/API/V1/CHECKOUT")]
    public void Lo_publico_y_lo_que_cuelga_de_ello_pasa(string path) =>
        Assert.True(AdminWriteAuthMiddleware.IsPublicWrite(path));

    [Theory]
    [InlineData("/api/v1/checkout-settings")]
    [InlineData("/api/v1/checkoutx/1")]
    [InlineData("/api/v1/reviews-admin")]
    [InlineData("/api/v1/newsletter-export")]
    [InlineData("/api/v1/tenantsx")]
    [InlineData("/api/v1/tracking")]
    [InlineData("/api/v1/search/logs")]
    [InlineData("/api/v1/shopping")]
    [InlineData("/api/v1/authz")]
    [InlineData("/api/v1/admin/reviews/1/approve")]
    public void Un_segmento_que_solo_empieza_igual_no_pasa(string path) =>
        Assert.False(AdminWriteAuthMiddleware.IsPublicWrite(path));
}
