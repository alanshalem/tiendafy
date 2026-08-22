namespace Customers.Infrastructure;

/// <summary>
/// Alguien que dejó su email en la tienda para recibir novedades.
///
/// No es un cliente: puede no haber comprado nunca ni tener cuenta. Se guarda
/// aparte para que el comercio pueda escribirle desde Email marketing sin
/// mezclarlo con la lista de compradores, y para poder contestar honestamente
/// "cuántos suscriptores tengo".
/// </summary>
public sealed class NewsletterSubscriber
{
    /// <summary>De dónde salió el email. Sirve para saber qué parte de la tienda capta.</summary>
    public const string SourceHome = "home";
    public const string SourceFooter = "footer";
    public const string SourceComingSoon = "coming-soon";

    private static readonly string[] Sources = [SourceHome, SourceFooter, SourceComingSoon];

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    /// <summary>Siempre en minúsculas: es la clave contra la que se deduplica.</summary>
    public string Email { get; private set; } = null!;

    public string Source { get; private set; } = SourceHome;
    public DateTime CreatedAtUtc { get; private set; }

    private NewsletterSubscriber() { } // EF Core

    public static NewsletterSubscriber Create(Guid tenantId, string email, string? source) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        Email = email.Trim().ToLowerInvariant(),
        Source = source is not null && Sources.Contains(source) ? source : SourceHome,
        CreatedAtUtc = DateTime.UtcNow,
    };
}
