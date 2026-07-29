namespace Notifications.Infrastructure;

/// <summary>
/// Campaña de email marketing de una tienda. Ciclo: Draft → Sending → Sent
/// (o Cancelled). Al pasar a Sending se snapshotea la audiencia en
/// CampaignRecipient y el CampaignWorker envía por lotes en background.
/// Marketing ≠ transaccional: cada email lleva link de baja firmado y la
/// audiencia SIEMPRE se filtra contra la lista de supresión.
/// </summary>
public sealed class EmailCampaign
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Subject { get; private set; } = null!;
    public string BodyHtml { get; private set; } = null!;
    /// <summary>"buyers" (compraron alguna vez) | "customers" (todos los contactos con email).</summary>
    public string Audience { get; private set; } = "buyers";
    /// <summary>"draft" | "sending" | "sent" | "cancelled".</summary>
    public string Status { get; private set; } = "draft";
    public int RecipientCount { get; private set; }
    public int SentCount { get; private set; }
    public int FailedCount { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? SentAtUtc { get; private set; }

    private EmailCampaign() { } // EF Core

    public static EmailCampaign Create(Guid tenantId, string subject, string bodyHtml, string audience) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        Subject = subject.Trim(),
        BodyHtml = bodyHtml,
        Audience = NormalizeAudience(audience),
        Status = "draft",
        CreatedAtUtc = DateTime.UtcNow,
    };

    public bool IsDraft => Status == "draft";
    public bool IsSending => Status == "sending";

    public void UpdateDraft(string subject, string bodyHtml, string audience)
    {
        if (!IsDraft) return;
        Subject = subject.Trim();
        BodyHtml = bodyHtml;
        Audience = NormalizeAudience(audience);
    }

    /// <summary>Arranca el envío con la audiencia ya snapshoteada.</summary>
    public void StartSending(int recipientCount)
    {
        if (!IsDraft) return;
        Status = "sending";
        RecipientCount = recipientCount;
        SentCount = 0;
        FailedCount = 0;
    }

    public void RecordProgress(int sentDelta, int failedDelta)
    {
        SentCount += sentDelta;
        FailedCount += failedDelta;
    }

    public void MarkSent()
    {
        if (!IsSending) return;
        Status = "sent";
        SentAtUtc = DateTime.UtcNow;
    }

    public void Cancel()
    {
        if (Status is "draft" or "sending") Status = "cancelled";
    }

    private static string NormalizeAudience(string audience) =>
        audience?.Trim().ToLowerInvariant() == "customers" ? "customers" : "buyers";
}

/// <summary>
/// Destinatario snapshoteado de una campaña. El snapshot garantiza que el
/// envío sea resumible (el worker procesa pending y marca sent/failed) y
/// auditable (a quién le llegó qué).
/// </summary>
public sealed class CampaignRecipient
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid CampaignId { get; private set; }
    public string Email { get; private set; } = null!;
    /// <summary>"pending" | "sent" | "failed".</summary>
    public string Status { get; private set; } = "pending";

    private CampaignRecipient() { } // EF Core

    public static CampaignRecipient Create(Guid tenantId, Guid campaignId, string email) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        CampaignId = campaignId,
        Email = email.Trim().ToLowerInvariant(),
        Status = "pending",
    };

    public void MarkSent() => Status = "sent";
    public void MarkFailed() => Status = "failed";
}

/// <summary>
/// Lista de supresión por tienda: quien se dio de baja no recibe NUNCA más
/// campañas de esa tienda (los transaccionales de sus compras siguen — son
/// otra categoría legal). Única por tenant+email.
/// </summary>
public sealed class EmailSuppression
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Email { get; private set; } = null!;
    /// <summary>"unsubscribe" (baja voluntaria) | "manual" (cargada por la tienda).</summary>
    public string Reason { get; private set; } = "unsubscribe";
    public DateTime CreatedAtUtc { get; private set; }

    private EmailSuppression() { } // EF Core

    public static EmailSuppression Create(Guid tenantId, string email, string reason) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        Email = email.Trim().ToLowerInvariant(),
        Reason = reason == "manual" ? "manual" : "unsubscribe",
        CreatedAtUtc = DateTime.UtcNow,
    };
}
