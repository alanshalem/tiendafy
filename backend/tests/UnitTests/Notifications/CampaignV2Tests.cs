using Api.Notifications;
using Microsoft.AspNetCore.DataProtection;
using Notifications.Infrastructure;

namespace UnitTests.Notifications;

public class AudienceFiltersTests
{
    private static readonly DateTime Now = new(2026, 7, 29, 12, 0, 0, DateTimeKind.Utc);

    private static List<AudienceMember> Members() =>
    [
        new("vip@mail.com", "Vip", SpentMinor: 500_000_00, Orders: 8, LastPurchaseUtc: Now.AddDays(-5)),
        new("normal@mail.com", "Normal", SpentMinor: 20_000_00, Orders: 2, LastPurchaseUtc: Now.AddDays(-40)),
        new("dormido@mail.com", "Dormido", SpentMinor: 8_000_00, Orders: 1, LastPurchaseUtc: Now.AddDays(-200)),
        new("contacto@mail.com", "Contacto", SpentMinor: 0, Orders: 0, LastPurchaseUtc: null),
    ];

    [Fact]
    public void GastoMinimo_FiltraPorMonto()
    {
        var spec = new AudienceSpec("buyers", MinSpentMinor: 100_000_00);
        var result = AudienceFilters.Apply(Members(), spec, Now).ToList();
        Assert.Single(result);
        Assert.Equal("vip@mail.com", result[0].Email);
    }

    [Fact]
    public void ComprasMinimas_FiltraRecurrentes()
    {
        var spec = new AudienceSpec("buyers", MinOrders: 2);
        var result = AudienceFilters.Apply(Members(), spec, Now).Select(m => m.Email).ToList();
        Assert.Equal(["vip@mail.com", "normal@mail.com"], result);
    }

    [Fact]
    public void ComproReciente_FiltraPorVentana()
    {
        var spec = new AudienceSpec("buyers", PurchasedWithinDays: 30);
        var result = AudienceFilters.Apply(Members(), spec, Now).ToList();
        Assert.Single(result);
        Assert.Equal("vip@mail.com", result[0].Email);
    }

    [Fact]
    public void Inactivos_IncluyeSinCompras()
    {
        // Reactivación: sin comprar hace 90+ días (o nunca compró).
        var spec = new AudienceSpec("buyers", InactiveForDays: 90);
        var result = AudienceFilters.Apply(Members(), spec, Now).Select(m => m.Email).ToList();
        Assert.Equal(["dormido@mail.com", "contacto@mail.com"], result);
    }

    [Fact]
    public void FiltrosCombinados_SonAnd()
    {
        var spec = new AudienceSpec("buyers", MinSpentMinor: 10_000_00, MinOrders: 2, PurchasedWithinDays: 60);
        var result = AudienceFilters.Apply(Members(), spec, Now).Select(m => m.Email).ToList();
        Assert.Equal(["vip@mail.com", "normal@mail.com"], result);
    }

    [Fact]
    public void SeleccionManual_IgnoraFiltros()
    {
        var spec = new AudienceSpec("custom", MinSpentMinor: 999_999_99, Emails: ["contacto@mail.com"]);
        var result = AudienceFilters.Apply(Members(), spec, Now).ToList();
        Assert.Equal(4, result.Count); // custom no filtra: la lista manda aguas arriba
    }

    [Fact]
    public void Spec_RoundTripJson()
    {
        var spec = new AudienceSpec("customers", MinSpentMinor: 5000, MinOrders: 3,
            PurchasedWithinDays: 90, Emails: ["a@b.com"]);
        var back = AudienceSpec.Parse(spec.Serialize(), "buyers");
        Assert.Equal(spec.Type, back.Type);
        Assert.Equal(spec.MinSpentMinor, back.MinSpentMinor);
        Assert.Equal(spec.MinOrders, back.MinOrders);
        Assert.Equal(spec.PurchasedWithinDays, back.PurchasedWithinDays);
        Assert.Equal(spec.Emails, back.Emails);
    }

    [Fact]
    public void Spec_JsonRoto_CaeAlFallback()
    {
        Assert.Equal("customers", AudienceSpec.Parse("{no es json", "customers").Type);
        Assert.Equal("buyers", AudienceSpec.Parse(null, "buyers").Type);
    }
}

