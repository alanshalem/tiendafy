using SharedKernel.Common;

namespace Orders.Core.Domain;

public enum QuoteStatus
{
    /// <summary>Se está armando. Es el único estado en que se puede editar libremente.</summary>
    Draft,

    /// <summary>Ya se le mandó al cliente. Se puede corregir, pero lo que vio ya no es lo que hay.</summary>
    Sent,

    /// <summary>El cliente lo aceptó y se convirtió en una venta. Congelado.</summary>
    Accepted,

    /// <summary>El cliente dijo que no. Queda para saber cuánto se cotiza y cuánto se cierra.</summary>
    Rejected,
}

/// <summary>
/// Un presupuesto: los precios que se le pasaron a un cliente, con fecha de
/// vencimiento, y que al aceptarse se convierte en una venta.
///
/// No es una orden y por eso no vive como una. No reserva stock, no cuenta en
/// las estadísticas de venta y no genera deuda: es una propuesta. Recién cuando
/// el cliente la acepta nace la venta de verdad, con todo lo que eso implica.
///
/// Lo que SÍ hace es congelar los precios del día que se cotizó. Es la razón de
/// existir del documento: si el precio se recalculara al aceptarlo, el
/// presupuesto no sería una promesa sino una estimación, y no serviría para
/// cerrar nada.
/// </summary>
public sealed class Quote
{
    public const int MaxItems = 200;

    private readonly List<QuoteItem> _items = [];

    public Guid Id { get; private set; }
    public TenantId TenantId { get; private set; }

    /// <summary>Número correlativo por tienda: "PRE-0001". Es la referencia que se habla por teléfono.</summary>
    public string Number { get; private set; } = string.Empty;

    public QuoteStatus Status { get; private set; }

    /// <summary>
    /// Ficha del cliente, si la tiene. Sin ficha el presupuesto igual se puede
    /// hacer —a un cliente nuevo se le cotiza antes de darlo de alta—, pero para
    /// aceptarlo en cuenta corriente hace falta.
    /// </summary>
    public Guid? CustomerId { get; private set; }

    public string CustomerName { get; private set; } = string.Empty;
    public string? CustomerEmail { get; private set; }

    public string Currency { get; private set; } = Money.DefaultCurrency;

    /// <summary>
    /// Hasta cuándo valen estos precios. Con inflación, un presupuesto de hace
    /// tres meses aceptado al precio viejo es una venta a pérdida.
    /// </summary>
    public DateTime ValidUntilUtc { get; private set; }

    public Money DiscountAmount { get; private set; }
    public string? Notes { get; private set; }

    /// <summary>Por qué el cliente lo rechazó. Sirve más que el número de rechazados.</summary>
    public string? RejectionReason { get; private set; }

