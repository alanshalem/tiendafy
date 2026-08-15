namespace SharedKernel.Common;

/// <summary>
/// Base de un inbox durable de webhooks: el endpoint solo persiste y responde
/// rápido; un worker procesa después con reintentos. pending → done, o dead al
/// agotar MaxAttempts. Las columnas propias de cada origen viven en la
/// subclase; la base NO se registra en EF (cada entidad mapea su tabla).
/// </summary>
public abstract class InboxEntry
{
    public const string StatusPending = "pending";
    public const string StatusDone = "done";
    public const string StatusDead = "dead";
    public const int MaxAttempts = 6;

    public Guid Id { get; protected set; }
    public string Status { get; protected set; } = StatusPending;
    public int Attempts { get; protected set; }
    public string? LastError { get; protected set; }
    public DateTime CreatedAtUtc { get; protected set; }
    public DateTime? ProcessedAtUtc { get; protected set; }

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
