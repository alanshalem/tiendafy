using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using SharedKernel.Common;

namespace Fiscal.Infrastructure.Wsaa;

/// <summary>Credenciales devueltas por WSAA (loginCms).</summary>
public sealed record WsaaCredentials(string Token, string Sign, DateTimeOffset ExpirationTime);

/// <summary>
/// Cliente HTTP de WSAA: manda el CMS firmado a loginCms y parsea el TA.
/// El HttpClient viene con TLS explícito (H2/H3) configurado en el módulo.
/// </summary>
public sealed class WsaaClient(HttpClient http, ILogger<WsaaClient> logger)
{
    /// <summary>
    /// WSAA rechazó el login porque ya hay un TA vigente para este certificado.
    /// Tiene código propio porque el caller lo puede resolver: si tiene ese TA
    /// guardado, lo usa.
    /// </summary>
    public const string AlreadyAuthenticatedCode = "Wsaa.AlreadyAuthenticated";

    public async Task<Result<WsaaCredentials>> LoginCmsAsync(string endpoint, string cmsBase64, CancellationToken ct)
    {
        var soap =
            "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:wsaa=\"http://wsaa.view.wsdl.afip.gov.ar/\">" +
            "<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>" +
            System.Security.SecurityElement.Escape(cmsBase64) +
            "</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>";

        using var req = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = new StringContent(soap, System.Text.Encoding.UTF8, "text/xml"),
        };
        req.Headers.TryAddWithoutValidation("SOAPAction", "");

        HttpResponseMessage resp;
        try
        {
            resp = await http.SendAsync(req, ct);
        }
        catch (Exception ex)
        {
            // Handshake TLS fallido (H2/H3, ver FiscalModule.ArcaHandler) cae acá.
            logger.LogError(ex, "WSAA loginCms: fallo de red/TLS contra {Endpoint}.", endpoint);
            return Result.Failure<WsaaCredentials>(Error.Conflict("Wsaa.Network",
                "No se pudo conectar con ARCA (WSAA). Revisá conectividad/TLS del ambiente."));
        }

        var body = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            // WSAA devuelve el detalle del error (ej. coe.notAuthorized, cms.sign.invalid)
            // en un SOAP Fault. No lo tragamos: sirve para diagnosticar.
            var fault = SoapFault.Extract(body);
            var faultCode = SoapFault.ExtractCode(body);
            logger.LogWarning("WSAA loginCms {Status}: {Code} {Fault}", (int)resp.StatusCode, faultCode, fault);

            // El motivo técnico viene en el faultcode; se evalúan los dos juntos.
            var both = $"{faultCode} {fault}";
            var why = Fiscal.Core.Domain.ArcaErrorCatalog.ExplainWsaaFault(both);
            var code = both.Contains("alreadyAuthenticated", StringComparison.OrdinalIgnoreCase)
                       || fault.Contains("ya posee un TA valido", StringComparison.OrdinalIgnoreCase)
                ? AlreadyAuthenticatedCode
                : "Wsaa.Rejected";
            return Result.Failure<WsaaCredentials>(Error.Conflict(code,
                why is null ? $"ARCA rechazó la autenticación: {fault}" : $"ARCA rechazó la autenticación: {fault} — {why}"));
        }

        try
        {
            // El loginCmsReturn contiene el loginTicketResponse (XML) ya des-escapado por el parser.
            var doc = XDocument.Parse(body);
            var ret = doc.Descendants().FirstOrDefault(e => e.Name.LocalName == "loginCmsReturn")?.Value;
            if (string.IsNullOrWhiteSpace(ret))
                return Result.Failure<WsaaCredentials>(Error.Conflict("Wsaa.BadResponse", "WSAA no devolvió el ticket."));

            var ticket = XDocument.Parse(ret);
            var token = ticket.Descendants("token").FirstOrDefault()?.Value;
            var sign = ticket.Descendants("sign").FirstOrDefault()?.Value;
            var expText = ticket.Descendants("expirationTime").FirstOrDefault()?.Value;
            if (token is null || sign is null || expText is null)
                return Result.Failure<WsaaCredentials>(Error.Conflict("Wsaa.BadResponse", "Ticket de WSAA incompleto."));

            var exp = DateTimeOffset.Parse(expText, System.Globalization.CultureInfo.InvariantCulture);
            return new WsaaCredentials(token, sign, exp);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "WSAA loginCms: no se pudo parsear la respuesta.");
            return Result.Failure<WsaaCredentials>(Error.Conflict("Wsaa.BadResponse", "Respuesta de WSAA no válida."));
        }
    }
}
