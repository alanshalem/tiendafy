using SharedKernel.Common;

namespace Purchasing.Infrastructure;

/// <summary>
/// Ficha de proveedor.
///
/// Hasta ahora el proveedor era un texto libre escrito en cada orden de compra.
/// Alcanzaba para comprar, pero no para lo que viene después: ver qué le
/// compramos históricamente, cuánto le debemos, o comparar el precio de la
/// misma mercadería entre dos compras. Tres órdenes escritas "Textil Norte",
/// "Textil Norte SRL" y "textil norte" eran tres proveedores distintos.
///
/// La orden sigue guardando el NOMBRE además del id: si mañana le cambian la
/// razón social, las órdenes viejas siguen diciendo lo que decían.
/// </summary>
public sealed class Supplier
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    public string Name { get; private set; } = string.Empty;

    /// <summary>CUIT o identificación fiscal. Puede ser del exterior.</summary>
    public string? TaxId { get; private set; }

    public string? Email { get; private set; }
    public string? Phone { get; private set; }
    public string? Address { get; private set; }

    /// <summary>País: sirve para separar compras locales de importaciones.</summary>
    public string? Country { get; private set; }

    public string? Notes { get; private set; }
    public bool Active { get; private set; } = true;
    public DateTime CreatedAtUtc { get; private set; }

    private Supplier() { } // EF Core

    public static Result<Supplier> Create(Guid tenantId, string? name)
    {
        var clean = (name ?? string.Empty).Trim();
        if (clean.Length is < 2 or > 120)
            return Result.Failure<Supplier>(Error.Validation(
                "Supplier.Name", "El nombre del proveedor tiene entre 2 y 120 caracteres."));

        return Result.Success(new Supplier
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = clean,
            Active = true,
            CreatedAtUtc = DateTime.UtcNow,
        });
    }

    public Result Update(
        string? name, string? taxId, string? email, string? phone,
        string? address, string? country, string? notes, bool active)
    {
        var clean = (name ?? string.Empty).Trim();
        if (clean.Length is < 2 or > 120)
            return Result.Failure(Error.Validation(
                "Supplier.Name", "El nombre del proveedor tiene entre 2 y 120 caracteres."));

        Name = clean;
        TaxId = Trim(taxId, 20);
        Email = Trim(email, 200);
        Phone = Trim(phone, 40);
        Address = Trim(address, 200);
        Country = Trim(country, 60);
        Notes = Trim(notes, 1000);
        Active = active;
        return Result.Success();
    }

    private static string? Trim(string? value, int max) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim()[..Math.Min(value.Trim().Length, max)];
}
