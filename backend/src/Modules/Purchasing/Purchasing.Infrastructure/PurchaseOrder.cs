using SharedKernel.Common;

namespace Purchasing.Infrastructure;

/// <summary>
/// Ciclo de una compra a proveedor, con el vocabulario del importador:
/// borrador → confirmada → en producción → en tránsito → en aduana → recibida.
/// </summary>
public enum PurchaseOrderStatus
{
    Draft,
    Confirmed,
    InProduction,
    InTransit,
    InCustoms,
    Received,
    Cancelled,
}

/// <summary>
/// Orden de compra a un proveedor (del exterior o local). Los montos van en la
/// moneda de la OC (típicamente USD) y se convierten a ARS con ExchangeRate al
/// calcular el landed cost. Editable solo en borrador; el ciclo de estados es
/// visibilidad, no workflow rígido.
/// </summary>
public sealed class PurchaseOrder
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    public string SupplierName { get; private set; } = string.Empty;
    /// <summary>Referencia libre: nro de proforma, contenedor, embarque.</summary>
    public string? Reference { get; private set; }
    public string? Notes { get; private set; }

    /// <summary>Moneda de los montos de la OC (ISO 4217, ej. USD).</summary>
    public string Currency { get; private set; } = "USD";
    /// <summary>Pesos por unidad de Currency. Se puede ajustar hasta recibir.</summary>
    public decimal ExchangeRate { get; private set; } = 1m;
    /// <summary>Días entre confirmar y recibir (alimenta la reposición).</summary>
    public int? LeadTimeDays { get; private set; }

    public PurchaseOrderStatus Status { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? ConfirmedAtUtc { get; private set; }
    public DateTime? ReceivedAtUtc { get; private set; }

    private readonly List<PurchaseOrderItem> _items = [];
    public IReadOnlyList<PurchaseOrderItem> Items => _items.AsReadOnly();

    private readonly List<PurchaseExpense> _expenses = [];
    public IReadOnlyList<PurchaseExpense> Expenses => _expenses.AsReadOnly();

    private PurchaseOrder() { } // EF Core

    public static Result<PurchaseOrder> Create(Guid tenantId, string? supplierName)
    {
        var supplier = supplierName?.Trim() ?? string.Empty;
        if (supplier.Length is < 1 or > 120)
            return Result.Failure<PurchaseOrder>(Error.Validation(
                "Purchase.InvalidSupplier", "El proveedor es obligatorio (hasta 120 caracteres)."));

        return new PurchaseOrder
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            SupplierName = supplier,
            Status = PurchaseOrderStatus.Draft,
            CreatedAtUtc = DateTime.UtcNow,
        };
    }

    public bool IsEditable => Status == PurchaseOrderStatus.Draft;
    public bool IsOpen => Status is not (PurchaseOrderStatus.Received or PurchaseOrderStatus.Cancelled);

    public Result UpdateDraft(
        string? supplierName, string? reference, string? notes,
        string? currency, decimal exchangeRate, int? leadTimeDays)
    {
        if (!IsEditable)
            return Result.Failure(Error.Conflict("Purchase.NotEditable", "Solo se edita una OC en borrador."));

        var supplier = supplierName?.Trim() ?? string.Empty;
        if (supplier.Length is < 1 or > 120)
            return Result.Failure(Error.Validation("Purchase.InvalidSupplier", "El proveedor es obligatorio."));
        var cur = currency?.Trim().ToUpperInvariant() ?? string.Empty;
        if (cur.Length != 3)
            return Result.Failure(Error.Validation("Purchase.InvalidCurrency", "Moneda ISO de 3 letras."));
        if (exchangeRate <= 0)
            return Result.Failure(Error.Validation("Purchase.InvalidRate", "El tipo de cambio debe ser mayor a 0."));
        if (leadTimeDays is < 0 or > 720)
            return Result.Failure(Error.Validation("Purchase.InvalidLeadTime", "Lead time entre 0 y 720 días."));

        SupplierName = supplier;
        Reference = string.IsNullOrWhiteSpace(reference) ? null : reference.Trim();
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        Currency = cur;
        ExchangeRate = exchangeRate;
        LeadTimeDays = leadTimeDays;
        return Result.Success();
    }

    /// <summary>Reemplaza los ítems (edición de borrador: la lista viene entera del form).</summary>
    public Result SetItems(IReadOnlyList<(Guid VariantId, string ProductName, string VariantDescription, string Sku, int Quantity, decimal UnitCost)> lines)
    {
        if (!IsEditable)
            return Result.Failure(Error.Conflict("Purchase.NotEditable", "Solo se edita una OC en borrador."));
        if (lines.Any(l => l.Quantity <= 0))
            return Result.Failure(Error.Validation("Purchase.InvalidQuantity", "Las cantidades deben ser mayores a 0."));
        if (lines.Any(l => l.UnitCost < 0))
            return Result.Failure(Error.Validation("Purchase.InvalidCost", "El costo unitario no puede ser negativo."));
        if (lines.Select(l => l.VariantId).Distinct().Count() != lines.Count)
            return Result.Failure(Error.Validation("Purchase.DuplicateVariant", "Cada variante va una sola vez."));

        _items.Clear();
        foreach (var l in lines)
            _items.Add(new PurchaseOrderItem(l.VariantId, l.ProductName, l.VariantDescription, l.Sku, l.Quantity, l.UnitCost));
        return Result.Success();
    }

    /// <summary>Reemplaza los gastos del embarque (flete, seguro, aranceles, despachante…).</summary>
    public Result SetExpenses(IReadOnlyList<(string Label, decimal Amount, bool IsLocal)> expenses)
    {
        if (!IsEditable)
            return Result.Failure(Error.Conflict("Purchase.NotEditable", "Solo se edita una OC en borrador."));
        if (expenses.Any(e => string.IsNullOrWhiteSpace(e.Label) || e.Label.Trim().Length > 80))
            return Result.Failure(Error.Validation("Purchase.InvalidExpense", "Cada gasto necesita un concepto (hasta 80 caracteres)."));
        if (expenses.Any(e => e.Amount < 0))
            return Result.Failure(Error.Validation("Purchase.InvalidExpense", "Los gastos no pueden ser negativos."));

        _expenses.Clear();
        foreach (var e in expenses)
            _expenses.Add(new PurchaseExpense(e.Label.Trim(), e.Amount, e.IsLocal));
        return Result.Success();
    }

    private static readonly PurchaseOrderStatus[] Flow =
    [
        PurchaseOrderStatus.Draft, PurchaseOrderStatus.Confirmed, PurchaseOrderStatus.InProduction,
        PurchaseOrderStatus.InTransit, PurchaseOrderStatus.InCustoms, PurchaseOrderStatus.Received,
    ];

    /// <summary>
    /// Mueve la OC a un estado del ciclo (solo hacia ADELANTE, sin saltear a
    /// Received: recibir pasa por Receive(), que impacta stock y costos).
    /// </summary>
    public Result AdvanceTo(PurchaseOrderStatus next)
    {
        if (!IsOpen)
            return Result.Failure(Error.Conflict("Purchase.Closed", "La OC ya está cerrada."));
        var current = Array.IndexOf(Flow, Status);
        var target = Array.IndexOf(Flow, next);
        if (target <= current || next == PurchaseOrderStatus.Received)
            return Result.Failure(Error.Validation("Purchase.InvalidTransition", "Transición de estado inválida."));
        if (Status == PurchaseOrderStatus.Draft && _items.Count == 0)
            return Result.Failure(Error.Validation("Purchase.Empty", "Cargá al menos un ítem antes de confirmar."));

        if (Status == PurchaseOrderStatus.Draft) ConfirmedAtUtc = DateTime.UtcNow;
        Status = next;
        return Result.Success();
    }

    public Result Cancel()
    {
        if (!IsOpen)
            return Result.Failure(Error.Conflict("Purchase.Closed", "La OC ya está cerrada."));
        Status = PurchaseOrderStatus.Cancelled;
        return Result.Success();
    }

    /// <summary>
    /// Recibe la mercadería: fija cantidades recibidas y el TC definitivo.
    /// El caller (Api) impacta stock y costos con los landed costs resultantes.
    /// </summary>
    public Result Receive(IReadOnlyDictionary<Guid, int> receivedByVariant, decimal? finalExchangeRate)
    {
        if (Status is PurchaseOrderStatus.Draft)
            return Result.Failure(Error.Conflict("Purchase.NotConfirmed", "Confirmá la OC antes de recibirla."));
        if (!IsOpen)
            return Result.Failure(Error.Conflict("Purchase.Closed", "La OC ya está cerrada."));
        if (finalExchangeRate is <= 0)
            return Result.Failure(Error.Validation("Purchase.InvalidRate", "El tipo de cambio debe ser mayor a 0."));

        foreach (var item in _items)
        {
            var qty = receivedByVariant.TryGetValue(item.VariantId, out var q) ? q : item.Quantity;
            if (qty < 0 || qty > item.Quantity)
                return Result.Failure(Error.Validation(
                    "Purchase.InvalidReceived", $"Recibido de '{item.Sku}' fuera de rango (0 a {item.Quantity})."));
            item.MarkReceived(qty);
        }

        if (finalExchangeRate is { } rate) ExchangeRate = rate;
        Status = PurchaseOrderStatus.Received;
        ReceivedAtUtc = DateTime.UtcNow;
        return Result.Success();
    }

    /// <summary>FOB total en moneda de la OC.</summary>
    public decimal TotalFob => _items.Sum(i => i.UnitCost * i.Quantity);

    /// <summary>Gastos totales convertidos a ARS (los locales ya están en ARS).</summary>
    public decimal TotalExpensesArs =>
        _expenses.Sum(e => e.IsLocal ? e.Amount : e.Amount * ExchangeRate);

    /// <summary>
    /// Costo unitario "puesto en el depósito" en CENTAVOS ARS: FOB convertido +
    /// prorrateo de los gastos del embarque por participación en el valor FOB.
    /// La diferencia entre creer que algo cuesta USD 4 y saber que cuesta 6,80.
    /// </summary>
    public long LandedUnitCostArsMinor(PurchaseOrderItem item)
    {
        var totalFob = TotalFob;
        var itemFob = item.UnitCost * item.Quantity;
        var share = totalFob > 0 ? itemFob / totalFob : 0m;
        var itemArs = itemFob * ExchangeRate + share * TotalExpensesArs;
        var unitArs = item.Quantity > 0 ? itemArs / item.Quantity : 0m;
        return (long)Math.Round(unitArs * 100m, MidpointRounding.AwayFromZero);
    }
}

