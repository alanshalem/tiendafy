using Api.Shipping;
using Checkout.Core.Domain;
using Microsoft.AspNetCore.DataProtection;
using SharedKernel.Common;

namespace UnitTests.Checkout;

public class CorreoPackageTests
{
    [Fact]
    public void Aggregate_SumaPesoYApilaAltura()
    {
        var package = CorreoPackage.Aggregate(units: 3, unitWeightGrams: 500, lengthCm: 30, widthCm: 20, heightCm: 10);

        Assert.NotNull(package);
        Assert.Equal(1500, package!.WeightGrams);
        Assert.Equal(30, package.LengthCm);
        Assert.Equal(20, package.WidthCm);
        Assert.Equal(30, package.HeightCm); // 10 cm × 3 apilados
    }

    [Fact]
    public void Aggregate_UnaUnidad_EsElPaqueteDefault()
    {
        var package = CorreoPackage.Aggregate(1, 500, 30, 20, 10);
        Assert.Equal(new CorreoPackage(500, 30, 20, 10), package);
    }

    [Theory]
    [InlineData(51, 500, 30, 20, 10)]  // 25,5 kg > 25 kg
    [InlineData(16, 500, 30, 20, 10)]  // 160 cm de alto > 150
    [InlineData(1, 500, 151, 20, 10)]  // largo fuera de rango
    [InlineData(0, 500, 30, 20, 10)]   // sin unidades
    public void Aggregate_FueraDeLimites_DevuelveNull(int units, int weight, int length, int width, int height)
    {
        Assert.Null(CorreoPackage.Aggregate(units, weight, length, width, height));
    }

    [Fact]
    public void Aggregate_JustoEnElLimite_Pasa()
    {
        // 50 × 500 g = 25000 g exactos; 15 × 10 cm = 150 cm exactos.
        Assert.NotNull(CorreoPackage.Aggregate(50, 500, 30, 20, 1));
        Assert.NotNull(CorreoPackage.Aggregate(15, 100, 30, 20, 10));
    }
}

public class CorreoArgentinoConfigTests
{
    private static Result<CorreoArgentinoConfig> Create(
        string cp = "1704", int weight = 500, int length = 30, int width = 20, int height = 10,
        string customerId = "0090000025") =>
        CorreoArgentinoConfig.Create(
            Guid.NewGuid(), customerId, "enc-user", "enc-pass", "TEST", cp,
            weight, length, width, height, offerHome: true, offerAgency: true, active: true);

    [Fact]
    public void Create_Valido_NormalizaYGuarda()
    {
        var result = Create(cp: "B1842ZAB"); // CPA con letras → 4 dígitos

        Assert.True(result.IsSuccess);
        Assert.Equal("1842", result.Value.OriginPostalCode);
        Assert.Equal("TEST", result.Value.Environment);
        Assert.True(result.Value.Active);
    }

    [Theory]
    [InlineData("")]
    [InlineData("12")]
    [InlineData("123456")]
    [InlineData("ABCD")]
    public void Create_PostalInvalido_Falla(string cp)
    {
        var result = Create(cp: cp);
        Assert.True(result.IsFailure);
        Assert.Equal("Correo.InvalidPostalCode", result.Error.Code);
    }

    [Theory]
    [InlineData(0, 30, 20, 10, "Correo.InvalidWeight")]
    [InlineData(25001, 30, 20, 10, "Correo.InvalidWeight")]
    [InlineData(500, 151, 20, 10, "Correo.InvalidDimensions")]
    [InlineData(500, 30, 0, 10, "Correo.InvalidDimensions")]
    public void Create_PaqueteInvalido_Falla(int weight, int length, int width, int height, string code)
    {
        var result = Create(weight: weight, length: length, width: width, height: height);
        Assert.True(result.IsFailure);
        Assert.Equal(code, result.Error.Code);
    }

    [Fact]
    public void Create_SinCustomerId_Falla()
    {
        var result = Create(customerId: " ");
        Assert.True(result.IsFailure);
        Assert.Equal("Correo.InvalidCustomerId", result.Error.Code);
    }

    [Theory]
    [InlineData("1704", "1704")]
    [InlineData("B1842ZAB", "1842")]
    [InlineData("  1425 ", "1425")]
    [InlineData("999", null)]
    [InlineData(null, null)]
    public void NormalizePostalCode_Casos(string? input, string? expected)
    {
        Assert.Equal(expected, CorreoArgentinoConfig.NormalizePostalCode(input));
    }
}

public class CorreoQuoteTokenTests
{
    private static readonly IDataProtectionProvider Dp = new EphemeralDataProtectionProvider();

    private static CorreoQuotePayload Payload(Guid tenant, int units = 2) => new(
        tenant, units, "D", 498_06, "ARS", "Correo Argentino Clásico (a domicilio)", "2", "5", "1704");

    [Fact]
    public void RoundTrip_MismoTenant_Recupera()
    {
        var tenant = Guid.NewGuid();

        var token = CorreoQuoteToken.Protect(Dp, Payload(tenant, units: 3));
        var back = CorreoQuoteToken.Unprotect(Dp, token, tenant);

        Assert.NotNull(back);
        Assert.Equal(498_06, back!.PriceMinorUnits);
        Assert.Equal("D", back.Kind);
        Assert.Equal(3, back.Units);
        Assert.Equal("Correo Argentino Clásico (a domicilio)", back.ServiceName);
    }

    [Fact]
    public void Unprotect_OtroTenant_DevuelveNull()
    {
        var token = CorreoQuoteToken.Protect(Dp, Payload(Guid.NewGuid()));
        Assert.Null(CorreoQuoteToken.Unprotect(Dp, token, Guid.NewGuid()));
    }

    [Fact]
    public void Unprotect_TokenAdulterado_DevuelveNull()
    {
        var tenant = Guid.NewGuid();
        var token = CorreoQuoteToken.Protect(Dp, Payload(tenant));
        Assert.Null(CorreoQuoteToken.Unprotect(Dp, token + "x", tenant));
        Assert.Null(CorreoQuoteToken.Unprotect(Dp, "basura", tenant));
    }
}
