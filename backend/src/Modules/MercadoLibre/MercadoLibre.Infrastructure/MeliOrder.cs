using System.Text.Json;

namespace MercadoLibre.Infrastructure;

/// <summary>Unidades de una variante que una venta de ML descontó del stock local.</summary>
public sealed record MeliStockDeduction(Guid VariantId, int Quantity);

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

    /// <summary>
    /// Idempotencia del stock local: la venta cobrada ya pasó por la decisión
    /// de descontar, UNA sola vez por orden. Que haya pasado no quiere decir
    /// que haya descontado algo: eso lo dice <see cref="StockDeductionsJson"/>.
    /// </summary>
    public bool StockApplied { get; private set; }

    /// <summary>
    /// Lo que esta venta descontó de verdad (variante y unidades), con la
    /// sincronización de stock como estaba en ese momento. La cancelación
    /// devuelve exactamente esto: lo que no se descontó no se repone, aunque
    /// después alguien prenda la sincronización o cambie el vínculo.
    /// Null en las ventas procesadas antes de guardar el detalle (oct-2026).
    /// </summary>
    public string? StockDeductionsJson { get; private set; }

    /// <summary>
    /// La venta se canceló y el stock que había descontado ya volvió al
    /// disponible. Es el espejo de <see cref="StockApplied"/>: sin él, una
    /// venta cancelada dejaba la mercadería descontada para siempre y la
    /// tienda dejaba de vender lo que en realidad tenía en el depósito.
    /// </summary>
    public bool StockReverted { get; private set; }

    /// <summary>Comprobante ARCA emitido para esta venta ML (null = sin facturar).</summary>
    public Guid? FiscalDocumentId { get; private set; }

    /// <summary>
    /// La venta se canceló estando facturada y eso ya se resolvió: la nota de
    /// crédito quedó encolada, o no correspondía emitirla sola (nadie factura
    /// automáticamente, o la factura es de otro ambiente). Sirve para no
    /// volver a intentarlo en cada sincronización.
    /// </summary>
    public bool CreditNoteIssued { get; private set; }

    /// <summary>
    /// Lo que Mercado Libre le devolvió al comprador: la suma de
    /// <c>payments[].transaction_amount_refunded</c> de la orden. Con una
    /// devolución parcial la venta queda <c>partially_refunded</c> y esto dice
    /// cuánto se devolvió.
    /// </summary>
    public decimal RefundedAmount { get; private set; }

    /// <summary>
    /// Hasta cuánto de lo devuelto (en centavos) ya se resolvió fiscalmente: la
    /// nota de crédito quedó encolada o no correspondía emitirla sola. Cada
    /// devolución nueva es el tramo entre esto y <see cref="RefundedMinorUnits"/>.
    /// </summary>
    public long RefundCreditResolvedMinorUnits { get; private set; }

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
        long? packId, long? shipmentId, string? shipmentStatus, decimal refundedAmount = 0)
    {
        Status = status;
        RefundedAmount = Math.Max(0, refundedAmount);
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

    /// <summary>
    /// Los estados de una venta de ML que cuentan como cobrada: pagada, o con
    /// una devolución parcial (lo que quedó sigue siendo ingreso). Una sola
    /// definición para descontar stock, facturar, listar, contar ingresos,
    /// rentabilidad y reposición: antes la rentabilidad y la reposición
    /// contaban solo "paid" y daban otro número que el resto del panel.
    /// En consultas: <c>MeliOrder.EarningStatuses.Contains(o.Status)</c> (EF lo traduce).
    /// </summary>
    public static readonly string[] EarningStatuses = ["paid", "partially_refunded"];

    public bool IsPaid => EarningStatuses.Contains(Status);

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

    /// <summary>Lo devuelto en centavos (mismo redondeo que <see cref="BillableMinorUnits"/>).</summary>
    public long RefundedMinorUnits => (long)Math.Round(RefundedAmount * 100m, MidpointRounding.AwayFromZero);

    /// <summary>
    /// Hay una devolución parcial que todavía no pasó por la nota de crédito.
    /// Una cancelación o un reembolso total van por su propio camino (la NC
    /// por lo que queda de la factura), no por acá.
    /// </summary>
    public bool HasUnresolvedPartialRefund =>
        RefundedMinorUnits > RefundCreditResolvedMinorUnits && Status is not ("cancelled" or "refunded");

    /// <summary>La devolución hasta este monto ya se resolvió (NC encolada o no correspondía).</summary>
    public void MarkRefundCreditResolved(long upToMinorUnits)
    {
        RefundCreditResolvedMinorUnits = Math.Max(RefundCreditResolvedMinorUnits, upToMinorUnits);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    private static readonly JsonSerializerOptions DeductionsJson = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// Lo que descontó esta venta. Null = venta procesada antes de guardar el
    /// detalle: se sabe que pasó por el descuento, no qué descontó.
    /// </summary>
    public IReadOnlyList<MeliStockDeduction>? StockDeductions => StockDeductionsJson is null
        ? null
        : JsonSerializer.Deserialize<List<MeliStockDeduction>>(StockDeductionsJson, DeductionsJson) ?? [];

    /// <summary>
    /// La venta se llevó stock local. Falso si se procesó con la sincronización
    /// de stock apagada o con publicaciones sin vincular. Las ventas viejas sin
    /// detalle cuentan como descontadas: es lo que el panel decía de ellas.
    /// </summary>
    public bool StockDiscounted => StockApplied && StockDeductions is not { Count: 0 };

    /// <summary>Registra el descuento (vacío si no se descontó nada). Una sola vez por venta.</summary>
    public void MarkStockApplied(IReadOnlyCollection<MeliStockDeduction> deductions)
    {
        StockApplied = true;
        StockDeductionsJson = JsonSerializer.Serialize(deductions, DeductionsJson);
    }

    public void MarkStockReverted() => StockReverted = true;

    /// <summary>
    /// Venta cancelada cuya mercadería nunca salió: corresponde devolver el
    /// stock que descontó. Solo "cancelled" — un "refunded" es una devolución
    /// después del envío y ahí la mercadería puede estar en viaje, dañada o
    /// perdida; esa decisión es del humano, como en la tienda propia. La que
    /// no descontó nada (sincronización apagada) no tiene nada que devolver.
    /// </summary>
    public bool NeedsStockReversal => StockDiscounted && !StockReverted && Status is "cancelled";
}
