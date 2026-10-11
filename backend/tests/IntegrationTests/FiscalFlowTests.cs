using System.Net;
using System.Security;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Api.Fiscal;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// Facturación electrónica con ARCA de punta a punta, por el camino de
/// producción: datos del emisor → CSR → certificado → login en WSAA (firma
/// CMS de verdad) → CAE en WSFEv1 → PDF con QR → nota de crédito → libro IVA.
///
/// <para>
/// ARCA está simulado en <see cref="FakeHttp"/> a nivel SOAP: recibe el XML que
/// arma la API y contesta XML con la forma del real. El certificado lo emite
/// el propio test para el CSR que generó la API (una CA de prueba hace de
/// ARCA), así que la clave privada, el cifrado y la firma del TRA son los de
/// producción.
/// </para>
/// </summary>
[Collection("api")]
public sealed partial class FiscalFlowTests
{
    private const string Cuit = "20111111112";
    private const string Wsaa = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms";
    private const string Wsfe = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
    private const string Padron = "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5";

    private readonly ApiFactory _factory;

    public FiscalFlowTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Configurar_certificar_facturar_y_anular()
    {
        var merchant = await Merchant.CreateAsync(_factory, "fis");
        var arca = new FakeArca(_factory.ExternalHttp);

        // Sin emisor no hay nada que hacer.
        Assert.False((await merchant.GetAsync("/api/v1/fiscal/config")).GetProperty("configured").GetBoolean());
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Put, "/api/v1/fiscal/config/emission", new { autoInvoice = true })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/certificate/csr", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/test-connection")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/fiscal/padron/{Cuit}")).StatusCode);

        // 1. Emisor: el CUIT se valida con su dígito verificador.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put, "/api/v1/fiscal/config",
            new { cuit = "20111111113", businessName = "Tienda", condition = "RESPONSABLE_INSCRIPTO" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Put, "/api/v1/fiscal/config",
            new { cuit = Cuit, businessName = "" })).StatusCode);
        await merchant.PutAsync("/api/v1/fiscal/config", new { cuit = Cuit, businessName = "Tienda, S.A.", condition = "RESPONSABLE_INSCRIPTO", environment = "HOMOLOGACION" });
        await merchant.PutAsync("/api/v1/fiscal/config", new { cuit = Cuit, businessName = "Tienda SA", condition = "RESPONSABLE_INSCRIPTO", environment = "HOMOLOGACION" });

        // 2. Certificado: CSR → ARCA lo firma → se activa.
        var csr = await merchant.PostAsync("/api/v1/fiscal/certificate/csr", new { alias = "tiendafy-test" });
        var certificateId = csr.GetProperty("certificateId").GetGuid();
        var csrPem = csr.GetProperty("csrPem").GetString()!;
        Assert.StartsWith("-----BEGIN CERTIFICATE REQUEST-----", csrPem);

        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/certificate/activate",
            new { certificateId, certificatePem = "" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/certificate/activate",
            new { certificateId, certificatePem = "no es un certificado" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/certificate/activate",
            new { certificateId, certificatePem = TestCa.SignUnrelated() })).StatusCode); // de otra clave
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/certificate/activate",
            new { certificateId = Guid.NewGuid(), certificatePem = TestCa.Sign(csrPem) })).StatusCode);

        var activated = await merchant.PostAsync("/api/v1/fiscal/certificate/activate", new { certificateId, certificatePem = TestCa.Sign(csrPem) });
        Assert.True(activated.GetProperty("usable").GetBoolean());
        var config = await merchant.GetAsync("/api/v1/fiscal/config");
        Assert.Equal("ACTIVE", config.GetProperty("certificate").GetProperty("status").GetString());
        Assert.DoesNotContain("PRIVATE KEY", config.ToString());

        // 3. Punto de venta y diagnóstico.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/points-of-sale", new { number = 0 })).StatusCode);
        var pos = await merchant.PostAsync("/api/v1/fiscal/points-of-sale", new { number = 3, label = "Web" });
        Assert.Single((await merchant.GetAsync("/api/v1/fiscal/points-of-sale")).GetProperty("items").EnumerateArray());

        var health = await merchant.PostAsync("/api/v1/fiscal/health", new { });
        Assert.True(health.GetProperty("ok").GetBoolean());

        var diagnosis = await merchant.PostAsync("/api/v1/fiscal/test-connection", new { });
        Assert.True(diagnosis.GetProperty("ok").GetBoolean(), diagnosis.ToString());
        Assert.Equal(4, diagnosis.GetProperty("steps").GetArrayLength());
        // El TRA viajó firmado en CMS (base64) dentro del SOAP de WSAA.
        Assert.Contains("<wsaa:in0>MI", _factory.ExternalHttp.SentTo(Wsaa).Last().Body);

        // 4. Padrón: quién es un CUIT y su condición de IVA.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Get, "/api/v1/fiscal/padron/20111111113")).StatusCode);
        var persona = await merchant.GetAsync($"/api/v1/fiscal/padron/{Cuit}");
        Assert.Equal("PUENTE ORIENTE SA", persona.GetProperty("name").GetString());
        Assert.Equal("ResponsableInscripto", persona.GetProperty("condicion").GetString());

        // 5. Comprobante suelto desde el panel.
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/emit", new { amount = 0m })).StatusCode);
        var loose = await merchant.PostAsync("/api/v1/fiscal/emit", new { amount = 1210m, ptoVta = 3, creditNote = false });
        Assert.True(loose.GetProperty("authorized").GetBoolean());
        Assert.Equal(1, loose.GetProperty("number").GetInt64());

        // 6. Facturar una venta: a mano, con su PDF.
        var orderId = await merchant.CreateSaleAsync(priceMinor: 121_000_00);
        var bad = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/orders/{orderId}/invoice")
        {
            Content = new StringContent("{no es json", Encoding.UTF8, "application/json"),
        };
        bad.Headers.Add("X-Tenant-Id", merchant.TenantId.ToString());
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.Client.SendAsync(bad)).StatusCode);

        var invoice = await merchant.PostAsync($"/api/v1/orders/{orderId}/invoice", new { buyerDoc = "30111222", buyerIvaCondition = "ConsumidorFinal" });
        Assert.True(invoice.GetProperty("authorized").GetBoolean(), invoice.ToString());
        Assert.Matches("^7\\d{13}$", invoice.GetProperty("cae").GetString()!);

        // Dos veces no: la venta ya tiene factura.
        Assert.False((await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{orderId}/invoice")).IsSuccessStatusCode);

        var pdf = await merchant.ExpectOkAsync(HttpMethod.Get, $"/api/v1/orders/{orderId}/invoice.pdf");
        Assert.Equal("application/pdf", pdf.Content.Headers.ContentType?.MediaType);
        Assert.StartsWith("%PDF", Encoding.ASCII.GetString((await pdf.Content.ReadAsByteArrayAsync())[..4]));
        Assert.Equal(HttpStatusCode.NotFound,
            (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/orders/{orderId}/invoice.pdf?type=creditnote")).StatusCode);

        // 7. Factura automática al cobrar, por el worker.
        await merchant.PutAsync("/api/v1/fiscal/config/emission", new
        {
            autoInvoice = true,
            trigger = "PAYMENT",
            defaultPointOfSaleId = pos.GetProperty("id").GetGuid(),
            consumerFinalThresholdMinorUnits = 0L,
        });
        var autoOrder = await merchant.CreateSaleAsync(priceMinor: 50_000_00);
        await RunEmissionUntilAsync(autoOrder, "Done");
        var fiscal = await merchant.GetAsync($"/api/v1/orders/{autoOrder}/fiscal");
        Assert.Single(fiscal.GetProperty("documents").EnumerateArray());

        // 8. Devolver la venta encola la nota de crédito, y el worker la emite.
        await merchant.PostAsync($"/api/v1/orders/{autoOrder}/refund", new { reason = "Devolución" });
        await RunEmissionUntilAsync(autoOrder, "Done", kind: "CreditNote");
        var nc = await merchant.ExpectOkAsync(HttpMethod.Get, $"/api/v1/orders/{autoOrder}/invoice.pdf?type=creditnote");
        Assert.Equal("application/pdf", nc.Content.Headers.ContentType?.MediaType);

        // Reencolar un job a mano (lo que hace el botón "Reintentar").
        var jobId = (await merchant.GetAsync($"/api/v1/orders/{autoOrder}/fiscal")).GetProperty("jobs")[0].GetProperty("id").GetGuid();
        await merchant.PostAsync($"/api/v1/fiscal/jobs/{jobId}/retry", new { });
        Assert.Equal(HttpStatusCode.NotFound, (await merchant.SendAsync(HttpMethod.Post, $"/api/v1/fiscal/jobs/{Guid.NewGuid()}/retry")).StatusCode);
        await RunEmissionUntilAsync(autoOrder, "Done"); // ya facturada: se da por hecha, no se duplica

        // 9. Libro IVA del mes, en CSV para el contador.
        var now = DateTime.UtcNow;
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Get, "/api/v1/fiscal/documents/export?year=2019&month=1")).StatusCode);
        var csv = await merchant.ExpectOkAsync(HttpMethod.Get, $"/api/v1/fiscal/documents/export?year={now.Year}&month={now.Month}");
        var book = await csv.Content.ReadAsStringAsync();
        Assert.Contains("Fecha;Tipo;Punto de venta", book);
        Assert.True(book.Split('\n').Length >= 5, book); // encabezado + 4 comprobantes

        await merchant.ExpectOkAsync(HttpMethod.Delete, $"/api/v1/fiscal/points-of-sale/{pos.GetProperty("id").GetGuid()}");
    }

    [Fact]
    public async Task Los_rechazos_de_ARCA_llegan_explicados()
    {
        var merchant = await Merchant.CreateAsync(_factory, "fir");
        var arca = new FakeArca(_factory.ExternalHttp);
        await merchant.PutAsync("/api/v1/fiscal/config", new { cuit = Cuit, businessName = "Tienda SA", condition = "MONOTRIBUTO" });

        // Sin certificado: el diagnóstico frena en el primer paso.
        var noCert = await merchant.PostAsync("/api/v1/fiscal/test-connection", new { });
        Assert.False(noCert.GetProperty("ok").GetBoolean());
        Assert.Single(noCert.GetProperty("steps").EnumerateArray());

        var csr = await merchant.PostAsync("/api/v1/fiscal/certificate/csr", new { });
        await merchant.PostAsync("/api/v1/fiscal/certificate/activate",
            new { certificateId = csr.GetProperty("certificateId").GetGuid(), certificatePem = TestCa.Sign(csr.GetProperty("csrPem").GetString()!) });

        // WSAA rechaza el certificado: el diagnóstico frena en la autenticación.
        arca.WsaaFault = "coe.notAuthorized";
        var wsaa = await merchant.PostAsync("/api/v1/fiscal/test-connection", new { });
        Assert.Equal("error", wsaa.GetProperty("steps")[1].GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/fiscal/padron/{Cuit}")).StatusCode);
        arca.WsaaFault = null;

        // ARCA rechaza el comprobante: el motivo vuelve explicado.
        arca.RejectNext = true;
        var rejected = await merchant.PostAsync("/api/v1/fiscal/emit", new { amount = 500m, ptoVta = 1 });
        Assert.False(rejected.GetProperty("authorized").GetBoolean());
        Assert.NotEmpty(rejected.GetProperty("errors").EnumerateArray());

        // WSFE no acepta al CUIT (el famoso 600).
        arca.LastAuthorizedError = ("600", "ValidacionDeToken: No aparecio CUIT en lista de relaciones");
        var wsfe = await merchant.PostAsync("/api/v1/fiscal/test-connection", new { });
        Assert.Contains(wsfe.GetProperty("steps").EnumerateArray(), s => s.GetProperty("key").GetString() == "wsfe" && s.GetProperty("status").GetString() == "error");
        arca.LastAuthorizedError = null;

        // Un CUIT que el padrón no conoce vuelve como Fault.
        arca.PadronFault = "No existe persona con ese Id";
        Assert.Equal(HttpStatusCode.BadRequest, (await merchant.SendAsync(HttpMethod.Get, $"/api/v1/fiscal/padron/{Cuit}")).StatusCode);

        // ARCA caído: el health lo dice.
        arca.Down = true;
        var down = await merchant.SendAsync(HttpMethod.Post, "/api/v1/fiscal/health");
        Assert.False(down.IsSuccessStatusCode && (await down.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("ok").GetBoolean());
    }

    // ---------------------------------------------------------------- helpers

    private async Task RunEmissionUntilAsync(Guid orderId, string status, string kind = "Invoice")
    {
        var seen = "";
        for (var pass = 0; pass < 20; pass++)
        {
            await Workers.RunOnceAsync<FiscalEmissionWorker>(_factory);
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
            var jobs = await db.EmissionJobs.AsNoTracking().Where(j => j.OrderId == orderId).ToListAsync();
            if (jobs.Any(j => j.Kind.ToString() == kind && j.Status.ToString() == status)) return;
            seen = string.Join("; ", jobs.Select(j => $"{j.Kind} {j.Status} ({j.LastError})"));
        }
        Assert.Fail($"El job {kind} de la orden {orderId} no llegó a {status}. Jobs: [{seen}]");
    }

    /// <summary>
    /// Una CA de prueba que hace de ARCA: firma el CSR que generó la API con
    /// su clave pública. Lo que vuelve es un certificado real, igual al que se
    /// descarga de ARCA.
    /// </summary>
    private static class TestCa
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
            var req = new CertificateRequest($"CN=otro, SERIALNUMBER=CUIT {Cuit}", other, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            return Sign(new string(PemEncoding.Write("CERTIFICATE REQUEST", req.CreateSigningRequest())));
        }
    }

    /// <summary>
    /// ARCA en SOAP: WSAA entrega tickets, WSFEv1 numera (último + 1) y da CAE,
    /// el padrón contesta una persona. Cada servicio se puede romper a pedido.
    /// </summary>
    private sealed partial class FakeArca
    {
        private readonly Dictionary<string, long> _last = [];

        public string? WsaaFault { get; set; }
        public string? PadronFault { get; set; }
        public bool RejectNext { get; set; }
        public bool Down { get; set; }
        public (string Code, string Message)? LastAuthorizedError { get; set; }

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

            if (action.Contains("FECAESolicitar"))
            {
                var number = long.Parse(Tag(body, "CbteDesde"));
                if (RejectNext)
                {
                    RejectNext = false;
                    return Xml($"<FECAESolicitarResponse xmlns=\"http://ar.gov.afip.dif.FEV1/\"><FECAESolicitarResult><FeCabResp><Resultado>R</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><CbteDesde>{number}</CbteDesde><Resultado>R</Resultado><Observaciones><Obs><Code>10015</Code><Msg>El campo DocNro es invalido</Msg></Obs></Observaciones></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>");
                }
                _last[key] = number;
                var cae = "7" + Random.Shared.NextInt64(1_000_000_000_000, 9_999_999_999_999);
                var vto = DateTime.UtcNow.AddDays(10).ToString("yyyyMMdd");
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
}
