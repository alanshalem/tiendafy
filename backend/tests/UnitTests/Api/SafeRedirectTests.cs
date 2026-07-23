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
}
