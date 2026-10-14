namespace Themes.Infrastructure;

/// <summary>
/// Configuración de diseño de la tienda: un documento por tenant.
/// Modelo draft/published: el editor trabaja sobre el draft (preview en vivo
/// vía postMessage), "Publicar" copia draft → published. El storefront lee
/// published. La config es un blob JSON rico (colores, fuentes, encabezado,
/// barra de anuncio, secciones ordenadas con su contenido). El backend no
/// lo interpreta: lo guarda y lo sirve, y antes de guardar valida las
/// secciones con el contrato generado del registro compartido
/// (<see cref="ThemeConfigValidator"/>).
/// </summary>
public sealed class ThemeDocument
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }

    /// <summary>Config publicada (la que ve el comprador). JSON.</summary>
    public string PublishedConfig { get; set; } = DefaultConfig;

    /// <summary>Borrador del editor (preview, todavía no publicado). JSON.</summary>
    public string DraftConfig { get; set; } = DefaultConfig;

    /// <summary>
    /// Config que sale sola en <see cref="ScheduledAtUtc"/>. Es una copia congelada,
    /// no "el borrador de ese momento": entre programar y publicar el comercio
    /// sigue editando, y lo que se programó tiene que salir tal cual se aprobó.
    /// </summary>
    public string? ScheduledConfig { get; set; }

    /// <summary>Cuándo sale la config programada (UTC). Null = no hay nada programado.</summary>
    public DateTime? ScheduledAtUtc { get; set; }

    public DateTime UpdatedAtUtc { get; set; }

    public static ThemeDocument CreateDefault(Guid tenantId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        PublishedConfig = DefaultConfig,
        DraftConfig = DefaultConfig,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    /// <summary>
    /// Versión del borrador: sube con cada cambio. El editor la manda al guardar
    /// y, si no coincide, el guardado se rechaza (409) en vez de pisar lo que
    /// hizo otra pestaña u otra persona.
    /// </summary>
    public int DraftVersion { get; set; }

    /// <summary>
    /// Config por defecto de una tienda nueva. Sale del contrato que genera el
    /// registro de secciones de shared/types (ver <see cref="ThemeContract"/>):
    /// es exactamente el tema que el editor y la tienda consideran "por
    /// defecto", ya normalizado.
    /// </summary>
    public static string DefaultConfig => ThemeContract.DefaultConfigJson;
}
