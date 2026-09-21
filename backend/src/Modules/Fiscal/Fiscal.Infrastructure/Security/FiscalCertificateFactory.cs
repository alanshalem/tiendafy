using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using Fiscal.Contracts;
using SharedKernel.Common;

namespace Fiscal.Infrastructure.Security;

/// <summary>
/// Genera el par de claves + CSR con el subject que exige ARCA e inspecciona el
/// certificado firmado. Así el merchant nunca toca OpenSSL: baja el CSR, lo sube
/// a ARCA, descarga el cert y lo re-sube. La clave privada nunca sale del backend.
/// </summary>
public sealed class FiscalCertificateFactory : IFiscalCertificateFactory
{
    public CsrResult GenerateKeyAndCsr(GenerateCsrRequest request)
    {
        using var rsa = RSA.Create(2048);

        // Subject que ARCA valida: C=AR, O=razón social, CN=alias,
        // serialNumber="CUIT <cuit>" (el prefijo "CUIT " es obligatorio).
        var subject = new X500DistinguishedName(
            $"C=AR, O={Escape(request.BusinessName)}, CN={Escape(request.Alias)}, SERIALNUMBER=CUIT {request.Cuit}");

        var csr = new CertificateRequest(subject, rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var csrPem = new string(PemEncoding.Write("CERTIFICATE REQUEST", csr.CreateSigningRequest()));
        var privateKeyPem = new string(PemEncoding.Write("PRIVATE KEY", rsa.ExportPkcs8PrivateKey()));

        return new CsrResult(privateKeyPem, csrPem);
    }

    public Result<CertificateInfo> InspectSignedCertificate(string certificatePem, string privateKeyPem)
    {
        X509Certificate2 cert;
        try
        {
            cert = X509Certificate2.CreateFromPem(certificatePem);
        }
        catch
        {
            return Result.Failure<CertificateInfo>(Error.Validation(
                "Fiscal.BadCertificate", "El archivo no es un certificado X.509 válido (PEM)."));
        }

        // El cert tiene que corresponder a la clave privada que generamos.
        try
        {
            using var rsa = RSA.Create();
            rsa.ImportFromPem(privateKeyPem);
            using var certWithKey = cert.CopyWithPrivateKey(rsa); // lanza si no matchean
        }
        catch
        {
            return Result.Failure<CertificateInfo>(Error.Validation(
                "Fiscal.CertKeyMismatch", "El certificado no corresponde a la clave privada generada. Subí el cert que descargaste de ARCA para este CSR."));
        }

        var cn = cert.GetNameInfo(X509NameType.SimpleName, forIssuer: false);
        return new CertificateInfo(cn, cert.NotBefore.ToUniversalTime(), cert.NotAfter.ToUniversalTime(),
            ReadSubjectCuit(cert.SubjectName.Name));
    }

    /// <summary>
    /// El CUIT del titular, del "SERIALNUMBER=CUIT 20123456789" que ARCA exige en
    /// el subject. Según la plataforma el atributo sale como SERIALNUMBER o como
    /// OID.2.5.4.5, así que se busca el "CUIT nnnnnnnnnnn" en el nombre entero.
    /// </summary>
    public static string? ReadSubjectCuit(string subject)
    {
        var match = System.Text.RegularExpressions.Regex.Match(subject, @"CUIT\s*(\d{11})");
        return match.Success ? match.Groups[1].Value : null;
    }

    // Escapa comas/caracteres especiales del RDN.
    private static string Escape(string value) =>
        value.Replace("\\", "\\\\").Replace(",", "\\,").Replace("=", "\\=").Replace("\"", string.Empty).Trim();
}
