using Fiscal.Core.Domain;

namespace UnitTests.Fiscal;

/// <summary>
/// Dominio fiscal puro: config, puntos de venta, secuencia de numeración,
/// certificado, ticket de acceso (TA) y documento. Es el módulo que emite
/// comprobantes legales — cada invariante acá evita un problema con ARCA.
/// </summary>
public class FiscalDomainTests
{
    private static readonly Guid Tenant = Guid.NewGuid();
    private static Cuit CuitValido() => Cuit.Create("20-22222222-3").Value;

    // ---- Cuit ----

    [Fact]
    public void Cuit_valido_se_normaliza_sin_guiones_y_formatea()
    {
        var cuit = Cuit.Create(" 20-22222222-3 ").Value;
        Assert.Equal("20222222223", cuit.Value);
        Assert.Equal(20222222223, cuit.AsLong);
        Assert.Equal("20-22222222-3", cuit.Formatted);
    }

    [Theory]
    [InlineData(null, "Cuit.Empty")]
    [InlineData("", "Cuit.Empty")]
    [InlineData("123", "Cuit.Length")]
    [InlineData("20-22222222-4", "Cuit.CheckDigit")] // dígito verificador incorrecto
    public void Cuit_invalido_se_rechaza(string? raw, string codigo)
    {
        var result = Cuit.Create(raw);
        Assert.False(result.IsSuccess);
        Assert.Equal(codigo, result.Error.Code);
    }

    // ---- FiscalConfig ----

    [Fact]
    public void Config_nueva_arranca_deshabilitada_y_sin_auto_factura()
    {
        var cfg = FiscalConfig.Create(Tenant, CuitValido(), "  Mi Negocio SRL  ", FiscalCondition.Monotributo, FiscalEnvironment.Homologacion);
        Assert.False(cfg.Enabled);
        Assert.False(cfg.AutoInvoiceEnabled);
        Assert.Equal(EmissionTrigger.OnPayment, cfg.Trigger);
        Assert.Equal("Mi Negocio SRL", cfg.BusinessName); // trim
        Assert.True(cfg.ConsumerFinalThresholdMinorUnits > 0); // umbral RG por defecto
    }

    [Fact]
    public void Preferencias_de_emision_ignoran_umbral_no_positivo()
    {
        var cfg = FiscalConfig.Create(Tenant, CuitValido(), "X", FiscalCondition.ResponsableInscripto, FiscalEnvironment.Produccion);
        var umbralOriginal = cfg.ConsumerFinalThresholdMinorUnits;

        cfg.SetEmissionPreferences(autoInvoice: true, EmissionTrigger.OnFulfillment, Guid.NewGuid(), consumerFinalThreshold: 0);
        Assert.Equal(umbralOriginal, cfg.ConsumerFinalThresholdMinorUnits); // 0 no pisa
        Assert.True(cfg.AutoInvoiceEnabled);
        Assert.Equal(EmissionTrigger.OnFulfillment, cfg.Trigger);

        cfg.SetEmissionPreferences(true, EmissionTrigger.OnPayment, null, 5_000_00);
        Assert.Equal(5_000_00, cfg.ConsumerFinalThresholdMinorUnits);
    }

    [Fact]
    public void Enable_Disable_y_UpdateIdentity()
    {
        var cfg = FiscalConfig.Create(Tenant, CuitValido(), "X", FiscalCondition.Monotributo, FiscalEnvironment.Homologacion);
        cfg.Enable();
        Assert.True(cfg.Enabled);
        cfg.Disable();
        Assert.False(cfg.Enabled);

        cfg.UpdateIdentity(CuitValido(), "  Nuevo Nombre  ", FiscalCondition.ResponsableInscripto, FiscalEnvironment.Produccion);
        Assert.Equal("Nuevo Nombre", cfg.BusinessName);
        Assert.Equal(FiscalEnvironment.Produccion, cfg.Environment);
    }

    // ---- FiscalPointOfSale ----

    [Fact]
    public void PuntoDeVenta_crea_activo_y_actualiza()
    {
        var pos = FiscalPointOfSale.Create(Tenant, 11, "  Web  ");
        Assert.True(pos.Active);
        Assert.Equal("Web", pos.Label);

        pos.Update(2, " Mostrador ", active: false);
        Assert.Equal(2, pos.Number);
        Assert.Equal("Mostrador", pos.Label);
        Assert.False(pos.Active);
    }

    // ---- FiscalSequence (numeración: el corazón anti-huecos) ----

