using System.Collections.Concurrent;
using System.Threading.Channels;

namespace Api.Import;

/// <summary>
/// Cola de jobs de importación + registro de su estado, en memoria del proceso.
/// El endpoint crea+encola; el <see cref="ProductImportWorker"/> consume.
/// El front consulta el estado por id para mostrar el progreso en vivo.
/// </summary>
public sealed class ProductImportQueue
{
    private readonly Channel<Guid> _channel = Channel.CreateUnbounded<Guid>();
    private readonly ConcurrentDictionary<Guid, ImportJob> _jobs = new();

    public ImportJob Create(Guid tenantId, string csv, string fileName, ImportOptions options, int totalProducts)
    {
        var job = new ImportJob
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Csv = csv,
            FileName = fileName,
            Options = options,
            TotalProducts = totalProducts,
        };
        _jobs[job.Id] = job;
        return job;
    }

    public void Enqueue(Guid jobId) => _channel.Writer.TryWrite(jobId);

    public ChannelReader<Guid> Reader => _channel.Reader;

    /// <summary>Estado del job, validando que pertenezca al tenant que pregunta.</summary>
    public ImportJob? Get(Guid tenantId, Guid jobId) =>
        _jobs.TryGetValue(jobId, out var job) && job.TenantId == tenantId ? job : null;

    public ImportJob? Get(Guid jobId) =>
        _jobs.TryGetValue(jobId, out var job) ? job : null;
}
