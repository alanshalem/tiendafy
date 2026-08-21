using Payments.Contracts;
using Payments.Core.Domain;
using Payments.Infrastructure.Payway;
using SharedKernel.Common;

namespace UnitTests.Payments;

public class PaywayStatusMapTests
{
    [Theory]
    [InlineData("approved", PaywayPaymentStatus.Approved)]
    [InlineData("rejected", PaywayPaymentStatus.Declined)]
    [InlineData("group_rejected", PaywayPaymentStatus.Declined)]
    [InlineData("review", PaywayPaymentStatus.UnderReview)]
    [InlineData("pre_approved", PaywayPaymentStatus.Authorized)]
    [InlineData("refunded", PaywayPaymentStatus.Refunded)]
    [InlineData("annulled", PaywayPaymentStatus.Refunded)]
    [InlineData("approved_with_refund", PaywayPaymentStatus.Refunded)]
    public void MapeaLosEstadosConocidos(string raw, PaywayPaymentStatus expected) =>
        Assert.Equal(expected, PaywayMaps.Status(raw));

    [Theory]
    [InlineData("challenge pending")]
    [InlineData("fingerprint pending")]
    public void LosEstadosDe3dsPidenAccionDelComprador(string raw) =>
        // Con espacio, no con guion bajo: así los serializa Payway. Escribirlos
        // mal los mandaría a Unknown y dejaría la compra colgada.
        Assert.Equal(PaywayPaymentStatus.RequiresAction, PaywayMaps.Status(raw));

    [Theory]
    [InlineData("accredited")]
    [InlineData("adhered")]
    [InlineData("reversed")]
    [InlineData("undefined")]
    [InlineData("")]
    [InlineData(null)]
    public void LoQueNoConocemosEsUnknown_NuncaAprobado(string? raw)
    {
        // Es la regla que evita despachar mercadería por un estado que Payway
        // agregó y nosotros todavía no mapeamos.
        var status = PaywayMaps.Status(raw);
        Assert.Equal(PaywayPaymentStatus.Unknown, status);
        Assert.NotEqual(PaywayPaymentStatus.Approved, status);
    }
}

public class PaywayDeclineMapTests
{
    [Theory]
    [InlineData(51, PaywayDeclineCategory.InsufficientFunds, true)]
    [InlineData(54, PaywayDeclineCategory.CardExpired, true)]
    [InlineData(14, PaywayDeclineCategory.InvalidCardNumber, true)]
    [InlineData(48, PaywayDeclineCategory.InstallmentsNotAllowed, true)]
    [InlineData(96, PaywayDeclineCategory.ProcessingError, true)]
    public void ClasificaLosRechazosReintentables(int code, PaywayDeclineCategory category, bool retryable)
    {
        var decline = PaywayMaps.Decline(code, "x");
        Assert.Equal(category, decline.Category);
        Assert.Equal(retryable, decline.IsRetryable);
    }

