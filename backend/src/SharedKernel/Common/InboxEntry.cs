namespace SharedKernel.Common;

/// <summary>
/// Base de un inbox durable de webhooks: el endpoint solo persiste y responde
/// rápido; un worker procesa después con reintentos. pending → done, o dead al
/// agotar los intentos. Las columnas propias de cada origen viven en la
/// subclase; la base NO se registra en EF (cada entidad mapea su tabla).
///
/// <para>
/// <b>Reintentos.</b> Antes se reintentaba en cada vuelta del worker, cada
/// pocos segundos: los seis intentos se gastaban en medio minuto. Una caída
/// corta del proveedor alcanzaba para matar el evento, y como al webhook ya se
/// le contestó 200, el proveedor no lo reenvía — lo que se perdía ahí, se
/// perdía. Ahora cada fallo empuja <see cref="NextAttemptAtUtc"/> siguiendo
/// <see cref="Backoff"/>: el inbox aguanta casi un día de proveedor caído.
/// </para>
///
/// <para>
/// <b>Un solo worker por evento.</b> Ese mismo campo hace de lease: quien toma
/// el evento lo empuja hacia adelante con un UPDATE condicional, así que dos
/// instancias en paralelo no procesan el mismo (ver <c>InboxDrain</c>). Si el
/// proceso se muere con un evento tomado, el lease vence y otro lo levanta.
/// </para>
/// </summary>
public abstract class InboxEntry
{
    public const string StatusPending = "pending";
    public const string StatusDone = "done";
    public const string StatusDead = "dead";

    /// <summary>
    /// Cuánto se espera antes de cada reintento. Escrito a mano y no como
    /// fórmula a propósito: lo que importa es cuánto aguanta el inbox una
    /// caída del proveedor, y eso tiene que poder leerse de un vistazo.
    /// Suma poco más de 22 horas antes de darse por vencido.
    /// </summary>
    private static readonly TimeSpan[] Backoff =
    [
        TimeSpan.FromSeconds(30),
        TimeSpan.FromMinutes(2),
        TimeSpan.FromMinutes(10),
        TimeSpan.FromMinutes(45),
        TimeSpan.FromHours(3),
        TimeSpan.FromHours(6),
        TimeSpan.FromHours(12),
    ];

    /// <summary>
    /// Cuánto tiene un worker para terminar un evento que tomó. Si se pasa (o
    /// si el proceso se murió), otro lo puede levantar. Generoso a propósito:
    /// procesar un webhook son un par de llamadas al proveedor.
    /// </summary>
    public static readonly TimeSpan Lease = TimeSpan.FromMinutes(5);

    /// <summary>Intentos antes de darlo por muerto: uno más que escalones de backoff.</summary>
    public static int MaxAttempts => Backoff.Length + 1;

    public Guid Id { get; protected set; }
    public string Status { get; protected set; } = StatusPending;
    public int Attempts { get; protected set; }
    public string? LastError { get; protected set; }
    public DateTime CreatedAtUtc { get; protected set; }
    public DateTime? ProcessedAtUtc { get; protected set; }

    /// <summary>
    /// Desde cuándo se puede tomar este evento. Al entrar, ya: es ahora. Un
    /// fallo lo empuja según el backoff; tomarlo lo empuja según el lease.
    /// </summary>
    public DateTime NextAttemptAtUtc { get; protected set; }

    /// <summary>
    /// Alta del evento. La llaman las factories de cada inbox: así una entrada
    /// nueva no puede nacer sin fecha de intento —quedaría invisible para el
    /// worker— ni con un estado que no sea "pendiente".
    /// </summary>
    protected void Enqueue()
    {
        Id = Guid.NewGuid();
        Status = StatusPending;
        Attempts = 0;
        CreatedAtUtc = DateTime.UtcNow;
        NextAttemptAtUtc = CreatedAtUtc;
    }

    /// <summary>Alinea la entidad con el lease que el claim ya escribió en la base.</summary>
    public void MarkLeased(DateTime untilUtc) => NextAttemptAtUtc = untilUtc;

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
            return;
        }

        NextAttemptAtUtc = DateTime.UtcNow + Backoff[Attempts - 1];
    }

    /// <summary>
    /// Devuelve a la cola un evento que se dio por muerto, con los intentos en
    /// cero. Es la salida manual para cuando lo que fallaba ya se arregló: sin
    /// esto, un evento muerto no tiene vuelta y la venta queda sin cobrar.
    /// </summary>
    public bool Revive()
    {
        if (Status != StatusDead) return false;

        Status = StatusPending;
        Attempts = 0;
        ProcessedAtUtc = null;
        NextAttemptAtUtc = DateTime.UtcNow;
        return true;
    }
}
