using Api.Import;

namespace UnitTests.Api;

/// <summary>
/// La cola de importaciones guarda el estado de cada job en memoria: los
/// terminados se desalojan pasada la retención, los que siguen andando nunca.
/// </summary>
public sealed class ImportJobQueueTests
{
    private static readonly Guid Tenant = Guid.NewGuid();

    private static ImportJob NewJob(ProductImportQueue queue) =>
        queue.Create(Tenant, "slug,nombre\n", "productos.csv", new ImportOptions(true, true), 0);

    [Fact]
    public void Finished_job_is_kept_during_retention()
    {
        var queue = new ProductImportQueue();
        var job = NewJob(queue);
        job.Status = ImportStatus.Completed;
        job.FinishedAtUtc = DateTime.UtcNow.AddMinutes(-59);

        Assert.Same(job, queue.Get(Tenant, job.Id));
    }

    [Fact]
    public void Finished_job_is_evicted_after_retention()
    {
        var queue = new ProductImportQueue();
        var old = NewJob(queue);
        old.Status = ImportStatus.Failed;
        old.FinishedAtUtc = DateTime.UtcNow - ProductImportQueue.FinishedRetention - TimeSpan.FromMinutes(1);

        // Registrar otro barre el viejo.
        var fresh = NewJob(queue);

        Assert.Null(queue.Get(old.Id));
        Assert.Same(fresh, queue.Get(Tenant, fresh.Id));
    }

    [Fact]
    public void Running_job_is_never_evicted()
    {
        var queue = new ImageImportQueue();
        var job = queue.Create(Tenant, Path.GetTempPath(), 3);
        job.Status = ImportStatus.Processing;

        Assert.Same(job, queue.Get(Tenant, job.Id));
        Assert.Null(queue.Get(Guid.NewGuid(), job.Id)); // de otra tienda, no
    }
}
