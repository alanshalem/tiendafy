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
    Fulfilled = 5,      // despachada (o, si se retira, lista para retirar); no hay "entregada"
    ChargedBack = 6,    // contracargo / disputa del comprador
    PartiallyRefunded = 7, // reembolso parcial acumulado < total
}

/// <summary>
/// Qué estados cuentan como venta. Vivía copiado en catorce filtros del panel
/// —todos <c>Status == Paid</c>— y por eso marcar una venta como enviada la
/// borraba de las estadísticas: la plata había entrado igual, pero el estado ya
/// no era Paid. Nada que dependa de "cuánto vendí" debe volver a escribir la
/// lista a mano.
/// </summary>
public static class OrderStatuses
{
    /// <summary>
    /// La plata entró: cobrada, despachada o cobrada con un reembolso parcial
    /// encima. Para sumar importes va <see cref="Order.NetRevenue"/>, que
    /// descuenta lo devuelto; el total a secas contaría de más.
    /// </summary>
    public static readonly OrderStatus[] Earning =
    [
        OrderStatus.Paid,
        OrderStatus.Fulfilled,
        OrderStatus.PartiallyRefunded,
    ];

    public static bool IsEarning(OrderStatus status) =>
        status is OrderStatus.Paid or OrderStatus.Fulfilled or OrderStatus.PartiallyRefunded;
}

/// <summary>
/// Orden de compra: nace de un CheckoutSession ya con stock reservado y
/// conserva el snapshot de precios. El <c>Id</c> es el external_reference que
/// viaja a MercadoPago para reconciliar el pago.
/// </summary>
public sealed class Order : AggregateRoot
{
    /// <summary>
    /// Número de pedido de la tienda: 1001, 1002, … correlativo POR TIENDA. Es
    /// lo que el comprador dicta por teléfono o pega en un WhatsApp; el UUID
    /// sigue siendo la identidad (y el external_reference de los pagos). Lo
    /// asigna la persistencia al insertar (ver OrdersDbContext): 0 = todavía
    /// no se guardó.
    /// </summary>
    public int Number { get; private set; }

    /// <summary>Venta del checkout de la tienda online.</summary>
    public const string ChannelWeb = "web";

    /// <summary>Venta cargada a mano en el panel (mostrador, WhatsApp, teléfono).</summary>
    public const string ChannelManual = "manual";

    /// <summary>Presupuesto aceptado que se convirtió en venta.</summary>
    public const string ChannelQuote = "quote";

    public Guid CheckoutSessionId { get; private set; }

    /// <summary>
    /// Por dónde entró la venta. Se guarda al nacer y no se deduce después:
    /// adivinarlo por el id del pago o por la nota se rompía en cuanto una
    /// venta manual se cobraba con link (queda con un pago de Mercado Pago,
    /// igual que una del checkout).
    /// </summary>
    public string Channel { get; private set; } = ChannelWeb;
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

    /// <summary>
    /// Retiro en el local: "despachar" la orden es tenerla lista para que la
    /// pasen a buscar, y el aviso al comprador es "listo para retirar", no "en camino".
    /// </summary>
    public bool IsPickup { get; private set; }
    public string? ShippingAddress { get; private set; }
    public string? BuyerName { get; private set; }
    public string? BuyerPhone { get; private set; }
    public string? DocNumber { get; private set; }
    public string? Notes { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? PaidAtUtc { get; private set; }
    public string? Tracking { get; private set; }
    public DateTime? FulfilledAtUtc { get; private set; }

    /// <summary>
    /// Cuándo, quién y por qué se canceló a mano una venta pendiente. Una
    /// cancelación libera stock y anula el link de pago: sin rastro, después
    /// nadie sabe por qué una venta "desapareció" de lo pendiente.
    /// </summary>
    public DateTime? CancelledAtUtc { get; private set; }
    public string? CancelledBy { get; private set; }
    public string? CancelReason { get; private set; }

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
            return Result.Failure<Order>(Error.Validation("Order.Empty", "La venta necesita al menos un producto."));

        var email = buyerEmail.Trim();
        if (email.Length < 5 || !email.Contains('@'))
            return Result.Failure<Order>(Error.Validation("Order.InvalidEmail", "Ingresá un email válido."));

        var order = new Order(Guid.NewGuid(), tenantId)
        {
            CheckoutSessionId = checkoutSessionId,
            Status = OrderStatus.PendingPayment,
            Currency = currency,
            BuyerEmail = email,
            DiscountAmount = discount ?? Money.Zero(currency),
            RefundedAmount = Money.Zero(currency),
            ShippingCost = Money.Zero(currency),
            PaymentMethodDiscount = Money.Zero(currency),
            CouponCode = string.IsNullOrWhiteSpace(couponCode) ? null : couponCode.Trim().ToUpperInvariant(),
            CreatedAtUtc = DateTime.UtcNow,
        };

        foreach (var l in lines)
            order._items.Add(new OrderItem(l.VariantId, l.ProductName, l.VariantDescription, l.Sku, l.UnitPrice, l.Quantity, l.ReservationId, l.UnitCost));

        return order;
    }

