using System.Net;
using System.Text;
using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Security;
using Fiscal.Infrastructure.Wsaa;
using Fiscal.Infrastructure.Wsfe;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace UnitTests.Fiscal;

/// <summary>
/// Las cosas de ARCA que no están en el manual y que cada integración aprende
/// a los golpes. Cada test es una de esas lecciones: si alguno se rompe, la
/// integración volvió a caer en la misma trampa.
/// </summary>
public sealed class ArcaGotchasTests
{
    private static readonly FiscalTicket Ticket = new("TOKEN", "SIGN", DateTime.UtcNow.AddHours(11));
    private static readonly Cuit Emisor = Cuit.Create("20111111112").Value;

    private static (WsfeClient Client, Stub Handler) Make(string responseXml, HttpStatusCode status = HttpStatusCode.OK)
    {
        var handler = new Stub(responseXml, status);
        return (new WsfeClient(new HttpClient(handler), Options.Create(new FiscalEndpointsOptions()),
            NullLogger<WsfeClient>.Instance), handler);
    }

    private static InvoiceDraft Draft() => ComprobanteBuilder.Build(FiscalCondition.ResponsableInscripto,
        new Receptor(DocTipo.ConsumidorFinal, 0, CondicionIvaReceptor.ConsumidorFinal), 12100).Value;

    private static string Envelope(string body) =>
        $"""<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>{body}</soap:Body></soap:Envelope>""";

    // ---- Errors vs Observaciones -------------------------------------------------

    [Fact]
    public async Task Un_rechazo_que_viene_solo_en_Observaciones_no_se_pierde()
    {
        // Resultado R sin ningún Err: el motivo está entero en las Obs. Si solo
        // se miraran los Errors, esto se guardaba como "rechazado sin detalle".
        var (client, _) = Make(Envelope("""
            <FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECAESolicitarResult>
              <FeCabResp><Resultado>R</Resultado></FeCabResp>
              <FeDetResp><FECAEDetResponse><Resultado>R</Resultado>
                <Observaciones><Obs><Code>10242</Code><Msg>Condicion frente al IVA del receptor invalida</Msg></Obs></Observaciones>
              </FECAEDetResponse></FeDetResp>
            </FECAESolicitarResult></FECAESolicitarResponse>
            """));

        var r = await client.RequestCaeAsync(Ticket, Emisor, FiscalEnvironment.Homologacion, 1, 7, new DateOnly(2026, 9, 21), Draft());

        Assert.True(r.IsSuccess);
        Assert.False(r.Value.IsAuthorized);
        Assert.Empty(r.Value.Errors);
        var motivo = Assert.Single(r.Value.Observations);
        Assert.Equal("10242", motivo.Code);
    }

    [Fact]
    public async Task Los_errores_del_pedido_no_se_duplican()
    {
        var (client, _) = Make(Envelope("""
            <FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECAESolicitarResult>
              <FeCabResp><Resultado>R</Resultado></FeCabResp>
              <Errors><Err><Code>600</Code><Msg>ValidacionDeToken: No aparecio CUIT en lista de relaciones</Msg></Err></Errors>
            </FECAESolicitarResult></FECAESolicitarResponse>
            """));

        var r = await client.RequestCaeAsync(Ticket, Emisor, FiscalEnvironment.Homologacion, 1, 7, new DateOnly(2026, 9, 21), Draft());

        Assert.Single(r.Value.Errors);
    }

    // ---- El CUIT del bloque Auth -------------------------------------------------

    [Fact]
    public async Task El_bloque_Auth_lleva_el_CUIT_de_quien_factura()
    {
        // Con delegación de servicio, el certificado es de un CUIT y factura otro.
        // El Auth tiene que llevar el de QUIEN FACTURA. El error es silencioso:
        // con un solo emisor los dos coinciden, y con dos las facturas de uno
        // salen a nombre del otro, con CAE y todo.
        var (client, handler) = Make(Envelope("""
            <FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECAESolicitarResult>
              <FeCabResp><Resultado>A</Resultado></FeCabResp>
              <FeDetResp><FECAEDetResponse><Resultado>A</Resultado><CAE>75000000000001</CAE><CAEFchVto>20261001</CAEFchVto></FECAEDetResponse></FeDetResp>
            </FECAESolicitarResult></FECAESolicitarResponse>
            """));
        var otroEmisor = Cuit.Create("30712345671").Value;

        await client.RequestCaeAsync(Ticket, otroEmisor, FiscalEnvironment.Homologacion, 1, 7, new DateOnly(2026, 9, 21), Draft());

        Assert.Contains("<ar:Cuit>30712345671</ar:Cuit>", handler.LastRequest);
    }