    [Theory]
    [InlineData(4)]
    [InlineData(7)]
    [InlineData(43)]
    public void TarjetaDenunciada_NoSeOfreceReintentar(int code)
    {
        var decline = PaywayMaps.Decline(code, "RETENER TARJETA");
        Assert.Equal(PaywayDeclineCategory.CardReported, decline.Category);
        Assert.False(decline.IsRetryable);
        // Y no se le dice al comprador que la tarjeta está denunciada.
        Assert.DoesNotContain("denunciad", decline.BuyerMessage, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("robad", decline.BuyerMessage, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(3)]
    [InlineData(13)]
    public void ErrorDeConfiguracion_NoSeLeEchaLaCulpaAlComprador(int code)
    {
        var decline = PaywayMaps.Decline(code, "COMERCIO INVALIDO");
        Assert.Equal(PaywayDeclineCategory.ConfigurationError, decline.Category);
        Assert.DoesNotContain("tu tarjeta", decline.BuyerMessage, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("tu banco", decline.BuyerMessage, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void UnCodigoDesconocidoIgualTieneMensaje()
    {
        // La tabla de códigos vigente no está publicada entera, así que siempre
        // va a haber alguno sin mapear: no puede quedar sin mensaje.
        var decline = PaywayMaps.Decline(9999, "ALGO NUEVO");
        Assert.Equal(PaywayDeclineCategory.GenericDecline, decline.Category);
        Assert.NotEmpty(decline.BuyerMessage);
        Assert.Equal(9999, decline.ProviderCode);
    }
}

public class PaywayBrandTests
{
    [Theory]
    [InlineData("450799", "visa", false, 1)]
    [InlineData("450799", "visa", true, 31)]
    [InlineData("529991", "mastercard", false, 15)]
    [InlineData("373953", "amex", false, 65)]
    public void ResuelveMarcaYMedioDePagoDesdeElBin(string bin, string brand, bool debit, int methodId)
    {
        Assert.Equal(brand, PaywayMaps.BrandFromBin(bin));
        Assert.Equal(methodId, PaywayMaps.PaymentMethodId(brand, debit));
    }

    [Theory]
    [InlineData("12")]
    [InlineData("")]
    [InlineData("abcdef")]
    [InlineData(null)]
    public void UnBinInvalidoNoRevienta(string? bin) => Assert.Null(PaywayMaps.BrandFromBin(bin));

    [Fact]
    public void UnaMarcaDesconocidaNoInventaMedioDePago() =>
        // Mejor que Payway resuelva la marca por el BIN a mandarle un id que no
        // corresponde: un medio equivocado rechaza la tarjeta entera.
        Assert.Null(PaywayMaps.PaymentMethodId("tarjeta-del-club", false));
}

public class PaywayConnectionTests
{
    private static PaywayConnection Sandbox() =>
        PaywayConnection.Create(TenantId.From(Guid.NewGuid()), "00020220",
            PaywayEnvironment.Sandbox, "pub-key", "cipher").Value;

    [Fact]
    public void ElHostSaleDelAmbiente()
    {
        Assert.Equal(PaywayConnection.SandboxBaseUrl, Sandbox().BaseUrl);

        var connection = Sandbox();
        connection.Update("00020220", PaywayEnvironment.Production, "pub-key", null, null, null, null);
        Assert.Equal(PaywayConnection.ProductionBaseUrl, connection.BaseUrl);
    }

    [Fact]
    public void ElHostAlternativoTieneQueSerHttps()
    {
        var connection = Sandbox();
        var result = connection.Update("00020220", PaywayEnvironment.Production, "pub", null,
            "http://api.example.com", null, null);

        Assert.True(result.IsFailure);
        Assert.Equal("Payway.InsecureBaseUrl", result.Error.Code);
    }

    [Fact]
    public void EditarSinClavePrivadaNoLaBorra()
    {
        // El panel nunca muestra la clave guardada, así que dejar el campo
        // vacío significa "no la toques".
        var connection = Sandbox();
        connection.Update("00020220", PaywayEnvironment.Sandbox, "pub", null, null, "TIENDA", [1, 3, 6]);

        Assert.Equal("cipher", connection.PrivateKeyEncrypted);
        Assert.Equal([1, 3, 6], connection.InstallmentOptions);
    }

    [Fact]
    public void SinCuotasValidasQuedaUnPago()
    {
        var connection = Sandbox();
        connection.Update("00020220", PaywayEnvironment.Sandbox, "pub", null, null, null, [0, 200, -5]);
        Assert.Equal([1], connection.InstallmentOptions);
    }
}

public class PaywayAttemptTests
{
    [Fact]
    public void ElIdDeTransaccionEsEstableParaElMismoIntento()
    {
        // Es toda la defensa contra el doble cobro: Payway no tiene idempotencia,
        // así que el mismo intento tiene que producir siempre el mismo id.
        var orderId = Guid.NewGuid();
        Assert.Equal(
            PaywayPaymentAttempt.BuildSiteTransactionId(orderId, 1),
            PaywayPaymentAttempt.BuildSiteTransactionId(orderId, 1));
    }

    [Fact]
    public void CadaIntentoNuevoTieneSuPropioId()
    {
        var orderId = Guid.NewGuid();
        Assert.NotEqual(
            PaywayPaymentAttempt.BuildSiteTransactionId(orderId, 1),
            PaywayPaymentAttempt.BuildSiteTransactionId(orderId, 2));
    }

    [Fact]
    public void ElIdEntraEnElLimiteDePayway() =>
        // La API corta en 39 caracteres; pasarse hace que el id que viaja no sea
        // el que se guardó, y con eso se pierde la forma de consultar el pago.
        Assert.InRange(PaywayPaymentAttempt.BuildSiteTransactionId(Guid.NewGuid(), 99).Length, 1, 39);

    [Fact]
    public void UnIntentoNaceSinSaberSiSeCobro()
    {
        var attempt = PaywayPaymentAttempt.Start(
            Guid.NewGuid(), Guid.NewGuid(), 1, "TF-x-1", 125045, "ARS", 3, "450799", "4905", "visa", 1);

        Assert.Equal(PaywayPaymentStatus.Unknown, attempt.Status);
        Assert.False(attempt.IsSettled);
        Assert.Equal(125045, attempt.AmountMinor);
    }
}

public class PaywayRepeatedTokenTests
{
    [Fact]
    public void DetectaElTokenYaUsado()
    {
        // Respuesta textual del sandbox de Payway al reenviar un token
        // consumido. El token dura 15 minutos y sirve una sola vez.
        const string json = """{"error_type":"invalid_request_error","validation_errors":[{"code":"repeated","param":"token"}]}""";
        Assert.True(PaywayMaps.IsRepeatedToken(json));
    }

    [Theory]
    [InlineData("""{"error_type":"invalid_request_error","validation_errors":[{"code":"invalid","param":"bin"}]}""")]
    [InlineData("""{"error_type":"invalid_request_error"}""")]
    [InlineData("no es json")]
    public void OtrosErroresNoSeConfundenConUnTokenRepetido(string json) =>
        Assert.False(PaywayMaps.IsRepeatedToken(json));
}
