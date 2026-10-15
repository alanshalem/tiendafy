using System.Net;
using System.Security;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.RegularExpressions;

namespace IntegrationTests;

/// <summary>
/// Una CA de prueba que hace de ARCA: firma el CSR que generó la API con
/// su clave pública. Lo que vuelve es un certificado real, igual al que se
/// descarga de ARCA.
/// </summary>
public static class TestCa
{
    private static readonly Lazy<X509Certificate2> Ca = new(() =>
    {
        using var key = RSA.Create(2048);
        var req = new CertificateRequest("CN=AFIP Test CA, O=Tiendafy Tests", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        req.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, false, 0, true));
        return req.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddYears(2));
    });

    public static string Sign(string csrPem)
    {
        var req = CertificateRequest.LoadSigningRequestPem(csrPem, HashAlgorithmName.SHA256,
            CertificateRequestLoadOptions.UnsafeLoadCertificateExtensions, RSASignaturePadding.Pkcs1);
        using var cert = req.Create(Ca.Value, DateTimeOffset.UtcNow.AddHours(-1), DateTimeOffset.UtcNow.AddYears(1),
            RandomNumberGenerator.GetBytes(8));
        return cert.ExportCertificatePem();
    }

    /// <summary>Un certificado válido pero de OTRA clave.</summary>
    public static string SignUnrelated()
    {
        using var other = RSA.Create(2048);
        var req = new CertificateRequest($"CN=otro, SERIALNUMBER=CUIT {FakeArca.Cuit}", other, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        return Sign(new string(PemEncoding.Write("CERTIFICATE REQUEST", req.CreateSigningRequest())));
    }
}

/// <summary>
/// ARCA en SOAP: WSAA entrega tickets, WSFEv1 numera (último + 1) y da CAE,
/// el padrón contesta una persona. Cada servicio se puede romper a pedido.
/// </summary>
public sealed partial class FakeArca
{
    public const string Cuit = "20111111112";
    public const string Wsaa = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms";
    public const string Wsfe = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
    public const string Padron = "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5";

    private readonly Dictionary<string, long> _last = [];
    private readonly Dictionary<string, (string DocTipo, string DocNro, string ImpTotal, string Cae, string Vto)> _authorized = [];

    public string? WsaaFault { get; set; }
    public string? PadronFault { get; set; }
    public bool RejectNext { get; set; }
    public bool Down { get; set; }
    public (string Code, string Message)? LastAuthorizedError { get; set; }

    /// <summary>
    /// El próximo FECAESolicitar se autoriza y la respuesta se pierde (la
    /// conexión se corta): ARCA tiene el comprobante y la API no se enteró.
    /// </summary>
    public bool LoseNextResponse { get; set; }

    /// <summary>Pedidos de CAE que llegaron (autorizados o no).</summary>
    public int CaeRequests { get; private set; }

    public FakeArca(FakeHttp http)
    {
        http.On(HttpMethod.Post, Wsaa, (_, _) => WsaaFault is { } fault ? Fault(fault) : Xml(LoginTicket()));
        http.On(HttpMethod.Post, Wsfe, (req, body) => HandleWsfe(req.Headers.GetValues("SOAPAction").First(), body!));
        http.On(HttpMethod.Post, Padron, (_, _) => PadronFault is { } fault ? Fault(fault) : Xml(Persona()));
    }