    /// <summary>La venta que salió de este presupuesto, si se aceptó.</summary>
    public Guid? ConvertedOrderId { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? SentAtUtc { get; private set; }
    public DateTime? DecidedAtUtc { get; private set; }

    public IReadOnlyList<QuoteItem> Items => _items.AsReadOnly();

    public Money Subtotal => _items.Count == 0
        ? Money.Zero(Currency)
        : new Money(_items.Sum(i => i.LineTotal.AmountInMinorUnits), Currency);

    public Money Total => new(
        Math.Max(0, Subtotal.AmountInMinorUnits - DiscountAmount.AmountInMinorUnits), Currency);

    /// <summary>Se venció el plazo. No es un estado guardado: depende de qué día sea hoy.</summary>
    public bool IsExpired => Status is QuoteStatus.Draft or QuoteStatus.Sent && ValidUntilUtc < DateTime.UtcNow;

    /// <summary>Todavía se puede tocar: aceptado o rechazado ya es historia.</summary>
    public bool IsEditable => Status is QuoteStatus.Draft or QuoteStatus.Sent;

    private Quote() { } // EF Core

    public static Result<Quote> Create(
        TenantId tenantId, string number, string? customerName, Guid? customerId, string? customerEmail,
        string currency, DateTime validUntilUtc)
    {
        var name = (customerName ?? string.Empty).Trim();
        if (name.Length is < 2 or > 160)
            return Result.Failure<Quote>(Error.Validation(
                "Quote.Customer", "Poné a nombre de quién va el presupuesto."));

        if (validUntilUtc <= DateTime.UtcNow.Date)
            return Result.Failure<Quote>(Error.Validation(
                "Quote.Validity", "La fecha de validez tiene que ser posterior a hoy."));

        return new Quote
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Number = number,
            Status = QuoteStatus.Draft,
            CustomerId = customerId,
            CustomerName = name,
            CustomerEmail = string.IsNullOrWhiteSpace(customerEmail) ? null : customerEmail.Trim(),
            Currency = currency,
            ValidUntilUtc = validUntilUtc,
            DiscountAmount = Money.Zero(currency),
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    /// <summary>
    /// Reemplaza el contenido entero. Editar línea por línea no aporta nada
    /// —el presupuesto se arma de una sentada— y complica mantener el total.
    /// </summary>
    public Result Replace(
        string? customerName, Guid? customerId, string? customerEmail, DateTime validUntilUtc,
        IReadOnlyList<(Guid VariantId, string ProductName, string VariantDescription, string Sku, Money UnitPrice, int Quantity)> lines,
        Money? discount, string? notes)
    {
        if (!IsEditable)
            return Result.Failure(Error.Validation(
                "Quote.Closed", "Un presupuesto aceptado o rechazado ya no se edita."));

        var name = (customerName ?? string.Empty).Trim();
        if (name.Length is < 2 or > 160)
            return Result.Failure(Error.Validation("Quote.Customer", "Poné a nombre de quién va el presupuesto."));

        if (lines.Count is 0 or > MaxItems)
            return Result.Failure(Error.Validation(
                "Quote.Items", $"Un presupuesto lleva entre 1 y {MaxItems} productos."));

        if (lines.Any(l => l.Quantity <= 0))
            return Result.Failure(Error.Validation("Quote.Quantity", "Las cantidades tienen que ser positivas."));

        if (lines.Any(l => l.UnitPrice.AmountInMinorUnits < 0))
            return Result.Failure(Error.Validation("Quote.Price", "Ningún precio puede ser negativo."));

        if (lines.Select(l => l.VariantId).Distinct().Count() != lines.Count)
            return Result.Failure(Error.Validation("Quote.Duplicate", "Cada producto va una sola vez."));

        if (validUntilUtc <= DateTime.UtcNow.Date)
            return Result.Failure(Error.Validation(
                "Quote.Validity", "La fecha de validez tiene que ser posterior a hoy."));

        var subtotal = lines.Sum(l => l.UnitPrice.AmountInMinorUnits * (long)l.Quantity);
        var off = discount?.AmountInMinorUnits ?? 0;
        if (off < 0 || off > subtotal)
            return Result.Failure(Error.Validation(
                "Quote.Discount", "El descuento no puede ser mayor al total del presupuesto."));

        CustomerName = name;
        CustomerId = customerId;
        CustomerEmail = string.IsNullOrWhiteSpace(customerEmail) ? null : customerEmail.Trim();
        ValidUntilUtc = validUntilUtc;
        DiscountAmount = new Money(off, Currency);
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim()[..Math.Min(notes.Trim().Length, 1000)];

        _items.Clear();
        foreach (var l in lines)
            _items.Add(new QuoteItem(l.VariantId, l.ProductName, l.VariantDescription, l.Sku, l.UnitPrice, l.Quantity));

        return Result.Success();
    }

    /// <summary>Se lo mandamos al cliente. Marca la fecha para saber cuánto tarda en decidir.</summary>
    public Result MarkSent()
    {
        if (!IsEditable)
            return Result.Failure(Error.Validation("Quote.Closed", "Este presupuesto ya está cerrado."));
        if (_items.Count == 0)
            return Result.Failure(Error.Validation("Quote.Empty", "Agregá al menos un producto antes de enviarlo."));

        Status = QuoteStatus.Sent;
        SentAtUtc ??= DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>
    /// El cliente aceptó: queda atado a la venta que se generó. Un presupuesto
    /// vencido NO se acepta — los precios que congela ya no son los de hoy y
    /// aceptarlo sería vender al precio del mes pasado sin darse cuenta. Para
    /// eso está <see cref="ExtendValidity"/>, que obliga a mirar la fecha.
    /// </summary>
    public Result Accept(Guid orderId)
    {
        if (Status == QuoteStatus.Accepted)
            return Result.Failure(Error.Validation("Quote.AlreadyAccepted", "Este presupuesto ya se convirtió en venta."));
        if (Status == QuoteStatus.Rejected)
            return Result.Failure(Error.Validation("Quote.Rejected", "Este presupuesto figura como rechazado."));
        if (IsExpired)
            return Result.Failure(Error.Validation(
                "Quote.Expired",
                "El presupuesto está vencido. Revisá los precios y extendé la validez antes de aceptarlo."));
        if (_items.Count == 0)
            return Result.Failure(Error.Validation("Quote.Empty", "El presupuesto no tiene productos."));

        Status = QuoteStatus.Accepted;
        ConvertedOrderId = orderId;
        DecidedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    public Result Reject(string? reason)
    {
        if (Status == QuoteStatus.Accepted)
            return Result.Failure(Error.Validation(
                "Quote.AlreadyAccepted", "Ya se convirtió en venta: no se puede rechazar."));

        Status = QuoteStatus.Rejected;
        RejectionReason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim()[..Math.Min(reason.Trim().Length, 300)];
        DecidedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>Le da más plazo. Explícito para que extender sea una decisión y no un efecto.</summary>
    public Result ExtendValidity(DateTime validUntilUtc)
    {
        if (!IsEditable)
            return Result.Failure(Error.Validation("Quote.Closed", "Este presupuesto ya está cerrado."));
        if (validUntilUtc <= DateTime.UtcNow.Date)
            return Result.Failure(Error.Validation(
                "Quote.Validity", "La nueva fecha tiene que ser posterior a hoy."));

        ValidUntilUtc = validUntilUtc;
        return Result.Success();
    }

    /// <summary>Vuelve a borrador un presupuesto rechazado, para renegociarlo.</summary>
    public Result Reopen()
    {
        if (Status == QuoteStatus.Accepted)
            return Result.Failure(Error.Validation(
                "Quote.AlreadyAccepted", "Ya se convirtió en venta: hacé un presupuesto nuevo."));

        Status = QuoteStatus.Draft;
        RejectionReason = null;
        DecidedAtUtc = null;
        return Result.Success();
    }
}

/// <summary>
/// Una línea del presupuesto. Guarda nombre y SKU además del id: el documento
/// tiene que poder leerse igual dentro de un año, aunque el producto se haya
/// renombrado o borrado del catálogo.
/// </summary>
public sealed class QuoteItem
{
    public Guid Id { get; private set; }
    public Guid VariantId { get; private set; }
    public string ProductName { get; private set; } = string.Empty;
    public string VariantDescription { get; private set; } = string.Empty;
    public string Sku { get; private set; } = string.Empty;
    public Money UnitPrice { get; private set; }
    public int Quantity { get; private set; }

    public Money LineTotal => new(UnitPrice.AmountInMinorUnits * Quantity, UnitPrice.Currency);

    private QuoteItem() { } // EF Core

    internal QuoteItem(
        Guid variantId, string productName, string variantDescription, string sku, Money unitPrice, int quantity)
    {
        Id = Guid.NewGuid();
        VariantId = variantId;
        ProductName = productName;
        VariantDescription = variantDescription;
        Sku = sku;
        UnitPrice = unitPrice;
        Quantity = quantity;
    }
}
