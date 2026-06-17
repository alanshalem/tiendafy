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

public sealed record CardPaymentResult(string PaymentId, string Status, string StatusDetail);

public sealed record PaymentStatusDto(
    string PaymentId,
    string Status,
    string StatusDetail,
    string? ExternalReference,
    decimal TransactionAmount);

/// <summary>Cobro con MercadoPago en nombre del seller (token OAuth del tenant).</summary>
public interface IMercadoPagoPaymentService
{
    /// <summary>Crea una preference de Checkout Pro y devuelve el init_point para redirigir.</summary>
    Task<Result<PreferenceResult>> CreateCheckoutProPreferenceAsync(CreatePreferenceRequest request, CancellationToken ct = default);

    /// <summary>Cobra una tarjeta tokenizada on-site (Checkout API). Devuelve el estado del pago.</summary>
    Task<Result<CardPaymentResult>> CreateCardPaymentAsync(CreateCardPaymentRequest request, CancellationToken ct = default);

    /// <summary>Consulta el estado real de un pago (server-side, nunca confiar en el redirect).</summary>
    Task<Result<PaymentStatusDto>> GetPaymentAsync(TenantId tenantId, string paymentId, CancellationToken ct = default);
}

public sealed record WebhookValidationResult(bool IsValid, string? Type, string? DataId);

/// <summary>Valida la firma HMAC-SHA256 de un webhook de MercadoPago.</summary>
public interface IMercadoPagoWebhookValidator
{
    WebhookValidationResult Validate(string? xSignatureHeader, string? xRequestId, string? dataIdFromQuery, string rawBody);
}
