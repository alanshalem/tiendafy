using System.Net;
using System.Text;
using Fiscal.Core.Abstractions;
using Fiscal.Core.Domain;
using Fiscal.Infrastructure.Wsaa;
using Fiscal.Infrastructure.Wsfe;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace UnitTests.Fiscal;

public class WsfeClientTests
{
    private static readonly FiscalTicket Ticket = new("TOKEN", "SIGN", DateTime.UtcNow.AddHours(11));
    private static readonly Cuit Emisor = Cuit.Create("20111111112").Value;

    private static (WsfeClient client, StubHandler handler) Make(string responseXml, HttpStatusCode status = HttpStatusCode.OK)
    {
        var handler = new StubHandler(responseXml, status);
        var http = new HttpClient(handler);
        var opts = Options.Create(new FiscalEndpointsOptions());
        return (new WsfeClient(http, opts, NullLogger<WsfeClient>.Instance), handler);
    }

    [Fact]
    public async Task CheckHealth_ParsesFeDummy()
    {
        var (client, _) = Make("""
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
             <soap:Body><FEDummyResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FEDummyResult>
               <AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer>
             </FEDummyResult></FEDummyResponse></soap:Body></soap:Envelope>
            """);

        var r = await client.CheckHealthAsync(FiscalEnvironment.Homologacion);
        Assert.True(r.IsSuccess);
        Assert.True(r.Value.AllOk);
    }

    [Fact]
    public async Task GetLastAuthorized_ParsesCbteNro()
    {
        var (client, handler) = Make("""
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
             <soap:Body><FECompUltimoAutorizadoResponse xmlns="http://ar.gov.afip.dif.FEV1/">
              <FECompUltimoAutorizadoResult><PtoVta>1</PtoVta><CbteTipo>11</CbteTipo><CbteNro>42</CbteNro></FECompUltimoAutorizadoResult>
             </FECompUltimoAutorizadoResponse></soap:Body></soap:Envelope>
            """);

        var r = await client.GetLastAuthorizedAsync(Ticket, Emisor, FiscalEnvironment.Homologacion, 1, CbteTipo.FacturaC);
        Assert.True(r.IsSuccess);
        Assert.Equal(42L, r.Value);
        Assert.Contains("FECompUltimoAutorizado", handler.LastRequest);
        Assert.Contains("<ar:Token>TOKEN</ar:Token>", handler.LastRequest);
    }

    [Fact]
    public async Task RequestCae_Approved_MapsCaeAndObservations()
    {
        var (client, handler) = Make("""
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
             <soap:Body><FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECAESolicitarResult>
              <FeCabResp><Resultado>A</Resultado></FeCabResp>
              <FeDetResp><FECAEDetResponse>
                <CbteDesde>5</CbteDesde><Resultado>A</Resultado>
                <Observaciones><Obs><Code>10063</Code><Msg>Aprobada con observaciones</Msg></Obs></Observaciones>
                <CAE>75123456789012</CAE><CAEFchVto>20260806</CAEFchVto>
              </FECAEDetResponse></FeDetResp>
             </FECAESolicitarResult></FECAESolicitarResponse></soap:Body></soap:Envelope>
            """);

        var draft = ComprobanteBuilder.Build(FiscalCondition.ResponsableInscripto,
            new Receptor(DocTipo.ConsumidorFinal, 0, CondicionIvaReceptor.ConsumidorFinal), 12100).Value;

        var r = await client.RequestCaeAsync(Ticket, Emisor, FiscalEnvironment.Homologacion, 1, 5, new DateOnly(2026, 7, 27), draft);
        Assert.True(r.IsSuccess);
        var o = r.Value;
        Assert.True(o.IsAuthorized);
        Assert.Equal("75123456789012", o.Cae);
        Assert.Equal(new DateOnly(2026, 8, 6), o.CaeVto);
        Assert.Single(o.Observations);
        Assert.Equal("10063", o.Observations[0].Code);
        Assert.Empty(o.Errors);

        // El request lleva el desarme de IVA y la condición del receptor (Factura B).
        Assert.Contains("<ar:CbteTipo>6</ar:CbteTipo>", handler.LastRequest);
        Assert.Contains("<ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId>", handler.LastRequest);
        Assert.Contains("<ar:AlicIva>", handler.LastRequest);
        Assert.Contains("<ar:ImpNeto>100.00</ar:ImpNeto>", handler.LastRequest);
        Assert.Contains("<ar:ImpIVA>21.00</ar:ImpIVA>", handler.LastRequest);
    }

