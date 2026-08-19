namespace MercadoLibre.Infrastructure;

/// <summary>
/// Cache local de una venta de Mercado Libre (se alimenta por webhook
/// orders_v2 + backfill). Permite listar las ventas ML en el panel y calcular
/// métricas sin pegarle a la API en cada request. La fuente de verdad sigue
/// siendo Mercado Libre: acá solo se proyecta lo que el panel muestra.
/// </summary>
public sealed class MeliOrder
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }

    public long MeliOrderId { get; private set; }

    /// <summary>Pack = carrito de ML (agrupa órdenes y es la clave de la mensajería).</summary>
    public long? PackId { get; private set; }

    public string Status { get; private set; } = string.Empty;
    public DateTime DateCreatedUtc { get; private set; }
    public DateTime? DateClosedUtc { get; private set; }

    public decimal TotalAmount { get; private set; }
    public decimal PaidAmount { get; private set; }
    public string CurrencyId { get; private set; } = "ARS";

    public long BuyerId { get; private set; }
    public string BuyerNickname { get; private set; } = string.Empty;

    /// <summary>Items denormalizados para la tabla del panel (título, cantidad, precio, sku).</summary>
    public string ItemsJson { get; private set; } = "[]";

    public long? ShipmentId { get; private set; }
    public string? ShipmentStatus { get; private set; }

    /// <summary>Idempotencia del descuento de stock local: se aplica UNA sola vez por orden.</summary>
    public bool StockApplied { get; private set; }

    /// <summary>
    /// La venta se canceló y el stock que había descontado ya volvió al
    /// disponible. Es el espejo de <see cref="StockApplied"/>: sin él, una
    /// venta cancelada dejaba la mercadería descontada para siempre y la
    /// tienda dejaba de vender lo que en realidad tenía en el depósito.
    /// </summary>
    public bool StockReverted { get; private set; }

    /// <summary>Comprobante ARCA emitido para esta venta ML (null = sin facturar).</summary>
    public Guid? FiscalDocumentId { get; private set; }

    /// <summary>Nota de crédito ya encolada (la venta se canceló estando facturada).</summary>
    public bool CreditNoteIssued { get; private set; }

    public DateTime FirstSeenAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    private MeliOrder() { } // EF Core

    public static MeliOrder Create(Guid tenantId, long meliOrderId) => new()
    {
        Id = Guid.NewGuid(),
        TenantId = tenantId,
        MeliOrderId = meliOrderId,
        FirstSeenAtUtc = DateTime.UtcNow,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    public void Apply(
        string status, DateTime dateCreatedUtc, DateTime? dateClosedUtc,
        decimal totalAmount, decimal paidAmount, string currencyId,
        long buyerId, string buyerNickname, string itemsJson,
        long? packId, long? shipmentId, string? shipmentStatus)
    {
        Status = status;
        DateCreatedUtc = dateCreatedUtc;
        DateClosedUtc = dateClosedUtc;
        TotalAmount = totalAmount;
        PaidAmount = paidAmount;
        CurrencyId = string.IsNullOrWhiteSpace(currencyId) ? "ARS" : currencyId;
        BuyerId = buyerId;
        BuyerNickname = buyerNickname;
        ItemsJson = itemsJson;
        PackId = packId;
        ShipmentId = shipmentId;
        ShipmentStatus = shipmentStatus;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public bool IsPaid => Status is "paid" or "partially_refunded";

    /// <summary>Importe que se factura/acredita: lo pagado, o el total si aún no hay pago informado.</summary>
    public decimal BillableAmount => PaidAmount > 0 ? PaidAmount : TotalAmount;

    /// <summary>El facturable en centavos. AwayFromZero: criterio fiscal (nunca a favor del emisor).</summary>
    public long BillableMinorUnits => (long)Math.Round(BillableAmount * 100m, MidpointRounding.AwayFromZero);

    public void MarkInvoiced(Guid fiscalDocumentId)
    {
        FiscalDocumentId = fiscalDocumentId;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void MarkCreditNoteIssued()
    {
        CreditNoteIssued = true;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void MarkStockApplied() => StockApplied = true;

    public void MarkStockReverted() => StockReverted = true;

    /// <summary>
    /// Venta cancelada cuya mercadería nunca salió: corresponde devolver el
    /// stock. Solo "cancelled" — un "refunded" es una devolución después del
    /// envío y ahí la mercadería puede estar en viaje, dañada o perdida; esa
    /// decisión es del humano, como en la tienda propia.
    /// </summary>
    public bool NeedsStockReversal => StockApplied && !StockReverted && Status is "cancelled";
}
