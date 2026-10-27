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
    [InlineData(61, PaywayDeclineCategory.InsufficientFunds, true)]
    [InlineData(54, PaywayDeclineCategory.CardExpired, true)]
    [InlineData(14, PaywayDeclineCategory.InvalidCardNumber, true)]
    [InlineData(39, PaywayDeclineCategory.InvalidCardNumber, true)]
    [InlineData(49, PaywayDeclineCategory.InvalidExpiryDate, true)]
    [InlineData(38, PaywayDeclineCategory.IncorrectPin, true)]
    [InlineData(55, PaywayDeclineCategory.IncorrectPin, true)]
    [InlineData(48, PaywayDeclineCategory.InstallmentsNotAllowed, true)]
    [InlineData(77, PaywayDeclineCategory.InstallmentsNotAllowed, true)]
    [InlineData(96, PaywayDeclineCategory.ProcessingError, true)]
    [InlineData(-1, PaywayDeclineCategory.ProcessingError, true)]
    [InlineData(10003, PaywayDeclineCategory.ProcessingError, true)]
    [InlineData(1, PaywayDeclineCategory.CallIssuer, false)]
    [InlineData(91, PaywayDeclineCategory.CallIssuer, false)]
    [InlineData(57, PaywayDeclineCategory.NotAllowed, false)]
    [InlineData(8, PaywayDeclineCategory.Duplicate, false)]
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
    [InlineData("222100", "mastercard", true, 66)]   // rango 2-series de Mastercard
    [InlineData("361234", "diners", false, 8)]
    [InlineData("589657", "cabal", false, 27)]
    [InlineData("589657", "cabal", true, 67)]
    [InlineData("589562", "naranja", false, 24)]
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
    [InlineData("601100")] // Discover: no se opera en Argentina
    public void UnBinInvalidoNoRevienta(string? bin) => Assert.Null(PaywayMaps.BrandFromBin(bin));

    [Theory]
    [InlineData("Master", false, 15)]
    [InlineData(" MAESTRO ", true, 99)]
    [InlineData("american_express", false, 65)]
    [InlineData("diners_club", false, 8)]
    [InlineData("argencard", false, 30)]
    [InlineData("shopping", false, 23)]
    [InlineData("nativa", false, 42)]
    public void LasMarcasLocalesTienenSuMedioDePago(string brand, bool debit, int methodId) =>
        Assert.Equal(methodId, PaywayMaps.PaymentMethodId(brand, debit));

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

    [Theory]
    [InlineData("https://evil.example.com/api/v2")]
    [InlineData("https://decidir.com.evil.com/api/v2")]
    [InlineData("https://evildecidir.com/api/v2")]
    [InlineData("https://user:pass@live.decidir.com/api/v2")]
    [InlineData("https://live.decidir.com:8443/api/v2")]
    [InlineData("https://127.0.0.1/api/v2")]
    public void ElHostAlternativoSoloPuedeSerDePayway(string url)
    {
        var connection = Sandbox();
        var result = connection.Update("00020220", PaywayEnvironment.Production, "pub", null, url, null, null);

        Assert.True(result.IsFailure);
        Assert.Equal("Payway.BadBaseUrl", result.Error.Code);
    }

    [Theory]
    [InlineData("https://live.decidir.com/api/v2")]
    [InlineData("https://developers.decidir.com/api/v2/")]
    [InlineData("https://ventasonline.payway.com.ar/api/v2")]
    [InlineData("https://live.decidir.com:443/api/v2")]
    public void ElHostAlternativoDePaywayEsValido(string url)
    {
        var connection = Sandbox();
        var result = connection.Update("00020220", PaywayEnvironment.Production, "pub", null, url, null, null);

        Assert.True(result.IsSuccess);
        Assert.Equal(url.TrimEnd('/'), connection.BaseUrl);
    }

    [Fact]
    public void UnHostGuardadoQueNoEsDePaywaySeIgnoraAlLeer()
    {
        // Datos viejos: antes se aceptaba cualquier https. Al leerlo se usa el default.
        var connection = Sandbox();
        typeof(PaywayConnection).GetProperty(nameof(PaywayConnection.BaseUrlOverride))!
            .SetValue(connection, "https://evil.example.com/api/v2");

        Assert.Equal(PaywayConnection.SandboxBaseUrl, connection.BaseUrl);
        Assert.Null(connection.EffectiveBaseUrlOverride);
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

/// <summary>
/// Cuándo se le vuelve a preguntar a Payway por un cobro que quedó en el medio:
/// seguido al principio, cada vez más espaciado, y nunca después de tres días.
/// </summary>
public class PaywayRecheckScheduleTests
{
    private static PaywayPaymentAttempt Attempt() => PaywayPaymentAttempt.Start(
        Guid.NewGuid(), Guid.NewGuid(), 1, "TF-x-1", 125045, "ARS", 1, "450799", "4905", "visa", 1);

    [Theory]
    [InlineData(PaywayPaymentStatus.Unknown, true)]
    [InlineData(PaywayPaymentStatus.UnderReview, true)]
    [InlineData(PaywayPaymentStatus.RequiresAction, true)]
    [InlineData(PaywayPaymentStatus.Approved, false)]
    [InlineData(PaywayPaymentStatus.Declined, false)]
    [InlineData(PaywayPaymentStatus.Refunded, false)]
    [InlineData(PaywayPaymentStatus.Authorized, false)]
    public void SoloSeReconsultaLoQueQuedoEnElMedio(PaywayPaymentStatus status, bool needs)
    {
        var attempt = Attempt();
        attempt.Complete(status, "x", "1", null, null, null, null, null);
        Assert.Equal(needs, attempt.NeedsRecheck);
        Assert.Equal(needs, attempt.IsRecheckDue(attempt.CreatedAtUtc.AddMinutes(10)));
    }

    [Fact]
    public void ElIntervaloSeAlargaConLaEdad()
    {
        Assert.Equal(TimeSpan.FromMinutes(2), PaywayPaymentAttempt.RecheckInterval(TimeSpan.FromMinutes(5)));
        Assert.Equal(TimeSpan.FromMinutes(15), PaywayPaymentAttempt.RecheckInterval(TimeSpan.FromHours(2)));
        Assert.Equal(TimeSpan.FromHours(1), PaywayPaymentAttempt.RecheckInterval(TimeSpan.FromHours(12)));
        Assert.Equal(TimeSpan.FromHours(4), PaywayPaymentAttempt.RecheckInterval(TimeSpan.FromDays(2)));
    }

    [Fact]
    public void SeEsperaElIntervaloDesdeLaUltimaConsulta()
    {
        var attempt = Attempt(); // Unknown, nunca contestó: se cuenta desde que se creó
        var created = attempt.CreatedAtUtc;
        Assert.False(attempt.IsRecheckDue(created.AddMinutes(1)));
        Assert.True(attempt.IsRecheckDue(created.AddMinutes(2)));

        attempt.MarkChecked(created.AddMinutes(2));
        Assert.False(attempt.IsRecheckDue(created.AddMinutes(3)));
        Assert.True(attempt.IsRecheckDue(created.AddMinutes(4)));

        // A las 7 horas el intervalo ya es de una hora.
        attempt.MarkChecked(created.AddHours(7));
        Assert.False(attempt.IsRecheckDue(created.AddHours(7).AddMinutes(30)));
        Assert.True(attempt.IsRecheckDue(created.AddHours(8)));
    }

    [Fact]
    public void PasadosTresDiasSeDejaDePreguntar()
    {
        var attempt = Attempt();
        var created = attempt.CreatedAtUtc;
        attempt.MarkChecked(created.AddHours(60));
        Assert.True(attempt.IsRecheckDue(created.AddHours(64)));
        Assert.True(attempt.IsLastRecheck(created.AddHours(69))); // 69 h + 4 h de intervalo > 72 h
        Assert.False(attempt.IsLastRecheck(created.AddHours(64)));
        Assert.False(attempt.IsRecheckDue(created + PaywayPaymentAttempt.RecheckMaxAge));
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
    [InlineData("""{"validation_errors":"token repetido"}""")]
    public void OtrosErroresNoSeConfundenConUnTokenRepetido(string json) =>
        Assert.False(PaywayMaps.IsRepeatedToken(json));
}
