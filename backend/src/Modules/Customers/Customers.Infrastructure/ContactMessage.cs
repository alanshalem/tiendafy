namespace Customers.Infrastructure;

/// <summary>Mensaje enviado desde el formulario de contacto del storefront.</summary>
public sealed class ContactMessage
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Name { get; private set; } = null!;
    public string Email { get; private set; } = null!;
    public string Body { get; private set; } = null!;
    public bool Read { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private ContactMessage() { } // EF Core

    public static ContactMessage Create(Guid tenantId, string name, string email, string body) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        Name = name.Trim(),
        Email = email.Trim().ToLowerInvariant(),
        Body = body.Trim(),
        Read = false,
        CreatedAtUtc = DateTime.UtcNow,
    };

    public void MarkRead() => Read = true;
}
