using Api.Notifications;
using Microsoft.AspNetCore.DataProtection;
using Notifications.Infrastructure;

namespace UnitTests.Notifications;

public class EmailCampaignTests
{
    private static EmailCampaign Draft() =>
        EmailCampaign.Create(Guid.NewGuid(), "  Novedades de julio  ", "<p>Hola</p>", "buyers");

    [Fact]
    public void Create_NormalizaAsuntoYAudiencia()
    {
        var campaign = EmailCampaign.Create(Guid.NewGuid(), " Promo ", "<p>x</p>", "CUSTOMERS");
        Assert.Equal("Promo", campaign.Subject);
        Assert.Equal("customers", campaign.Audience);
        Assert.Equal("draft", campaign.Status);
    }

    [Fact]
    public void Create_AudienciaDesconocida_CaeEnBuyers()
    {
        var campaign = EmailCampaign.Create(Guid.NewGuid(), "x", "<p>x</p>", "everyone");
        Assert.Equal("buyers", campaign.Audience);
    }

    [Fact]
    public void CicloCompleto_DraftSendingSent()
    {
        var campaign = Draft();
        campaign.StartSending(120);

        Assert.True(campaign.IsSending);
        Assert.Equal(120, campaign.RecipientCount);

        campaign.RecordProgress(sentDelta: 100, failedDelta: 5);
        campaign.RecordProgress(sentDelta: 15, failedDelta: 0);
        campaign.MarkSent();

        Assert.Equal("sent", campaign.Status);
        Assert.Equal(115, campaign.SentCount);
        Assert.Equal(5, campaign.FailedCount);
        Assert.NotNull(campaign.SentAtUtc);
    }

    [Fact]
    public void UpdateDraft_SoloEnBorrador()
    {
        var campaign = Draft();
        campaign.StartSending(10);
        campaign.UpdateDraft("Otro asunto", "<p>otro</p>", "customers");

        // Ya no es borrador: nada cambia.
        Assert.Equal("Novedades de julio", campaign.Subject);
        Assert.Equal("buyers", campaign.Audience);
    }

    [Fact]
    public void Cancel_EnSendingFrena_EnSentNo()
    {
        var sending = Draft();
        sending.StartSending(10);
        sending.Cancel();
        Assert.Equal("cancelled", sending.Status);

        var sent = Draft();
        sent.StartSending(1);
        sent.MarkSent();
        sent.Cancel();
        Assert.Equal("sent", sent.Status);
    }

    [Fact]
    public void MarkSent_SoloDesdeSending()
    {
        var campaign = Draft();
        campaign.MarkSent();
        Assert.Equal("draft", campaign.Status);
    }
}

public class EmailSuppressionTests
{
    [Fact]
    public void Create_NormalizaEmailYRazon()
    {
        var s = EmailSuppression.Create(Guid.NewGuid(), "  Ana@Gmail.COM ", "unsubscribe");
        Assert.Equal("ana@gmail.com", s.Email);
        Assert.Equal("unsubscribe", s.Reason);

        var m = EmailSuppression.Create(Guid.NewGuid(), "x@y.com", "manual");
        Assert.Equal("manual", m.Reason);

        var raro = EmailSuppression.Create(Guid.NewGuid(), "x@y.com", "otra-cosa");
        Assert.Equal("unsubscribe", raro.Reason);
    }
}

public class CampaignRecipientTests
{
    [Fact]
    public void Create_NormalizaEmail_YTransiciona()
    {
        var r = CampaignRecipient.Create(Guid.NewGuid(), Guid.NewGuid(), " Cliente@Mail.com ");
        Assert.Equal("cliente@mail.com", r.Email);
        Assert.Equal("pending", r.Status);
        r.MarkSent();
        Assert.Equal("sent", r.Status);
    }
}

public class UnsubscribeTokenTests
{
    private static readonly IDataProtectionProvider Dp = new EphemeralDataProtectionProvider();

    [Fact]
    public void RoundTrip_RecuperaTenantYEmailNormalizado()
    {
        var tenant = Guid.NewGuid();
        var token = UnsubscribeToken.Protect(Dp, tenant, "  Ana@Gmail.COM ");
        var back = UnsubscribeToken.Unprotect(Dp, token);

        Assert.NotNull(back);
        Assert.Equal(tenant, back!.TenantId);
        Assert.Equal("ana@gmail.com", back.Email);
    }

    [Fact]
    public void Unprotect_TokenAdulterado_DevuelveNull()
    {
        var token = UnsubscribeToken.Protect(Dp, Guid.NewGuid(), "x@y.com");
        Assert.Null(UnsubscribeToken.Unprotect(Dp, token + "x"));
        Assert.Null(UnsubscribeToken.Unprotect(Dp, "basura"));
    }

    [Fact]
    public void Token_NoVence()
    {
        // Sin ITimeLimitedDataProtector a propósito: el link de baja debe
        // funcionar aunque el email quede meses en la bandeja. Este test
        // documenta la decisión (round-trip inmediato como proxy).
        var token = UnsubscribeToken.Protect(Dp, Guid.NewGuid(), "x@y.com");
        Assert.NotNull(UnsubscribeToken.Unprotect(Dp, token));
    }
}