    [Fact]
    public async Task RequestCae_ClassC_OmitsIvaArray()
    {
        var (client, handler) = Make("""
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
             <soap:Body><FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECAESolicitarResult>
              <FeCabResp><Resultado>A</Resultado></FeCabResp>
              <FeDetResp><FECAEDetResponse><Resultado>A</Resultado><CAE>75000000000001</CAE><CAEFchVto>20260806</CAEFchVto></FECAEDetResponse></FeDetResp>
             </FECAESolicitarResult></FECAESolicitarResponse></soap:Body></soap:Envelope>
            """);

        var draft = ComprobanteBuilder.Build(FiscalCondition.Monotributo,
            new Receptor(DocTipo.ConsumidorFinal, 0, CondicionIvaReceptor.ConsumidorFinal), 10000).Value;

        var r = await client.RequestCaeAsync(Ticket, Emisor, FiscalEnvironment.Homologacion, 1, 3, new DateOnly(2026, 7, 27), draft);
        Assert.True(r.IsSuccess);
        Assert.True(r.Value.IsAuthorized);
        Assert.DoesNotContain("<ar:AlicIva>", handler.LastRequest); // clase C sin array Iva (error 10071)
        Assert.Contains("<ar:CbteTipo>11</ar:CbteTipo>", handler.LastRequest);
    }

    [Fact]
    public async Task RequestCae_Rejected_MapsErrors()
    {
        var (client, _) = Make("""
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
             <soap:Body><FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECAESolicitarResult>
              <FeCabResp><Resultado>R</Resultado></FeCabResp>
              <FeDetResp><FECAEDetResponse><Resultado>R</Resultado>
                <Observaciones><Obs><Code>10016</Code><Msg>Numeracion erronea</Msg></Obs></Observaciones>
              </FECAEDetResponse></FeDetResp>
              <Errors><Err><Code>10016</Code><Msg>Numeracion erronea</Msg></Err></Errors>
             </FECAESolicitarResult></FECAESolicitarResponse></soap:Body></soap:Envelope>
            """);

        var draft = ComprobanteBuilder.Build(FiscalCondition.Monotributo,
            new Receptor(DocTipo.ConsumidorFinal, 0, CondicionIvaReceptor.ConsumidorFinal), 10000).Value;

        var r = await client.RequestCaeAsync(Ticket, Emisor, FiscalEnvironment.Homologacion, 1, 3, new DateOnly(2026, 7, 27), draft);
        Assert.True(r.IsSuccess);
        Assert.False(r.Value.IsAuthorized);
        Assert.Null(r.Value.Cae);
        Assert.Contains(r.Value.Errors, e => e.Code == "10016");
    }

    [Fact]
    public async Task Fault_ReturnsFailure()
    {
        var (client, _) = Make("""
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
             <soap:Fault><faultstring>Internal Error</faultstring></soap:Fault>
            </soap:Body></soap:Envelope>
            """, HttpStatusCode.InternalServerError);

        var r = await client.CheckHealthAsync(FiscalEnvironment.Homologacion);
        Assert.True(r.IsFailure);
        Assert.Contains("Internal Error", r.Error.Message);
    }

    private sealed class StubHandler(string responseXml, HttpStatusCode status) : HttpMessageHandler
    {
        public string LastRequest { get; private set; } = "";

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            LastRequest = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
            return new HttpResponseMessage(status) { Content = new StringContent(responseXml, Encoding.UTF8, "text/xml") };
        }
    }
}