public sealed class PurchaseOrderItem
{
    public Guid Id { get; private set; }
    public Guid VariantId { get; private set; }
    public string ProductName { get; private set; } = string.Empty;
    public string VariantDescription { get; private set; } = string.Empty;
    public string Sku { get; private set; } = string.Empty;
    public int Quantity { get; private set; }
    /// <summary>Costo unitario en la moneda de la OC (FOB).</summary>
    public decimal UnitCost { get; private set; }
    /// <summary>Unidades efectivamente recibidas (fijado al recibir).</summary>
    public int? ReceivedQuantity { get; private set; }

    private PurchaseOrderItem() { } // EF Core

    internal PurchaseOrderItem(Guid variantId, string productName, string variantDescription, string sku, int quantity, decimal unitCost)
    {
        Id = Guid.NewGuid();
        VariantId = variantId;
        ProductName = productName;
        VariantDescription = variantDescription;
        Sku = sku;
        Quantity = quantity;
        UnitCost = unitCost;
    }

    internal void MarkReceived(int quantity) => ReceivedQuantity = quantity;
}

public sealed class PurchaseExpense
{
    public Guid Id { get; private set; }
    public string Label { get; private set; } = string.Empty;
    public decimal Amount { get; private set; }
    /// <summary>true = el monto ya está en ARS (despachante, IVA aduana); false = moneda de la OC (flete, seguro).</summary>
    public bool IsLocal { get; private set; }

    private PurchaseExpense() { } // EF Core

    internal PurchaseExpense(string label, decimal amount, bool isLocal)
    {
        Id = Guid.NewGuid();
        Label = label;
        Amount = amount;
        IsLocal = isLocal;
    }
}
