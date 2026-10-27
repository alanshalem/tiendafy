using Api.Auth;
using Microsoft.Extensions.Configuration;

namespace UnitTests.Api;

public class SafeRedirectTests
{
    private static IConfiguration Cfg(string platform = "tiendafy.com") =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Tenancy:PlatformBaseDomain"] = platform })
            .Build();

    [Theory]
    [InlineData("https://mitienda.tiendafy.com")]
    [InlineData("https://tiendafy.com")]
    [InlineData("http://mitienda.localhost:3000")]
    [InlineData("https://mitienda.tiendafy.com/checkout")]
    public void SafeAbsoluteBase_OwnHost_Accepted(string url) =>
        Assert.NotNull(SafeRedirect.SafeAbsoluteBase(url, Cfg()));

    [Theory]
    [InlineData("https://evil.com")]
    [InlineData("https://tiendafy.com.evil.com")]        // sufijo falso
    [InlineData("https://eviltiendafy.com")]             // sin el punto
    [InlineData("/checkout/success")]                    // relativo: MP necesita absoluta
    [InlineData("javascript:alert(1)")]
    [InlineData("")]
    [InlineData(null)]
    public void SafeAbsoluteBase_Rejects(string? url) =>
        Assert.Null(SafeRedirect.SafeAbsoluteBase(url, Cfg()));

    [Fact]
    public void SafeAbsoluteBase_TrimsTrailingSlash() =>
        Assert.Equal("https://mitienda.tiendafy.com",
            SafeRedirect.SafeAbsoluteBase("https://mitienda.tiendafy.com/", Cfg()));

    [Theory]
    [InlineData("/mis-pedidos", true)]                   // relativo propio OK
    [InlineData("https://mitienda.tiendafy.com/x", true)]
    [InlineData("//evil.com", false)]                    // protocol-relative
    [InlineData("https://evil.com", false)]
    public void IsSafeReturnUrl_RelativeOrOwnHost(string url, bool expected) =>
        Assert.Equal(expected, SafeRedirect.IsSafeReturnUrl(url, Cfg()));

    // El navegador lee "\" como "/" y se saltea tabs y saltos de línea: todos
    // estos terminan en evil.com aunque empiecen con una sola barra.
    [Theory]
    [InlineData("/\\evil.com")]
    [InlineData("/\\\\evil.com")]
    [InlineData("\\\\evil.com")]
    [InlineData("/ok\\..\\\\evil.com")]
    [InlineData("/\t/evil.com")]
    [InlineData("/\n/evil.com")]
    [InlineData("/%5Cevil.com")]                         // codificada: por si alguien la decodifica después
    [InlineData("https://mitienda.tiendafy.com\\@evil.com")]
    public void IsSafeReturnUrl_RejectsBackslashesAndControlChars(string url) =>
        Assert.False(SafeRedirect.IsSafeReturnUrl(url, Cfg()));

    [Fact]
    public void IsSafeReturnUrl_RejectsTheDecodedQueryValue() =>
        // Lo que llega al endpoint desde ?return=/%5Cevil.com: el framework ya lo decodificó.
        Assert.False(SafeRedirect.IsSafeReturnUrl(Uri.UnescapeDataString("/%5Cevil.com"), Cfg()));

    [Theory]
    [InlineData("/ok/path")]
    [InlineData("/cuenta?tab=pedidos")]
    [InlineData("/productos/remera%20azul")]
    public void IsSafeReturnUrl_KeepsOwnPaths(string url) =>
        Assert.True(SafeRedirect.IsSafeReturnUrl(url, Cfg()));
}
