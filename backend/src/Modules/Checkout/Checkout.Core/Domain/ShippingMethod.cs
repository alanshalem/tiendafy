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

    /// <summary>
    /// "Gratis desde $X": con un subtotal de productos igual o mayor, este medio
    /// no cobra el envío. Null = siempre cobra su precio. Es lo que respalda la
    /// barra "te faltan $X para el envío gratis" del carrito: antes ese número
    /// vivía solo en el diseño y el checkout cobraba el envío igual.
    /// </summary>
    public Money? FreeAbove { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private ShippingMethod() { } // EF Core

    private ShippingMethod(Guid id, TenantId tenantId) : base(id, tenantId) { }

    public static Result<ShippingMethod> Create(
        TenantId tenantId, string name, ShippingKind kind, Money price,
        string? description, string? pickupAddress, int sortOrder, Money? freeAbove = null)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length is < 2 or > 120)
            return Result.Failure<ShippingMethod>(Error.Validation(
                "Shipping.InvalidName", "El nombre debe tener entre 2 y 120 caracteres."));
        if (price.IsNegative)
            return Result.Failure<ShippingMethod>(Error.Validation(
                "Shipping.InvalidPrice", "El precio no puede ser negativo."));
        if (freeAbove is { IsNegative: true })
            return Result.Failure<ShippingMethod>(InvalidFreeAbove);

        var now = DateTime.UtcNow;
        return new ShippingMethod(Guid.NewGuid(), tenantId)
        {
            Name = trimmed,
            Kind = kind,
            Price = price,
            Description = Text.Clip(description, 300),
            PickupAddress = Text.Clip(pickupAddress, 300),
            Active = true,
            SortOrder = sortOrder,
            FreeAbove = NormalizeFreeAbove(price, freeAbove),
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
        };
    }

    public Result Update(string name, ShippingKind kind, Money price,
        string? description, string? pickupAddress, bool active, int sortOrder, Money? freeAbove = null)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length is < 2 or > 120)
            return Result.Failure(Error.Validation(
                "Shipping.InvalidName", "El nombre debe tener entre 2 y 120 caracteres."));
        if (price.IsNegative)
            return Result.Failure(Error.Validation(
                "Shipping.InvalidPrice", "El precio no puede ser negativo."));
        if (freeAbove is { IsNegative: true })
            return Result.Failure(InvalidFreeAbove);

        Name = trimmed;
        Kind = kind;
        Price = price;
        Description = Text.Clip(description, 300);
        PickupAddress = Text.Clip(pickupAddress, 300);
        Active = active;
        SortOrder = sortOrder;
        FreeAbove = NormalizeFreeAbove(price, freeAbove);
        UpdatedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>
    /// Lo que cuesta este envío para un carrito de ese subtotal de productos
    /// (antes de cupones y de descuentos por medio de pago: así la barra del
    /// carrito, que todavía no sabe cómo va a pagar el comprador, dice lo mismo
    /// que el cobro).
    /// </summary>
    public Money PriceFor(Money productsSubtotal) =>
        FreeAbove is { } from && productsSubtotal.Currency == from.Currency && productsSubtotal >= from
            ? Money.Zero(Price.Currency)
            : Price;

    private static readonly Error InvalidFreeAbove = Error.Validation(
        "Shipping.InvalidFreeAbove", "El monto para el envío gratis no puede ser negativo.");

    /// <summary>
    /// Un umbral de 0, o en un medio que ya es gratis, no dice nada: se guarda
    /// como "sin umbral" para que la barra del carrito no prometa algo vacío.
    /// </summary>
    private static Money? NormalizeFreeAbove(Money price, Money? freeAbove) =>
        freeAbove is { } f && f.AmountInMinorUnits > 0 && !price.IsZero ? f : null;
}
