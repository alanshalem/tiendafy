using Identity.Infrastructure;
using Microsoft.AspNetCore.Identity;

namespace UnitTests.Identity;

/// <summary>
/// Cómo se busca a alguien del panel por su email: NFKC + mayúsculas
/// invariantes, igual que los compradores (que usan minúsculas). Sin NFKC, una
/// "é" escrita como "e" + tilde combinante o un email con letras de ancho
/// completo quedaban como cuentas distintas de la misma dirección.
/// </summary>
public class PanelLookupNormalizerTests
{
    private readonly PanelLookupNormalizer _normalizer = new();

    [Theory]
    [InlineData("admin@test.local")]
    [InlineData("Ana.Perez+ventas@Empresa.com.ar")]
    public void Para_ascii_da_lo_mismo_que_el_de_Identity(string email)
    {
        var identity = new UpperInvariantLookupNormalizer();
        Assert.Equal(identity.NormalizeEmail(email), _normalizer.NormalizeEmail(email));
        Assert.Equal(identity.NormalizeName(email), _normalizer.NormalizeName(email));
    }

    [Fact]
    public void Las_formas_unicode_de_un_mismo_email_se_buscan_igual()
    {
        var compuesta = "jos\u00e9@test.local";    // é en un solo carácter
        var combinante = "jose\u0301@test.local";  // e + tilde combinante
        var anchoCompleto = "\uff41\uff44\uff4d\uff49\uff4e@test.local"; // "admin" en ancho completo

        Assert.Equal(_normalizer.NormalizeEmail(compuesta), _normalizer.NormalizeEmail(combinante));
        Assert.Equal("JOS\u00c9@TEST.LOCAL", _normalizer.NormalizeEmail(combinante));
        Assert.Equal("ADMIN@TEST.LOCAL", _normalizer.NormalizeEmail(anchoCompleto));
        Assert.Equal(_normalizer.NormalizeEmail(combinante), _normalizer.NormalizeName(combinante));
    }

    [Fact]
    public void Sin_email_no_hay_clave()
    {
        Assert.Null(_normalizer.NormalizeEmail(null));
        Assert.Null(_normalizer.NormalizeName(null));
    }

    [Fact]
    public void La_clave_vieja_es_la_de_antes_de_NFKC()
    {
        Assert.Equal("JOSE\u0301@TEST.LOCAL", PanelLookupNormalizer.LegacyNormalize("jose\u0301@test.local"));
        Assert.Null(PanelLookupNormalizer.LegacyNormalize(null));
    }
}
