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

/// <summary>Ticket de acceso al padrón y con qué servicio de WSAA se consiguió.</summary>
/// <param name="Legacy">
/// Salió con el servicio viejo (<see cref="ConstanciaInscripcionClient.LegacyService"/>):
/// anda, pero ARCA lo dio de baja y el comercio tiene que asociar el nuevo.
/// </param>
public sealed record PadronTicket(FiscalTicket Ticket, bool Legacy);

/// <summary>
/// Adaptador de la constancia de inscripción de ARCA (servicio
/// ws_sr_constancia_inscripcion, operación getPersona_v2): quién es un CUIT y
/// su condición frente al IVA.
///
/// <para>
/// Antes se llamaba "padrón alcance 5" (ws_sr_padron_a5). ARCA le cambió el
/// nombre en 2017 y hoy marca el viejo como deprecado, pero el web service es
/// el mismo: la URL sigue terminando en <c>personaServiceA5</c> y el namespace
/// es <c>http://a5.soap.ws.server.puc.sr/</c> (manual v4.1, mar-2026).
/// </para>
///
/// <para>
/// Usa lo mismo que la facturación —el certificado activo y el CUIT emisor de
/// la tienda, y un ticket de WSAA—, pero para otro servicio. El ticket se
/// cachea aparte (es por servicio), y el certificado tiene que estar asociado
/// al servicio en ARCA (WSASS en homologación, Administrador de Relaciones en
/// producción). Una tienda que lo había asociado al nombre viejo sigue
/// andando: si WSAA rechaza el nuevo se prueba con el viejo, y el diagnóstico
/// de la conexión avisa que hay que asociar el nuevo.
/// </para>
/// </summary>
public sealed class ConstanciaInscripcionClient(
    HttpClient http,
    IOptions<FiscalEndpointsOptions> endpoints,
    FiscalDbContext db,
    IFiscalAuthenticator authenticator,
    ILogger<ConstanciaInscripcionClient> logger) : ITaxpayerRegistry
{
    /// <summary>Servicio de WSAA de la constancia de inscripción.</summary>
    public const string Service = "ws_sr_constancia_inscripcion";

    /// <summary>El nombre viejo (padrón alcance 5), deprecado por ARCA.</summary>
    public const string LegacyService = "ws_sr_padron_a5";

    /// <summary>Lo que se le dice al comercio cuando ARCA no da acceso.</summary>
    public const string NotAuthorizedHint =
        "Asociá el servicio de consulta de la constancia de inscripción (\"" + Service + "\") a tu certificado: "
        + "en homologación desde WSASS y en producción desde el Administrador de Relaciones de ARCA.";

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

        var ticket = await AuthorizeAsync(tenantId, issuer.Value, cfg.Environment, ct);
        if (ticket.IsFailure) return Result.Failure<TaxpayerInfo>(ticket.Error);

        // getPersona_v2: los hijos van SIN namespace (elementFormDefault unqualified).
        var body = new XElement(A5 + "getPersona_v2",
            new XElement("token", ticket.Value.Ticket.Token),
            new XElement("sign", ticket.Value.Ticket.Sign),
            new XElement("cuitRepresentada", issuer.Value.AsLong),
            new XElement("idPersona", cuit.AsLong));

        var xml = new XDocument(new XDeclaration("1.0", "utf-8", null),
            new XElement(Soap + "Envelope",
                new XAttribute(XNamespace.Xmlns + "soapenv", Soap.NamespaceName),
                new XAttribute(XNamespace.Xmlns + "a5", A5.NamespaceName),
                new XElement(Soap + "Header"),
                new XElement(Soap + "Body", body)))
            .ToString(SaveOptions.DisableFormatting);

        using var req = new HttpRequestMessage(HttpMethod.Post, endpoints.Value.ConstanciaInscripcion(cfg.Environment))
        {
            Content = new StringContent(xml, System.Text.Encoding.UTF8, "text/xml"),
        };
        req.Headers.TryAddWithoutValidation("SOAPAction", "\"\"");

        HttpResponseMessage resp;
        try { resp = await http.SendAsync(req, ct); }
        catch (Exception ex)
        {
            logger.LogError(ex, "Constancia de inscripción: fallo de red/TLS.");
            return Result.Failure<TaxpayerInfo>(Error.Conflict(FiscalGatewayErrors.Network, "No se pudo conectar con ARCA (padrón)."));
        }

        var text = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            // Un CUIT que no existe vuelve como SOAP Fault ("No existe persona
            // con ese Id"), no como respuesta vacía.
            var fault = SoapFault.Extract(text);
            logger.LogWarning("Constancia de inscripción {Status}: {Fault}", (int)resp.StatusCode, fault);
            return Result.Failure<TaxpayerInfo>(Error.Validation("Padron.NotFound", $"ARCA (padrón): {fault}"));
        }

        try
        {
            return ConstanciaInscripcionResponse.Parse(XDocument.Parse(text).Root!, cuit.AsLong);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Constancia de inscripción: respuesta no válida.");
            return Result.Failure<TaxpayerInfo>(Error.Conflict(FiscalGatewayErrors.BadResponse, "Respuesta del padrón no válida."));
        }
    }

    /// <summary>
    /// Ticket de WSAA para el padrón: primero con el servicio vigente y, si
    /// WSAA lo rechaza, con el nombre viejo (un certificado que solo se asoció
    /// a ws_sr_padron_a5 sigue andando mientras ARCA lo acepte). Los errores
    /// que no son un rechazo de WSAA (sin certificado, red) no se reintentan.
    /// </summary>
    public async Task<Result<PadronTicket>> AuthorizeAsync(
        Guid tenantId, Cuit issuer, FiscalEnvironment environment, CancellationToken ct = default)
    {
        var current = await authenticator.GetTicketAsync(tenantId, issuer, Service, environment, ct);
        if (current.IsSuccess) return new PadronTicket(current.Value, Legacy: false);

        if (current.Error.Code == WsaaClient.RejectedCode)
        {
            var legacy = await authenticator.GetTicketAsync(tenantId, issuer, LegacyService, environment, ct);
            if (legacy.IsSuccess)
            {
                logger.LogWarning("Padrón: el certificado de la tienda {Tenant} solo está asociado al servicio viejo {Legacy}.",
                    tenantId, LegacyService);
                return new PadronTicket(legacy.Value, Legacy: true);
            }
        }

        return Result.Failure<PadronTicket>(Error.Conflict("Padron.NotAuthorized",
            $"ARCA no dio acceso al padrón. {NotAuthorizedHint} ({current.Error.Message})"));
    }
}