    private HttpResponseMessage HandleWsfe(string action, string body)
    {
        if (action.EndsWith("FEDummy\"") || action.EndsWith("FEDummy"))
        {
            var ok = Down ? "ERROR" : "OK";
            return Xml($"<FEDummyResponse xmlns=\"http://ar.gov.afip.dif.FEV1/\"><FEDummyResult><AppServer>{ok}</AppServer><DbServer>{ok}</DbServer><AuthServer>{ok}</AuthServer></FEDummyResult></FEDummyResponse>");
        }

        var ptoVta = Tag(body, "PtoVta");
        var tipo = Tag(body, "CbteTipo");
        var key = $"{ptoVta}-{tipo}";

        if (action.Contains("FECompUltimoAutorizado"))
        {
            if (LastAuthorizedError is { } err)
                return Xml($"<FECompUltimoAutorizadoResponse xmlns=\"http://ar.gov.afip.dif.FEV1/\"><FECompUltimoAutorizadoResult><Errors><Err><Code>{err.Code}</Code><Msg>{err.Message}</Msg></Err></Errors></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>");
            return Xml($"<FECompUltimoAutorizadoResponse xmlns=\"http://ar.gov.afip.dif.FEV1/\"><FECompUltimoAutorizadoResult><PtoVta>{ptoVta}</PtoVta><CbteTipo>{tipo}</CbteTipo><CbteNro>{_last.GetValueOrDefault(key)}</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>");
        }

        if (action.Contains("FEParamGetPtosVenta"))
        {
            // En homologación ARCA no lista los puntos de venta (error 602).
            return Xml("<FEParamGetPtosVentaResponse xmlns=\"http://ar.gov.afip.dif.FEV1/\"><FEParamGetPtosVentaResult><Errors><Err><Code>602</Code><Msg>Sin Resultados</Msg></Err></Errors></FEParamGetPtosVentaResult></FEParamGetPtosVentaResponse>");
        }

        if (action.Contains("FECompConsultar"))
        {
            var nro = Tag(body, "CbteNro");
            if (!_authorized.TryGetValue($"{key}-{nro}", out var a))
                return Xml("<FECompConsultarResponse xmlns=\"http://ar.gov.afip.dif.FEV1/\"><FECompConsultarResult><Errors><Err><Code>602</Code><Msg>No existen datos en nuestros registros para los parametros ingresados.</Msg></Err></Errors></FECompConsultarResult></FECompConsultarResponse>");
            return Xml("<FECompConsultarResponse xmlns=\"http://ar.gov.afip.dif.FEV1/\"><FECompConsultarResult><ResultGet>" +
                $"<Concepto>1</Concepto><DocTipo>{a.DocTipo}</DocTipo><DocNro>{a.DocNro}</DocNro><CbteDesde>{nro}</CbteDesde><CbteHasta>{nro}</CbteHasta>" +
                $"<CbteFch>{DateTime.UtcNow:yyyyMMdd}</CbteFch><ImpTotal>{a.ImpTotal}</ImpTotal><Resultado>A</Resultado>" +
                $"<CodAutorizacion>{a.Cae}</CodAutorizacion><EmisionTipo>CAE</EmisionTipo><FchVto>{a.Vto}</FchVto>" +
                $"<PtoVta>{ptoVta}</PtoVta><CbteTipo>{tipo}</CbteTipo></ResultGet></FECompConsultarResult></FECompConsultarResponse>");
        }

        if (action.Contains("FECAESolicitar"))
        {
            CaeRequests++;
            var number = long.Parse(Tag(body, "CbteDesde"));
            if (RejectNext)
            {
                RejectNext = false;
                return Xml($"<FECAESolicitarResponse xmlns=\"http://ar.gov.afip.dif.FEV1/\"><FECAESolicitarResult><FeCabResp><Resultado>R</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><CbteDesde>{number}</CbteDesde><Resultado>R</Resultado><Observaciones><Obs><Code>10015</Code><Msg>El campo DocNro es invalido</Msg></Obs></Observaciones></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>");
            }
            _last[key] = number;
            var cae = "7" + Random.Shared.NextInt64(1_000_000_000_000, 9_999_999_999_999);
            var vto = DateTime.UtcNow.AddDays(10).ToString("yyyyMMdd");
            _authorized[$"{key}-{number}"] = (Tag(body, "DocTipo"), Tag(body, "DocNro"), Tag(body, "ImpTotal"), cae, vto);
            if (LoseNextResponse)
            {
                LoseNextResponse = false;
                throw new HttpRequestException("la conexión se cortó antes de la respuesta");
            }
            return Xml($"<FECAESolicitarResponse xmlns=\"http://ar.gov.afip.dif.FEV1/\"><FECAESolicitarResult><FeCabResp><Resultado>A</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><CbteDesde>{number}</CbteDesde><Resultado>A</Resultado><CAE>{cae}</CAE><CAEFchVto>{vto}</CAEFchVto></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>");
        }

        return new HttpResponseMessage(HttpStatusCode.InternalServerError) { Content = new StringContent($"operación no simulada: {action}") };
    }

