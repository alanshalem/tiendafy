using System.Collections.Concurrent;
using System.Threading.Channels;

namespace Api.Import;

/// <summary>Job de import con dueño (tenant) e id propio.</summary>
public interface IImportJob
{
    Guid Id { get; }
    Guid TenantId { get; }

    // Estado del job: lo escribe el worker (y la base, si el job falla).
    ImportStatus Status { get; set; }
    string? FailureMessage { get; set; }
    DateTime? FinishedAtUtc { get; set; }
}

/// <summary>
/// Cola de jobs de importación + registro de su estado, en memoria del proceso.
/// El endpoint crea (subclase) + encola; el worker consume por el Reader.
/// El front consulta el estado por id para mostrar el progreso en vivo.
///
/// Un job terminado se guarda <see cref="FinishedRetention"/> y después se
/// desaloja: antes quedaban todos (con el CSV entero adentro) hasta reiniciar
/// la API. El panel consulta cada menos de un segundo mientras corre y lee el
/// resultado apenas termina, así que una hora sobra. El barrido es perezoso
/// (al registrar o consultar un job): sin actividad, lo que queda es lo de la
/// última hora en que hubo.
/// </summary>
public abstract class JobQueue<TJob> where TJob : class, IImportJob
{
    /// <summary>Cuánto se guarda el estado de un job después de terminar.</summary>
    public static readonly TimeSpan FinishedRetention = TimeSpan.FromHours(1);

    private readonly Channel<Guid> _channel = Channel.CreateUnbounded<Guid>();
    private readonly ConcurrentDictionary<Guid, TJob> _jobs = new();

    protected TJob Register(TJob job)
    {
        EvictFinished();
        _jobs[job.Id] = job;
        return job;
    }

    public void Enqueue(Guid jobId) => _channel.Writer.TryWrite(jobId);

    public ChannelReader<Guid> Reader => _channel.Reader;

    /// <summary>Estado del job, validando que pertenezca al tenant que pregunta.</summary>
    public TJob? Get(Guid tenantId, Guid jobId)
    {
        var job = Get(jobId);
        return job is not null && job.TenantId == tenantId ? job : null;
    }

    public TJob? Get(Guid jobId)
    {
        EvictFinished();
        return _jobs.TryGetValue(jobId, out var job) ? job : null;
    }

    /// <summary>Jobs sin terminar (en cola o procesándose), de una tienda o de todas (<c>null</c>).</summary>
    protected int PendingCount(Guid? tenantId) =>
        _jobs.Values.Count(j => j.FinishedAtUtc is null && (tenantId is null || j.TenantId == tenantId));

    /// <summary>Saca los jobs que terminaron hace más de <see cref="FinishedRetention"/>.</summary>
    private void EvictFinished()
    {
        var cutoff = DateTime.UtcNow - FinishedRetention;
        foreach (var (id, job) in _jobs)
        {
            if (job.FinishedAtUtc is { } finished && finished < cutoff)
                _jobs.TryRemove(id, out _);
        }
    }
}
