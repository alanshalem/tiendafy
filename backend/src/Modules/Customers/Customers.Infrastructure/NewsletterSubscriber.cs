namespace Customers.Infrastructure;

/// <summary>
/// Alguien que dejó su email en la tienda para recibir novedades.
///
/// No es un cliente: puede no haber comprado nunca ni tener cuenta. Se guarda
/// aparte para que el comercio pueda escribirle desde Email marketing sin
/// mezclarlo con la lista de compradores, y para poder contestar honestamente
/// "cuántos suscriptores tengo".
///
/// <para>
/// Con doble confirmación: el alta deja la suscripción pendiente y manda un
/// mail con un link (token de un solo uso, guardado como hash, ver
/// <see cref="ShopperTokenHash"/>); recién al tocarlo queda confirmada y le
/// llegan las campañas. Sin eso cualquiera anotaba el email de otro. Las
/// suscripciones de antes de la doble confirmación quedaron confirmadas
/// (migración NewsletterDoubleOptIn).
/// </para>
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

    /// <summary>Cuándo tocó el link del mail. Null = pendiente: no le llegan campañas.</summary>
    public DateTime? ConfirmedAtUtc { get; private set; }

    /// <summary>SHA-256 (hex) del token del link de confirmación; null una vez usado.</summary>
    public string? ConfirmTokenHash { get; private set; }

    public DateTime? ConfirmTokenExpiresAtUtc { get; private set; }

    /// <summary>Cuánto vale el link de confirmación.</summary>
    public static readonly TimeSpan ConfirmLinkLifetime = TimeSpan.FromDays(7);

    public bool IsConfirmed => ConfirmedAtUtc is not null;

    private NewsletterSubscriber() { } // EF Core

    /// <param name="confirmToken">El token en claro del link del mail: se guarda su hash.</param>
    public static NewsletterSubscriber CreatePending(Guid tenantId, string email, string? source, string confirmToken)
    {
        var subscriber = new NewsletterSubscriber
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Email = email.Trim().ToLowerInvariant(),
            Source = source is not null && Sources.Contains(source) ? source : SourceHome,
            CreatedAtUtc = DateTime.UtcNow,
        };
        subscriber.IssueConfirmToken(confirmToken);
        return subscriber;
    }

    /// <summary>Un link nuevo (se suscribió otra vez sin haber confirmado): el anterior deja de valer.</summary>
    public void IssueConfirmToken(string confirmToken)
    {
        ConfirmTokenHash = ShopperTokenHash.Of(confirmToken);
        ConfirmTokenExpiresAtUtc = DateTime.UtcNow.Add(ConfirmLinkLifetime);
    }

    public bool IsConfirmTokenExpired(DateTime nowUtc) => ConfirmTokenExpiresAtUtc is { } until && until <= nowUtc;

    /// <summary>Tocó el link: queda suscripto y el token no sirve más.</summary>
    public void Confirm()
    {
        ConfirmedAtUtc ??= DateTime.UtcNow;
        ConfirmTokenHash = null;
        ConfirmTokenExpiresAtUtc = null;
    }
}
