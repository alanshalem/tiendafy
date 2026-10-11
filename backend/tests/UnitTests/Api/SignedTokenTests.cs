using System.Text.Json;
using Api.Auth;
using Api.Notifications;
using Api.Shipping;
using Microsoft.AspNetCore.DataProtection;

namespace UnitTests.Api;

/// <summary>
/// El motor de tokens firmados.
///
/// Lo que más importa no es que un token nuevo se lea: es que un token emitido
/// ANTES de unificar el motor se siga leyendo. Un link de baja que salió en un
/// mail hace meses tiene que funcionar —es un derecho del destinatario y lo
/// exigen los proveedores de email—, y una cotización de envío en vuelo no
/// puede caerse en medio de un checkout. Los tokens "viejos" de acá se arman
/// con las mismas llamadas literales que hacía el código anterior.
/// </summary>
public sealed class SignedTokenTests
{
    private readonly EphemeralDataProtectionProvider _dp = new();

    private sealed record Demo(Guid TenantId, string Value);

    [Fact]
    public void Un_link_de_baja_emitido_con_el_codigo_viejo_se_sigue_leyendo()
    {
        var tenant = Guid.NewGuid();
        var viejo = _dp.CreateProtector("Tiendafy.Marketing.Unsubscribe.v1")
            .Protect(JsonSerializer.Serialize(new UnsubscribePayload(tenant, "ana@mail.com", null)));

        var leido = UnsubscribeToken.Unprotect(_dp, viejo);

        Assert.NotNull(leido);
        Assert.Equal(tenant, leido.TenantId);
        Assert.Equal("ana@mail.com", leido.Email);
    }

    [Fact]
    public void Un_token_de_tracking_emitido_con_el_codigo_viejo_se_sigue_leyendo()
    {
        var campaign = Guid.NewGuid();
        var viejo = _dp.CreateProtector("Tiendafy.Marketing.Track.v1")
            .Protect(JsonSerializer.Serialize(new TrackPayload(campaign, "ana@mail.com")));

        Assert.Equal(campaign, TrackToken.Unprotect(_dp, viejo)?.CampaignId);
    }

    [Fact]
    public void Una_cotizacion_emitida_con_el_codigo_viejo_se_sigue_leyendo()
    {
        var tenant = Guid.NewGuid();
        var payload = new AndreaniQuotePayload(tenant, 1, 150050, "ARS", "Estándar", "C1", false, "1414");
        var viejo = _dp.CreateProtector("Tiendafy.Shipping.AndreaniQuote.v1").ToTimeLimitedDataProtector()
            .Protect(JsonSerializer.Serialize(payload), TimeSpan.FromMinutes(30));

        Assert.Equal(150050, AndreaniQuoteToken.Unprotect(_dp, viejo, tenant)?.PriceMinorUnits);
    }

    [Fact]
    public void Ida_y_vuelta()
    {
        var token = new SignedToken<Demo>("Test.Demo.v1");
        var payload = new Demo(Guid.NewGuid(), "hola");

        Assert.Equal(payload, token.Unprotect(_dp, token.Protect(_dp, payload)));
    }

    [Fact]
    public void Un_token_vencido_no_se_lee()
    {
        var token = new SignedToken<Demo>("Test.Demo.v1", TimeSpan.FromMilliseconds(-1));
        var emitido = token.Protect(_dp, new Demo(Guid.NewGuid(), "x"));

        Assert.Null(token.Unprotect(_dp, emitido));
    }

    [Fact]
    public void Un_token_adulterado_o_basura_da_null_y_no_tira()
    {
        var token = new SignedToken<Demo>("Test.Demo.v1");
        var emitido = token.Protect(_dp, new Demo(Guid.NewGuid(), "x"));

        Assert.Null(token.Unprotect(_dp, emitido[..^4] + "AAAA"));
        Assert.Null(token.Unprotect(_dp, "no-es-un-token"));
        Assert.Null(token.Unprotect(_dp, ""));
    }

    [Fact]
    public void Otro_purpose_no_lee_el_token()
    {
        // Lo que impide usar el link de baja como token de tracking, o al revés.
        var emitido = new SignedToken<Demo>("Test.A.v1").Protect(_dp, new Demo(Guid.NewGuid(), "x"));

        Assert.Null(new SignedToken<Demo>("Test.B.v1").Unprotect(_dp, emitido));
    }

    [Fact]
    public void Con_vencimiento_y_sin_vencimiento_no_son_intercambiables()
    {
        // El formato cambia: por eso cada caller declara si su token vence, y
        // cambiarlo después invalidaría todo lo emitido.
        var sinVencer = new SignedToken<Demo>("Test.Demo.v1").Protect(_dp, new Demo(Guid.NewGuid(), "x"));

        Assert.Null(new SignedToken<Demo>("Test.Demo.v1", TimeSpan.FromMinutes(5)).Unprotect(_dp, sinVencer));
    }

    [Fact]
    public void La_validacion_del_caller_decide()
    {
        var token = new SignedToken<Demo>("Test.Demo.v1");
        var emitido = token.Protect(_dp, new Demo(Guid.Empty, "x"));

        Assert.Null(token.Unprotect(_dp, emitido, p => p.TenantId != Guid.Empty));
        Assert.NotNull(token.Unprotect(_dp, emitido));
    }

    [Fact]
    public void Una_cotizacion_de_otra_tienda_no_se_lee()
    {
        var payload = new AndreaniQuotePayload(Guid.NewGuid(), 1, 100, "ARS", "E", "C", false, "1414");
        var emitido = AndreaniQuoteToken.Protect(_dp, payload);

        Assert.Null(AndreaniQuoteToken.Unprotect(_dp, emitido, Guid.NewGuid()));
    }
}
