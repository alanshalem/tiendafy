using SharedKernel.Common;
using SharedKernel.Domain;

namespace Orders.Core.Domain;

public enum OrderStatus
{
    PendingPayment = 0, // orden creada, esperando confirmación del pago
    Paid = 1,           // pago aprobado; reservas de stock confirmadas
    Failed = 2,         // pago rechazado
    Cancelled = 3,      // cancelada (expiró / usuario abandonó)
    Refunded = 4,       // reembolsada por el total tras estar pagada
    Fulfilled = 5,      // entregada (módulo de fulfillment, futuro)
    ChargedBack = 6,    // contracargo / disputa del comprador
    PartiallyRefunded = 7, // reembolso parcial acumulado < total
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

    /// <summary>Canal de adquisición (utm_source de la sesión): redes, email, ads…</summary>
    public string? UtmSource { get; private set; }
    public Money DiscountAmount { get; private set; }
    public Money RefundedAmount { get; private set; }
    public Money ShippingCost { get; private set; }
    public string? ShippingMethodName { get; private set; }
    public string? ShippingAddress { get; private set; }
    public string? BuyerName { get; private set; }
    public string? BuyerPhone { get; private set; }
    public string? DocNumber { get; private set; }
    public string? Notes { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? PaidAtUtc { get; private set; }
    public string? Tracking { get; private set; }
    public DateTime? FulfilledAtUtc { get; private set; }

    private readonly List<OrderItem> _items = [];
    public IReadOnlyList<OrderItem> Items => _items.AsReadOnly();

    private Order() { } // EF Core

    private Order(Guid id, TenantId tenantId) : base(id, tenantId) { }

    public static Result<Order> Create(
        TenantId tenantId,
        Guid checkoutSessionId,
        string buyerEmail,
        string currency,
        IReadOnlyList<(Guid VariantId, string ProductName, string VariantDescription, string Sku, Money UnitPrice, int Quantity, Guid? ReservationId, Money? UnitCost)> lines,
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
            RefundedAmount = Money.Zero(currency),
            ShippingCost = Money.Zero(currency),
            CouponCode = string.IsNullOrWhiteSpace(couponCode) ? null : couponCode.Trim().ToUpperInvariant(),
            CreatedAtUtc = DateTime.UtcNow,
        };

        foreach (var l in lines)
            order._items.Add(new OrderItem(l.VariantId, l.ProductName, l.VariantDescription, l.Sku, l.UnitPrice, l.Quantity, l.ReservationId, l.UnitCost));

        return order;
    }

    /// <summary>
    /// Comisión REAL cobrada por Mercado Pago en este pago (transaction_amount −
    /// net_received_amount, leída de la API al conciliar). Null = pago sin
    /// conciliar o canal sin dato. Alimenta el dashboard de rentabilidad.
    /// </summary>
    public Money? MpFeeAmount { get; private set; }

    public void RecordMpFee(Money fee) => MpFeeAmount = fee;

    /// <summary>
    /// Costo total de los productos de la orden (snapshot al momento de la venta).
    /// Null si NINGÚN ítem tenía costo cargado; los ítems sin costo suman 0.
    /// </summary>
    public Money? ProductCost =>
        _items.Any(i => i.UnitCost is not null)
            ? _items.Where(i => i.UnitCost is not null)
                .Aggregate(Money.Zero(Currency), (acc, i) => acc + (i.UnitCost!.Value * i.Quantity))
            : null;

    public Money Subtotal => _items.Aggregate(Money.Zero(Currency), (acc, i) => acc + i.LineTotal);

    /// <summary>Total a cobrar = subtotal − descuento (nunca negativo) + envío.</summary>
    public Money Total =>
        (DiscountAmount.AmountInMinorUnits >= Subtotal.AmountInMinorUnits
            ? Money.Zero(Currency)
            : Subtotal - DiscountAmount) + ShippingCost;

    /// <summary>Snapshot de envío y datos del comprador (vienen del checkout, nunca del cliente).</summary>
    /// <summary>De dónde vino la venta (first-touch de la sesión del comprador).</summary>
    public void SetUtmSource(string? utmSource) =>
        UtmSource = string.IsNullOrWhiteSpace(utmSource) ? null : utmSource.Trim().ToLowerInvariant()[..Math.Min(40, utmSource.Trim().Length)];

