namespace Customers.Infrastructure;

/// <summary>
/// Una dirección guardada del comprador logueado, con los mismos campos que
/// el paso de entrega del checkout: el checkout la usa para completarse solo.
/// Todo lo que identifica a la persona o al domicilio se cifra en reposo
/// (ver CustomersDbContext), igual que el teléfono y la dirección del cliente.
/// </summary>
public sealed class CustomerAddress
{
    /// <summary>Tope por cuenta: alcanza para casa, trabajo y familia, y frena a un script.</summary>
    public const int MaxPerCustomer = 10;

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid CustomerId { get; private set; }

    /// <summary>Cómo la llama el comprador: "Casa", "Trabajo".</summary>
    public string? Label { get; private set; }
    public string Name { get; private set; } = string.Empty;
    public string? LastName { get; private set; }
    public string? Phone { get; private set; }
    public string? DocNumber { get; private set; }
    public string Street { get; private set; } = string.Empty;
    public string StreetNumber { get; private set; } = string.Empty;
    public string? Apartment { get; private set; }
    public string City { get; private set; } = string.Empty;
    public string? Province { get; private set; }
    public string PostalCode { get; private set; } = string.Empty;
    public bool IsDefault { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private CustomerAddress() { } // EF Core

    public static CustomerAddress Create(Guid tenantId, Guid customerId, CustomerAddressData data, bool isDefault)
    {
        var now = DateTime.UtcNow;
        var address = new CustomerAddress
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            CustomerId = customerId,
            IsDefault = isDefault,
            CreatedAtUtc = now,
        };
        address.Update(data);
        return address;
    }

    public void Update(CustomerAddressData d)
    {
        Label = Clip(d.Label, 40);
        Name = Clip(d.Name, 80) ?? string.Empty;
        LastName = Clip(d.LastName, 80);
        Phone = Clip(d.Phone, 40);
        DocNumber = Clip(d.DocNumber, 20);
        Street = Clip(d.Street, 120) ?? string.Empty;
        StreetNumber = Clip(d.StreetNumber, 20) ?? string.Empty;
        Apartment = Clip(d.Apartment, 40);
        City = Clip(d.City, 80) ?? string.Empty;
        Province = Clip(d.Province, 60);
        PostalCode = Clip(d.PostalCode, 10) ?? string.Empty;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void SetDefault(bool value)
    {
        IsDefault = value;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Lo que falta para poder mandar un paquete, en palabras del comprador.
    /// Null si está completa. Son los mismos obligatorios que el checkout.
    /// </summary>
    public static string? Validate(CustomerAddressData d)
    {
        if (string.IsNullOrWhiteSpace(d.Name)) return "Completá el nombre de quien recibe.";
        if (string.IsNullOrWhiteSpace(d.Street)) return "Completá la calle.";
        if (string.IsNullOrWhiteSpace(d.StreetNumber)) return "Completá el número.";
        if (string.IsNullOrWhiteSpace(d.City)) return "Completá la ciudad.";
        if (string.IsNullOrWhiteSpace(d.PostalCode)) return "Completá el código postal.";
        return null;
    }

    private static string? Clip(string? s, int max)
    {
        var t = s?.Trim();
        if (string.IsNullOrEmpty(t)) return null;
        return t.Length <= max ? t : t[..max];
    }
}

/// <summary>Los campos editables de una dirección (lo que manda el formulario).</summary>
public sealed record CustomerAddressData(
    string? Label,
    string? Name,
    string? LastName,
    string? Phone,
    string? DocNumber,
    string? Street,
    string? StreetNumber,
    string? Apartment,
    string? City,
    string? Province,
    string? PostalCode);
