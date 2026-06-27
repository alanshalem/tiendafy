namespace Payments.Infrastructure.Persistence;

/// <summary>
/// Inbox durable de webhooks de MercadoPago. El endpoint persiste el evento y
/// responde 200; un worker lo procesa con reintentos. Sobrevive reinicios
/// (a diferencia de una cola en memoria). El procesamiento es idempotente.
/// </summary>
public sealed class PaymentWebhookEvent
{
    public const string StatusPending = "pending";
    public const string StatusDone = "done";
    public const string StatusDead = "dead";
    public const int MaxAttempts = 6;

    public Guid Id { get; private set; }
    public string Type { get; private set; } = null!;
    public string DataId { get; private set; } = null!;
    public long UserId { get; private set; }
    public string Status { get; private set; } = StatusPending;
    public int Attempts { get; private set; }
    public string? LastError { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? ProcessedAtUtc { get; private set; }

    private PaymentWebhookEvent() { } // EF Core

    public static PaymentWebhookEvent Receive(string type, string dataId, long userId) => new()
    {
        Id = Guid.NewGuid(),
        Type = type,
        DataId = dataId,
        UserId = userId,
        Status = StatusPending,
        CreatedAtUtc = DateTime.UtcNow,
    };

    public void MarkDone()
    {
        Status = StatusDone;
        ProcessedAtUtc = DateTime.UtcNow;
        LastError = null;
    }

    public void MarkFailed(string error)
    {
        Attempts++;
        LastError = error.Length > 500 ? error[..500] : error;
        if (Attempts >= MaxAttempts)
        {
            Status = StatusDead;
            ProcessedAtUtc = DateTime.UtcNow;
        }
    }
}
