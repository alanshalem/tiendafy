using SharedKernel.Common;
using SharedKernel.Domain;

namespace Checkout.Core.Domain;

public enum CheckoutStatus
{
    Open = 0,       // carrito armado, esperando datos del comprador
    Submitted = 1,  // stock reservado, esperando pago
    Completed = 2,  // pago aprobado (llega con módulo Payments)
    Expired = 3,    // venció sin pagar; reservas liberadas
}

/// <summary>
/// Sesión de checkout: EL camino crítico. Snapshot inmutable de precios al
/// momento de armar el carrito — si el merchant cambia el precio después,
/// esta sesión conserva el que vio el comprador.
/// </summary>
public sealed class CheckoutSession : AggregateRoot
{
    public static readonly TimeSpan Ttl = TimeSpan.FromMinutes(30);

    public CheckoutStatus Status { get; private set; }
    public string? Email { get; private set; }
    public string Currency { get; private set; } = null!;
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime ExpiresAtUtc { get; private set; }
    /// <summary>Cuándo se mandó el email de recuperación (null = todavía no). Evita reenviar.</summary>
    public DateTime? RecoveryEmailSentAtUtc { get; private set; }

    // Datos del destinatario / facturación (checkout en pasos).
    public string? BuyerName { get; private set; }
    public string? BuyerLastName { get; private set; }
    public string? Phone { get; private set; }
    public string? DocNumber { get; private set; }
    public string? Notes { get; private set; }

    // Envío elegido: snapshot de método y costo al momento del submit.
    public Guid? ShippingMethodId { get; private set; }
    public string? ShippingMethodName { get; private set; }
    public Money ShippingCost { get; private set; }
    /// <summary>Dirección formateada en una línea (domicilio) o dirección de retiro.</summary>
    public string? ShippingAddress { get; private set; }

    private readonly List<CheckoutItem> _items = [];
    public IReadOnlyList<CheckoutItem> Items => _items.AsReadOnly();

    private CheckoutSession() { } // EF Core

    private CheckoutSession(Guid id, TenantId tenantId, string currency)
        : base(id, tenantId)
    {
        Status = CheckoutStatus.Open;
        Currency = currency;
        ShippingCost = Money.Zero(currency);
        CreatedAtUtc = DateTime.UtcNow;
        ExpiresAtUtc = CreatedAtUtc + Ttl;
    }

    public static Result<CheckoutSession> Create(
        TenantId tenantId,
        IReadOnlyList<(Guid VariantId, string ProductName, string VariantDescription, string Sku, Money UnitPrice, int Quantity)> lines)
    {
        if (lines.Count == 0)
            return Result.Failure<CheckoutSession>(Error.Validation(
                "Checkout.Empty", "Checkout needs at least one item."));

        if (lines.Any(l => l.Quantity is <= 0 or > 99))
            return Result.Failure<CheckoutSession>(Error.Validation(
                "Checkout.InvalidQuantity", "Item quantity must be between 1 and 99."));

        var currencies = lines.Select(l => l.UnitPrice.Currency).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (currencies.Count > 1)
            return Result.Failure<CheckoutSession>(Error.Validation(
                "Checkout.MixedCurrencies", "All items must share the same currency."));

        var session = new CheckoutSession(Guid.NewGuid(), tenantId, currencies[0]);
        foreach (var line in lines)
        {
            session._items.Add(new CheckoutItem(
                line.VariantId, line.ProductName, line.VariantDescription, line.Sku, line.UnitPrice, line.Quantity));
        }

        return session;
    }

    public Money Subtotal =>
        _items.Aggregate(Money.Zero(Currency), (acc, item) => acc + item.LineTotal);

    public bool IsExpired(DateTime nowUtc) =>
        Status is CheckoutStatus.Open or CheckoutStatus.Submitted && nowUtc >= ExpiresAtUtc;

