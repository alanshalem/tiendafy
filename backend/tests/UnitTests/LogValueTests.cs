using SharedKernel.Common;

namespace UnitTests;

public class LogValueTests
{
    [Fact]
    public void BodyTapaEmailsYNumerosLargos()
    {
        var s = LogValue.Body("""{"error":"bad","payer":{"email":"juan.perez@gmail.com","dni":"30123456","phone":"+54 9 11 2345-6789"},"card":"4509953566233704"}""");

        Assert.DoesNotContain("juan.perez", s);
        Assert.DoesNotContain("30123456", s);
        Assert.DoesNotContain("4509953566233704", s);
        Assert.DoesNotContain("2345-6789", s);
        Assert.Contains("\"error\":\"bad\"", s);
    }

    [Fact]
    public void BodyTapaTokens()
    {
        var s = LogValue.Body("""Authorization: Bearer APP_USR-1234-abcd and access_token=APP_USR-9999-zzzz, {"refresh_token":"TG-secret"}""");

        Assert.DoesNotContain("APP_USR-1234-abcd", s);
        Assert.DoesNotContain("APP_USR-9999-zzzz", s);
        Assert.DoesNotContain("TG-secret", s);
    }

    [Fact]
    public void BodyConservaCodigoYMensajeDelProveedor()
    {
        var s = LogValue.Body("""{"status":400,"error":"bad_request","cause":[{"code":2067,"description":"Invalid user identification number"}]}""");

        Assert.Contains("bad_request", s);
        Assert.Contains("2067", s);
        Assert.Contains("Invalid user identification number", s);
    }

    [Fact]
    public void BodyRecortaYSacaSaltosDeLinea()
    {
        var s = LogValue.Body("a\nb\r\n" + new string('x', 2000), 100);

        Assert.True(s.Length <= 100);
        Assert.DoesNotContain('\n', s);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void BodyVacioDaVacio(string? input) => Assert.Equal(string.Empty, LogValue.Body(input));

    [Fact]
    public void MaskEmailDejaSoloElDominio() =>
        Assert.Equal("***@gmail.com", LogValue.MaskEmail("juan.perez@gmail.com"));
}
