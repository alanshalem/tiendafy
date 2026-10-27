using System.Text.RegularExpressions;
using SharedKernel.Common;

namespace Tenancy.Core.Domain;

/// <summary>
/// Subdominio de tienda: mitienda.plataforma.com. Reglas DNS label
/// (RFC 1035) + lista de reservados de plataforma.
/// </summary>
public sealed partial record Subdomain
{
    // 3-63 chars, lowercase alfanumérico y guiones, sin guión al inicio/fin.
    [GeneratedRegex("^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$")]
    private static partial Regex ValidPattern();

    // img/media: el host de las fotos (MEDIA_PUBLIC_BASE_URL, ver .env.prod.example).
    // stg: staging cuelga de producción (stg.<dominio>).
    private static readonly HashSet<string> Reserved =
    [
        "www", "admin", "api", "app", "staging", "stg", "dev", "test",
        "mail", "smtp", "ftp", "blog", "docs", "status", "cdn",
        "assets", "static", "img", "media", "checkout", "pay", "billing", "support",
    ];

    /// <summary>
    /// ¿Es un subdominio de la plataforma que no es una tienda (el panel, la API,
    /// las fotos…)? CORS no les da credenciales como si fueran una tienda.
    /// </summary>
    public static bool IsReserved(string label) => Reserved.Contains(label.ToLowerInvariant());

    public string Value { get; }

    private Subdomain(string value) => Value = value;

    public static Result<Subdomain> Create(string? raw)
    {
        var value = raw?.Trim().ToLowerInvariant() ?? string.Empty;

        if (!ValidPattern().IsMatch(value))
            return Result.Failure<Subdomain>(Error.Validation(
                "Subdomain.Invalid",
                "La dirección de la tienda tiene que tener entre 3 y 63 caracteres: minúsculas, números y guiones, sin guion al principio ni al final."));

        if (Reserved.Contains(value))
            return Result.Failure<Subdomain>(Error.Validation(
                "Subdomain.Reserved",
                $"La dirección «{value}» está reservada: elegí otra."));

        return new Subdomain(value);
    }

    public override string ToString() => Value;
}