public class CampaignEmailComposerTests
{
    [Fact]
    public void RewriteLinks_EnvuelveSoloHttp()
    {
        const string html = """<a href="https://tienda.com/productos/remera">Ver</a> <a href="mailto:x@y.com">Mail</a>""";
        var result = CampaignEmailComposer.RewriteLinks(html, "https://api.test/c?t=TOK");

        Assert.Contains("https://api.test/c?t=TOK&u=https%3A%2F%2Ftienda.com%2Fproductos%2Fremera", result);
        Assert.Contains("mailto:x@y.com", result); // no se toca
    }

    [Fact]
    public void ComposeForRecipient_IncluyePixelBajaYProductos()
    {
        var products = new List<CampaignProduct>
        {
            new(Guid.NewGuid(), "Remera Oversize", 15_000_00, "ARS", null, "remera-oversize"),
        };
        var html = CampaignEmailComposer.ComposeForRecipient(
            "<p>Hola</p>", products, "https://mitienda.com",
            "https://api.test/c?t=TOK", "https://api.test/o.gif?t=TOK", "https://api.test/unsub?token=U");

        Assert.Contains("Remera Oversize", html);
        Assert.Contains("o.gif?t=TOK", html);
        Assert.Contains("unsub?token=U", html);
        // El link del producto quedó trackeado; el de baja NO.
        Assert.Contains("&u=https%3A%2F%2Fmitienda.com%2Fproductos%2Fremera-oversize", html);
        Assert.DoesNotContain("&u=https%3A%2F%2Fapi.test%2Funsub", html);
    }

    [Fact]
    public void ParseProducts_JsonRotoOVacio_DevuelveVacio()
    {
        Assert.Empty(CampaignEmailComposer.ParseProducts(null));
        Assert.Empty(CampaignEmailComposer.ParseProducts("{roto"));
    }
}

public class TrackTokenTests
{
    private static readonly IDataProtectionProvider Dp = TestData.Dp;

    [Fact]
    public void RoundTrip_YRechazaAdulterados()
    {
        var campaignId = Guid.NewGuid();
        var token = TrackToken.Protect(Dp, campaignId, " Ana@Mail.com ");
        var back = TrackToken.Unprotect(Dp, token);

        Assert.NotNull(back);
        Assert.Equal(campaignId, back!.CampaignId);
        Assert.Equal("ana@mail.com", back.Email);
        Assert.Null(TrackToken.Unprotect(Dp, token + "x"));
    }
}

public class CampaignScheduleTests
{
    [Fact]
    public void Schedule_YLuegoEnviar_TransicionaBien()
    {
        var campaign = EmailCampaign.Create(Guid.NewGuid(), "x", "<p>x</p>", "buyers");
        campaign.Schedule(DateTime.UtcNow.AddHours(2));
        Assert.True(campaign.IsScheduled);
        Assert.NotNull(campaign.ScheduledAtUtc);

        campaign.StartSending(50);
        Assert.True(campaign.IsSending);
        Assert.Null(campaign.ScheduledAtUtc);
        Assert.NotNull(campaign.SentAtUtc); // ancla de atribución = inicio del envío
    }

    [Fact]
    public void Cancel_FrenaProgramadas()
    {
        var campaign = EmailCampaign.Create(Guid.NewGuid(), "x", "<p>x</p>", "buyers");
        campaign.Schedule(DateTime.UtcNow.AddDays(1));
        campaign.Cancel();
        Assert.Equal("cancelled", campaign.Status);
    }
}

public class SvixVerificationTests
{
    [Fact]
    public void FirmaValida_Pasa_YAdulterada_No()
    {
        var secretBytes = new byte[32];
        Random.Shared.NextBytes(secretBytes);
        var secret = "whsec_" + Convert.ToBase64String(secretBytes);
        const string id = "msg_123";
        const string ts = "1722268800";
        const string payload = """{"type":"email.bounced"}""";

        using var hmac = new System.Security.Cryptography.HMACSHA256(secretBytes);
        var sig = Convert.ToBase64String(hmac.ComputeHash(
            System.Text.Encoding.UTF8.GetBytes($"{id}.{ts}.{payload}")));

        Assert.True(ResendWebhook.VerifySvix(secret, id, ts, $"v1,{sig}", payload));
        Assert.False(ResendWebhook.VerifySvix(secret, id, ts, $"v1,{sig}", payload + "x"));
        Assert.False(ResendWebhook.VerifySvix(secret, id, ts, "v1,AAAA", payload));
        Assert.False(ResendWebhook.VerifySvix(secret, null, ts, $"v1,{sig}", payload));
    }
}
