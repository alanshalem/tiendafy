namespace Payments.Infrastructure.Persistence;

/// <summary>
/// Auditoría de reembolsos: quién pidió cuánto, cuándo y qué devolvió MP.
/// Un registro por intento exitoso; el Id es además la clave de idempotencia
/// enviada a MercadoPago, así un retry de red nunca duplica el débito.
/// </summary>
public sealed class PaymentRefund
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid OrderId { get; private set; }
    public string PaymentId { get; private set; } = null!;
    public string? MercadoPagoRefundId { get; private set; }
    public long AmountInMinorUnits { get; private set; }
    public string Currency { get; private set; } = null!;
    public bool IsTotal { get; private set; }
    public string? Reason { get; private set; }
    /// <summary>Email del admin que lo ejecutó; "webhook" si vino de MP.</summary>
    public string RequestedBy { get; private set; } = null!;
    public DateTime CreatedAtUtc { get; private set; }

    private PaymentRefund() { } // EF Core

    public static PaymentRefund Create(
        Guid id, Guid tenantId, Guid orderId, string paymentId,
        long amountInMinorUnits, string currency, bool isTotal,
        string? reason, string requestedBy) => new()
        {
            Id = id,
            TenantId = tenantId,
            OrderId = orderId,
            PaymentId = paymentId,
            AmountInMinorUnits = amountInMinorUnits,
            Currency = currency,
            IsTotal = isTotal,
            Reason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim()[..Math.Min(500, reason.Trim().Length)],
            RequestedBy = requestedBy,
            CreatedAtUtc = DateTime.UtcNow,
        };

    public void AttachMercadoPagoId(string refundId) =>
        MercadoPagoRefundId = string.IsNullOrWhiteSpace(refundId) ? null : refundId;
}