    /// <summary>
    /// La persistencia le da el número al insertar. Una sola vez: un número ya
    /// asignado no se pisa nunca (está impreso en etiquetas y en mails).
    /// </summary>
    public void AssignNumber(int number)
    {
        if (Number == 0 && number > 0) Number = number;
    }

    /// <summary>
    /// Cómo se nombra el pedido ante una persona: "#1042". Una orden sin
    /// número todavía (en memoria, sin guardar) cae al principio del id, que
    /// es lo que se mostraba antes.
    /// </summary>
    public string Label => OrderLabel.For(Number, Id);

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

    /// <summary>
    /// Lo que la tienda se quedó de esta venta: el total menos lo ya devuelto.
    /// Es el número que corresponde sumar en estadísticas — el total a secas
    /// cuenta entero un reembolso parcial.
    /// </summary>
    public Money NetRevenue =>
        RefundedAmount.AmountInMinorUnits >= Total.AmountInMinorUnits
            ? Money.Zero(Currency)
            : Total - RefundedAmount;

    /// <summary>Snapshot de envío y datos del comprador (vienen del checkout, nunca del cliente).</summary>
    /// <summary>De dónde vino la venta (first-touch de la sesión del comprador).</summary>
    public void SetUtmSource(string? utmSource) =>
        UtmSource = string.IsNullOrWhiteSpace(utmSource)
            ? null
            : Text.Cap(utmSource.Trim().ToLowerInvariant(), 40);

