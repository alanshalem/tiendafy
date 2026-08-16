using SharedKernel.Common;

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
    /// <summary>"buyers" | "customers" | "custom" (selección manual).</summary>
    public string Audience { get; private set; } = "buyers";
    /// <summary>
    /// Spec completa de la audiencia en JSON: filtros (gasto/compras/recencia)
    /// y/o emails elegidos a mano. La interpreta CampaignAudienceService.
    /// </summary>
    public string? AudienceJson { get; private set; }
    /// <summary>Cupón asociado para atribución de ingresos (ventas con ese código desde el envío).</summary>
    public string? CouponCode { get; private set; }
    /// <summary>Cards de productos (JSON) que se renderizan debajo del contenido.</summary>
    public string? ProductsJson { get; private set; }
    /// <summary>"draft" | "scheduled" | "sending" | "sent" | "cancelled".</summary>
    public string Status { get; private set; } = "draft";
    /// <summary>Si está programada, cuándo debe arrancar el envío.</summary>
    public DateTime? ScheduledAtUtc { get; private set; }
    public int RecipientCount { get; private set; }
    public int SentCount { get; private set; }
    public int FailedCount { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? SentAtUtc { get; private set; }

    private EmailCampaign() { } // EF Core

    public static EmailCampaign Create(
        Guid tenantId, string subject, string bodyHtml, string audience,
        string? audienceJson = null, string? couponCode = null, string? productsJson = null) => new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Subject = subject.Trim(),
            BodyHtml = bodyHtml,
            Audience = NormalizeAudience(audience),
            AudienceJson = audienceJson,
            CouponCode = NormalizeCoupon(couponCode),
            ProductsJson = productsJson,
            Status = "draft",
            CreatedAtUtc = DateTime.UtcNow,
        };

    public bool IsDraft => Status == "draft";
    public bool IsScheduled => Status == "scheduled";
    public bool IsSending => Status == "sending";

    public void UpdateDraft(
        string subject, string bodyHtml, string audience,
        string? audienceJson, string? couponCode, string? productsJson)
    {
        if (!IsDraft && !IsScheduled) return;
        Subject = subject.Trim();
        BodyHtml = bodyHtml;
        Audience = NormalizeAudience(audience);
        AudienceJson = audienceJson;
        CouponCode = NormalizeCoupon(couponCode);
        ProductsJson = productsJson;
    }

    /// <summary>Programa el envío para más adelante (el worker lo levanta al vencer).</summary>
    public void Schedule(DateTime whenUtc)
    {
        if (!IsDraft && !IsScheduled) return;
        Status = "scheduled";
        ScheduledAtUtc = whenUtc;
    }

    /// <summary>Arranca el envío con la audiencia ya snapshoteada.</summary>
    public void StartSending(int recipientCount)
    {
        if (!IsDraft && !IsScheduled) return;
        Status = "sending";
        ScheduledAtUtc = null;
        RecipientCount = recipientCount;
        SentCount = 0;
        FailedCount = 0;
        SentAtUtc = DateTime.UtcNow; // inicio del envío: ancla de la atribución
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
    }

    public void Cancel()
    {
        if (Status is "draft" or "scheduled" or "sending") Status = "cancelled";
    }

    private static string NormalizeAudience(string audience) => audience?.Trim().ToLowerInvariant() switch
    {
        "customers" => "customers",
        "custom" => "custom",
        _ => "buyers",
    };

    private static string? NormalizeCoupon(string? code) => Text.Clip(code?.ToUpperInvariant(), 40);
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
    /// <summary>Primera apertura (pixel). Subestima: muchos clientes bloquean imágenes.</summary>
    public DateTime? OpenedAtUtc { get; private set; }
    /// <summary>Primer click en un link trackeado.</summary>
    public DateTime? ClickedAtUtc { get; private set; }

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
    public void MarkOpened() => OpenedAtUtc ??= DateTime.UtcNow;

    public void MarkClicked()
    {
        ClickedAtUtc ??= DateTime.UtcNow;
        OpenedAtUtc ??= ClickedAtUtc; // un click implica apertura aunque el pixel esté bloqueado
    }
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
    /// <summary>"unsubscribe" (baja voluntaria) | "manual" | "bounce" | "complaint" (webhook de Resend).</summary>
    public string Reason { get; private set; } = "unsubscribe";
    /// <summary>Campaña que originó la baja, si se conoce (métricas de detalle).</summary>
    public Guid? CampaignId { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private EmailSuppression() { } // EF Core

    public static EmailSuppression Create(Guid tenantId, string email, string reason, Guid? campaignId = null) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        Email = email.Trim().ToLowerInvariant(),
        Reason = reason is "manual" or "bounce" or "complaint" ? reason : "unsubscribe",
        CampaignId = campaignId,
        CreatedAtUtc = DateTime.UtcNow,
    };
}
