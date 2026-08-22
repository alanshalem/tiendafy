namespace Themes.Infrastructure;

/// <summary>
/// Una foto del diseño en el momento en que se publicó.
///
/// Publicar es lo único irreversible del editor: en el segundo siguiente lo ve
/// todo el que entra a la tienda. Sin historial, "quedó mejor como estaba antes"
/// significaba rehacerlo de memoria. Se guardan las últimas
/// <see cref="MaxPerTenant"/> por tienda: es una foto completa del tema y no
/// tiene sentido acumularlas para siempre.
/// </summary>
public sealed class ThemeVersion
{
    public const int MaxPerTenant = 20;

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    /// <summary>La config publicada en ese momento. JSON.</summary>
    public string Config { get; private set; } = null!;

    public DateTime PublishedAtUtc { get; private set; }

    /// <summary>Quién publicó. Null si no se pudo resolver (no vale perder la versión por eso).</summary>
    public Guid? PublishedByUserId { get; private set; }

    private ThemeVersion() { } // EF Core

    public static ThemeVersion Create(Guid tenantId, string config, Guid? userId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        Config = config,
        PublishedAtUtc = DateTime.UtcNow,
        PublishedByUserId = userId,
    };
}
