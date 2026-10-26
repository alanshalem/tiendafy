using Ai.Infrastructure;

namespace UnitTests.Ai;

public class AiCatalogJobTests
{
    private static readonly DateTime Now = new(2026, 10, 26, 12, 0, 0, DateTimeKind.Utc);

    private static AiCatalogJob NewJob(int total = 3) =>
        AiCatalogJob.Create(Guid.NewGuid(), Guid.NewGuid(), total, 1_000, Now);

    private static AiCatalogJobItem NewItem() =>
        AiCatalogJobItem.Create(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Now);

    [Fact]
    public void Create_rechaza_cero_y_mas_de_500()
    {
        var t = Guid.NewGuid();
        var u = Guid.NewGuid();

        Assert.Throws<ArgumentOutOfRangeException>(() => AiCatalogJob.Create(t, u, 0, 1_000, Now));
        Assert.Throws<ArgumentOutOfRangeException>(() => AiCatalogJob.Create(t, u, 501, 1_000, Now));
        var job = AiCatalogJob.Create(t, u, 500, 1_000, Now);
        Assert.Equal(AiCatalogJobStatus.Queued, job.Status);
        Assert.Equal(500, job.Total);
        Assert.Equal(0, job.Processed);
    }

    [Fact]
    public void Reanudar_vale_desde_las_dos_pausas_y_desde_Done()
    {
        var budget = NewJob();
        budget.Start(Now);
        budget.PauseForBudget(Now);
        Assert.Equal(AiCatalogJobStatus.PausedBudget, budget.Status);
        budget.Resume(Now);
        Assert.Equal(AiCatalogJobStatus.Running, budget.Status);

        var unavailable = NewJob();
        unavailable.Start(Now);
        unavailable.PauseUnavailable(Now);
        Assert.Equal(AiCatalogJobStatus.PausedUnavailable, unavailable.Status);
        unavailable.Resume(Now);
        Assert.Equal(AiCatalogJobStatus.Running, unavailable.Status);

        var done = NewJob();
        done.Start(Now);
        done.Finish(Now);
        Assert.Equal(AiCatalogJobStatus.Done, done.Status);
        done.Resume(Now);
        Assert.Equal(AiCatalogJobStatus.Running, done.Status);
    }

    [Fact]
    public void Cancelado_no_se_reanuda()
    {
        var job = NewJob();
        job.Cancel(Now);

        Assert.Equal(AiCatalogJobStatus.Cancelled, job.Status);
        Assert.Throws<InvalidOperationException>(() => job.Resume(Now));
        Assert.Throws<InvalidOperationException>(() => job.Cancel(Now));
    }

    [Fact]
    public void Transiciones_invalidas_lanzan()
    {
        var job = NewJob();
        Assert.Throws<InvalidOperationException>(() => job.PauseForBudget(Now)); // en cola, no corriendo
        Assert.Throws<InvalidOperationException>(() => job.Finish(Now));
        job.Start(Now);
        Assert.Throws<InvalidOperationException>(() => job.Start(Now));
        job.Finish(Now);
        Assert.Throws<InvalidOperationException>(() => job.Cancel(Now));
    }

    [Fact]
    public void IsActive_solo_en_cola_corriendo_o_pausado()
    {
        var job = NewJob();
        Assert.True(job.IsActive);
        job.Start(Now);
        Assert.True(job.IsActive);
        job.PauseForBudget(Now);
        Assert.True(job.IsActive);
        job.Resume(Now);
        job.PauseUnavailable(Now);
        Assert.True(job.IsActive);
        job.Resume(Now);
        job.Finish(Now);
        Assert.False(job.IsActive);

        var cancelled = NewJob();
        cancelled.Cancel(Now);
        Assert.False(cancelled.IsActive);
    }

    [Fact]
    public void Requeue_vuelve_a_Pending_con_intentos_en_cero()
    {
        var item = NewItem();
        item.Checkpoint("{\"a\":1}", 2, Now);
        item.ToNeedsCategory("{\"step\":0}", Now);
        Assert.Equal(AiCatalogItemStatus.NeedsCategory, item.Status);
        Assert.Null(item.ClaimedAtUtc);

        item.Requeue("{\"step\":1}", Now);

        Assert.Equal(AiCatalogItemStatus.Pending, item.Status);
        Assert.Equal(0, item.Attempts);
        Assert.Null(item.ClaimedAtUtc);
        Assert.Equal("{\"step\":1}", item.ProposalJson);
    }

    [Fact]
    public void Checkpoint_guarda_el_paso_y_sigue_reclamado()
    {
        var item = NewItem();

        item.Checkpoint("{\"step\":2}", 1, Now);

        Assert.Equal(AiCatalogItemStatus.Pending, item.Status);
        Assert.Equal(1, item.Attempts);
        Assert.Equal("{\"step\":2}", item.ProposalJson);
        Assert.Equal(Now, item.ClaimedAtUtc);
    }

    [Fact]
    public void ToReview_libera_el_reclamo_y_guarda_la_nota()
    {
        var item = NewItem();
        item.Checkpoint("{}", 1, Now);

        item.ToReview("{\"done\":true}", 2, 4, "Se ve bien.", Now);

        Assert.Equal(AiCatalogItemStatus.Review, item.Status);
        Assert.Equal(2, item.Attempts);
        Assert.Equal(4, item.JudgeScore);
        Assert.Equal("Se ve bien.", item.JudgeNotes);
        Assert.Null(item.ClaimedAtUtc);
    }

    [Fact]
    public void Fail_libera_el_reclamo()
    {
        var item = NewItem();
        item.Checkpoint("{}", 1, Now);

        item.Fail("{\"failure\":\"x\"}", Now);

        Assert.Equal(AiCatalogItemStatus.Failed, item.Status);
        Assert.Null(item.ClaimedAtUtc);
    }

    [Fact]
    public void Approve_solo_desde_Review()
    {
        var item = NewItem();
        Assert.Throws<InvalidOperationException>(() => item.Approve(Now));

        item.ToReview("{}", 1, 5, null, Now);
        item.Approve(Now);
        Assert.Equal(AiCatalogItemStatus.Approved, item.Status);
        Assert.Throws<InvalidOperationException>(() => item.Discard(Now));
    }

    [Theory]
    [InlineData(AiCatalogItemStatus.Review)]
    [InlineData(AiCatalogItemStatus.NeedsCategory)]
    [InlineData(AiCatalogItemStatus.Failed)]
    public void Discard_vale_desde_Review_NeedsCategory_y_Failed(AiCatalogItemStatus from)
    {
        var item = NewItem();
        switch (from)
        {
            case AiCatalogItemStatus.Review: item.ToReview("{}", 1, 3, "x", Now); break;
            case AiCatalogItemStatus.NeedsCategory: item.ToNeedsCategory("{}", Now); break;
            default: item.Fail("{}", Now); break;
        }

        item.Discard(Now);

        Assert.Equal(AiCatalogItemStatus.Discarded, item.Status);
    }

    [Fact]
    public void Un_item_Pending_no_se_descarta()
    {
        Assert.Throws<InvalidOperationException>(() => NewItem().Discard(Now));
    }
}