    [Fact]
    public void Secuencia_Next_incrementa_y_SyncWithAuthority_nunca_retrocede()
    {
        var seq = FiscalSequence.Create(Tenant, FiscalEnvironment.Produccion, 1, CbteTipo.FacturaC, lastNumber: 41);

        Assert.Equal(42, seq.Next());
        Assert.Equal(42, seq.LastNumber);

        seq.SyncWithAuthority(40); // ARCA atrasada respecto de lo local → NO retrocede
        Assert.Equal(42, seq.LastNumber);

        seq.SyncWithAuthority(100); // ARCA adelante (emitieron por otro sistema) → avanza
        Assert.Equal(100, seq.LastNumber);
        Assert.Equal(101, seq.Next());
    }

    // ---- FiscalAccessToken (TA de WSAA) ----

    [Fact]
    public void TA_es_valido_solo_con_margen_antes_del_vencimiento()
    {
        var now = DateTime.UtcNow;
        var ta = FiscalAccessToken.Create(Tenant, "20222222223", "wsfe", FiscalEnvironment.Homologacion,
            "tok-cifrado", "sign-cifrado", now, expirationTime: now.AddHours(12));

        Assert.True(ta.IsValid(now, margin: TimeSpan.FromMinutes(5)));
        Assert.False(ta.IsValid(now.AddHours(11).AddMinutes(56), TimeSpan.FromMinutes(5))); // dentro del margen
        Assert.False(ta.IsValid(now.AddHours(13), TimeSpan.Zero)); // vencido

        ta.Replace("tok2", "sign2", now.AddHours(12), now.AddHours(24));
        Assert.True(ta.IsValid(now.AddHours(13), TimeSpan.FromMinutes(5)));
        Assert.Equal("tok2", ta.TokenEncrypted);
    }

    // ---- FiscalCertificate ----

    [Fact]
    public void Certificado_pendiente_activa_y_reporta_usable()
    {
        var cert = FiscalCertificate.CreatePending(Tenant, FiscalEnvironment.Homologacion, "pk-cifrada", "-----BEGIN CERTIFICATE REQUEST-----");
        Assert.Equal(CertificateStatus.PendingCsr, cert.Status);
        Assert.False(cert.IsUsable);

        cert.Activate("cert-cifrado", "CN=tienda", DateTime.UtcNow.AddDays(-1), DateTime.UtcNow.AddYears(2));
        Assert.Equal(CertificateStatus.Active, cert.Status);
        Assert.True(cert.IsUsable);
    }

    [Fact]
    public void Certificado_subido_ya_vencido_queda_Expired_y_no_usable()
    {
        var cert = FiscalCertificate.CreatePending(Tenant, FiscalEnvironment.Produccion, "pk", "csr");
        cert.Activate("cert", "CN=x", DateTime.UtcNow.AddYears(-3), DateTime.UtcNow.AddDays(-1));
        Assert.Equal(CertificateStatus.Expired, cert.Status);
        Assert.False(cert.IsUsable);
    }

    // ---- FiscalDocument ----

    [Fact]
    public void Documento_draft_autorizado_guarda_CAE_y_las_observaciones_no_son_error()
    {
        var doc = FiscalDocument.Draft(Tenant, orderId: Guid.NewGuid(), FiscalEnvironment.Produccion,
            ptoVta: 1, CbteTipo.FacturaC, number: 42, DocTipo.ConsumidorFinal, docNro: 0,
            impTotal: 1210m, impNeto: 1000m, impIva: 210m);
        Assert.Equal(FiscalResult.Pending, doc.Result);
        Assert.Null(doc.Cae);

        var vto = DateTime.UtcNow.AddDays(10);
        doc.MarkAuthorized("75123456789012", vto, observationsJson: "[{\"Code\":10017}]", request: "<xml/>", response: "<xml/>");
        Assert.Equal(FiscalResult.Authorized, doc.Result);
        Assert.Equal("75123456789012", doc.Cae);
        Assert.Equal(vto, doc.CaeVtoUtc);
        Assert.NotNull(doc.Observations); // obs con CAE = válido igual (H13)
        Assert.Null(doc.Errors);
    }

    [Fact]
    public void Documento_rechazado_guarda_errores_y_payloads_de_auditoria()
    {
        var doc = FiscalDocument.Draft(Tenant, null, FiscalEnvironment.Homologacion,
            1, CbteTipo.NotaCreditoC, 7, DocTipo.Cuit, 20222222223, 100m, 100m, 0m);

        doc.MarkRejected("[{\"Code\":10071}]", "<req/>", "<res/>");
        Assert.Equal(FiscalResult.Rejected, doc.Result);
        Assert.NotNull(doc.Errors);
        Assert.Null(doc.Cae);
        Assert.Equal("<req/>", doc.RequestPayload);
        Assert.Equal("<res/>", doc.ResponsePayload);
    }
}
