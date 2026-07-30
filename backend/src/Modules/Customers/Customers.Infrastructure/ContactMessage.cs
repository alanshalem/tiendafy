namespace Customers.Infrastructure;

/// <summary>Mensaje enviado desde el formulario de contacto del storefront.</summary>
public sealed class ContactMessage
{
    public const string KindContact = "contact";
    public const string KindRepentance = "repentance";

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Name { get; private set; } = null!;
    public string Email { get; private set; } = null!;
    public string Body { get; private set; } = null!;

    /// <summary>Tipo de mensaje: contacto común o Botón de Arrepentimiento.</summary>
    public string Kind { get; private set; } = KindContact;

    /// <summary>Número de constancia (solo arrepentimiento) — el mismo que ve el comprador.</summary>
    public string? Reference { get; private set; }

    /// <summary>Número de pedido tal como lo escribió el comprador (texto libre).</summary>
    public string? OrderRef { get; private set; }

    public bool Read { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private ContactMessage() { } // EF Core

    public static ContactMessage Create(
        Guid tenantId, string name, string email, string body,
        string kind = KindContact, string? reference = null, string? orderRef = null) => new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = name.Trim(),
            Email = email.Trim().ToLowerInvariant(),
            Body = body.Trim(),
            Kind = kind == KindRepentance ? KindRepentance : KindContact,
            Reference = string.IsNullOrWhiteSpace(reference) ? null : reference.Trim(),
            OrderRef = string.IsNullOrWhiteSpace(orderRef) ? null : orderRef.Trim(),
            Read = false,
            CreatedAtUtc = DateTime.UtcNow,
        };

    public void MarkRead() => Read = true;
}
