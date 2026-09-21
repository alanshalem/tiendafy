using SharedKernel.Common;

namespace Fiscal.Contracts;

/// <summary>Cifra secretos fiscales (clave privada, cert, TA) en reposo.</summary>
public interface IFiscalSecretProtector
{
    string Protect(string plaintext);
    string Unprotect(string ciphertext);
}

public sealed record GenerateCsrRequest(string Cuit, string BusinessName, string Alias);

/// <summary>Resultado de generar el par de claves + CSR para ARCA.</summary>
public sealed record CsrResult(string PrivateKeyPem, string CsrPem);

/// <summary>
/// Datos extraídos de un certificado X.509 ya firmado por ARCA. SubjectCuit es el
/// CUIT del TITULAR del certificado (el "SERIALNUMBER=CUIT ..." del subject), que
/// no tiene por qué ser el que factura: con delegación de servicio, un
/// certificado emite a nombre de otros.
/// </summary>
public sealed record CertificateInfo(string SubjectCn, DateTime NotBeforeUtc, DateTime NotAfterUtc, string? SubjectCuit = null);

/// <summary>
/// Cripto de certificados fiscales: genera keypair+CSR (el merchant no toca
/// OpenSSL) e inspecciona el certificado firmado que devuelve. La firma CMS
/// del TRA (WSAA) vive en el autenticador, no acá.
/// </summary>
public interface IFiscalCertificateFactory
{
    /// <summary>Genera RSA 2048 + CSR PKCS#10 con el subject que exige ARCA.</summary>
    CsrResult GenerateKeyAndCsr(GenerateCsrRequest request);

    /// <summary>Valida que el cert firmado corresponda a la clave privada y devuelve sus datos.</summary>
    Result<CertificateInfo> InspectSignedCertificate(string certificatePem, string privateKeyPem);
}
