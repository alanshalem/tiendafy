using SharedKernel.Common;
using SharedKernel.Domain;

namespace Checkout.Core.Domain;

public enum ShippingKind
{
    Delivery = 0, // envío a domicilio
    Pickup = 1,   // retiro en punto/local
}

/// <summary>
/// Medio de envío configurado por la tienda (manual: nombre + precio fijo +
/// plazo). Los carriers con cotización automática (OCA/Andreani) se suman
/// después detrás de la misma abstracción.
/// </summary>
public sealed class ShippingMethod : AggregateRoot
{
    public string Name { get; private set; } = null!;
    public ShippingKind Kind { get; private set; }
    public Money Price { get; private set; }
    /// <summary>Plazo/nota visible al comprador ("Llega en 3-5 días hábiles").</summary>
    public string? Description { get; private set; }
    /// <summary>Solo retiro: dirección y horarios del punto.</summary>
    public string? PickupAddress { get; private set; }
    public bool Active { get; private set; }
    public int SortOrder { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private ShippingMethod() { } // EF Core

    private ShippingMethod(Guid id, TenantId tenantId) : base(id, tenantId) { }

    public static Result<ShippingMethod> Create(
        TenantId tenantId, string name, ShippingKind kind, Money price,
        string? description, string? pickupAddress, int sortOrder)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length is < 2 or > 120)
            return Result.Failure<ShippingMethod>(Error.Validation(
                "Shipping.InvalidName", "El nombre debe tener entre 2 y 120 caracteres."));
        if (price.IsNegative)
            return Result.Failure<ShippingMethod>(Error.Validation(
                "Shipping.InvalidPrice", "El precio no puede ser negativo."));

        var now = DateTime.UtcNow;
        return new ShippingMethod(Guid.NewGuid(), tenantId)
        {
            Name = trimmed,
            Kind = kind,
            Price = price,
            Description = Trim(description, 300),
            PickupAddress = Trim(pickupAddress, 300),
            Active = true,
            SortOrder = sortOrder,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
        };
    }

    public Result Update(string name, ShippingKind kind, Money price,
        string? description, string? pickupAddress, bool active, int sortOrder)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length is < 2 or > 120)
            return Result.Failure(Error.Validation(
                "Shipping.InvalidName", "El nombre debe tener entre 2 y 120 caracteres."));
        if (price.IsNegative)
            return Result.Failure(Error.Validation(
                "Shipping.InvalidPrice", "El precio no puede ser negativo."));

        Name = trimmed;
        Kind = kind;
        Price = price;
        Description = Trim(description, 300);
        PickupAddress = Trim(pickupAddress, 300);
        Active = active;
        SortOrder = sortOrder;
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    private static string? Trim(string? v, int max)
    {
        var t = v?.Trim();
        return string.IsNullOrEmpty(t) ? null : t[..Math.Min(max, t.Length)];
    }
}
