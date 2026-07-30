namespace MercadoLibre.Infrastructure;

/// <summary>
/// Inbox durable de notificaciones (webhooks) de Mercado Libre. ML exige
/// responder 200 en menos de 500 ms, así que el endpoint solo persiste y un
/// worker procesa después con reintentos. El payload de ML NO trae los datos
/// (solo el resource a consultar), por eso nunca se confía en él: el worker
/// re-consulta el recurso con el token del vendedor.
/// </summary>
public sealed class MeliNotification
{
    public const string StatusPending = "pending";
    public const string StatusDone = "done";
    public const string StatusDead = "dead";
    public const int MaxAttempts = 6;

    public Guid Id { get; private set; }
    public string Topic { get; private set; } = string.Empty;
    public string Resource { get; private set; } = string.Empty;
    public long MeliUserId { get; private set; }
    public string Status { get; private set; } = StatusPending;
    public int Attempts { get; private set; }
    public string? LastError { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? ProcessedAtUtc { get; private set; }

    private MeliNotification() { } // EF Core

    public static MeliNotification Receive(string topic, string resource, long meliUserId) => new()
    {
        Id = Guid.NewGuid(),
        Topic = topic.Length > 60 ? topic[..60] : topic,
        Resource = resource.Length > 300 ? resource[..300] : resource,
        MeliUserId = meliUserId,
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