    public void SetShippingAndBuyer(
        Money shippingCost, string? shippingMethodName, string? shippingAddress,
        string? buyerName, string? buyerPhone, string? docNumber, string? notes)
    {
        if (shippingCost.Currency == Currency && !shippingCost.IsNegative)
            ShippingCost = shippingCost;
        ShippingMethodName = shippingMethodName;
        ShippingAddress = shippingAddress;
        BuyerName = buyerName;
        BuyerPhone = buyerPhone;
        DocNumber = docNumber;
        Notes = notes;
    }

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

    /// <summary>Marca como despachada/entregada (Paid → Fulfilled). Guarda el tracking opcional.</summary>
    public Result MarkFulfilled(string? tracking)
    {
        if (Status == OrderStatus.Fulfilled)
        {
            Tracking = string.IsNullOrWhiteSpace(tracking) ? Tracking : tracking.Trim();
            return Result.Success();
        }
        if (Status != OrderStatus.Paid)
            return Result.Failure(Error.Conflict("Order.NotPaid", $"Order is {Status}, solo se puede despachar una pagada."));
        Status = OrderStatus.Fulfilled;
        Tracking = string.IsNullOrWhiteSpace(tracking) ? null : tracking.Trim();
        FulfilledAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>Monto que todavía se puede reembolsar (total − reembolsado acumulado).</summary>
    public Money RemainingRefundable =>
        RefundedAmount.AmountInMinorUnits >= Total.AmountInMinorUnits
            ? Money.Zero(Currency)
            : Total - RefundedAmount;

    /// <summary>
    /// Aplica un reembolso (parcial o total) sobre una orden pagada/despachada.
    /// Acumula el monto; al llegar al total la orden pasa a Refunded, antes queda
    /// en PartiallyRefunded.
    /// </summary>
    public Result ApplyRefund(Money amount)
    {
        if (amount.Currency != Currency)
            return Result.Failure(Error.Validation("Refund.CurrencyMismatch",
                $"El reembolso debe ser en {Currency}."));
        if (amount.AmountInMinorUnits <= 0)
            return Result.Failure(Error.Validation("Refund.InvalidAmount",
                "El monto a reembolsar debe ser mayor a cero."));
        if (Status is not (OrderStatus.Paid or OrderStatus.Fulfilled or OrderStatus.PartiallyRefunded))
            return Result.Failure(Error.Conflict("Order.NotRefundable",
                $"Order is {Status}, solo se puede reembolsar una orden pagada."));
        if (amount > RemainingRefundable)
            return Result.Failure(OrderErrors.RefundExceedsRemaining(RemainingRefundable));

        RefundedAmount += amount;
        Status = RefundedAmount.AmountInMinorUnits >= Total.AmountInMinorUnits
            ? OrderStatus.Refunded
            : OrderStatus.PartiallyRefunded;
        return Result.Success();
    }

    /// <summary>Reembolso total (webhook "refunded" o botón total). Idempotente.</summary>
    public bool MarkRefunded()
    {
        if (Status == OrderStatus.Refunded) return false;
        if (Status is not (OrderStatus.Paid or OrderStatus.Fulfilled or OrderStatus.PartiallyRefunded)) return false;
        RefundedAmount = Total;
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

    /// <summary>Costo unitario snapshot al crear la orden (null = sin costo cargado entonces).</summary>
    public Money? UnitCost { get; private set; }

    private OrderItem() { } // EF Core

    internal OrderItem(Guid variantId, string productName, string variantDescription, string sku, Money unitPrice, int quantity, Guid? reservationId, Money? unitCost = null)
    {
        Id = Guid.NewGuid();
        VariantId = variantId;
        ProductName = productName;
        VariantDescription = variantDescription;
        Sku = sku;
        UnitPrice = unitPrice;
        Quantity = quantity;
        ReservationId = reservationId;
        UnitCost = unitCost;
    }

    public Money LineTotal => UnitPrice * Quantity;
}

/// <summary>Errores de reembolso compartidos entre el dominio y el pre-chequeo del endpoint.</summary>
public static class OrderErrors
{
    public static Error RefundExceedsRemaining(Money remaining) =>
        Error.Validation("Refund.ExceedsRemaining", $"El monto supera lo reembolsable ({remaining}).");
}