    public void SetShippingAndBuyer(
        Money shippingCost, string? shippingMethodName, string? shippingAddress,
        string? buyerName, string? buyerPhone, string? docNumber, string? notes, bool isPickup = false)
    {
        IsPickup = isPickup;
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
            return Result.Failure(Error.Conflict("Order.NotPending", "Esta venta ya no está pendiente: no se puede marcar como pagada."));

        Status = OrderStatus.Paid;
        PaymentId = paymentId;
        PaidAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>
    /// Un pago aprobado que llegó cuando la venta ya figuraba rechazada o
    /// cancelada sin cobrar: el comprador pagó igual (en Checkout Pro, con otra
    /// tarjeta después de un rechazo, o un pago en efectivo generado antes de
    /// que la venta venciera), así que la venta pasa a pagada. Solo desde una
    /// que nunca se cobró; una devuelta o con contracargo no se revive. La
    /// cancelación queda contada en la nota para revisar (ver
    /// <see cref="AddReviewNote"/>), no en los campos de cancelación: la venta
    /// ya no está cancelada.
    /// </summary>
    public Result MarkPaidLate(string paymentId)
    {
        if (Status is not (OrderStatus.Failed or OrderStatus.Cancelled) || PaidAtUtc is not null)
            return Result.Failure(Error.Conflict("Order.NotRevivable",
                "Solo se puede dar por pagada una venta rechazada o cancelada que nunca se cobró."));

        var was = Status == OrderStatus.Cancelled
            ? CancelReason is { Length: > 0 } reason ? $"cancelada ({reason})" : "cancelada"
            : "con el pago rechazado";
        Status = OrderStatus.Paid;
        PaymentId = paymentId;
        PaidAtUtc = DateTime.UtcNow;
        CancelledAtUtc = null;
        CancelledBy = null;
        CancelReason = null;
        AddReviewNote($"Figuraba {was} y después entró un pago aprobado: quedó como pagada. Si ya no la podés entregar, devolvé el pago.");
        return Result.Success();
    }

    // ------------------------------------------------- Para revisar

    /// <summary>
    /// Lo que el comercio tiene que mirar de esta venta y el sistema no puede
    /// resolver solo: se cobró sin stock para entregarla, se pagó una que
    /// figuraba cancelada, entró un segundo pago. Sale en el Inicio ("para
    /// revisar") y arriba del detalle, hasta que alguien la da por revisada.
    /// Null = nada que revisar.
    /// </summary>
    public string? ReviewNote { get; private set; }

    /// <summary>Desde cuándo está para revisar.</summary>
    public DateTime? ReviewNoteAtUtc { get; private set; }

    public const int ReviewNoteMaxLength = 1000;

    /// <summary>Suma un motivo para revisar (los anteriores quedan, uno por renglón).</summary>
    public void AddReviewNote(string note)
    {
        if (string.IsNullOrWhiteSpace(note)) return;
        var text = string.IsNullOrEmpty(ReviewNote) ? note.Trim() : $"{ReviewNote}\n{note.Trim()}";
        ReviewNote = text.Length > ReviewNoteMaxLength ? text[..ReviewNoteMaxLength] : text;
        ReviewNoteAtUtc ??= DateTime.UtcNow;
    }

    /// <summary>El comercio ya lo miró: sale de "para revisar".</summary>
    public void ResolveReview()
    {
        ReviewNote = null;
        ReviewNoteAtUtc = null;
    }

    // ------------------------------------------- Pago fuera de una pasarela

    /// <summary>
    /// Medios que se cobran a mano (transferencia, efectivo al retirar): la
    /// orden espera a que el comercio registre el pago, con un plazo.
    /// </summary>
    public static readonly string[] OfflineProviders = ["transfer", "cash"];

    /// <summary>
    /// Hasta cuándo se guarda el stock esperando el pago. Vencido, la orden se
    /// cancela sola (ver OfflinePaymentExpiryWorker). Null = no aplica.
    /// </summary>
    public DateTime? PaymentDueAtUtc { get; private set; }

    /// <summary>
    /// La parte de <see cref="DiscountAmount"/> que viene del medio de pago
    /// (el % por transferencia o efectivo). Ya está sumada al descuento, así el
    /// total y las estadísticas no cambian de fórmula; esto es para mostrar el
    /// desglose ("Descuento por transferencia") en el panel, el email y la
    /// pantalla del comprador.
    /// </summary>
    public Money PaymentMethodDiscount { get; private set; }

    public bool IsOfflinePayment => OfflineProviders.Contains(PaymentProvider);

    /// <summary>El descuento que no vino del medio de pago (el cupón, o el que cargó el vendedor).</summary>
    public Money CouponDiscount =>
        PaymentMethodDiscount.AmountInMinorUnits > 0 && PaymentMethodDiscount.Currency == Currency
            ? DiscountAmount - PaymentMethodDiscount
            : DiscountAmount;

    /// <summary>
    /// La orden se paga por transferencia o en efectivo: queda pendiente con un
    /// plazo y con el descuento del medio aplicado. El monto lo calcula el
    /// servidor con el subtotal de la orden: ningún número del navegador llega
    /// hasta acá.
    ///
    /// El orden de los descuentos: precio de lista de los productos → cupón
    /// (evaluado contra el subtotal de lista, así el mínimo de compra de un
    /// cupón no cambia según cómo se pague) → % del medio de pago sobre lo que
    /// queda → envío, que nunca se descuenta. Encadenados y no sumados: un
    /// cupón del 10% más un 10% por transferencia dan 19%, porque cada uno se
    /// aplica sobre lo que realmente se paga. Sin cupón, el resultado es
    /// exactamente el "precio con transferencia" que anuncian la ficha y las
    /// tarjetas de producto.
    /// </summary>
    public Result UseOfflinePayment(string provider, int discountPercent, DateTime dueAtUtc)
    {
        if (!OfflineProviders.Contains(provider))
            return Result.Failure(Error.Validation("Order.BadOfflineProvider", "Medio de pago inválido."));
        if (Status != OrderStatus.PendingPayment)
            return Result.Failure(Error.Conflict("Order.NotPending", "Esta venta ya no está pendiente de pago."));
        if (discountPercent is < 0 or > 100)
            return Result.Failure(Error.Validation("Order.BadDiscount", "El descuento tiene que estar entre 0 y 100%."));

        var methodDiscount = new Money(PercentOf(ProductsAfterCoupon.AmountInMinorUnits, discountPercent), Currency);

        PaymentProvider = provider;
        PaymentMethodDiscount = methodDiscount;
        DiscountAmount += methodDiscount;
        PaymentDueAtUtc = dueAtUtc;
        return Result.Success();
    }

    /// <summary>El % redondeado al centavo, con el medio centavo para arriba (como la ficha del producto).</summary>
    public static long PercentOf(long baseMinor, int percent) =>
        baseMinor <= 0 || percent <= 0
            ? 0
            : (long)Math.Round(baseMinor * percent / 100m, MidpointRounding.AwayFromZero);

    /// <summary>Lo que queda de los productos después del cupón: la base del descuento por medio de pago.</summary>
    public Money ProductsAfterCoupon =>
        DiscountAmount.AmountInMinorUnits >= Subtotal.AmountInMinorUnits
            ? Money.Zero(Currency)
            : Subtotal - DiscountAmount;

    /// <summary>
    /// Cancela una orden que nadie pagó (el comercio desde el panel, o el plazo
    /// que venció). Solo una pendiente: una cobrada se devuelve con un reembolso.
    /// </summary>
    public Result CancelUnpaid()
    {
        if (Status == OrderStatus.Cancelled) return Result.Success();
        if (Status != OrderStatus.PendingPayment)
            return Result.Failure(Error.Conflict("Order.NotPending",
                "Solo se puede cancelar una venta que todavía no se pagó."));
        Status = OrderStatus.Cancelled;
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

    /// <summary>De dónde vino la venta (ver <see cref="Channel"/>). Valores fuera de la lista quedan en web.</summary>
    public void SetChannel(string channel) =>
        Channel = channel is ChannelManual or ChannelQuote ? channel : ChannelWeb;

    /// <summary>
    /// Cancelación a mano de una venta que nunca se cobró (el link de pago que
    /// no se pagó, el cliente que se arrepintió antes de pagar). Una venta
    /// cobrada no se cancela: se reembolsa, que es lo que devuelve la plata.
    /// </summary>
    public Result Cancel(string cancelledBy, string? reason)
    {
        var allowed = EnsureCancellable();
        if (allowed.IsFailure) return allowed;

        Status = OrderStatus.Cancelled;
        CancelledAtUtc = DateTime.UtcNow;
        CancelledBy = Text.Clip(cancelledBy, 200) ?? "admin";
        CancelReason = Text.Clip(reason, 300);
        return Result.Success();
    }

    /// <summary>Si se puede cancelar, sin cancelarla: para chequear antes de tocar el link de pago.</summary>
    public Result EnsureCancellable() => Status switch
    {
        OrderStatus.PendingPayment => Result.Success(),
        OrderStatus.Cancelled => Result.Failure(Error.Conflict("Order.AlreadyCancelled", "Esta venta ya estaba cancelada.")),
        _ => Result.Failure(Error.Conflict("Order.NotCancellable",
            "Solo se cancela una venta pendiente de pago. Si ya se cobró, reembolsala.")),
    };

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

/// <summary>El nombre visible de un pedido, para quien solo tiene el número y el id.</summary>
public static class OrderLabel
{
    /// <summary>Primer número de cada tienda: un "#1" parece de prueba.</summary>
    public const int FirstNumber = 1001;

    public static string For(int number, Guid id) =>
        number > 0 ? $"#{number}" : $"#{id.ToString("N")[..8].ToUpperInvariant()}";

    /// <summary>
    /// Lee un número de pedido como lo escribe una persona: "1042", "#1042",
    /// "Pedido #1042 ". Null si no es un número.
    /// </summary>
    public static int? ParseNumber(string? text)
    {
        var t = text?.Trim();
        if (string.IsNullOrEmpty(t)) return null;
        var hash = t.LastIndexOf('#');
        if (hash >= 0) t = t[(hash + 1)..].Trim();
        return int.TryParse(t, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var n) && n > 0
            ? n
            : null;
    }
}

/// <summary>Errores de reembolso compartidos entre el dominio y el pre-chequeo del endpoint.</summary>
public static class OrderErrors
{
    /// <summary>
    /// Con centavos ("ARS 15.000,50"): es un tope y redondearlo confunde. Sin
    /// la cultura del proceso, que en producción es la invariante ("15000.50 ARS").
    /// </summary>
    public static Error RefundExceedsRemaining(Money remaining) =>
        Error.Validation("Refund.ExceedsRemaining",
            $"El monto supera lo reembolsable ({remaining.Currency} {ArgentineNumbers.Number(remaining.ToDecimal(), 2)}).");
}
