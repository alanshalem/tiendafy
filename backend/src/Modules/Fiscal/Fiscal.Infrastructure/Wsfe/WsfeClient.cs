using System.Globalization;
using System.Xml.Linq;
using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Wsaa;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SharedKernel.Common;

namespace Fiscal.Infrastructure.Wsfe;

/// <summary>
/// Adapter de WSFEv1 (factura electrónica de ARCA). SOAP armado y parseado a
/// mano (el WSDL productivo tiene TLS/rate-limit; dotnet-svcutil no es viable en
/// CI). Namespace del servicio: http://ar.gov.afip.dif.FEV1/.
/// </summary>
public sealed class WsfeClient(
    HttpClient http, IOptions<FiscalEndpointsOptions> endpoints, ILogger<WsfeClient> logger) : IFiscalGateway
{
    private static readonly XNamespace Ar = "http://ar.gov.afip.dif.FEV1/";
    private static readonly XNamespace Soap = "http://schemas.xmlsoap.org/soap/envelope/";

    public async Task<Result<FiscalHealth>> CheckHealthAsync(FiscalEnvironment environment, CancellationToken ct = default)
    {
        var body = new XElement(Ar + "FEDummy");
        var resp = await CallAsync(environment, "FEDummy", body, ct);
        if (resp.IsFailure) return Result.Failure<FiscalHealth>(resp.Error);

        var r = resp.Value.Descendants().FirstOrDefault(e => e.Name.LocalName == "FEDummyResult");
        string Val(string name) => r?.Descendants().FirstOrDefault(e => e.Name.LocalName == name)?.Value ?? "";
        return new FiscalHealth(
            AppOk: Val("AppServer").Equals("OK", StringComparison.OrdinalIgnoreCase),
            DbOk: Val("DbServer").Equals("OK", StringComparison.OrdinalIgnoreCase),
            AuthOk: Val("AuthServer").Equals("OK", StringComparison.OrdinalIgnoreCase));
    }

    public async Task<Result<long>> GetLastAuthorizedAsync(
        FiscalTicket auth, Cuit cuit, FiscalEnvironment environment, int ptoVta, CbteTipo cbteTipo, CancellationToken ct = default)
    {
        var body = new XElement(Ar + "FECompUltimoAutorizado",
            AuthElement(auth, cuit),
            new XElement(Ar + "PtoVta", ptoVta),
            new XElement(Ar + "CbteTipo", (int)cbteTipo));

        var resp = await CallAsync(environment, "FECompUltimoAutorizado", body, ct);
        if (resp.IsFailure) return Result.Failure<long>(resp.Error);

        var errors = ParseErrors(resp.Value);
        if (errors.Count > 0)
            return Result.Failure<long>(Error.Conflict("Wsfe.Error", $"{errors[0].Code}: {errors[0].Message}"));

        var nro = resp.Value.Descendants().FirstOrDefault(e => e.Name.LocalName == "CbteNro")?.Value;
        return long.TryParse(nro, out var n) ? n : 0L;
    }

    public async Task<Result<CaeOutcome>> RequestCaeAsync(
        FiscalTicket auth, Cuit cuit, FiscalEnvironment environment,
        int ptoVta, long number, DateOnly cbteFch, InvoiceDraft draft, CancellationToken ct = default)
    {
        var det = new XElement(Ar + "FECAEDetRequest",
            new XElement(Ar + "Concepto", (int)draft.Concepto),
            new XElement(Ar + "DocTipo", (int)draft.Receptor.DocTipo),
            new XElement(Ar + "DocNro", draft.Receptor.DocNro),
            new XElement(Ar + "CbteDesde", number),
            new XElement(Ar + "CbteHasta", number),
            new XElement(Ar + "CbteFch", cbteFch.ToString("yyyyMMdd")),
            new XElement(Ar + "ImpTotal", Dec(draft.ImpTotal)),
            new XElement(Ar + "ImpTotConc", Dec(draft.ImpTotConc)),
            new XElement(Ar + "ImpNeto", Dec(draft.ImpNeto)),
            new XElement(Ar + "ImpOpEx", Dec(draft.ImpOpEx)),
            new XElement(Ar + "ImpIVA", Dec(draft.ImpIVA)),
            new XElement(Ar + "ImpTrib", Dec(draft.ImpTrib)),
            new XElement(Ar + "MonId", draft.Currency),
            new XElement(Ar + "MonCotiz", "1"),
            new XElement(Ar + "CondicionIVAReceptorId", (int)draft.Receptor.Condicion));

        // Array Iva SOLO para A/B (clase C no lleva — error 10071, H15).
        if (draft.Iva.Count > 0)
            det.Add(new XElement(Ar + "Iva",
                draft.Iva.Select(l => new XElement(Ar + "AlicIva",
                    new XElement(Ar + "Id", (int)l.Id),
                    new XElement(Ar + "BaseImp", Dec(l.BaseImp)),
                    new XElement(Ar + "Importe", Dec(l.Importe))))));

        var body = new XElement(Ar + "FECAESolicitar",
            AuthElement(auth, cuit),
            new XElement(Ar + "FeCAEReq",
                new XElement(Ar + "FeCabReq",
                    new XElement(Ar + "CantReg", 1),
                    new XElement(Ar + "PtoVta", ptoVta),
                    new XElement(Ar + "CbteTipo", (int)draft.CbteTipo)),
                new XElement(Ar + "FeDetReq", det)));

        var resp = await CallAsync(environment, "FECAESolicitar", body, ct);
        var requestXml = new XDocument(Envelope(body)).ToString();
        if (resp.IsFailure) return Result.Failure<CaeOutcome>(resp.Error);
        var responseXml = resp.Value.ToString();

        // Errores de nivel request (auth, estructura) → rechazo directo.
        var reqErrors = ParseErrors(resp.Value);

        var cab = resp.Value.Descendants().FirstOrDefault(e => e.Name.LocalName == "FeCabResp");
        var resultado = cab?.Descendants().FirstOrDefault(e => e.Name.LocalName == "Resultado")?.Value ?? "R";

        var detResp = resp.Value.Descendants().FirstOrDefault(e => e.Name.LocalName == "FECAEDetResponse");
        string DetVal(string name) => detResp?.Descendants().FirstOrDefault(e => e.Name.LocalName == name)?.Value ?? "";

        var obs = ParseMessages(detResp, "Obs");
        var errors = reqErrors.Concat(ParseMessages(detResp, "Err")).ToList();

        DateOnly? caeVto = null;
        var vtoRaw = DetVal("CAEFchVto");
        if (vtoRaw.Length == 8 && DateOnly.TryParseExact(vtoRaw, "yyyyMMdd", out var v)) caeVto = v;

        var cae = DetVal("CAE");
        return new CaeOutcome(resultado, string.IsNullOrEmpty(cae) ? null : cae, caeVto, obs, errors, requestXml, responseXml);
    }

    // ---- Plomería SOAP -----------------------------------------------------------

    private XElement AuthElement(FiscalTicket auth, Cuit cuit) =>
        new(Ar + "Auth",
            new XElement(Ar + "Token", auth.Token),
            new XElement(Ar + "Sign", auth.Sign),
            new XElement(Ar + "Cuit", cuit.AsLong));

    private XElement Envelope(XElement body) =>
        new(Soap + "Envelope",
            new XAttribute(XNamespace.Xmlns + "soap", Soap.NamespaceName),
            new XAttribute(XNamespace.Xmlns + "ar", Ar.NamespaceName),
            new XElement(Soap + "Body", body));

    private async Task<Result<XElement>> CallAsync(FiscalEnvironment env, string operation, XElement body, CancellationToken ct)
    {
        var xml = new XDocument(new XDeclaration("1.0", "utf-8", null), Envelope(body)).ToString(SaveOptions.DisableFormatting);
        using var req = new HttpRequestMessage(HttpMethod.Post, endpoints.Value.Wsfe(env))
        {
            Content = new StringContent(xml, System.Text.Encoding.UTF8, "text/xml"),
        };
        req.Headers.TryAddWithoutValidation("SOAPAction", $"http://ar.gov.afip.dif.FEV1/{operation}");

        HttpResponseMessage resp;
        try { resp = await http.SendAsync(req, ct); }
        catch (Exception ex)
        {
            logger.LogError(ex, "WSFEv1 {Op}: fallo de red/TLS.", operation);
            return Result.Failure<XElement>(Error.Conflict("Wsfe.Network", "No se pudo conectar con ARCA (WSFEv1)."));
        }

        var text = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
        {
            var fault = ExtractFault(text);
            logger.LogWarning("WSFEv1 {Op} {Status}: {Fault}", operation, (int)resp.StatusCode, fault);
            return Result.Failure<XElement>(Error.Conflict("Wsfe.Fault", $"ARCA (WSFEv1): {fault}"));
        }

        try { return XDocument.Parse(text).Root!; }
        catch { return Result.Failure<XElement>(Error.Conflict("Wsfe.BadResponse", "Respuesta de WSFEv1 no válida.")); }
    }

    private static IReadOnlyList<FiscalMessage> ParseErrors(XElement root) => ParseMessages(root, "Err");

    private static IReadOnlyList<FiscalMessage> ParseMessages(XElement? scope, string localName)
    {
        if (scope is null) return [];
        return [.. scope.Descendants().Where(e => e.Name.LocalName == localName).Select(e =>
            new FiscalMessage(
                e.Descendants().FirstOrDefault(x => x.Name.LocalName == "Code")?.Value ?? "",
                e.Descendants().FirstOrDefault(x => x.Name.LocalName == "Msg")?.Value ?? ""))];
    }

    private static string Dec(decimal v) => v.ToString("0.00", CultureInfo.InvariantCulture);

    private static string ExtractFault(string body)
    {
        try
        {
            var s = XDocument.Parse(body).Descendants().FirstOrDefault(e => e.Name.LocalName == "faultstring")?.Value;
            return string.IsNullOrWhiteSpace(s) ? "(sin detalle)" : s.Trim();
        }
        catch { return "(sin detalle)"; }
    }
}
