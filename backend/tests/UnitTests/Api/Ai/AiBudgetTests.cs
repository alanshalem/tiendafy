using Ai.Infrastructure;
using Api.Ai;

namespace UnitTests.Api.Ai;

public sealed class AiBudgetTests
{
    private static readonly Guid Tenant = Guid.NewGuid();

    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    // La primera lectura responde ya; la segunda espera el portón (y devuelve lo que había en la base al arrancar).
    private sealed class SecondReadGatedSpend : IAiMonthSpend
    {
        private readonly TaskCompletionSource _entered = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _gate = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _calls;
        public Task Entered => _entered.Task;
        public void Open() => _gate.SetResult();

        public async Task<long> SpentThisMonthMicroUsdAsync(Guid tenantId, CancellationToken ct)
        {
            if (Interlocked.Increment(ref _calls) == 1) return 0;
            _entered.TrySetResult();
            await _gate.Task;
            return 0; // el snapshot de la consulta no incluye lo que se informó después
        }
    }

    [Fact]
    public async Task AddActual_durante_la_relectura_no_se_pierde()
    {
        var clock = new FixedClock(new DateTimeOffset(2026, 10, 15, 12, 0, 0, TimeSpan.Zero));
        var spend = new SecondReadGatedSpend();
        var budget = new AiBudget(spend, clock);

        await using var r = await budget.TryReserveAsync(Tenant, 1_000, 100, CancellationToken.None);
        clock.Now += TimeSpan.FromSeconds(31); // vence la caché
        var committed = budget.CommittedMicroUsdAsync(Tenant, CancellationToken.None);
        await spend.Entered;
        r!.AddActual(50);
        spend.Open();

        Assert.Equal(150, await committed); // 50 real + 100 reservado
    }

    private sealed class FakeSpend(long spent) : IAiMonthSpend
    {
        public Task<long> SpentThisMonthMicroUsdAsync(Guid tenantId, CancellationToken ct) => Task.FromResult(spent);
    }

    // Cada lectura avisa que entró y espera el portón.
    private sealed class GatedSpend : IAiMonthSpend
    {
        private readonly TaskCompletionSource _entered = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _gate = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public Task Entered => _entered.Task;
        public void Open() => _gate.SetResult();

        public async Task<long> SpentThisMonthMicroUsdAsync(Guid tenantId, CancellationToken ct)
        {
            _entered.TrySetResult();
            await _gate.Task;
            return 0;
        }
    }

    private static AiBudget Budget(IAiMonthSpend spend) =>
        new(spend, new FixedClock(new DateTimeOffset(2026, 10, 15, 12, 0, 0, TimeSpan.Zero)));

    [Fact]
    public async Task Reserva_si_entra()
    {
        var budget = Budget(new FakeSpend(0));

        await using var r = await budget.TryReserveAsync(Tenant, 1_000, 400, CancellationToken.None);

        Assert.NotNull(r);
        Assert.Equal(400, await budget.CommittedMicroUsdAsync(Tenant, CancellationToken.None));
    }

    [Fact]
    public async Task No_reserva_si_no_entra()
    {
        var budget = Budget(new FakeSpend(700));

        var r = await budget.TryReserveAsync(Tenant, 1_000, 400, CancellationToken.None);

        Assert.Null(r);
    }

    [Fact]
    public async Task Al_liberar_queda_solo_lo_real()
    {
        var budget = Budget(new FakeSpend(0));

        var r = await budget.TryReserveAsync(Tenant, 1_000, 400, CancellationToken.None);
        r!.AddActual(50);
        await r.DisposeAsync();

        Assert.Equal(50, await budget.CommittedMicroUsdAsync(Tenant, CancellationToken.None));
    }

    [Fact]
    public async Task Dos_reservas_simultaneas_no_pasan_juntas()
    {
        var spend = new GatedSpend();
        var budget = Budget(spend);

        var a = budget.TryReserveAsync(Tenant, 1_000, 600, CancellationToken.None);
        var b = budget.TryReserveAsync(Tenant, 1_000, 600, CancellationToken.None);
        await spend.Entered; // una ya está leyendo; la otra espera el lock de la tienda
        spend.Open();
        var results = await Task.WhenAll(a, b);

        Assert.Equal(1, results.Count(r => r is not null));
    }

    [Fact]
    public async Task El_mes_corta_en_hora_argentina()
    {
        var usage = new List<AiUsage>
        {
            // 31-oct 23:30 AR = 02:30 UTC del 1-nov: es de octubre.
            new() { TenantId = Tenant, CostMicroUsd = 10, CreatedAtUtc = new DateTime(2026, 11, 1, 2, 30, 0, DateTimeKind.Utc) },
            // 1-nov 00:00 AR = 03:00 UTC: ya es de noviembre.
            new() { TenantId = Tenant, CostMicroUsd = 100, CreatedAtUtc = new DateTime(2026, 11, 1, 3, 0, 0, DateTimeKind.Utc) },
            // 30-sep 23:59 AR = 02:59 UTC del 1-oct: es de setiembre.
            new() { TenantId = Tenant, CostMicroUsd = 1_000, CreatedAtUtc = new DateTime(2026, 10, 1, 2, 59, 0, DateTimeKind.Utc) },
            // Otra tienda.
            new() { TenantId = Guid.NewGuid(), CostMicroUsd = 10_000, CreatedAtUtc = new DateTime(2026, 10, 10, 0, 0, 0, DateTimeKind.Utc) },
        };

        var octubre = await AiMonthSpend.SumAsync(usage.AsQueryable(), Tenant, new DateOnly(2026, 10, 20), CancellationToken.None);

        Assert.Equal(10, octubre);
    }
}
