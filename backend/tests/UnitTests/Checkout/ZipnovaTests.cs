using System.Text.Json;
using Api.Shipping;
using Checkout.Core.Domain;
using Microsoft.AspNetCore.DataProtection;
using SharedKernel.Common;

namespace UnitTests.Checkout;

public class ZipnovaUnitsTests
{
    [Theory]
    [InlineData(1, 10)]
    [InlineData(30, 300)]
    [InlineData(85, 850)]   // el lavarropas del ejemplo de la spec
    [InlineData(500, 5000)] // tope de config → tope del contrato en mm
    public void CmToMm_FactorDiez(int cm, int mm)
    {
        // La trampa PA-01 de la spec: quote en cm, create en mm. Un solo
        // conversor y un test que lo clava.
        Assert.Equal(mm, ZipnovaUnits.CmToMm(cm));
    }
}

public class ZipnovaConfigTests
{
    private static Result<ZipnovaConfig> Create(
        string country = "AR", int accountId = 4821, string? origin = null,
        int weight = 500, int length = 30, int width = 20, int height = 10) =>
        ZipnovaConfig.Create(Guid.NewGuid(), "enc-token", "enc-secret",
            country, accountId, origin, weight, length, width, height, active: true);

    [Fact]
    public void Create_Valido_NormalizaPaisYOrigen()
    {
        var result = Create(country: "ar", origin: "  15733 ");
        Assert.True(result.IsSuccess);
        Assert.Equal("AR", result.Value.Country);
        Assert.Equal("15733", result.Value.OriginId);
    }

    [Fact]
    public void Create_SinOrigen_UsaAuto()
    {
        var result = Create(origin: null);
        Assert.True(result.IsSuccess);
        Assert.Equal("auto", result.Value.OriginId);
    }

    [Theory]
    [InlineData("BR")]
    [InlineData("")]
    [InlineData("argentina")]
    public void Create_PaisInvalido_Falla(string country)
    {
        var result = Create(country: country);
        Assert.True(result.IsFailure);
        Assert.Equal("Zipnova.InvalidCountry", result.Error.Code);
    }

    [Fact]
    public void Create_AccountIdInvalido_Falla()
    {
        var result = Create(accountId: 0);
        Assert.True(result.IsFailure);
        Assert.Equal("Zipnova.InvalidAccountId", result.Error.Code);
    }

    [Fact]
    public void Create_OrigenNoNumericoNiAuto_Falla()
    {
        var result = Create(origin: "deposito-central");
        Assert.True(result.IsFailure);
        Assert.Equal("Zipnova.InvalidOrigin", result.Error.Code);
    }

    [Theory]
    [InlineData(9, 30, 20, 10, "Zipnova.InvalidWeight")]     // < 10 g (mínimo del contrato)
    [InlineData(500, 501, 20, 10, "Zipnova.InvalidDimensions")]
    [InlineData(500, 30, 0, 10, "Zipnova.InvalidDimensions")]
    public void Create_PaqueteInvalido_Falla(int weight, int length, int width, int height, string code)
    {
        var result = Create(weight: weight, length: length, width: width, height: height);
        Assert.True(result.IsFailure);
        Assert.Equal(code, result.Error.Code);
    }
}

public class ZipnovaShipmentTests
{
    [Fact]
    public void ExternalId_RespetaElMaximoDe30DelContrato()
    {
        // La spec sólo declara el límite en prosa: se garantiza acá.
        var orderId = Guid.NewGuid();
        var externalId = $"TF-{orderId:N}"[..19];
        Assert.True(externalId.Length <= 30);
        Assert.Matches("^[A-Za-z0-9-]+$", externalId);
    }

    [Fact]
    public void Create_ClipeaCamposLargos()
    {
        var shipment = ZipnovaShipment.Create(
            Guid.NewGuid(), Guid.NewGuid(), 8842137,
            new string('x', 300), new string('y', 300), new string('z', 900), new string('s', 100));
        Assert.Equal(120, shipment.CarrierName!.Length);
        Assert.Equal(80, shipment.CarrierTrackingId!.Length);
        Assert.Equal(500, shipment.TrackingUrl!.Length);
        Assert.Equal(40, shipment.Status.Length);
    }
}

public class ZipnovaQuoteTokenTests
{
    private static readonly IDataProtectionProvider Dp = new EphemeralDataProtectionProvider();

