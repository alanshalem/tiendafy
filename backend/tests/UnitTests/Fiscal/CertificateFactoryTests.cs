using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Fiscal.Contracts;
using Fiscal.Infrastructure.Security;

namespace UnitTests.Fiscal;

public class CertificateFactoryTests
{
    private readonly FiscalCertificateFactory _factory = new();

    [Fact]
    public void GenerateKeyAndCsr_ProducesValidPemPair()
    {
        var result = _factory.GenerateKeyAndCsr(new GenerateCsrRequest("20123456786", "Mi Tienda SA", "tiendafy-test"));

        Assert.Contains("BEGIN CERTIFICATE REQUEST", result.CsrPem);
        Assert.Contains("BEGIN PRIVATE KEY", result.PrivateKeyPem);

        // La clave privada es RSA 2048 importable.
        using var rsa = RSA.Create();
        rsa.ImportFromPem(result.PrivateKeyPem);
        Assert.Equal(2048, rsa.KeySize);
    }

    [Fact]
    public void InspectSignedCertificate_MatchingKey_ReturnsInfo()
    {
        var csr = _factory.GenerateKeyAndCsr(new GenerateCsrRequest("20123456786", "Mi Tienda", "alias"));

        // Simulamos a ARCA: autofirmamos un cert con la MISMA clave privada.
        var certPem = SelfSign(csr.PrivateKeyPem, "CN=alias");

        var info = _factory.InspectSignedCertificate(certPem, csr.PrivateKeyPem);
        Assert.True(info.IsSuccess, info.IsFailure ? info.Error.Message : null);
        Assert.True(info.Value.NotAfterUtc > info.Value.NotBeforeUtc);
    }

    [Fact]
    public void InspectSignedCertificate_WrongKey_Fails()
    {
        var a = _factory.GenerateKeyAndCsr(new GenerateCsrRequest("20123456786", "A", "a"));
        var b = _factory.GenerateKeyAndCsr(new GenerateCsrRequest("27123456780", "B", "b"));
        // Cert firmado con la clave de A, pero validado contra la clave de B.
        var certPem = SelfSign(a.PrivateKeyPem, "CN=a");

        var result = _factory.InspectSignedCertificate(certPem, b.PrivateKeyPem);
        Assert.True(result.IsFailure);
        Assert.Equal("Fiscal.CertKeyMismatch", result.Error.Code);
    }

    [Fact]
    public void InspectSignedCertificate_Garbage_Fails()
    {
        var key = _factory.GenerateKeyAndCsr(new GenerateCsrRequest("20123456786", "A", "a")).PrivateKeyPem;
        var result = _factory.InspectSignedCertificate("no soy un certificado", key);
        Assert.True(result.IsFailure);
        Assert.Equal("Fiscal.BadCertificate", result.Error.Code);
    }

    private static string SelfSign(string privateKeyPem, string subject)
    {
        using var rsa = RSA.Create();
        rsa.ImportFromPem(privateKeyPem);
        var req = new CertificateRequest(subject, rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var cert = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddYears(2));
        return new string(PemEncoding.Write("CERTIFICATE", cert.RawData));
    }
}
