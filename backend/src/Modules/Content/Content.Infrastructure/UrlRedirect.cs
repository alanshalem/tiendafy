using SharedKernel.Common;

namespace Content.Infrastructure;

/// <summary>
/// Redirección permanente de una URL vieja de la tienda a otra. Sirve cuando
/// cambia el slug de un producto o se rehace la estructura del sitio: sin esto
/// el link que quedó en Google, en un mail o en un post de Instagram cae en un
/// 404 y se pierde tanto la visita como el posicionamiento.
///
/// Se cuenta cuántas veces se usó cada una: una regla que nunca se dispara es
/// una regla que se puede borrar, y una que se dispara mucho suele señalar un
/// link roto que conviene arreglar en el origen.
/// </summary>
public sealed class UrlRedirect
{
    public const int MaxPathLength = 400;

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    /// <summary>Ruta vieja, normalizada: siempre empieza con "/" y no termina con "/".</summary>
    public string FromPath { get; private set; } = string.Empty;

    /// <summary>A dónde va: otra ruta de la tienda, o una URL http(s) completa.</summary>
    public string ToPath { get; private set; } = string.Empty;

    public int Hits { get; private set; }
    public DateTime? LastHitAtUtc { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private UrlRedirect() { } // EF Core

    public static Result<UrlRedirect> Create(Guid tenantId, string? from, string? to)
    {
        var fromPath = NormalizeFrom(from);
        if (fromPath is null)
            return Result.Failure<UrlRedirect>(Error.Validation(
                "Redirect.From", "La URL vieja tiene que ser una ruta de tu tienda, como /producto-viejo."));

        var toPath = NormalizeTo(to);
        if (toPath is null)
            return Result.Failure<UrlRedirect>(Error.Validation(
                "Redirect.To", "La URL nueva tiene que ser una ruta de tu tienda o una dirección http(s) completa."));

        // Una regla que apunta a sí misma deja al visitante rebotando para
        // siempre entre la misma URL, y el browser corta con un error.
        if (string.Equals(fromPath, toPath, StringComparison.OrdinalIgnoreCase))
            return Result.Failure<UrlRedirect>(Error.Validation(
                "Redirect.Loop", "El origen y el destino son la misma dirección."));

        return Result.Success(new UrlRedirect
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            FromPath = fromPath,
            ToPath = toPath,
            CreatedAtUtc = DateTime.UtcNow,
        });
    }

    public void RegisterHit()
    {
        Hits++;
        LastHitAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Deja la ruta en una sola forma para que "/Zapatos/", "zapatos" y
    /// "/zapatos?utm_source=ig" sean la misma regla. Null = no sirve.
    /// </summary>
    public static string? NormalizeFrom(string? raw)
    {
        var value = (raw ?? string.Empty).Trim();
        if (value.Length == 0) return null;

        // Si pegaron la URL entera, se usa solo la ruta.
        if (Uri.TryCreate(value, UriKind.Absolute, out var absolute))
        {
            if (absolute.Scheme != Uri.UriSchemeHttp && absolute.Scheme != Uri.UriSchemeHttps) return null;
            value = absolute.AbsolutePath;
        }

        var query = value.IndexOfAny(['?', '#']);
        if (query >= 0) value = value[..query];

        if (!value.StartsWith('/')) value = "/" + value;
        value = value.TrimEnd('/');
        if (value.Length == 0) return null; // la home no se redirige a ningún lado
        if (value.Length > MaxPathLength) return null;

        // "//otro-sitio.com" el browser lo lee como una URL con protocolo
        // implícito: normalizar a una sola barra evita esa sorpresa.
        while (value.StartsWith("//", StringComparison.Ordinal)) value = value[1..];

        return value.ToLowerInvariant();
    }

    /// <summary>Destino: ruta local o http(s). Cualquier otro esquema se rechaza.</summary>
    public static string? NormalizeTo(string? raw)
    {
        var value = (raw ?? string.Empty).Trim();
        if (value.Length == 0 || value.Length > MaxPathLength) return null;

        if (Uri.TryCreate(value, UriKind.Absolute, out var absolute))
            return absolute.Scheme is "http" or "https" ? absolute.ToString() : null;

        // Sin esquema tiene que ser una ruta de la tienda. Se descarta cualquier
        // cosa con ":" (javascript:, data:) y el "//" con protocolo implícito.
        if (value.Contains(':', StringComparison.Ordinal)) return null;
        if (!value.StartsWith('/')) value = "/" + value;
        while (value.StartsWith("//", StringComparison.Ordinal)) value = value[1..];
        return value;
    }
}
