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

    private static readonly HashSet<string> Reserved =
    [
        "www", "admin", "api", "app", "staging", "dev", "test",
        "mail", "smtp", "ftp", "blog", "docs", "status", "cdn",
        "assets", "static", "checkout", "pay", "billing", "support",
    ];

    public string Value { get; }

    private Subdomain(string value) => Value = value;

    public static Result<Subdomain> Create(string? raw)
    {
        var value = raw?.Trim().ToLowerInvariant() ?? string.Empty;

        if (!ValidPattern().IsMatch(value))
            return Result.Failure<Subdomain>(Error.Validation(
                "Subdomain.Invalid",
                "Subdomain must be 3-63 chars: lowercase letters, digits, hyphens; cannot start or end with a hyphen."));

        if (Reserved.Contains(value))
            return Result.Failure<Subdomain>(Error.Validation(
                "Subdomain.Reserved",
                $"Subdomain '{value}' is reserved."));

        return new Subdomain(value);
    }

    public override string ToString() => Value;
}
