using System.Xml.Linq;
using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Persistence;
using Fiscal.Infrastructure.Wsaa;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SharedKernel.Common;

namespace Fiscal.Infrastructure.Padron;

/// <summary>
/// Adaptador del padrón A5 de ARCA (ws_sr_padron_a5, operación getPersona_v2):
/// la constancia de inscripción de un CUIT.
///
/// <para>
/// Usa lo mismo que la facturación —el certificado activo y el CUIT emisor de
/// la tienda, y un ticket de WSAA—, pero para otro servicio. El ticket se
/// cachea aparte (es por servicio), y el certificado tiene que estar habilitado
/// para el padrón en el Administrador de Relaciones de ARCA: si no lo está,
/// WSAA lo rechaza y se devuelve un mensaje que dice exactamente eso.
/// </para>
/// </summary>
public sealed class PadronA5Client(
    HttpClient http,
    IOptions<FiscalEndpointsOptions> endpoints,
    FiscalDbContext db,
    IFiscalAuthenticator authenticator,
    ILogger<PadronA5Client> logger) : ITaxpayerRegistry
{
    /// <summary>Servicio de WSAA del padrón.</summary>
    public const string Service = "ws_sr_padron_a5";

    private static readonly XNamespace Soap = "http://schemas.xmlsoap.org/soap/envelope/";
    private static readonly XNamespace A5 = "http://a5.soap.ws.server.puc.sr/";

    public async Task<Result<TaxpayerInfo>> LookupAsync(Guid tenantId, Cuit cuit, CancellationToken ct = default)
    {
        var cfg = await db.Configs.AsNoTracking().FirstOrDefaultAsync(c => c.TenantId == tenantId, ct);
        if (cfg is null)
            return Result.Failure<TaxpayerInfo>(Error.Conflict("Fiscal.NotConfigured",
                "Para consultar el padrón primero hay que configurar la facturación con ARCA."));

        var issuer = Cuit.Create(cfg.Cuit);
        if (issuer.IsFailure) return Result.Failure<TaxpayerInfo>(issuer.Error);

        var ticket = await authenticator.GetTicketAsync(tenantId, issuer.Value, Service, cfg.Environment, ct);
        if (ticket.IsFailure)
            return Result.Failure<TaxpayerInfo>(Error.Conflict("Padron.NotAuthorized",
                "ARCA no dio acceso al padrón. Habilitá el servicio \"ws_sr_padron_a5\" para el certificado "
                + $"en el Administrador de Relaciones de ARCA. ({ticket.Error.Message})"));

        // getPersona_v2: los hijos van SIN namespace (elementFormDefault unqualified).
        var body = new XElement(A5 + "getPersona_v2",
            new XElement("token", ticket.Value.Token),
            new XElement("sign", ticket.Value.Sign),
            new XElement("cuitRepresentada", issuer.Value.AsLong),
            new XElement("idPersona", cuit.AsLong));

        var xml = new XDocument(new XDeclaration("1.0", "utf-8", null),
            new XElement(Soap + "Envelope",
                new XAttribute(XNamespace.Xmlns + "soapenv", Soap.NamespaceName),
                new XAttribute(XNamespace.Xmlns + "a5", A5.NamespaceName),
                new XElement(Soap + "Header"),
                new XElement(Soap + "Body", body)))
            .ToString(SaveOptions.DisableFormatting);

        using var req = new HttpRequestMessage(HttpMethod.Post, endpoints.Value.PadronA5(cfg.Environment))
        {
            Content = new StringContent(xml, System.Text.Encoding.UTF8, "text/xml"),
        };
        req.Headers.TryAddWithoutValidation("SOAPAction", "\"\"");

        HttpResponseMessage resp;
        try { resp = await http.SendAsync(req, ct); }
        catch (Exception ex)
        {
            logger.LogError(ex, "Padrón A5: fallo de red/TLS.");
            return Result.Failure<TaxpayerInfo>(Error.Conflict(FiscalGatewayErrors.Network, "No se pudo conectar con ARCA (padrón)."));
        }

        var text = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            // Un CUIT que no existe vuelve como SOAP Fault, no como respuesta vacía.
            var fault = SoapFault.Extract(text);
            logger.LogWarning("Padrón A5 {Status}: {Fault}", (int)resp.StatusCode, fault);
            return Result.Failure<TaxpayerInfo>(Error.Validation("Padron.NotFound", $"ARCA (padrón): {fault}"));
        }

        try
        {
            return PadronA5Response.Parse(XDocument.Parse(text).Root!, cuit.AsLong);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Padrón A5: respuesta no válida.");
            return Result.Failure<TaxpayerInfo>(Error.Conflict(FiscalGatewayErrors.BadResponse, "Respuesta del padrón no válida."));
        }
    }
}
