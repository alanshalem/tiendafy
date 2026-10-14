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

    /// <summary>
    /// Lista de precios de este cliente. Null = precio de lista, que es el caso
    /// de casi todos: solo el mayorista tiene una propia. Vive en Catalog, así
    /// que acá es un id suelto y no una clave foránea.
    /// </summary>
    public Guid? PriceListId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    /// <summary>
    /// Etiquetas libres del comercio ("mayorista", "gimnasio", "VIP"): una
    /// forma de agrupar a la gente que el sistema no puede deducir de las ventas.
    /// </summary>
    public List<string> Tags { get; private set; } = [];

    // --- Resumen de compras. Es una foto de las ventas (que viven en Orders):
    // se guarda acá para poder ordenar y filtrar la agenda en la base —"los que
    // más gastaron", "los que no compran hace 90 días"— sin cruzar dos módulos
    // ni sumar montos guardados como texto en cada página. Lo recalcula
    // CustomerDirectory al cobrarse o reembolsarse una venta y al abrir la ficha.
    public int OrdersCount { get; private set; }
    public long TotalSpentMinor { get; private set; }
    public DateTime? LastOrderAtUtc { get; private set; }

    public const int MaxTags = 10;
    public const int MaxTagLength = 30;

    // --- Cuenta de comprador (shopper). Null = es solo un registro de CRM
    // (ej. creado desde un pedido) sin login. Se setean al registrarse. ---
    public string? PasswordHash { get; private set; }
    public string? GoogleSubject { get; private set; }
    public bool EmailVerified { get; private set; }

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

    /// <summary>Crea una cuenta de comprador (email obligatorio, listo para login).</summary>
    public static Result<Customer> CreateShopper(Guid tenantId, string? name, string? email, bool emailVerified = false)
    {
        var e = email?.Trim();
        if (string.IsNullOrEmpty(e) || !e.Contains('@') || e.Length > 200)
            return Result.Failure<Customer>(Error.Validation("Customer.InvalidEmail", "El email no es válido."));
        var n = name?.Trim();
        if (string.IsNullOrEmpty(n) || n.Length > 120)
            return Result.Failure<Customer>(Error.Validation("Customer.InvalidName", "El nombre debe tener entre 1 y 120 caracteres."));

        return new Customer
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Name = n,
            Email = e.ToLowerInvariant(),
            EmailVerified = emailVerified,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    public void SetPasswordHash(string hash) => PasswordHash = hash;
    public void MarkEmailVerified() => EmailVerified = true;
    public void LinkGoogle(string subject)
    {
        GoogleSubject = subject;
        EmailVerified = true;
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

    /// <summary>Le asigna (o le saca) una lista de precios. Null vuelve al precio de lista.</summary>
    public void SetPriceList(Guid? priceListId) => PriceListId = priceListId;

    /// <summary>Notas internas sueltas, sin tocar el resto de la ficha (se editan desde el perfil).</summary>
    public Result SetNotes(string? notes)
    {
        var n = Norm(notes);
        if (n is { Length: > 2000 })
            return Result.Failure(Error.Validation("Customer.NotesTooLong", "Las notas pueden tener hasta 2000 caracteres."));
        Notes = n;
        return Result.Success();
    }

    /// <summary>
    /// Reemplaza las etiquetas. Sin repetidas aunque cambie la mayúscula
    /// ("VIP" y "vip" son la misma para quien filtra) y conservando cómo se
    /// escribió la primera.
    /// </summary>
    public Result SetTags(IEnumerable<string?>? tags)
    {
        var clean = new List<string>();
        foreach (var raw in tags ?? [])
        {
            var t = raw?.Trim();
            if (string.IsNullOrEmpty(t)) continue;
            if (t.Length > MaxTagLength)
                return Result.Failure(Error.Validation("Customer.TagTooLong", $"Cada etiqueta puede tener hasta {MaxTagLength} caracteres."));
            if (!clean.Contains(t, StringComparer.OrdinalIgnoreCase)) clean.Add(t);
        }
        if (clean.Count > MaxTags)
            return Result.Failure(Error.Validation("Customer.TooManyTags", $"Un cliente puede tener hasta {MaxTags} etiquetas."));
        Tags = clean;
        return Result.Success();
    }

    /// <summary>Pisa el resumen de compras con uno recién calculado. Devuelve true si cambió.</summary>
    public bool SetPurchaseStats(int ordersCount, long totalSpentMinor, DateTime? lastOrderAtUtc)
    {
        if (OrdersCount == ordersCount && TotalSpentMinor == totalSpentMinor && LastOrderAtUtc == lastOrderAtUtc)
            return false;
        OrdersCount = ordersCount;
        TotalSpentMinor = totalSpentMinor;
        LastOrderAtUtc = lastOrderAtUtc;
        return true;
    }

    /// <summary>
    /// Completa lo que falta con los datos de una compra, sin pisar nada de lo
    /// que ya está cargado: si alguien corrigió el teléfono a mano, una venta
    /// posterior con el dato viejo no se lo revierte.
    /// </summary>
    /// <returns>true si algo cambió.</returns>
    public bool FillMissingContact(string? name, string? phone, string? address)
    {
        var changed = false;

        // El nombre solo se reemplaza si el que hay es el placeholder del email.
        var incomingName = name?.Trim();
        if (!string.IsNullOrEmpty(incomingName) && incomingName.Length <= 120
            && (string.IsNullOrWhiteSpace(Name) || Name == Email?.Split('@')[0]))
        {
            Name = incomingName;
            changed = true;
        }

        if (Phone is null && Norm(phone) is { } p) { Phone = p; changed = true; }
        if (Address is null && Norm(address) is { } a) { Address = a; changed = true; }
        return changed;
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
