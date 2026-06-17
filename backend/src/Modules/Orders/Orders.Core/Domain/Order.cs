using SharedKernel.Common;
using SharedKernel.Domain;

namespace Orders.Core.Domain;

public enum OrderStatus
{
    PendingPayment = 0, // orden creada, esperando confirmación del pago
    Paid = 1,           // pago aprobado; reservas de stock confirmadas
    Failed = 2,         // pago rechazado
    Cancelled = 3,      // cancelada (expiró / usuario abandonó)
    Refunded = 4,       // reembolsada tras estar pagada
    Fulfilled = 5,      // entregada (módulo de fulfillment, futuro)
    ChargedBack = 6,    // contracargo / disputa del comprador
}

/// <summary>
/// Orden de compra: nace de un CheckoutSession ya con stock reservado y
/// conserva el snapshot de precios. El <c>Id</c> es el external_reference que
/// viaja a MercadoPago para reconciliar el pago.
/// </summary>
public sealed class Order : AggregateRoot
{
    public Guid CheckoutSessionId { get; private set; }
    public OrderStatus Status { get; private set; }
    public string Currency { get; private set; } = null!;
    public string BuyerEmail { get; private set; } = null!;
    public string PaymentProvider { get; private set; } = "mercadopago";
    public string? PreferenceId { get; private set; }
    public string? PaymentId { get; private set; }
    public string? CouponCode { get; private set; }
    public Money DiscountAmount { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? PaidAtUtc { get; private set; }

    private readonly List<OrderItem> _items = [];
    public IReadOnlyList<OrderItem> Items => _items.AsReadOnly();

    private Order() { } // EF Core

    private Order(Guid id, TenantId tenantId) : base(id, tenantId) { }

    public static Result<Order> Create(
        TenantId tenantId,
        Guid checkoutSessionId,
        string buyerEmail,
        string currency,
        IReadOnlyList<(Guid VariantId, string ProductName, string VariantDescription, string Sku, Money UnitPrice, int Quantity, Guid? ReservationId)> lines,
        Money? discount = null,
        string? couponCode = null)
    {
        if (lines.Count == 0)
            return Result.Failure<Order>(Error.Validation("Order.Empty", "Order needs at least one item."));

        var email = buyerEmail.Trim();
        if (email.Length < 5 || !email.Contains('@'))
            return Result.Failure<Order>(Error.Validation("Order.InvalidEmail", "A valid email is required."));

        var order = new Order(Guid.NewGuid(), tenantId)
        {
            CheckoutSessionId = checkoutSessionId,
            Status = OrderStatus.PendingPayment,
            Currency = currency,
            BuyerEmail = email,
            DiscountAmount = discount ?? Money.Zero(currency),
            CouponCode = string.IsNullOrWhiteSpace(couponCode) ? null : couponCode.Trim().ToUpperInvariant(),
            CreatedAtUtc = DateTime.UtcNow,
        };

        foreach (var l in lines)
            order._items.Add(new OrderItem(l.VariantId, l.ProductName, l.VariantDescription, l.Sku, l.UnitPrice, l.Quantity, l.ReservationId));

        return order;
    }

    public Money Subtotal => _items.Aggregate(Money.Zero(Currency), (acc, i) => acc + i.LineTotal);

    /// <summary>Total a cobrar = subtotal − descuento (nunca negativo).</summary>
    public Money Total =>
        DiscountAmount.AmountInMinorUnits >= Subtotal.AmountInMinorUnits
            ? Money.Zero(Currency)
            : Subtotal - DiscountAmount;

    public IEnumerable<Guid> ReservationIds =>
        _items.Where(i => i.ReservationId.HasValue).Select(i => i.ReservationId!.Value);

    public void AttachPreference(string preferenceId) => PreferenceId = preferenceId;

    public bool IsPending => Status == OrderStatus.PendingPayment;

    /// <summary>Transición a pagada. Idempotente: si ya está pagada, no hace nada.</summary>
    public Result MarkPaid(string paymentId)
    {
        if (Status == OrderStatus.Paid) return Result.Success();
        if (Status != OrderStatus.PendingPayment)
            return Result.Failure(Error.Conflict("Order.NotPending", $"Order is {Status}, cannot mark paid."));

        Status = OrderStatus.Paid;
        PaymentId = paymentId;
        PaidAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    public void MarkFailed(string? paymentId)
    {
        if (Status != OrderStatus.PendingPayment) return;
        Status = OrderStatus.Failed;
        PaymentId = paymentId;
    }

    public void MarkCancelled()
    {
        if (Status == OrderStatus.PendingPayment) Status = OrderStatus.Cancelled;
    }

    /// <summary>Reembolso total tras estar pagada. Idempotente.</summary>
    public bool MarkRefunded()
    {
        if (Status == OrderStatus.Refunded) return false;
        if (Status != OrderStatus.Paid && Status != OrderStatus.Fulfilled) return false;
        Status = OrderStatus.Refunded;
        return true;
    }

    /// <summary>Contracargo / disputa. Idempotente.</summary>
    public bool MarkChargedBack()
    {
        if (Status == OrderStatus.ChargedBack) return false;
        Status = OrderStatus.ChargedBack;
        return true;
    }
}

public sealed class OrderItem
{
    public Guid Id { get; private set; }
    public Guid VariantId { get; private set; }
    public string ProductName { get; private set; } = null!;
    public string VariantDescription { get; private set; } = null!;
    public string Sku { get; private set; } = null!;
    public Money UnitPrice { get; private set; }
    public int Quantity { get; private set; }
    public Guid? ReservationId { get; private set; }

    private OrderItem() { } // EF Core

    internal OrderItem(Guid variantId, string productName, string variantDescription, string sku, Money unitPrice, int quantity, Guid? reservationId)
    {
        Id = Guid.NewGuid();
        VariantId = variantId;
        ProductName = productName;
        VariantDescription = variantDescription;
        Sku = sku;
        UnitPrice = unitPrice;
        Quantity = quantity;
        ReservationId = reservationId;
    }

    public Money LineTotal => UnitPrice * Quantity;
}
