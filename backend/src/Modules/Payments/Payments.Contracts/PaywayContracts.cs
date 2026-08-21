using SharedKernel.Common;

namespace Payments.Contracts;

/// <summary>
/// Resultado de un cobro, traducido al vocabulario de Tiendafy.
///
/// Payway devuelve veinte estados distintos; para decidir qué hacer con una
/// orden alcanzan estos seis. El mapeo vive en la infraestructura y su caso por
/// defecto es <see cref="Unknown"/>: un estado que no conocemos nunca se asume
/// aprobado ni rechazado.
/// </summary>
public enum PaywayPaymentStatus
{
    /// <summary>Cobrado. La plata entró.</summary>
    Approved = 0,

    /// <summary>Rechazado por el emisor o por antifraude. No hay cobro.</summary>
    Declined = 1,

    /// <summary>En revisión manual del antifraude. NO despachar.</summary>
    UnderReview = 2,

    /// <summary>Falta un paso del comprador (3D Secure).</summary>
    RequiresAction = 3,

    /// <summary>Fondos reservados sin capturar (pre-autorización).</summary>
    Authorized = 4,

    /// <summary>Devuelto o anulado, total o parcialmente.</summary>
    Refunded = 5,

    /// <summary>
    /// No sabemos. Timeout, 5xx o un estado sin mapear. Obliga a consultar
    /// contra Payway antes de tocar la orden.
    /// </summary>
    Unknown = 6,
}

/// <summary>
/// Cobro con tarjeta vía Payway. El navegador ya cambió la tarjeta por un
/// token contra Payway, así que acá nunca llega el número ni el código de
/// seguridad: solo el token, el BIN y los últimos cuatro dígitos.
/// </summary>
public sealed record PaywayChargeRequest(
    TenantId TenantId,
    Guid OrderId,
    /// <summary>Importe en centavos. Es la unidad de la API; el proyecto ya guarda así los Money.</summary>
    long AmountMinor,
    string Currency,
    /// <summary>Token de un solo uso devuelto por <c>POST /tokens</c>.</summary>
    string Token,
    /// <summary>Primeros seis dígitos. Payway lo exige en el cobro y viene en la respuesta del token.</summary>
    string Bin,
    int Installments,
    string BuyerEmail,
    /// <summary>IP real del comprador: Payway la pide y el antifraude la usa.</summary>
    string BuyerIpAddress,
    string? CardLastFour = null,
    /// <summary>Marca detectada en el navegador ("visa", "mastercard"…). Resuelve el medio de pago.</summary>
    string? CardBrand = null,
    bool IsDebit = false,
    string? Description = null);

/// <summary>Por qué se rechazó, en términos que sirven para decidir qué mostrar y qué ofrecer.</summary>
public enum PaywayDeclineCategory
{
    InsufficientFunds,
    CardExpired,
    InvalidCardNumber,
    InvalidExpiryDate,
    IncorrectPin,
    CallIssuer,
    /// <summary>Tarjeta denunciada. No ofrecer reintentar con la misma.</summary>
    CardReported,
    NotAllowed,
    InstallmentsNotAllowed,
    FraudSuspected,
    ProcessingError,
    /// <summary>Está mal configurado el comercio. No es culpa del comprador: hay que avisar adentro.</summary>
    ConfigurationError,
    Duplicate,
    GenericDecline,
}

/// <summary>Detalle de un rechazo, ya traducido a algo que se le puede mostrar a una persona.</summary>
public sealed record PaywayDecline(
    PaywayDeclineCategory Category,
    int ProviderCode,
    string ProviderDescription,
    /// <summary>Si tiene sentido que el comprador vuelva a intentar (con otra tarjeta, otro plan o más tarde).</summary>
    bool IsRetryable,
    string BuyerMessage);

public sealed record PaywayChargeResult(
    PaywayPaymentStatus Status,
    string? ProviderPaymentId,
    string RawStatus,
    long AmountMinor,
    string? AuthorizationCode = null,
    string? NetworkTransactionId = null,
    string? TicketNumber = null,
    PaywayDecline? Decline = null)
{
    public bool IsApproved => Status == PaywayPaymentStatus.Approved;
}

public sealed record PaywayRefundResult(string RefundId, long AmountMinor, string RawStatus);

/// <summary>Lo que el navegador necesita saber para armar el formulario de tarjeta.</summary>
public sealed record PaywayPublicConfig(
    bool Enabled,
    string? PublicKey,
    string? BaseUrl,
    string? SiteId,
    IReadOnlyList<int> InstallmentOptions);

/// <summary>
/// Cobro con Payway (ex Decidir) en nombre de la tienda.
///
/// Es una interfaz aparte de la de Mercado Pago, y no una abstracción común,
/// porque los dos flujos no se parecen: Mercado Pago tiene OAuth, webhooks
/// firmados e idempotencia por header; Payway tiene claves fijas, no notifica
/// nada y obliga a resolver la idempotencia por nuestra cuenta. Una interfaz
/// que tape esa diferencia haría creer que da igual cuál se use.
/// </summary>
public interface IPaywayPaymentService
{
    /// <summary>Configuración pública de la tienda. Segura de mandar al navegador.</summary>
    Task<PaywayPublicConfig> GetPublicConfigAsync(TenantId tenantId, CancellationToken ct = default);

    /// <summary>
    /// Cobra la tarjeta tokenizada. Un rechazo NO es un fallo: devuelve
    /// <see cref="Result"/> exitoso con <c>Status = Declined</c> y el detalle
    /// cargado. Solo falla ante problemas de configuración o de red.
    /// </summary>
    Task<Result<PaywayChargeResult>> ChargeAsync(PaywayChargeRequest request, CancellationToken ct = default);

    /// <summary>Estado real de un pago según Payway. Nunca confiar en lo que quedó guardado.</summary>
    Task<Result<PaywayChargeResult>> GetPaymentAsync(TenantId tenantId, string providerPaymentId, CancellationToken ct = default);

    /// <summary>
    /// Busca un pago por NUESTRO id de transacción. Es la única forma de saber
    /// si un cobro que dio timeout llegó a existir, y por eso es lo que evita
    /// el doble cobro cuando la red falla.
    /// </summary>
    Task<Result<PaywayChargeResult?>> FindBySiteTransactionIdAsync(TenantId tenantId, string siteTransactionId, CancellationToken ct = default);

    /// <summary>Devuelve un pago. <paramref name="amountMinor"/> null = total.</summary>
    Task<Result<PaywayRefundResult>> RefundAsync(TenantId tenantId, string providerPaymentId, long? amountMinor, CancellationToken ct = default);
}