    [Fact]
    public async Task El_error_600_se_explica_con_sus_dos_causas()
    {
        var (client, _) = Make(Envelope("""
            <FECompUltimoAutorizadoResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompUltimoAutorizadoResult>
              <Errors><Err><Code>600</Code><Msg>ValidacionDeToken: No aparecio CUIT en lista de relaciones</Msg></Err></Errors>
            </FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>
            """));

        var r = await client.GetLastAuthorizedAsync(Ticket, Emisor, FiscalEnvironment.Homologacion, 1, CbteTipo.FacturaB);

        Assert.True(r.IsFailure);
        // El mensaje original se conserva (es lo que se busca en Google)…
        Assert.Contains("No aparecio CUIT en lista de relaciones", r.Error.Message);
        // …y se nombran las dos causas, que ARCA no distingue.
        Assert.Contains("delegó", r.Error.Message);
        Assert.Contains("inhabilitado para facturar", r.Error.Message);
    }

    // ---- Reconciliar con FECompConsultar ----------------------------------------

    [Fact]
    public async Task FECompConsultar_devuelve_el_CAE_que_nunca_nos_llego()
    {
        var (client, handler) = Make(Envelope("""
            <FECompConsultarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompConsultarResult>
              <ResultGet>
                <Concepto>1</Concepto><DocTipo>99</DocTipo><DocNro>0</DocNro>
                <CbteDesde>8</CbteDesde><CbteHasta>8</CbteHasta><CbteFch>20260921</CbteFch>
                <ImpTotal>121.00</ImpTotal><Resultado>A</Resultado>
                <CodAutorizacion>75999999999999</CodAutorizacion><EmisionTipo>CAE</EmisionTipo><FchVto>20261001</FchVto>
              </ResultGet>
            </FECompConsultarResult></FECompConsultarResponse>
            """));

        var r = await client.ConsultAsync(Ticket, Emisor, FiscalEnvironment.Homologacion, 1, CbteTipo.FacturaB, 8);

        Assert.True(r.IsSuccess);
        var c = Assert.IsType<ConsultedComprobante>(r.Value);
        Assert.True(c.IsAuthorized);
        Assert.Equal("75999999999999", c.Cae);
        Assert.Equal(new DateOnly(2026, 10, 1), c.CaeVto);
        Assert.Equal(121.00m, c.ImpTotal);
        Assert.Contains("<ar:CbteNro>8</ar:CbteNro>", handler.LastRequest);
    }

    [Fact]
    public async Task FECompConsultar_de_un_numero_que_no_existe_no_es_una_falla()
    {
        // "No existen datos" es justo la respuesta que se busca al reconciliar:
        // el número no se usó y se puede emitir.
        var (client, _) = Make(Envelope("""
            <FECompConsultarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompConsultarResult>
              <Errors><Err><Code>602</Code><Msg>No existen datos en nuestros registros para los parametros ingresados.</Msg></Err></Errors>
            </FECompConsultarResult></FECompConsultarResponse>
            """));

        var r = await client.ConsultAsync(Ticket, Emisor, FiscalEnvironment.Homologacion, 1, CbteTipo.FacturaB, 9);

        Assert.True(r.IsSuccess);
        Assert.Null(r.Value);
    }

    [Fact]
    public async Task FECompConsultar_con_error_de_autenticacion_si_es_una_falla()
    {
        // Con un 600 no sabemos nada del comprobante: tratarlo como "no existe"
        // liberaría un número que quizás está usado.
        var (client, _) = Make(Envelope("""
            <FECompConsultarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompConsultarResult>
              <Errors><Err><Code>600</Code><Msg>ValidacionDeToken: No aparecio CUIT en lista de relaciones</Msg></Err></Errors>
            </FECompConsultarResult></FECompConsultarResponse>
            """));

        var r = await client.ConsultAsync(Ticket, Emisor, FiscalEnvironment.Homologacion, 1, CbteTipo.FacturaB, 9);

        Assert.True(r.IsFailure);
    }

