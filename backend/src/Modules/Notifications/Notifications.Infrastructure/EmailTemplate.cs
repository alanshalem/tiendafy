namespace Notifications.Infrastructure;

/// <summary>Override por tenant de una plantilla de email (enabled/asunto/cuerpo editados).</summary>
public sealed class EmailTemplate
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Type { get; private set; } = "";
    public bool Enabled { get; private set; }
    public string Subject { get; private set; } = "";
    public string BodyHtml { get; private set; } = "";
    public DateTime UpdatedAtUtc { get; private set; }

    private EmailTemplate() { }

    public static EmailTemplate Create(Guid tenantId, string type, bool enabled, string subject, string bodyHtml)
        => new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Type = type,
            Enabled = enabled,
            Subject = subject,
            BodyHtml = bodyHtml,
            UpdatedAtUtc = DateTime.UtcNow,
        };

    public void Update(bool enabled, string subject, string bodyHtml)
    {
        Enabled = enabled;
        Subject = subject;
        BodyHtml = bodyHtml;
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
