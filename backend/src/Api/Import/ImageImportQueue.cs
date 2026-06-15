using System.Collections.Concurrent;
using System.Threading.Channels;

namespace Api.Import;

/// <summary>Cola + registro de estado de los jobs de importación de imágenes.</summary>
public sealed class ImageImportQueue
{
    private readonly Channel<Guid> _channel = Channel.CreateUnbounded<Guid>();
    private readonly ConcurrentDictionary<Guid, ImageImportJob> _jobs = new();

    public ImageImportJob Create(Guid tenantId, string tempDir, int totalFiles)
    {
        var job = new ImageImportJob
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            TempDir = tempDir,
            TotalFiles = totalFiles,
        };
        _jobs[job.Id] = job;
        return job;
    }

    public void Enqueue(Guid jobId) => _channel.Writer.TryWrite(jobId);

    public ChannelReader<Guid> Reader => _channel.Reader;

    public ImageImportJob? Get(Guid tenantId, Guid jobId) =>
        _jobs.TryGetValue(jobId, out var job) && job.TenantId == tenantId ? job : null;

    public ImageImportJob? Get(Guid jobId) =>
        _jobs.TryGetValue(jobId, out var job) ? job : null;
}
