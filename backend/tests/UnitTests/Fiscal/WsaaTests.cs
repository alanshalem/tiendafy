using System.Security.Cryptography;
using System.Security.Cryptography.Pkcs;
using System.Security.Cryptography.X509Certificates;
using System.Xml.Linq;
using Fiscal.Infrastructure.Wsaa;

namespace UnitTests.Fiscal;

public class WsaaTests
{
    [Fact]
    public void BuildTra_HasRequiredElements()
    {
        var now = DateTimeOffset.Parse("2026-07-23T12:00:00+00:00");
        var xml = TraSigner.BuildTra("wsfe", now);
        var doc = XDocument.Parse(xml);

        Assert.Equal("loginTicketRequest", doc.Root!.Name.LocalName);
        Assert.Equal("wsfe", doc.Descendants("service").Single().Value);
        Assert.NotEmpty(doc.Descendants("uniqueId").Single().Value);

        // generationTime < expirationTime, ambos con offset (±24h de tolerancia, H5).
        var gen = DateTimeOffset.Parse(doc.Descendants("generationTime").Single().Value);
        var exp = DateTimeOffset.Parse(doc.Descendants("expirationTime").Single().Value);
        Assert.True(gen < exp);
        Assert.True(exp - gen <= TimeSpan.FromHours(24));
    }

    [Fact]
    public void BuildTra_UniqueId_FitsUnsignedInt()
    {
        var xml = TraSigner.BuildTra("wsfe", DateTimeOffset.UtcNow);
        var uid = XDocument.Parse(xml).Descendants("uniqueId").Single().Value;
        Assert.True(uint.TryParse(uid, out _)); // xsd:unsignedInt, no desborda (H5)
    }

    [Fact]
    public void SignCms_ProducesValidSignedCms_WithSignerCert()
    {
        var (certPem, keyPem) = SelfSignedPem();
        using var cert = TraSigner.LoadForSigning(certPem, keyPem);
        var tra = TraSigner.BuildTra("wsfe", DateTimeOffset.UtcNow);

        var base64 = TraSigner.SignCms(tra, cert);

        // Se decodifica como CMS y el firmante es nuestro cert (prueba de firma real).
        var cms = new SignedCms();
        cms.Decode(Convert.FromBase64String(base64));
        cms.CheckSignature(verifySignatureOnly: true); // no lanza → firma válida
        Assert.Single(cms.SignerInfos);
        Assert.Equal(cert.Thumbprint, cms.SignerInfos[0].Certificate!.Thumbprint);

        // El contenido firmado es exactamente el TRA.
        Assert.Equal(tra, System.Text.Encoding.UTF8.GetString(cms.ContentInfo.Content));
    }

    [Fact]
    public void LoadForSigning_AttachesPrivateKey()
    {
        var (certPem, keyPem) = SelfSignedPem();
        using var cert = TraSigner.LoadForSigning(certPem, keyPem);
        Assert.True(cert.HasPrivateKey); // el round-trip PKCS#12 dejó la clave usable
    }

    private static (string CertPem, string KeyPem) SelfSignedPem()
    {
        using var rsa = RSA.Create(2048);
        var req = new CertificateRequest("CN=tiendafy-test, SERIALNUMBER=CUIT 20123456786",
            rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var cert = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddYears(2));
        var certPem = new string(PemEncoding.Write("CERTIFICATE", cert.RawData));
        var keyPem = new string(PemEncoding.Write("PRIVATE KEY", rsa.ExportPkcs8PrivateKey()));
        return (certPem, keyPem);
    }
}
