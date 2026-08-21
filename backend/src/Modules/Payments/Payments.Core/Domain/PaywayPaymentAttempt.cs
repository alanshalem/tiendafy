using Payments.Contracts;
using SharedKernel.Common;

namespace Payments.Core.Domain;

/// <summary>
/// Un intento de cobro contra Payway. Uno por intento, no por orden: si al
/// comprador le rechazan la tarjeta y prueba con otra, son dos filas.
///
/// Existe por una razón muy concreta: <b>Payway no tiene idempotencia</b>. No
/// hay header equivalente al <c>X-Idempotency-Key</c> de Mercado Pago, así que
/// evitar el doble cobro es responsabilidad nuestra. La defensa es el
/// <see cref="SiteTransactionId"/>: se calcula solo con datos estables (tienda,
/// orden, número de intento), viaja en el request, y tiene un índice único en
/// la base. Si dos requests concurrentes intentan el mismo intento, la base
/// frena al segundo antes de que llegue a Payway.
///
/// Y como ese id se puede consultar (<c>GET /payments?siteOperationId=</c>),
/// es también lo que permite averiguar si un pago que dio timeout se cobró o
/// no, en vez de reintentar a ciegas.
/// </summary>
public sealed class PaywayPaymentAttempt
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid OrderId { get; private set; }

    /// <summary>1, 2, 3… Cada tarjeta nueva que prueba el comprador suma uno.</summary>
    public int AttemptNumber { get; private set; }

    /// <summary>Nuestro id de la transacción. Determinístico y único por intento.</summary>
    public string SiteTransactionId { get; private set; } = string.Empty;

    /// <summary>Id numérico del pago en Payway. Null hasta que responde.</summary>
    public string? ProviderPaymentId { get; private set; }

    public PaywayPaymentStatus Status { get; private set; }

    /// <summary>El estado tal cual lo mandó Payway. Para poder investigar lo que mapeamos a Unknown.</summary>
    public string? RawStatus { get; private set; }

    /// <summary>Importe en centavos, la unidad que usa la API de Payway.</summary>
    public long AmountMinor { get; private set; }
    public string Currency { get; private set; } = Money.DefaultCurrency;
    public int Installments { get; private set; }

    // Lo único de la tarjeta que PCI permite guardar.
    public string? CardBin { get; private set; }
    public string? CardLastFour { get; private set; }
    public string? CardBrand { get; private set; }
    public int? PaymentMethodId { get; private set; }

    public string? AuthorizationCode { get; private set; }

    /// <summary>Transaction id de la marca. Es la clave para cruzar contra la liquidación y los contracargos.</summary>
    public string? NetworkTransactionId { get; private set; }
    public string? TicketNumber { get; private set; }

    /// <summary>Código de rechazo de Payway (<c>status_details.error.reason.id</c>).</summary>
    public int? DeclineCode { get; private set; }
    public string? DeclineDescription { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? ProcessedAtUtc { get; private set; }

    private PaywayPaymentAttempt() { } // EF Core

    public static PaywayPaymentAttempt Start(
        Guid tenantId, Guid orderId, int attemptNumber, string siteTransactionId,
        long amountMinor, string currency, int installments,
        string? cardBin, string? cardLastFour, string? cardBrand, int? paymentMethodId) => new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            OrderId = orderId,
            AttemptNumber = attemptNumber,
            SiteTransactionId = siteTransactionId,
            // Arranca en Unknown a propósito: entre que se guarda la fila y
            // llega la respuesta, el pago está exactamente en ese estado.
            Status = PaywayPaymentStatus.Unknown,
            AmountMinor = amountMinor,
            Currency = currency,
            Installments = installments,
            CardBin = cardBin,
            CardLastFour = cardLastFour,
            CardBrand = cardBrand,
            PaymentMethodId = paymentMethodId,
            CreatedAtUtc = DateTime.UtcNow,
        };

    /// <summary>Id de transacción estable para un intento. Mismo intento, mismo id.</summary>
    public static string BuildSiteTransactionId(Guid orderId, int attemptNumber) =>
        $"TF-{orderId:N}-{attemptNumber}"[..Math.Min(39, $"TF-{orderId:N}-{attemptNumber}".Length)];

    public void Complete(
        PaywayPaymentStatus status, string? rawStatus, string? providerPaymentId,
        string? authorizationCode, string? networkTransactionId, string? ticketNumber,
        int? declineCode, string? declineDescription)
    {
        Status = status;
        RawStatus = rawStatus;
        ProviderPaymentId = providerPaymentId ?? ProviderPaymentId;
        AuthorizationCode = authorizationCode;
        NetworkTransactionId = networkTransactionId;
        TicketNumber = ticketNumber;
        DeclineCode = declineCode;
        DeclineDescription = declineDescription;
        ProcessedAtUtc = DateTime.UtcNow;
    }

    /// <summary>Estados de los que ya no se sale solo: no tiene sentido volver a consultarlos.</summary>
    public bool IsSettled =>
        Status is PaywayPaymentStatus.Approved or PaywayPaymentStatus.Declined or PaywayPaymentStatus.Refunded;
}
