namespace UnitTests.Api.Ai;

/// <summary>
/// Reloj de prueba: el tiempo avanza solo con <see cref="Advance"/>, y ahí mismo disparan los
/// timers vencidos (los que usa <c>new CancellationTokenSource(TimeSpan, TimeProvider)</c>).
/// </summary>
public sealed class ManualClock : TimeProvider
{
    private readonly List<ManualTimer> _timers = [];
    private DateTimeOffset _now = new(2026, 10, 25, 15, 0, 0, TimeSpan.Zero);

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by)
    {
        _now += by;
        List<ManualTimer> due;
        lock (_timers) due = _timers.Where(t => t.DueAt is { } at && at <= _now).ToList();
        foreach (var timer in due) timer.Fire();
    }

    public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
    {
        var timer = new ManualTimer(this, callback, state);
        timer.Change(dueTime, period);
        lock (_timers) _timers.Add(timer);
        return timer;
    }

    private sealed class ManualTimer(ManualClock clock, TimerCallback callback, object? state) : ITimer
    {
        public DateTimeOffset? DueAt { get; private set; }

        public bool Change(TimeSpan dueTime, TimeSpan period)
        {
            DueAt = dueTime == Timeout.InfiniteTimeSpan ? null : clock.GetUtcNow() + dueTime;
            return true;
        }

        public void Fire()
        {
            DueAt = null;
            callback(state);
        }

        public void Dispose() => DueAt = null;

        public ValueTask DisposeAsync()
        {
            Dispose();
            return ValueTask.CompletedTask;
        }
    }
}