    [Fact]
    public async Task Un_corte_de_red_es_ambiguo_y_un_fault_no()
    {
        // Timeout: no sabemos si ARCA lo recibió → hay que reconciliar.
        var timeout = new WsfeClient(new HttpClient(new Throwing()), Options.Create(new FiscalEndpointsOptions()),
            NullLogger<WsfeClient>.Instance);
        var cut = await timeout.RequestCaeAsync(Ticket, Emisor, FiscalEnvironment.Homologacion, 1, 7, new DateOnly(2026, 9, 21), Draft());
        Assert.True(cut.IsFailure);
        Assert.True(FiscalGatewayErrors.IsAmbiguous(cut.Error));

        // SOAP fault: ARCA contestó que no → el número está libre.
        var (client, _) = Make(Envelope("<soap:Fault><faultstring>Server was unable to process request</faultstring></soap:Fault>"),
            HttpStatusCode.InternalServerError);
        var fault = await client.RequestCaeAsync(Ticket, Emisor, FiscalEnvironment.Homologacion, 1, 7, new DateOnly(2026, 9, 21), Draft());
        Assert.True(fault.IsFailure);
        Assert.False(FiscalGatewayErrors.IsAmbiguous(fault.Error));
    }

    [Theory]
    [InlineData(HttpStatusCode.BadGateway, "<html><body>502 Bad Gateway</body></html>")]
    [InlineData(HttpStatusCode.ServiceUnavailable, "")]
    [InlineData(HttpStatusCode.GatewayTimeout, "upstream request timeout")]
    [InlineData(HttpStatusCode.InternalServerError, "<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\"><soap:Body/></soap:Envelope>")]
    public async Task Un_error_HTTP_sin_SOAP_Fault_es_ambiguo(HttpStatusCode status, string body)
    {
        // Lo contestó un proxy, no ARCA: el pedido pudo haber llegado y estar
        // autorizado. Antes se tomaba como rechazo y el número quedaba libre:
        // el reintento lo volvía a pedir con otra venta o facturaba dos veces.
        var (client, _) = Make(body, status);

        var r = await client.RequestCaeAsync(Ticket, Emisor, FiscalEnvironment.Homologacion, 1, 7, new DateOnly(2026, 9, 21), Draft());

        Assert.True(r.IsFailure);
        Assert.Equal(FiscalGatewayErrors.NoFault, r.Error.Code);
        Assert.True(FiscalGatewayErrors.IsAmbiguous(r.Error));
    }

    // ---- Puntos de venta de Web Services ----------------------------------------

    [Fact]
    public async Task Los_puntos_de_venta_se_leen_con_bloqueo_y_baja()
    {
        var (client, _) = Make(Envelope("""
            <FEParamGetPtosVentaResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetPtosVentaResult>
              <ResultGet>
                <PtoVenta><Nro>1</Nro><EmisionTipo>CAE - RECE</EmisionTipo><Bloqueado>N</Bloqueado><FchBaja>NULL</FchBaja></PtoVenta>
                <PtoVenta><Nro>2</Nro><EmisionTipo>CAE - RECE</EmisionTipo><Bloqueado>S</Bloqueado><FchBaja>NULL</FchBaja></PtoVenta>
                <PtoVenta><Nro>3</Nro><EmisionTipo>CAE - RECE</EmisionTipo><Bloqueado>N</Bloqueado><FchBaja>20250101</FchBaja></PtoVenta>
              </ResultGet>
            </FEParamGetPtosVentaResult></FEParamGetPtosVentaResponse>
            """));

        var r = await client.GetPointsOfSaleAsync(Ticket, Emisor, FiscalEnvironment.Produccion);

        Assert.True(r.IsSuccess);
        var list = r.Value!;
        Assert.True(list.Single(p => p.Number == 1).Usable);
        Assert.True(list.Single(p => p.Number == 2).Blocked);
        Assert.True(list.Single(p => p.Number == 3).Retired);
    }