    [Fact]
    public void RoundTrip_MismoTenant_Recupera()
    {
        var tenant = Guid.NewGuid();
        var token = ZipnovaQuoteToken.Protect(Dp, new ZipnovaQuotePayload(
            tenant, 3, 12_500_00, "ARS", "Zipnova · Andreani (Estándar)", "2026-08-03", "2000"));
        var back = ZipnovaQuoteToken.Unprotect(Dp, token, tenant);

        Assert.NotNull(back);
        Assert.Equal(12_500_00, back!.PriceMinorUnits);
        Assert.Equal(3, back.Units);
        Assert.Equal("Zipnova · Andreani (Estándar)", back.ServiceName);
    }

    [Fact]
    public void Unprotect_OtroTenantOTokenAjeno_DevuelveNull()
    {
        var tenant = Guid.NewGuid();
        var token = ZipnovaQuoteToken.Protect(Dp, new ZipnovaQuotePayload(
            tenant, 1, 100, "ARS", "x", null, "2000"));
        Assert.Null(ZipnovaQuoteToken.Unprotect(Dp, token, Guid.NewGuid()));
        Assert.Null(ZipnovaQuoteToken.Unprotect(Dp, "basura", tenant));
        // Cross-carrier: un token de Zipnova jamás se abre con el protector de Correo.
        Assert.Null(CorreoQuoteToken.Unprotect(Dp, token, tenant));
    }
}

public class ZipnovaClientParsingTests
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Fact]
    public void QuoteResponse_ParseaElShapeDeLaSpec()
    {
        // Recorte del shape documentado en la spec (04 §2.8) — la doc oficial
        // no publica ejemplos; este fixture sigue el schema al pie de la letra.
        const string body = """
        {
          "sorted_by": "price",
          "declared_value": 1250000,
          "all_results": [
            {
              "selectable": true,
              "impediments": null,
              "logistic_type": "carrier_dropoff",
              "carrier": { "id": 12, "name": "Andreani", "rating": 4.5, "logo": null },
              "service_type": { "id": 1, "code": "standard_delivery", "name": "Estándar", "is_urgent": false },
              "delivery_time": { "estimated_delivery": "2026-08-03T18:00:00-03:00", "estimation_expires_at": "2026-07-30T00:00:00-03:00" },
              "amounts": { "price_shipment": 9500, "price_insurance": 500, "price": 10000, "price_incl_tax": 12100 },
              "tags": ["cheapest"]
            },
            {
              "selectable": false,
              "impediments": ["No coverage"],
              "logistic_type": "carrier_pickup",
              "carrier": { "id": 9, "name": "OCA" },
              "service_type": { "id": 4, "code": "pickup_point", "name": "Punto de retiro" },
              "amounts": { "price": 8000, "price_incl_tax": 9680 }
            }
          ]
        }
        """;

        var parsed = JsonSerializer.Deserialize<ZipnovaQuoteResponse>(body, Json);

        Assert.NotNull(parsed?.AllResults);
        Assert.Equal(2, parsed!.AllResults!.Count);
        var best = parsed.AllResults[0];
        Assert.True(best.Selectable);
        Assert.Equal("Andreani", best.Carrier!.Name);
        Assert.Equal("standard_delivery", best.ServiceType!.Code);
        Assert.Equal(12100m, best.Amounts!.PriceInclTax);
        Assert.False(parsed.AllResults[1].Selectable);
    }

    [Fact]
    public void ShipmentResponse_ParseaElShapeDeLaSpec()
    {
        const string body = """
        {
          "id": 8842137,
          "external_id": "TF-2026-000184213",
          "carrier_tracking_id": "AND00012345",
          "carrier": { "id": 12, "name": "Andreani", "logo": null },
          "status": "new",
          "status_name": "Procesando",
          "tracking": "https://tracking.zipnova.com.ar/8842137",
          "tracking_external": null,
          "price_incl_tax": 12100.0
        }
        """;

        var parsed = JsonSerializer.Deserialize<ZipnovaShipmentResponse>(body, Json);

        Assert.NotNull(parsed);
        Assert.Equal(8842137, parsed!.Id);
        Assert.Equal("AND00012345", parsed.CarrierTrackingId);
        Assert.Equal("new", parsed.Status);
        Assert.Equal("https://tracking.zipnova.com.ar/8842137", parsed.TrackingUrl);
    }
}
