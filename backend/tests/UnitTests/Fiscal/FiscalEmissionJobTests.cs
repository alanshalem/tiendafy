using Fiscal.Core.Domain;

namespace UnitTests.Fiscal;

public class FiscalEmissionJobTests
{
    private static FiscalEmissionJob NewJob() =>
        FiscalEmissionJob.Create(Guid.NewGuid(), Guid.NewGuid(), FiscalJobKind.Invoice, 12100, "20123456786");

    [Fact]
    public void Create_StartsPending_ReadyNow()
    {
        var j = NewJob();
        Assert.Equal(FiscalJobStatus.Pending, j.Status);
        Assert.Equal(0, j.Attempts);
        Assert.True(j.NextAttemptUtc <= DateTime.UtcNow);
    }

    [Fact]
    public void MarkProcessing_IncrementsAttempts()
    {
        var j = NewJob();
        j.MarkProcessing();
        Assert.Equal(FiscalJobStatus.Processing, j.Status);
        Assert.Equal(1, j.Attempts);
    }

    [Fact]
    public void MarkDone_LinksDocument_ClearsError()
    {
        var j = NewJob();
        j.MarkProcessing();
        var doc = Guid.NewGuid();
        j.MarkDone(doc);
        Assert.Equal(FiscalJobStatus.Done, j.Status);
        Assert.Equal(doc, j.FiscalDocumentId);
        Assert.Null(j.LastError);
    }

    [Fact]
    public void Reschedule_BackToPending_WithFutureAttemptAndError()
    {
        var j = NewJob();
        j.MarkProcessing();
        var next = DateTime.UtcNow.AddMinutes(5);
        j.Reschedule("timeout", next);
        Assert.Equal(FiscalJobStatus.Pending, j.Status);
        Assert.Equal(next, j.NextAttemptUtc);
        Assert.Equal("timeout", j.LastError);
    }

    [Fact]
    public void MarkFailed_DeadLetters()
    {
        var j = NewJob();
        j.MarkProcessing();
        j.MarkFailed("10016 Numeracion erronea");
        Assert.Equal(FiscalJobStatus.Failed, j.Status);
        Assert.Contains("10016", j.LastError);
    }

    [Fact]
    public void Requeue_ResetsToPendingNow()
    {
        var j = NewJob();
        j.MarkProcessing();
        j.MarkFailed("x");
        j.Requeue();
        Assert.Equal(FiscalJobStatus.Pending, j.Status);
        Assert.True(j.NextAttemptUtc <= DateTime.UtcNow);
    }

    [Fact]
    public void ReleaseStaleLease_BackToPendingNow_KeepsAttempts()
    {
        var j = NewJob();
        j.MarkProcessing();
        j.ReleaseStaleLease("quedó a medias");
        Assert.Equal(FiscalJobStatus.Pending, j.Status);
        Assert.True(j.NextAttemptUtc <= DateTime.UtcNow);
        Assert.Equal(1, j.Attempts); // el intento muerto cuenta para el tope
        Assert.Equal("quedó a medias", j.LastError);
    }

    [Fact]
    public void LastError_TruncatedTo1000()
    {
        var j = NewJob();
        j.MarkFailed(new string('x', 5000));
        Assert.Equal(1000, j.LastError!.Length);
    }
}