    private static string LoginTicket()
    {
        var ticket = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><loginTicketResponse version=\"1.0\"><header>" +
            $"<generationTime>{DateTime.UtcNow:O}</generationTime><expirationTime>{DateTime.UtcNow.AddHours(12):O}</expirationTime>" +
            $"</header><credentials><token>TOKEN-{Guid.NewGuid():N}</token><sign>SIGN</sign></credentials></loginTicketResponse>";
        return $"<loginCmsResponse xmlns=\"http://wsaa.view.wsdl.afip.gov.ar\"><loginCmsReturn>{SecurityElement.Escape(ticket)}</loginCmsReturn></loginCmsResponse>";
    }

    private static string Persona() =>
        "<ns2:getPersona_v2Response xmlns:ns2=\"http://a5.soap.ws.server.puc.sr/\"><personaReturn>" +
        "<datosGenerales><razonSocial>PUENTE ORIENTE SA</razonSocial><tipoPersona>JURIDICA</tipoPersona>" +
        "<domicilioFiscal><direccion>AV CORRIENTES 1234</direccion><localidad>CABA</localidad><descripcionProvincia>CABA</descripcionProvincia></domicilioFiscal>" +
        "</datosGenerales><datosRegimenGeneral><impuesto><idImpuesto>30</idImpuesto><descripcionImpuesto>IVA</descripcionImpuesto></impuesto></datosRegimenGeneral>" +
        "</personaReturn></ns2:getPersona_v2Response>";

    private static HttpResponseMessage Xml(string inner) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(
            $"<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"><soap:Body>{inner}</soap:Body></soap:Envelope>",
            Encoding.UTF8, "text/xml"),
    };

    private static HttpResponseMessage Fault(string message) => new(HttpStatusCode.InternalServerError)
    {
        Content = new StringContent(
            "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\"><soapenv:Body><soapenv:Fault>" +
            $"<faultcode>ns1:{message}</faultcode><faultstring>{message}</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>",
            Encoding.UTF8, "text/xml"),
    };

    private static string Tag(string xml, string name) =>
        TagRegex().Matches(xml).FirstOrDefault(m => m.Groups[1].Value == name)?.Groups[2].Value ?? "0";

    [GeneratedRegex(@"<(?:\w+:)?(\w+)>([^<]*)</")]
    private static partial Regex TagRegex();
}

/// <summary>Facturación electrónica lista para emitir: emisor, certificado activo y punto de venta.</summary>
public static class FiscalSetup
{
    /// <summary>
    /// Configura la facturación de la tienda por el camino del panel: datos del
    /// emisor, CSR, certificado firmado por la <see cref="TestCa"/> y punto de venta.
    /// </summary>
    public static async Task ConfigureFiscalAsync(this Merchant merchant, int pointOfSale = 3)
    {
        await merchant.PutAsync("/api/v1/fiscal/config", new
        {
            cuit = FakeArca.Cuit,
            businessName = "Tienda SA",
            condition = "RESPONSABLE_INSCRIPTO",
            environment = "HOMOLOGACION",
        });
        var csr = await merchant.PostAsync("/api/v1/fiscal/certificate/csr", new { alias = "tiendafy-test" });
        await merchant.PostAsync("/api/v1/fiscal/certificate/activate", new
        {
            certificateId = csr.GetProperty("certificateId").GetGuid(),
            certificatePem = TestCa.Sign(csr.GetProperty("csrPem").GetString()!),
        });
        await merchant.PostAsync("/api/v1/fiscal/points-of-sale", new { number = pointOfSale, label = "Web" });
    }
}
