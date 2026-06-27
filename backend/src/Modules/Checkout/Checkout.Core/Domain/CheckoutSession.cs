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

    private readonly List<CheckoutItem> _items = [];
    public IReadOnlyList<CheckoutItem> Items => _items.AsReadOnly();

    private CheckoutSession() { } // EF Core

    private CheckoutSession(Guid id, TenantId tenantId, string currency)
        : base(id, tenantId)
    {
        Status = CheckoutStatus.Open;
        Currency = currency;
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
