using SharedKernel.Common;

namespace Payments.Infrastructure.Persistence;

/// <summary>
/// Inbox durable de webhooks de MercadoPago. El endpoint persiste el evento y
/// responde 200; un worker lo procesa con reintentos. Sobrevive reinicios
/// (a diferencia de una cola en memoria). El procesamiento es idempotente.
/// </summary>
public sealed class PaymentWebhookEvent : InboxEntry
{
    public string Type { get; private set; } = null!;
    public string DataId { get; private set; } = null!;
    public long UserId { get; private set; }

    private PaymentWebhookEvent() { } // EF Core

    public static PaymentWebhookEvent Receive(string type, string dataId, long userId)
    {
        var e = new PaymentWebhookEvent { Type = type, DataId = dataId, UserId = userId };
        e.Enqueue();
        return e;
    }
}
