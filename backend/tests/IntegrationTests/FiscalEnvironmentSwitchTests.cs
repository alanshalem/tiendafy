using System.Net;
using Fiscal.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace IntegrationTests;

/// <summary>
/// ARCA usa un certificado distinto para homologación y para producción. Una
/// tienda recién pasada a producción con solo el de homologación veía
/// "Certificado activo" (la configuración mostraba el último de cualquier
/// ambiente), el panel ofrecía "Facturar" (la preparación tampoco miraba el
/// ambiente) y la factura fallaba. Ahora todo mira el certificado del ambiente
/// actual, y el de homologación queda guardado para cuando se vuelva.
/// </summary>
[Collection("api")]
public sealed class FiscalEnvironmentSwitchTests(ApiFactory factory)
{
    [Fact]
    public async Task Pasar_a_produccion_sin_su_certificado_dice_que_falta_y_no_factura()
    {
        var merchant = await Merchant.CreateAsync(factory, "fsw");
        _ = new FakeArca(factory.ExternalHttp);
        await merchant.ConfigureFiscalAsync();
        Assert.True((await merchant.GetAsync("/api/v1/fiscal/readiness")).GetProperty("ready").GetBoolean());

        // Pasa a producción sin generar el certificado de producción.
        var saved = await merchant.PutAsync("/api/v1/fiscal/config", new
        {
            cuit = FakeArca.Cuit,
            businessName = "Tienda SA",
            condition = "RESPONSABLE_INSCRIPTO",
            environment = "PRODUCCION",
        });
        Assert.Equal(JsonValueKindNull, saved.GetProperty("certificate").ValueKind);

        var config = await merchant.GetAsync("/api/v1/fiscal/config");
        Assert.Equal("PRODUCCION", config.GetProperty("environment").GetString());
        Assert.Equal(JsonValueKindNull, config.GetProperty("certificate").ValueKind);
        Assert.True(config.GetProperty("otherEnvironmentCertificate").GetBoolean());

        var readiness = await merchant.GetAsync("/api/v1/fiscal/readiness");
        Assert.False(readiness.GetProperty("ready").GetBoolean());
        Assert.True(readiness.GetProperty("issuer").GetBoolean());
        Assert.False(readiness.GetProperty("certificate").GetBoolean());
        Assert.True(readiness.GetProperty("pointOfSale").GetBoolean());

        // "Facturar" no llega a ARCA con el certificado de homologación: dice qué falta.
        // (Los otros tests comparten el ARCA falso: se cuenta lo que se suma.)
        var arcaBefore = ArcaRequests();
        var sale = await merchant.CreateSaleAsync(priceMinor: 10_000_00);
        var invoice = await merchant.SendAsync(HttpMethod.Post, $"/api/v1/orders/{sale}/invoice");
        Assert.Equal(HttpStatusCode.Conflict, invoice.StatusCode);
        Assert.Contains("certificado de Producción", await invoice.Content.ReadAsStringAsync());
        Assert.Equal(arcaBefore, ArcaRequests());
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<FiscalDbContext>();
            Assert.Empty(await db.Documents.IgnoreQueryFilters().AsNoTracking().Where(d => d.OrderId == sale).ToListAsync());
        }

        // Volver a homologación recupera su certificado, que nunca se borró.
        await merchant.PutAsync("/api/v1/fiscal/config", new
        {
            cuit = FakeArca.Cuit,
            businessName = "Tienda SA",
            condition = "RESPONSABLE_INSCRIPTO",
            environment = "HOMOLOGACION",
        });
        config = await merchant.GetAsync("/api/v1/fiscal/config");
        Assert.Equal("ACTIVE", config.GetProperty("certificate").GetProperty("status").GetString());
        Assert.Equal("HOMOLOGACION", config.GetProperty("certificate").GetProperty("environment").GetString());
        Assert.False(config.GetProperty("otherEnvironmentCertificate").GetBoolean());
        Assert.True((await merchant.GetAsync("/api/v1/fiscal/readiness")).GetProperty("ready").GetBoolean());

        // Con el certificado de producción, la tienda queda lista en producción.
        await merchant.SwitchFiscalEnvironmentAsync("PRODUCCION");
        config = await merchant.GetAsync("/api/v1/fiscal/config");
        Assert.Equal("PRODUCCION", config.GetProperty("certificate").GetProperty("environment").GetString());
        Assert.True(config.GetProperty("certificate").GetProperty("usable").GetBoolean());
        Assert.True((await merchant.GetAsync("/api/v1/fiscal/readiness")).GetProperty("ready").GetBoolean());
    }

    private int ArcaRequests() =>
        factory.ExternalHttp.SentTo(FakeArca.WsaaProduccion).Count + factory.ExternalHttp.SentTo(FakeArca.WsfeProduccion).Count
        + factory.ExternalHttp.SentTo(FakeArca.Wsaa).Count + factory.ExternalHttp.SentTo(FakeArca.Wsfe).Count;

    private const System.Text.Json.JsonValueKind JsonValueKindNull = System.Text.Json.JsonValueKind.Null;
}
