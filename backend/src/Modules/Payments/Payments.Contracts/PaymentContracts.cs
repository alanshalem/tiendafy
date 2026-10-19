using SharedKernel.Common;

namespace Payments.Contracts;

/// <summary>Ítem para la preference de Checkout Pro (precios en unidad mayor, p.ej. 1500.00).</summary>
public sealed record PreferenceItem(string Title, int Quantity, decimal UnitPrice);

public sealed record CreatePreferenceRequest(
    TenantId TenantId,
    Guid OrderId,
    string Currency,
    IReadOnlyList<PreferenceItem> Items,
    string PayerEmail,
    string SuccessUrl,
    string FailureUrl,
    string PendingUrl,
    decimal DiscountAmount = 0m);

public sealed record PreferenceResult(string PreferenceId, string InitPoint);

/// <summary>Pago on-site (Checkout API/Bricks): el front tokeniza la tarjeta y manda el token.</summary>
public sealed record CreateCardPaymentRequest(
    TenantId TenantId,
    Guid OrderId,
    decimal Amount,
    string Token,
    string PaymentMethodId,
    int Installments,
    string? IssuerId,
    string PayerEmail,
    string? PayerDocType,
    string? PayerDocNumber);

public sealed record CardPaymentResult(string PaymentId, string Status, string StatusDetail)
{
    /// <summary>
    /// El desafío 3DS que el comprador tiene que responder en la tienda; null si
    /// el pago no lo pide (o vino sin los datos para mostrarlo).
    /// </summary>
    public ThreeDsChallenge? Challenge { get; init; }

    /// <summary>El banco pide que el comprador confirme el pago (3DS): <c>pending</c> / <c>pending_challenge</c>.</summary>
    public bool IsPendingChallenge =>
        string.Equals(Status, "pending", StringComparison.OrdinalIgnoreCase)
        && string.Equals(StatusDetail, "pending_challenge", StringComparison.OrdinalIgnoreCase);
}

/// <summary>
/// Lo que el navegador necesita para mostrar el desafío 3DS
/// (<c>three_ds_info</c> del pago): la URL del banco y el <c>creq</c> que se le postea.
/// </summary>
public sealed record ThreeDsChallenge(string ExternalResourceUrl, string Creq);

public sealed record PaymentStatusDto(
    string PaymentId,
    string Status,
    string StatusDetail,
    string? ExternalReference,
    decimal TransactionAmount,
    decimal TransactionAmountRefunded = 0m,
    // Lo que MP le acredita al seller (transaction_details.net_received_amount).
    // TransactionAmount − esto = comisión REAL del pago → rentabilidad.
    decimal? NetReceivedAmount = null)
{
    /// <summary>Comisión total de MP en el pago; null si MP no informó el neto.</summary>
    public decimal? FeeAmount =>
        NetReceivedAmount is { } net && net > 0 && net <= TransactionAmount
            ? TransactionAmount - net
            : null;
}

public sealed record RefundResult(string RefundId, decimal Amount);

/// <summary>Cobro con MercadoPago en nombre del seller (token OAuth del tenant).</summary>
public interface IMercadoPagoPaymentService
{
    /// <summary>Crea una preference de Checkout Pro y devuelve el init_point para redirigir.</summary>
    Task<Result<PreferenceResult>> CreateCheckoutProPreferenceAsync(CreatePreferenceRequest request, CancellationToken ct = default);

    /// <summary>Cobra una tarjeta tokenizada on-site (Checkout API). Devuelve el estado del pago.</summary>
    Task<Result<CardPaymentResult>> CreateCardPaymentAsync(CreateCardPaymentRequest request, CancellationToken ct = default);

    /// <summary>Consulta el estado real de un pago (server-side, nunca confiar en el redirect).</summary>
    Task<Result<PaymentStatusDto>> GetPaymentAsync(TenantId tenantId, string paymentId, CancellationToken ct = default);

    /// <summary>
    /// Los pagos de una orden (<c>GET /v1/payments/search?external_reference=</c>),
    /// del más nuevo al más viejo: los intentos de Checkout Pro, el Brick o un
    /// pago en efectivo todavía sin acreditar. Sirve para saber si una venta
    /// pendiente tiene un pago en curso antes de darla por abandonada.
    /// </summary>
    Task<Result<IReadOnlyList<PaymentStatusDto>>> SearchPaymentsAsync(TenantId tenantId, Guid orderId, CancellationToken ct = default);

    /// <summary>
    /// Reembolso de un pago aprobado (MercadoPago refunds API). <paramref name="amount"/>
    /// null = total; con valor = parcial. <paramref name="idempotencyKey"/> debe ser único
    /// por intento de refund (no por pago) para permitir múltiples parciales.
    /// </summary>
    Task<Result<RefundResult>> RefundAsync(TenantId tenantId, string paymentId, decimal? amount, string idempotencyKey, CancellationToken ct = default);

    /// <summary>
    /// Vence una preference de Checkout Pro: el link de pago deja de aceptar
    /// pagos. Se usa al cancelar una venta pendiente, para que el comprador no
    /// pague algo que ya no existe.
    /// </summary>
    Task<Result> ExpirePreferenceAsync(TenantId tenantId, string preferenceId, CancellationToken ct = default);
}

public sealed record WebhookValidationResult(bool IsValid, string? Type, string? DataId);

/// <summary>Valida la firma HMAC-SHA256 de un webhook de MercadoPago.</summary>
public interface IMercadoPagoWebhookValidator
{
    WebhookValidationResult Validate(string? xSignatureHeader, string? xRequestId, string? dataIdFromQuery, string rawBody);
}
