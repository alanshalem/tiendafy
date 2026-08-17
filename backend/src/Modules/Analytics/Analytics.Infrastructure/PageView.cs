using SharedKernel.Common;

namespace Analytics.Infrastructure;

/// <summary>
/// Evento de vista de página (storefront). Anónimo: visitorId/sessionId son
/// ids generados en el cliente, sin datos personales.
/// </summary>
public sealed class PageView
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Path { get; private set; } = "/";
    public string? Referrer { get; private set; }
    public string VisitorId { get; private set; } = "";
    public string SessionId { get; private set; } = "";
    public DateTime OccurredAtUtc { get; private set; }

    private PageView() { }

    public static PageView Create(Guid tenantId, string? path, string? referrer, string? visitorId, string? sessionId)
        => new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Path = Text.Cap(string.IsNullOrWhiteSpace(path) ? "/" : path!, 512),
            Referrer = string.IsNullOrWhiteSpace(referrer) ? null : Text.Cap(referrer!, 512),
            VisitorId = Text.Cap(visitorId ?? "", 64),
            SessionId = Text.Cap(sessionId ?? "", 64),
            OccurredAtUtc = DateTime.UtcNow,
        };

}