    [Fact]
    public async Task En_homologacion_una_lista_vacia_significa_no_se_puede_verificar()
    {
        const string empty = """
            <FEParamGetPtosVentaResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEParamGetPtosVentaResult>
              <Errors><Err><Code>602</Code><Msg>Sin Resultados</Msg></Err></Errors>
            </FEParamGetPtosVentaResult></FEParamGetPtosVentaResponse>
            """;

        // Homologación acepta cualquier número: no es un problema del usuario.
        var (homo, _) = Make(Envelope(empty));
        var h = await homo.GetPointsOfSaleAsync(Ticket, Emisor, FiscalEnvironment.Homologacion);
        Assert.True(h.IsSuccess);
        Assert.Null(h.Value);

        // En producción, vacío es vacío: no hay ningún punto de venta de Web Services.
        var (prod, _) = Make(Envelope(empty));
        var p = await prod.GetPointsOfSaleAsync(Ticket, Emisor, FiscalEnvironment.Produccion);
        Assert.True(p.IsSuccess);
        Assert.NotNull(p.Value);
        Assert.Empty(p.Value!);
    }

    // ---- WSAA ------------------------------------------------------------------------

    [Fact]
    public async Task AlreadyAuthenticated_tiene_codigo_propio_para_poder_recuperarse()
    {
        // WSAA no da un TA nuevo mientras el anterior siga vigente. El autenticador
        // necesita distinguir este rechazo para volver al TA que tiene guardado.
        var wsaa = new WsaaClient(new HttpClient(new Stub(Envelope("""
            <soapenv:Fault xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
              <faultcode>ns1:coe.alreadyAuthenticated</faultcode>
              <faultstring>El CEE ya posee un TA valido para el acceso al WSN solicitado</faultstring>
            </soapenv:Fault>
            """), HttpStatusCode.InternalServerError)), NullLogger<WsaaClient>.Instance);

        // El motivo viene en el faultcode; el faultstring es una frase que no lo
        // nombra. Mirar solo el texto dejaba pasar este caso como un rechazo más.
        var r = await wsaa.LoginCmsAsync("https://wsaahomo.test/LoginCms", "CMS", CancellationToken.None);
        Assert.True(r.IsFailure);
        Assert.Equal(WsaaClient.AlreadyAuthenticatedCode, r.Error.Code);
        Assert.Contains("12 horas", r.Error.Message);
    }

    [Fact]
    public void El_titular_del_certificado_se_lee_del_subject()
    {
        Assert.Equal("20111111112",
            FiscalCertificateFactory.ReadSubjectCuit("SERIALNUMBER=CUIT 20111111112, CN=tienda, O=CKING SA, C=AR"));
        Assert.Equal("30712345678",
            FiscalCertificateFactory.ReadSubjectCuit("OID.2.5.4.5=CUIT 30712345678, CN=tienda, C=AR"));
        Assert.Null(FiscalCertificateFactory.ReadSubjectCuit("CN=otro certificado, C=AR"));
    }

    // ---- TLS ---------------------------------------------------------------------

    [Fact]
    public void El_TLS_con_ARCA_no_ofrece_DHE()
    {
        // servicios1 (WSFEv1 de producción) elige DHE de 1024 bits si se lo
        // ofrecen, y OpenSSL 3 corta con DH_KEY_TOO_SMALL. La política vale
        // solo en Linux (en Windows decide SChannel): ahí corre producción y CI.
        if (!OperatingSystem.IsLinux()) return;

        var suites = global::Fiscal.Infrastructure.FiscalModule.EcdheOnly().AllowedCipherSuites!.ToList();

        Assert.Contains(System.Net.Security.TlsCipherSuite.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384, suites);
        Assert.DoesNotContain(suites, s => s.ToString().StartsWith("TLS_DHE_", StringComparison.Ordinal));
    }

    private sealed class Stub(string responseXml, HttpStatusCode status) : HttpMessageHandler
    {
        public string LastRequest { get; private set; } = "";

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            LastRequest = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
            return new HttpResponseMessage(status) { Content = new StringContent(responseXml, Encoding.UTF8, "text/xml") };
        }
    }

    private sealed class Throwing : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) =>
            throw new TaskCanceledException("timeout");
    }
}
