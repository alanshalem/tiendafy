namespace Support.Infrastructure;

public enum ConversationStatus
{
    Open = 0,
    Closed = 1,
}

/// <summary>
/// Chat posventa: una conversación por orden entre el comprador (Customer) y el
/// staff de la tienda. Los contadores de no-leídos son por lado y se resetean
/// al listar mensajes desde ese lado.
/// </summary>
public sealed class Conversation
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid OrderId { get; private set; }
    public Guid CustomerId { get; private set; }
    /// <summary>Snapshot para la bandeja del admin (evita join cross-módulo).</summary>
    public string CustomerEmail { get; private set; } = null!;
    public ConversationStatus Status { get; private set; }
    public int UnreadForCustomer { get; private set; }
    public int UnreadForStaff { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime LastMessageAtUtc { get; private set; }

    private Conversation() { } // EF Core

    public static Conversation Open(Guid tenantId, Guid orderId, Guid customerId, string customerEmail) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        OrderId = orderId,
        CustomerId = customerId,
        CustomerEmail = customerEmail,
        Status = ConversationStatus.Open,
        CreatedAtUtc = DateTime.UtcNow,
        LastMessageAtUtc = DateTime.UtcNow,
    };

    public void RegisterMessage(bool fromStaff)
    {
        LastMessageAtUtc = DateTime.UtcNow;
        if (fromStaff) UnreadForCustomer++;
        else UnreadForStaff++;
        if (Status == ConversationStatus.Closed && !fromStaff)
            Status = ConversationStatus.Open; // el cliente reabre al escribir
    }

    public void MarkReadByCustomer() => UnreadForCustomer = 0;
    public void MarkReadByStaff() => UnreadForStaff = 0;
    public void Close() => Status = ConversationStatus.Closed;
}

/// <summary>
/// Mensaje del chat. Un adjunto opcional por mensaje (PDF/JPG/PNG), guardado
/// privado en S3: acá solo la clave — la URL firmada se genera al listar.
/// </summary>
public sealed class SupportMessage
{
    public Guid Id { get; private set; }
    public Guid ConversationId { get; private set; }
    public Guid TenantId { get; private set; }
    public bool IsFromStaff { get; private set; }
    /// <summary>Nombre visible del autor (email del staff o del cliente).</summary>
    public string AuthorName { get; private set; } = null!;
    public string Body { get; private set; } = null!;
    public string? AttachmentKey { get; private set; }
    public string? AttachmentName { get; private set; }
    public string? AttachmentContentType { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private SupportMessage() { } // EF Core

    public static SupportMessage Create(
        Guid conversationId, Guid tenantId, bool isFromStaff, string authorName, string body,
        string? attachmentKey = null, string? attachmentName = null, string? attachmentContentType = null) => new()
        {
            Id = Guid.NewGuid(),
            ConversationId = conversationId,
            TenantId = tenantId,
            IsFromStaff = isFromStaff,
            AuthorName = authorName,
            Body = body.Trim()[..Math.Min(4000, body.Trim().Length)],
            AttachmentKey = attachmentKey,
            AttachmentName = attachmentName,
            AttachmentContentType = attachmentContentType,
            CreatedAtUtc = DateTime.UtcNow,
        };
}
