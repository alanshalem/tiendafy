using System.Net;

namespace IntegrationTests;

/// <summary>Headers de defensa que la API manda en todas sus respuestas.</summary>
[Collection("api")]
public sealed class SecurityHeadersTests(ApiFactory factory)
{
    [Theory]
    [InlineData("/health")]
    [InlineData("/api/v1/auth/me")]
    [InlineData("/ruta-que-no-existe")]
    public async Task Toda_respuesta_lleva_los_headers_de_seguridad(string path)
    {
        var res = await factory.CreateClient().GetAsync(path);

        Assert.Equal("nosniff", res.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", res.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("frame-ancestors 'none'", res.Headers.GetValues("Content-Security-Policy").Single());
        Assert.Equal("no-referrer", res.Headers.GetValues("Referrer-Policy").Single());
    }

    [Fact]
    public async Task La_UI_de_Scalar_en_Development_queda_sin_CSP_para_poder_cargar_su_CDN()
    {
        var res = await factory.CreateClient().GetAsync("/scalar/v1");

        Assert.NotEqual(HttpStatusCode.NotFound, res.StatusCode);
        Assert.False(res.Headers.Contains("Content-Security-Policy"));
        Assert.False(res.Headers.Contains("X-Frame-Options"));
        Assert.Equal("nosniff", res.Headers.GetValues("X-Content-Type-Options").Single());
    }
}
