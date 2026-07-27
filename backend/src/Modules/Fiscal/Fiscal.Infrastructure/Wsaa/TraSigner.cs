using System.Globalization;
using System.Security.Cryptography.Pkcs;
using System.Security.Cryptography.X509Certificates;
using System.Xml.Linq;

namespace Fiscal.Infrastructure.Wsaa;

/// <summary>
/// Arma el TRA (Ticket de Requerimiento de Acceso) XML y lo firma como CMS/
/// PKCS#7 con el certificado del tenant — el "sobre firmado" que espera loginCms.
/// </summary>
public static class TraSigner
{
    /// <summary>
    /// TRA XML para un servicio. Tolerancia de reloj de ARCA: ±24h (H5). Dejamos
    /// un margen amplio pero conservador. uniqueId es xsd:unsignedInt: usamos el
    /// epoch en segundos (entra en uint hasta 2106; documentar rollover).
    /// </summary>
    public static string BuildTra(string service, DateTimeOffset now)
    {
        var uniqueId = (uint)(now.ToUnixTimeSeconds() % uint.MaxValue);
        // Generación 10 min atrás, expiración 10 min adelante: margen holgado
        // contra desfasajes de reloj, muy por debajo del límite de 24h.
        var gen = now.AddMinutes(-10);
        var exp = now.AddMinutes(10);

        var tra = new XElement("loginTicketRequest",
            new XAttribute("version", "1.0"),
            new XElement("header",
                new XElement("uniqueId", uniqueId.ToString(CultureInfo.InvariantCulture)),
                new XElement("generationTime", gen.ToString("yyyy-MM-ddTHH:mm:sszzz", CultureInfo.InvariantCulture)),
                new XElement("expirationTime", exp.ToString("yyyy-MM-ddTHH:mm:sszzz", CultureInfo.InvariantCulture))),
            new XElement("service", service));

        return new XDeclaration("1.0", "UTF-8", null) + tra.ToString(SaveOptions.DisableFormatting);
    }

    /// <summary>Firma el TRA como CMS y devuelve el base64 (parámetro in0 de loginCms).</summary>
    public static string SignCms(string traXml, X509Certificate2 certificate)
    {
        var content = new ContentInfo(System.Text.Encoding.UTF8.GetBytes(traXml));
        var signed = new SignedCms(content);
        var signer = new CmsSigner(certificate) { IncludeOption = X509IncludeOption.EndCertOnly };
        signed.ComputeSignature(signer, silent: true);
        return Convert.ToBase64String(signed.Encode());
    }

    /// <summary>
    /// Reconstruye el X509Certificate2 CON clave privada a partir de los PEM.
    /// En Windows, un cert creado directo de PEM no sirve para firmar CMS
    /// (clave efímera): hay que hacer un round-trip por PKCS#12. Este método lo
    /// resuelve de forma portable (Windows y Linux).
    /// </summary>
    public static X509Certificate2 LoadForSigning(string certificatePem, string privateKeyPem)
    {
        using var fromPem = X509Certificate2.CreateFromPem(certificatePem, privateKeyPem);
        var pfx = fromPem.Export(X509ContentType.Pkcs12);
        return X509CertificateLoader.LoadPkcs12(pfx, password: null,
            keyStorageFlags: X509KeyStorageFlags.Exportable | X509KeyStorageFlags.EphemeralKeySet);
    }
}
