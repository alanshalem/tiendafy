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
        var job = queue.TryCreate(Tenant, Path.GetTempPath(), 3)!;
        job.Status = ImportStatus.Processing;

        Assert.Same(job, queue.Get(Tenant, job.Id));
        Assert.Null(queue.Get(Guid.NewGuid(), job.Id)); // de otra tienda, no
    }

    [Fact]
    public void Orphan_image_import_dirs_are_swept_on_startup()
    {
        var root = Directory.CreateTempSubdirectory("tiendafy-sweep-test").FullName;
        try
        {
            var orphan = Directory.CreateDirectory(Path.Combine(root, Guid.NewGuid().ToString("N"))).FullName;
            File.WriteAllText(Path.Combine(orphan, "foto.jpg"), "x");

            Assert.Equal(1, ImageImportTemp.SweepOrphans(root));
            Assert.False(Directory.Exists(orphan));
            Assert.Equal(0, ImageImportTemp.SweepOrphans(Path.Combine(root, "no-existe")));
        }
        finally { Directory.Delete(root, recursive: true); }
    }

    [Fact]
    public void Image_jobs_pending_per_tenant_are_capped()
    {
        var queue = new ImageImportQueue();
        for (var i = 0; i < ImageImportQueue.MaxPendingPerTenant; i++)
            Assert.NotNull(queue.TryCreate(Tenant, Path.GetTempPath(), 1));

        Assert.False(queue.HasRoom(Tenant));
        Assert.Null(queue.TryCreate(Tenant, Path.GetTempPath(), 1));
        // Otra tienda sigue teniendo lugar.
        Assert.True(queue.HasRoom(Guid.NewGuid()));
    }

    [Fact]
    public void A_finished_image_job_frees_its_place()
    {
        var queue = new ImageImportQueue();
        var jobs = Enumerable.Range(0, ImageImportQueue.MaxPendingPerTenant)
            .Select(_ => queue.TryCreate(Tenant, Path.GetTempPath(), 1)!).ToList();

        jobs[0].Status = ImportStatus.Completed;
        jobs[0].FinishedAtUtc = DateTime.UtcNow;

        Assert.True(queue.HasRoom(Tenant));
        Assert.NotNull(queue.TryCreate(Tenant, Path.GetTempPath(), 1));
    }

    [Fact]
    public void Image_jobs_pending_are_capped_across_tenants()
    {
        var queue = new ImageImportQueue();
        for (var i = 0; i < ImageImportQueue.MaxPendingGlobal; i++)
            Assert.NotNull(queue.TryCreate(Guid.NewGuid(), Path.GetTempPath(), 1));

        Assert.False(queue.HasRoom(Guid.NewGuid()));
        Assert.Null(queue.TryCreate(Guid.NewGuid(), Path.GetTempPath(), 1));
    }
}
