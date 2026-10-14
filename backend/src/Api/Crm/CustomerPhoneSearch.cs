using Customers.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Api.Crm;

/// <summary>
/// Buscar un cliente por teléfono.
///
/// El teléfono está cifrado en reposo (ver CustomersDbContext): la base no
/// puede hacer un ILIKE sobre el texto cifrado, y la agenda decía "buscá por
/// nombre o email" aunque lo que el comercio tiene a mano cuando le escriben
/// por WhatsApp es justamente el número. Acá se descifran los teléfonos de la
/// tienda y se comparan solo los dígitos —"11 1234-5678" encuentra a
/// "+54 9 11 1234 5678"—. Se hace solo cuando lo buscado parece un teléfono, y
/// con un tope de fichas, para que tipear un nombre no pague este costo.
/// </summary>
public static class CustomerPhoneSearch
{
    /// <summary>Dígitos mínimos para que la búsqueda se tome como un teléfono.</summary>
    public const int MinDigits = 6;

    /// <summary>Fichas con teléfono que se revisan, de la más nueva a la más vieja.</summary>
    private const int ScanLimit = 5000;

    /// <summary>¿Lo que se tipeó es un teléfono? Dígitos y los separadores que se usan al escribir uno.</summary>
    public static string? Digits(string? query)
    {
        if (string.IsNullOrWhiteSpace(query)) return null;
        var q = query.Trim();
        if (q.Any(ch => !char.IsDigit(ch) && ch is not (' ' or '-' or '+' or '(' or ')' or '.'))) return null;
        var digits = new string(q.Where(char.IsDigit).ToArray());
        return digits.Length >= MinDigits ? digits : null;
    }

    /// <summary>Los ids de las fichas cuyo teléfono contiene esos dígitos. Vacío si la búsqueda no es un teléfono.</summary>
    public static async Task<List<Guid>> MatchingIdsAsync(
        CustomersDbContext db, Guid tenantId, string? query, CancellationToken ct, int max = 500)
    {
        var digits = Digits(query);
        if (digits is null) return [];

        var rows = await db.Customers.AsNoTracking()
            .Where(c => c.TenantId == tenantId && c.Phone != null)
            .OrderByDescending(c => c.CreatedAtUtc)
            .Take(ScanLimit)
            .Select(c => new { c.Id, c.Phone })
            .ToListAsync(ct);

        return rows
            .Where(r => new string(r.Phone!.Where(char.IsDigit).ToArray()).Contains(digits, StringComparison.Ordinal))
            .Select(r => r.Id)
            .Take(max)
            .ToList();
    }
}
