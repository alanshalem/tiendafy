using SharedKernel.Common;

namespace Customers.Infrastructure;

/// <summary>Cliente de una tienda (CRM básico). Datos de contacto + notas internas.</summary>
public sealed class Customer
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string Name { get; private set; } = null!;
    public string? Email { get; private set; }
    public string? Phone { get; private set; }
    public string? Address { get; private set; }
    public string? Notes { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    private Customer() { } // EF Core

    public static Result<Customer> Create(Guid tenantId, string? name, string? email, string? phone, string? address, string? notes)
    {
        var check = Validate(name, email);
        if (check.IsFailure) return Result.Failure<Customer>(check.Error);

        return new Customer
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = name!.Trim(),
            Email = Norm(email),
            Phone = Norm(phone),
            Address = Norm(address),
            Notes = Norm(notes),
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    public Result Update(string? name, string? email, string? phone, string? address, string? notes)
    {
        var check = Validate(name, email);
        if (check.IsFailure) return check;

        Name = name!.Trim();
        Email = Norm(email);
        Phone = Norm(phone);
        Address = Norm(address);
        Notes = Norm(notes);
        return Result.Success();
    }

    private static Result Validate(string? name, string? email)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length is < 1 or > 120)
            return Result.Failure(Error.Validation("Customer.InvalidName", "El nombre debe tener entre 1 y 120 caracteres."));
        var e = email?.Trim();
        if (!string.IsNullOrEmpty(e) && (!e.Contains('@') || e.Length > 200))
            return Result.Failure(Error.Validation("Customer.InvalidEmail", "El email no es válido."));
        return Result.Success();
    }

    private static string? Norm(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
}