    /// <summary>Submit exitoso: cada item quedó con su reserva de stock.</summary>
    public Result MarkSubmitted(string email, IReadOnlyDictionary<Guid, Guid> reservationByVariant, DateTime nowUtc)
    {
        if (Status != CheckoutStatus.Open)
            return Result.Failure(Error.Conflict("Checkout.NotOpen", $"Checkout is {Status}."));
        if (nowUtc >= ExpiresAtUtc)
            return Result.Failure(Error.Conflict("Checkout.Expired", "Checkout session expired."));

        var trimmed = email.Trim();
        if (trimmed.Length < 5 || !trimmed.Contains('@'))
            return Result.Failure(Error.Validation("Checkout.InvalidEmail", "A valid email is required."));

        foreach (var item in _items)
        {
            if (!reservationByVariant.TryGetValue(item.VariantId, out var reservationId))
                return Result.Failure(Error.Validation(
                    "Checkout.MissingReservation", $"No reservation for variant {item.VariantId}."));
            item.AttachReservation(reservationId);
        }

        Email = trimmed;
        Status = CheckoutStatus.Submitted;
        return Result.Success();
    }

    private static string? Clip(string? v, int max)
    {
        var t = v?.Trim();
        return string.IsNullOrEmpty(t) ? null : t[..Math.Min(max, t.Length)];
    }

    /// <summary>Datos del destinatario/facturación y notas (paso Entrega).</summary>
    public void SetRecipient(string? name, string? lastName, string? phone, string? docNumber, string? notes)
    {
        BuyerName = Clip(name, 80);
        BuyerLastName = Clip(lastName, 80);
        Phone = Clip(phone, 40);
        DocNumber = Clip(docNumber, 20);
        Notes = Clip(notes, 500);
    }

    /// <summary>Snapshot del envío elegido: el costo queda congelado en la sesión.</summary>
    public Result SetShipping(Guid methodId, string methodName, Money cost, string? address)
    {
        if (cost.Currency != Currency)
            return Result.Failure(Error.Validation("Checkout.ShippingCurrency",
                $"El costo de envío debe ser en {Currency}."));
        ShippingMethodId = methodId;
        ShippingMethodName = Clip(methodName, 120);
        ShippingCost = cost;
        ShippingAddress = Clip(address, 300);
        return Result.Success();
    }

    /// <summary>
    /// Envío cotizado en vivo por un carrier (Correo Argentino): el precio viene
    /// de un quote firmado por el servidor, no de un método persistido.
    /// </summary>
    public Result SetQuotedShipping(string methodName, Money cost, string? address)
    {
        if (cost.Currency != Currency)
            return Result.Failure(Error.Validation("Checkout.ShippingCurrency",
                $"El costo de envío debe ser en {Currency}."));
        ShippingMethodId = null;
        ShippingMethodName = Clip(methodName, 120);
        ShippingCost = cost;
        ShippingAddress = Clip(address, 300);
        return Result.Success();
    }

    public void Expire() => Status = CheckoutStatus.Expired;

    public void MarkRecoveryEmailed() => RecoveryEmailSentAtUtc = DateTime.UtcNow;
}

/// <summary>Línea del checkout: snapshot de producto y precio.</summary>
public sealed class CheckoutItem
{
    public Guid Id { get; private set; }
    public Guid VariantId { get; private set; }
    public string ProductName { get; private set; } = null!;
    public string VariantDescription { get; private set; } = null!;
    public string Sku { get; private set; } = null!;
    public Money UnitPrice { get; private set; }
    public int Quantity { get; private set; }
    public Guid? ReservationId { get; private set; }

    private CheckoutItem() { } // EF Core

    internal CheckoutItem(Guid variantId, string productName, string variantDescription, string sku, Money unitPrice, int quantity)
    {
        Id = Guid.NewGuid();
        VariantId = variantId;
        ProductName = productName;
        VariantDescription = variantDescription;
        Sku = sku;
        UnitPrice = unitPrice;
        Quantity = quantity;
    }

    public Money LineTotal => UnitPrice * Quantity;

    internal void AttachReservation(Guid reservationId) => ReservationId = reservationId;
}
