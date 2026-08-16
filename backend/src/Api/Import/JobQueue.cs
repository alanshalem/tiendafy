using System.Collections.Concurrent;
using System.Threading.Channels;

namespace Api.Import;

/// <summary>Job de import con dueño (tenant) e id propio.</summary>
public interface IImportJob
{
    Guid Id { get; }
    Guid TenantId { get; }
}

/// <summary>
/// Cola de jobs de importación + registro de su estado, en memoria del proceso.
/// El endpoint crea (subclase) + encola; el worker consume por el Reader.
/// El front consulta el estado por id para mostrar el progreso en vivo.
/// </summary>
public abstract class JobQueue<TJob> where TJob : class, IImportJob
{
    private readonly Channel<Guid> _channel = Channel.CreateUnbounded<Guid>();
    private readonly ConcurrentDictionary<Guid, TJob> _jobs = new();

    protected TJob Register(TJob job)
    {
        _jobs[job.Id] = job;
        return job;
    }

    public void Enqueue(Guid jobId) => _channel.Writer.TryWrite(jobId);

    public ChannelReader<Guid> Reader => _channel.Reader;

    /// <summary>Estado del job, validando que pertenezca al tenant que pregunta.</summary>
    public TJob? Get(Guid tenantId, Guid jobId) =>
        _jobs.TryGetValue(jobId, out var job) && job.TenantId == tenantId ? job : null;

    public TJob? Get(Guid jobId) =>
        _jobs.TryGetValue(jobId, out var job) ? job : null;
}
